/**
 * Ce qui peut empêcher un appel au modèle d'aboutir — et ce qu'on en dit.
 *
 * ── Pourquoi ce module existe ───────────────────────────────────────
 *
 * Deux chaînes appellent le même service : la lecture d'une pièce
 * déposée (WF-06) et la mise en forme d'une pièce rédigée (WF-08). Les
 * deux peuvent échouer exactement de la même façon — une clé refusée,
 * une cadence dépassée, un service muet — et les deux doivent en tirer
 * les mêmes conclusions : rejouer, ou non ; demander un geste, ou non.
 *
 * Recopier ces six causes dans le second module aurait produit deux
 * sources pour une même règle. Elles divergent toujours, et c'est celle
 * qu'on n'a pas sous les yeux qu'on oublie de corriger — l'arbitrage
 * S.36 en a tranché un cas il y a deux jours.
 *
 * Ce qui reste propre à chaque chaîne y reste : lire une pièce peut
 * buter sur un scan flou ou un objet disparu du stockage, écrire un
 * texte non.
 *
 * Module pur : aucune dépendance à Prisma, Next, au réseau ou au SDK.
 */

/**
 * Les six façons dont un appel n'aboutit pas, quelle que soit la chaîne.
 *
 * Elles se répartissent en deux familles, et c'est la répartition qui
 * commande la suite :
 *
 * - **ce qui se dissipe** — injoignable, trop lent, saturé. Le job
 *   rejoue, et personne n'a rien à faire.
 * - **ce qui se répare** — clé absente ou refusée, refus du service,
 *   réponse que nous ne savons pas relire. Rejouer n'y changerait rien ;
 *   un exploitant a quelque chose à faire.
 *
 * Dans aucun des six cas le candidat n'a de geste à faire, et c'est la
 * raison pour laquelle aucun message d'ici ne lui en demande un.
 */
export const CAUSES_DAPPEL = [
  "non_configure",
  "injoignable",
  "delai_depasse",
  "service_sature",
  "refus",
  "reponse_illisible",
] as const;

export type CauseDAppel = (typeof CAUSES_DAPPEL)[number];

/**
 * L'appel doit-il être rejoué ?
 *
 * Seulement quand l'obstacle peut disparaître sans que personne
 * n'intervienne. Rejouer six fois une clé absente consomme la file et
 * retarde d'autant le traitement humain qui, lui, aurait abouti.
 */
export const appelSeReprend = (cause: CauseDAppel): boolean =>
  cause === "injoignable" || cause === "delai_depasse" || cause === "service_sature";

/**
 * Ce que l'exploitant lit dans un journal.
 *
 * Jamais une clé, jamais une URL, jamais un extrait de ce qui a été
 * transmis : ces lignes finissent dans un journal, et un journal se
 * copie.
 */
export const MOTIF_DAPPEL: Record<CauseDAppel, string> = {
  non_configure: "aucune clé d'appel au modèle n'est configurée",
  injoignable: "le service n'a pas répondu",
  delai_depasse: "le service n'a rien rendu dans le délai imparti",
  service_sature: "le service a refusé la demande faute de capacité",
  refus: "le service a refusé de traiter la demande",
  reponse_illisible: "la réponse n'a pas la forme attendue",
};
