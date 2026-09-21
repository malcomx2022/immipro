import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { journaliser } from "@/server/acces/journal";
import { getQueue, JOBS } from "@/lib/queue";
import {
  avecLesTextesCandidat,
  visaRulesSchema,
  SCHEMA_VERSION,
  peutEtrePubliee,
  textesCandidat,
} from "@/domain/rules/schema";
import { verifierPayloadCandidat, messageDeRefusPayload } from "@/domain/backoffice/regle";

/**
 * Édition et publication d'une règle — B-02, WF-14.
 *
 * Trois garde-fous, dans cet ordre, parce qu'ils coûtent de moins en moins
 * cher à corriger quand ils sont vus tôt :
 *
 * 1. **Le vocabulaire (INV-1, INV-2).** Un administrateur qui écrit une
 *    promesse dans un texte de règle bute sur la même liste qu'un
 *    développeur. La publication est bloquée tant que la formulation est
 *    refusée — c'est le troisième point d'application de la liste unique.
 * 2. **Le schéma (WF-14 étape 3).** Aucune écriture sans validation Zod.
 * 3. **La source (RG-14.2).** Une règle de source secondaire ne se publie
 *    pas. La base le refuse aussi ; le refuser ici permet de le **dire**,
 *    au lieu de rendre une erreur de contrainte.
 */
export const PUT = route({
  nom: "admin.regle.maj",
  acces: "veilleur",
  limite: "sensible",
  /**
   * Deux façons d'écrire, et l'écran n'en emploie qu'une.
   *
   * B-02 n'édite que les deux textes destinés au candidat ; il n'a jamais
   * eu le payload entier sous la main, et c'est pour ça que son bouton
   * « Enregistrer le brouillon » n'était relié à rien. Lui faire porter le
   * payload complet aurait été le plus court — et le plus faux : la copie
   * chargée à l'ouverture de la page écraserait, à l'enregistrement, tout
   * ce qu'un autre veilleur aurait changé entre-temps dans les champs que
   * l'écran ne montre pas.
   *
   * La branche `textes` n'envoie donc que ce qui est édité, et le serveur
   * la recolle sur la version en base. La branche `payload`, elle, reste
   * la porte de WF-14 étape 3 pour un éditeur complet.
   */
  corps: z.discriminatedUnion("champ", [
    z.object({
      champ: z.literal("payload"),
      rules: z.unknown(),
      sourceUrl: z.string().url().optional(),
      nextReviewAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
      notes: z.string().max(4000).optional(),
    }),
    z.object({
      champ: z.literal("textes"),
      libelleCandidat: z.string().trim().min(1).max(300),
      reserveCandidat: z.string().trim().max(1000),
    }),
  ]),
  async traiter({ corps, params, acteur }) {
    const regle = await db.visaRule.findUnique({ where: { id: params.id } });
    if (!regle) throw echec("introuvable");
    if (regle.status === "ARCHIVED") {
      throw echec("etat_incompatible", {
        corps: "Une version archivée ne se modifie plus. Repars de la version en vigueur.",
      });
    }

    /**
     * La branche `textes` relit la version en base et n'y remplace que les
     * deux champs du formulaire. Le reste du payload traverse sans être
     * recopié par personne — donc sans risque d'être perdu.
     */
    const propose =
      corps.champ === "textes"
        ? (() => {
            const enBase = visaRulesSchema.safeParse(regle.rules);
            if (!enBase.success) return null;
            return avecLesTextesCandidat(enBase.data, corps);
          })()
        : corps.rules;

    if (propose === null) {
      throw echec("etat_incompatible", {
        corps: "Le contenu de cette version ne passe plus la validation. Reprends l'édition.",
      });
    }

    const lu = visaRulesSchema.safeParse(propose);
    if (!lu.success) {
      throw echec("champs_invalides", {
        champs: Object.fromEntries(
          lu.error.issues.map((i) => [i.path.map(String).join(".") || "rules", i.message]),
        ),
      });
    }

    const fautes = verifierPayloadCandidat(textesCandidat(lu.data));
    if (fautes.length > 0) {
      throw echec("champs_invalides", {
        corps: messageDeRefusPayload(fautes[0]!),
        champs: Object.fromEntries(fautes.map((f) => [f.chemin, messageDeRefusPayload(f)])),
      });
    }

    const maj = await db.visaRule.update({
      where: { id: regle.id },
      data: {
        rules: lu.data as never,
        schemaVersion: SCHEMA_VERSION,
        ...(corps.champ === "payload" && corps.sourceUrl
          ? { sourceUrl: corps.sourceUrl }
          : {}),
        ...(corps.champ === "payload" && corps.nextReviewAt
          ? { nextReviewAt: new Date(`${corps.nextReviewAt}T00:00:00Z`) }
          : {}),
        ...(corps.champ === "payload" && corps.notes !== undefined
          ? { notes: corps.notes }
          : {}),
        verifiedAt: new Date(),
        verifiedBy: acteur!.email,
      },
    });

    return { id: maj.id, version: maj.version, statut: maj.status };
  },
});

