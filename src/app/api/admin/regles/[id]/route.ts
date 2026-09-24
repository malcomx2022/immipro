import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import {
  avecLesTextesCandidat,
  visaRulesSchema,
  SCHEMA_VERSION,
} from "@/domain/rules/schema";
import { exigerUnEnregistrementAffichable } from "@/server/regles/edition";
import { publierLaRegle } from "@/server/regles/publication";

/**
 * Édition et publication d'une règle — B-02, WF-14.
 *
 * Trois garde-fous, dans cet ordre, parce qu'ils coûtent de moins en moins
 * cher à corriger quand ils sont vus tôt :
 *
 * 1. **Le schéma (WF-14 étape 3).** Aucune écriture sans validation Zod.
 * 2. **Le vocabulaire (INV-1, INV-2).** Un administrateur qui écrit une
 *    promesse dans un texte de règle bute sur la même liste qu'un
 *    développeur. Le refus est opposé là où le candidat verra le texte, et
 *    la décision vit dans `server/regles/edition.ts` : cette route bloquait
 *    l'enregistrement, y compris celui d'un brouillon, quand `CLAUDE.md`
 *    bloque la publication et protège le brouillon. Ce commentaire disait
 *    déjà « la publication est bloquée » à côté d'un code qui bloquait la
 *    sauvegarde.
 * 3. **La source (RG-14.2).** Une règle de source secondaire ne se publie
 *    pas. La base le refuse aussi ; le refuser dans `publierLaRegle` permet
 *    de le **dire**, au lieu de rendre une erreur de contrainte.
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

    /**
     * Le vocabulaire, opposé à ce que cet enregistrement **introduit**, et
     * seulement quand la version écrite est celle que le candidat lit —
     * l'écrire alors est une publication, et le refus vient donc avant
     * l'écriture. Sur un brouillon, rien n'est refusé : `publierLaRegle`
     * relira le référentiel entier le jour où il entrera en vigueur.
     */
    exigerUnEnregistrementAffichable(
      regle,
      corps.champ === "textes"
        ? {
            champ: "textes",
            libelleCandidat: corps.libelleCandidat,
            reserveCandidat: corps.reserveCandidat,
          }
        : { champ: "payload", payload: lu.data },
    );

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
 * L'accès est administrateur et non veilleur : séparer qui rédige de qui
 * publie est la première moitié de la relecture que WF-14 §4 demande pour
 * toute modification de condition bloquante. Elle ne suffisait pas — un
 * administrateur passe les deux portes —, et la seconde moitié vit
 * désormais dans `server/regles/publication.ts` : le publicateur ne peut
 * pas être celui qui a écrit la version.
 */
export const POST = route({
  nom: "admin.regle.publication",
  acces: "admin",
  limite: "sensible",
  corps: z.object({ motif: z.string().trim().min(3).max(500) }),
  traiter: ({ corps, params, acteur }) =>
    publierLaRegle(params.id!, { id: acteur!.id, email: acteur!.email }, corps.motif),
});
