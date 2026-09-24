import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { collecte, fichesSuivies } from "@/server/lecture/backoffice";
import { journaliser } from "@/server/acces/journal";
import { prochaineRelecture } from "@/domain/backoffice/veille";

/**
 * File de veille — B-01, WF-14 étape 1.
 *
 * Le back-office voit **aussi** les règles de source secondaire, avec leur
 * marque. INV-4 dit qu'elles ne sont jamais visibles par l'utilisateur, pas
 * qu'elles sont invisibles au veilleur — c'est lui qui doit savoir qu'une
 * source secondaire attend d'être remplacée par une source officielle.
 *
 * `acces: "veilleur"` : le moindre privilège (RG-15.3). Un veilleur relit
 * des sources ; il n'a rien à faire dans les paiements.
 */
export const GET = route({
  nom: "admin.veille",
  acces: "veilleur",
  limite: "lecture",
  async traiter() {
    return { fiches: await fichesSuivies(), collecte: await collecte() };
  },
});

/**
 * Relecture sans changement — WF-14 étape 2, branche « inchangé ».
 *
 * « Le veilleur consulte la source officielle, compare, et conclut :
 * inchangé → `verifiedAt` et `nextReviewAt` mis à jour, pas de nouvelle
 * version. » C'est l'issue la plus fréquente de la veille, et le bouton
 * qui la porte n'était relié à rien.
 *
 * La conséquence de cet oubli n'était pas qu'un bouton inerte : une fiche
 * relue et trouvée identique restait en retard, et le cron de trois
 * heures finissait par la dépublier (RG-14.1). Le travail était fait, et
 * le produit se comportait comme s'il ne l'avait pas été.
 *
 * **Pas de ligne d'audit pour la relecture, et c'est voulu.** RG-14.4
 * désigne la preuve de diligence : « chaque version conserve son
 * `sourceUrl`, `verifiedAt` et `verifiedBy` ». C'est le champ qui porte qui
 * a relu et quand, pas une entrée de journal — en ajouter une doublerait la
 * preuve sans l'améliorer, et les deux finiraient par diverger.
 *
 * **Une fiche dépubliée par l'échéance redevient publiée.** C'est le sens
 * de RG-14.1 : le retour en `DRAFT` dit « personne n'a relu », pas « cette
 * règle est douteuse ». Une fois relue, la raison du retrait n'existe
 * plus. Une fiche mise en brouillon pour une autre raison — une version
 * en préparation — n'est pas republiée par une relecture : seule
 * l'échéance dépassée est réversible ainsi.
 *
 * **Et cette remise en ligne, elle, laisse une trace.** Le raisonnement
 * ci-dessus couvre la relecture et non la republication : `verifiedAt` et
 * `verifiedBy` disent qui a relu, pas qu'une règle est redevenue visible
 * pour les candidats. C'est le même effet que `publierLaRegle`, qui le
 * journalise — et une règle qui rentre à l'affichage sans trace est
 * précisément ce qu'un contrôle vient chercher. La ligne n'est écrite que
 * lorsque la republication a lieu : une relecture qui ne change rien à la
 * visibilité n'a rien à consigner.
 */
export const PUT = route({
  nom: "admin.veille.relecture",
  acces: "veilleur",
  limite: "sensible",
  corps: z.object({ id: z.string().uuid() }),
  async traiter({ corps, acteur }) {
    const fiche = await db.visaRule.findUnique({ where: { id: corps.id } });
    if (!fiche) throw echec("introuvable");
    if (fiche.status === "ARCHIVED") {
      throw echec("etat_incompatible", {
        corps: "Une version archivée ne se relit plus. Repars de la version en vigueur.",
      });
    }

    const maintenant = new Date();
    const jour = new Date(
      Date.UTC(
        maintenant.getUTCFullYear(),
        maintenant.getUTCMonth(),
        maintenant.getUTCDate(),
      ),
    );

    /**
     * Aucune colonne ne porte la date de révision connue d'une source.
     * La seconde moitié de RG-14.3 — « ramenée à 30 jours avant une date
     * connue de révision » — est donc écrite dans la fonction pure et
     * inatteignable depuis ici. Passer `null` est la lecture honnête :
     * inventer une colonne au passage ferait décider à cette route ce
     * qu'un veilleur doit saisir.
     */
    const echeance = prochaineRelecture(jour, null);

    // Le retour en brouillon par échéance est réversible : c'est ce que
    // la relecture vient de lever. Un brouillon en préparation, non.
    const republier = fiche.status === "DRAFT" && fiche.nextReviewAt < jour;

    const maj = await db.visaRule.update({
      where: { id: fiche.id },
      data: {
        verifiedAt: jour,
        verifiedBy: acteur!.email,
        nextReviewAt: echeance,
        ...(republier ? { status: "PUBLISHED" as const } : {}),
      },
    });

    if (republier) {
      await journaliser({
        acteurId: acteur!.id,
        action: "regle.republication",
        cible: `visaRule:${fiche.id}`,
        motif: `Remise en ligne après relecture : l'échéance du ${fiche.nextReviewAt
          .toISOString()
          .slice(0, 10)} l'avait dépubliée (RG-14.1)`,
        details: {
          pays: fiche.countryCode,
          type: fiche.visaType,
          version: fiche.version,
        },
      });
    }

    return {
      relueLe: maj.verifiedAt.toISOString().slice(0, 10),
      prochaineLe: maj.nextReviewAt.toISOString().slice(0, 10),
      republiee: republier,
    };
  },
});