/**
 * Publication — WF-14 étape 5. La version en vigueur passe en `ARCHIVED`
 * avec son `effectiveTo`, la nouvelle en `PUBLISHED`, et WF-11 se déclenche.
 *
 * L'accès est administrateur et non veilleur : RG-14.2 demande une relecture
 * par un second opérateur pour toute modification de condition bloquante, et
 * séparer qui rédige de qui publie est la forme la plus simple de cette
 * relecture.
 */
export const POST = route({
  nom: "admin.regle.publication",
  acces: "admin",
  limite: "sensible",
  corps: z.object({ motif: z.string().trim().min(3).max(500) }),
  async traiter({ corps, params, acteur }) {
    const regle = await db.visaRule.findUnique({ where: { id: params.id } });
    if (!regle) throw echec("introuvable");

    if (!peutEtrePubliee(regle.sourceTier)) {
      throw echec("etat_incompatible", {
        corps:
          "Cette fiche s'appuie sur une source secondaire. Rattache-la à une source officielle ou institutionnelle avant de publier (RG-14.2).",
      });
    }

    const lu = visaRulesSchema.safeParse(regle.rules);
    if (!lu.success) {
      throw echec("etat_incompatible", {
        corps: "Le contenu de cette version ne passe plus la validation. Reprends l'édition.",
      });
    }
    const fautes = verifierPayloadCandidat(textesCandidat(lu.data));
    if (fautes.length > 0) {
      throw echec("etat_incompatible", { corps: messageDeRefusPayload(fautes[0]!) });
    }

    const veille = await db.visaRule.findFirst({
      where: {
        countryCode: regle.countryCode,
        visaType: regle.visaType,
        status: "PUBLISHED",
        id: { not: regle.id },
      },
    });

    const aujourdhui = new Date();
    await db.$transaction([
      ...(veille
        ? [
            db.visaRule.update({
              where: { id: veille.id },
              data: { status: "ARCHIVED" as const, effectiveTo: aujourdhui },
            }),
          ]
        : []),
      db.visaRule.update({
        where: { id: regle.id },
        data: { status: "PUBLISHED" as const, effectiveFrom: aujourdhui },
      }),
    ]);

    await journaliser({
      acteurId: acteur!.id,
      action: "regle.publication",
      cible: `visaRule:${regle.id}`,
      motif: corps.motif,
      details: { pays: regle.countryCode, type: regle.visaType, version: regle.version },
    });

    // WF-11 : la divergence est calculée par un job, pas ici. Une
    // publication ne doit pas attendre le parcours de tous les dossiers
    // rattachés, ni échouer parce que l'un d'eux pose problème.
    if (veille) {
      const file = await getQueue();
      await file.send(JOBS.DIVERGENCE_REGLEMENTAIRE, {
        ancienneId: veille.id,
        nouvelleId: regle.id,
      });
    }

    return {
      publiee: regle.id,
      archivee: veille?.id ?? null,
      divergenceMiseEnFile: veille !== null,
    };
  },
});
