import { z } from "zod";
import { route } from "@/server/http/route";
import { collecte, fichesSuivies } from "@/server/lecture/backoffice";
import { consignerLeReleve } from "@/server/veille/releve";

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
  corps: z.object({
    id: z.string().uuid(),
    /**
     * Ce que le veilleur a trouvé — WF-14 étape 2.
     *
     * Absent vaut `A_JOUR` : c'est l'issue la plus fréquente, c'est celle
     * que le bouton d'origine portait, et les appels déjà écrits la
     * gardent.
     */
    conclusion: z.enum(["A_JOUR", "A_ARBITRER", "PERIME"]).optional(),
    /** L'écart constaté, ou le motif du silence. */
    note: z.string().max(500).optional(),
  }),
  traiter: ({ corps, acteur }) =>
    consignerLeReleve(corps.id, corps.conclusion ?? "A_JOUR", corps.note, acteur!),
});
