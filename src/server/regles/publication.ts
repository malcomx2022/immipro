import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { journaliser } from "@/server/acces/journal";
import { getQueue, JOBS, poster } from "@/lib/queue";
import {
  visaRulesSchema,
  peutEtrePubliee,
  raisonsDIncompletabilite,
  textesCandidat,
} from "@/domain/rules/schema";
import { verifierPayloadCandidat, messageDeRefusPayload } from "@/domain/backoffice/regle";
import {
  comparerLesVersions,
  relectureExigee,
  motifDeRelecture,
} from "@/domain/rules/comparaison";

/**
 * Publication d'une version de règle — WF-14 étape 5, B-02.
 *
 * ── Pourquoi la décision vit ici ────────────────────────────────────
 *
 * Elle vivait dans sa route, donc derrière `next/headers`, donc hors de
 * portée de toute fumée. C'est la leçon du 22/09 au soir : ce qu'aucun
 * script ne peut appeler, rien n'éprouve. Et c'est le geste le plus
 * conséquent du produit — il rejuge tous les dossiers ouverts sur la
 * procédure.
 *
 * ── La relecture par un second opérateur ────────────────────────────
 *
 * WF-14 §4 : « Relecture par un second opérateur pour toute modification
 * de condition bloquante. » Le contrôle n'existait pas. Le commentaire de
 * la route affirmait que la séparation veilleur / administrateur en
 * tenait lieu — mais un administrateur passe les deux portes, et rien ne
 * comparait qui avait écrit à qui publiait.
 *
 * Exécuté : une version qui fait passer le seuil kennismigrant de 4 357 €
 * à 1 000 €, écrite et publiée par la même personne, franchissait les
 * quatre garde-fous de la publication — source, schéma, vocabulaire,
 * terminabilité — sans qu'aucun ne regarde la seule chose qui compte.
 *
 * `VisaRule.verifiedBy` porte l'email de qui a écrit la version : chaque
 * édition l'y inscrit. Il n'y avait donc rien à ajouter en base, seulement
 * à comparer.
 */

export interface Publicateur {
  id: string;
  email: string;
}

export interface Publication {
  publiee: string;
  archivee: string | null;
  divergenceMiseEnFile: boolean;
}

export async function publierLaRegle(
  regleId: string,
  publicateur: Publicateur,
  motif: string,
): Promise<Publication> {
  const regle = await db.visaRule.findUnique({ where: { id: regleId } });
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

  /*
    Et la règle doit pouvoir être terminée. Une condition bloquante qui ne
    nomme aucune pièce n'est satisfaite par aucun dépôt : le dossier
    resterait `ACTIF` avec une exigence que le candidat ne peut lever. Le
    refus est ici parce que c'est le dernier moment où personne n'a encore
    ouvert de dossier dessus.
  */
  const impossibles = raisonsDIncompletabilite(lu.data);
  if (impossibles.length > 0) {
    throw echec("etat_incompatible", { corps: impossibles[0]! });
  }

  /*
    Le prédécesseur est la version **mise en vigueur et jamais remplacée**,
    et non « celle qui est PUBLISHED ». La distinction n'est pas
    théorique : RG-14.1 repasse en `DRAFT` une fiche dont la relecture est
    dépassée, et la relecture par défaut est de quatre-vingt-dix jours.
    Tout retard du veilleur ouvre donc la fenêtre — précisément au moment
    où il vient de relire et où la version suivante va paraître.

    Cherché par `status`, le prédécesseur disparaissait alors : la
    publication se croyait première, n'archivait rien, et ne mettait
    aucune divergence en file. Le candidat dont le seuil montait de
    1 500 € n'apprenait rien.
  */
  const veille = await db.visaRule.findFirst({
    where: {
      countryCode: regle.countryCode,
      visaType: regle.visaType,
      id: { not: regle.id },
      publishedAt: { not: null },
      effectiveTo: null,
    },
    orderBy: { publishedAt: "desc" },
  });

  /*
    La comparaison sert deux fois, et c'est pourquoi elle est faite ici :
    elle décide de la relecture maintenant, et le job de divergence la
    refera pour décider de l'impact. La même fonction pure, donc la même
    réponse — un contrôle qui s'appuierait sur une seconde définition de
    « une condition bloquante a bougé » finirait par diverger d'elle.

    Sans version en vigueur, la nouvelle ne modifie rien : elle pose. Une
    première version qui porte des conditions bloquantes décide pourtant
    de qui peut partir, et la comparaison contre un référentiel vide la
    traite comme une apparition — donc comme une modification.
  */
  const comparaison = veille
    ? comparerLesVersions(visaRulesSchema.parse(veille.rules), lu.data)
    : comparerLesVersions(
        { ...lu.data, conditions: [], pieces_requises: [] },
        lu.data,
      );

  if (relectureExigee(comparaison) && regle.verifiedBy === publicateur.email) {
    throw echec("etat_incompatible", { corps: motifDeRelecture(comparaison) });
  }

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
      data: {
        status: "PUBLISHED" as const,
        effectiveFrom: aujourdhui,
        // Posée une fois. Une fiche republiée après une échéance de
        // relecture garde la date où elle est entrée en vigueur : c'est
        // elle qui ordonne la succession, pas la dernière remise en ligne.
        publishedAt: regle.publishedAt ?? aujourdhui,
      },
    }),
  ]);

  await journaliser({
    acteurId: publicateur.id,
    action: "regle.publication",
    cible: `visaRule:${regle.id}`,
    motif,
    details: {
      pays: regle.countryCode,
      type: regle.visaType,
      version: regle.version,
      // La preuve de diligence de RG-14.4 se lit dans le journal : qui a
      // écrit, qui a publié, et ce qui a bougé parmi les bloquantes.
      redigeePar: regle.verifiedBy,
      bloquantesTouchees: comparaison.bloquantesTouchees,
    },
  });

  // WF-11 : la divergence est calculée par un job, pas ici. Une
  // publication ne doit pas attendre le parcours de tous les dossiers
  // rattachés, ni échouer parce que l'un d'eux pose problème.
  if (veille) {
    const file = await getQueue();
    // La réponse annonce `divergenceMiseEnFile` : elle ne doit pas
    // l'annoncer si rien n'a été mis en file.
    await poster(file, JOBS.DIVERGENCE_REGLEMENTAIRE, {
      ancienneId: veille.id,
      nouvelleId: regle.id,
    });
  }

  return {
    publiee: regle.id,
    archivee: veille?.id ?? null,
    divergenceMiseEnFile: veille !== null,
  };
}
