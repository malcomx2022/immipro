/**
 * Paiements et réconciliation — B-04, WF-15, INV-7.
 *
 * Deux règles, toutes deux contre l'empressement.
 *
 * **Aucun paiement n'est marqué en échec sur la seule absence de réponse de
 * l'opérateur.** Un silence de l'API MTN n'est pas un refus : le paiement
 * reste en attente de rapprochement, et aucun pack n'est fermé.
 *
 * **Pendant un incident, aucun total n'est affiché.** Un chiffre partiel
 * présenté comme un total est une erreur comptable, et elle se propage :
 * l'écart se retrouve dans un export, puis dans un rapport.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type EtatRapprochement =
  | "RAPPROCHE"
  | "EN_ATTENTE"
  | "ECART"
  | "ECHEC_DELAI"
  | "ECHEC_SOLDE";

export const LIBELLE_RAPPROCHEMENT: Record<EtatRapprochement, string> = {
  RAPPROCHE: "Rapproché",
  EN_ATTENTE: "En attente de rapprochement",
  ECART: "Écart à traiter",
  ECHEC_DELAI: "Délai dépassé",
  ECHEC_SOLDE: "Solde insuffisant",
};

export interface Paiement {
  reference: string;
  compte: string;
  montant: number;
  devise: string;
  moyen: string;
  /** Référence de la transaction opérateur. Absente tant qu'elle n'est pas connue. */
  transaction?: string;
  /** Horodatage, ISO. */
  recuLe: string;
  etat: EtatRapprochement;
}

export const estConfirme = (p: Paiement): boolean => p.etat === "RAPPROCHE";
export const estEnAttente = (p: Paiement): boolean => p.etat === "EN_ATTENTE";
export const estEnEchec = (p: Paiement): boolean =>
  p.etat === "ECHEC_DELAI" || p.etat === "ECHEC_SOLDE";

export interface EtatOperateur {
  /** Faux quand l'API de l'opérateur ne répond plus. */
  disponible: boolean;
  /** Dernier rapprochement automatique réussi, ISO. */
  dernierRapprochement: string;
  operateur: string;
}

export interface Agregats {
  encaisse: number;
  confirmes: number;
  enAttente: number;
  transactionsEnAttente: number;
  echecs: number;
  ecarts: number;
}

export function agreger(paiements: readonly Paiement[]): Agregats {
  const confirmes = paiements.filter(estConfirme);
  const attente = paiements.filter(estEnAttente);
  return {
    encaisse: confirmes.reduce((total, p) => total + p.montant, 0),
    confirmes: confirmes.length,
    enAttente: attente.reduce((total, p) => total + p.montant, 0),
    transactionsEnAttente: attente.length,
    echecs: paiements.filter(estEnEchec).length,
    ecarts: paiements.filter((p) => p.etat === "ECART").length,
  };
}

/**
 * Pendant un incident opérateur, le total encaissé n'est pas publiable : la
 * journée n'est pas close et le chiffre changerait sans qu'on sache de
 * combien. Les compteurs qui ne dépendent pas de l'opérateur restent, eux,
 * exacts — un échec d'une source ne fait jamais passer une donnée pour
 * absente.
 */
export const totalPubliable = (operateur: EtatOperateur): boolean =>
  operateur.disponible;

export const MENTION_TOTAL_SUSPENDU =
  "Le total encaissé du jour n'est pas affiché pendant l'incident : un chiffre partiel présenté comme un total est une erreur comptable.";

export function messageIncidentOperateur(
  operateur: EtatOperateur,
  formaterMoment: (iso: string) => string,
): string | null {
  if (operateur.disponible) return null;
  return `L'API ${operateur.operateur} ne répond plus depuis ${formaterMoment(operateur.dernierRapprochement)}. Le rapprochement automatique est suspendu et reprendra seul. Les paiements reçus restent en attente : aucun n'est marqué en échec sur la seule absence de réponse de l'opérateur, et aucun pack n'est fermé.`;
}

export const MENTION_ECARTS =
  "Les écarts sont conservés jusqu'à leur résolution manuelle et consignés au journal d'audit.";

/** Un écart se traite à la main : il n'existe pas de résolution automatique (INV-7). */
export function libelleEcarts(agregats: Agregats): string {
  if (agregats.ecarts === 0) return "Aucun écart à traiter";
  return agregats.ecarts > 1
    ? `Traiter les ${agregats.ecarts} écarts`
    : "Traiter l'écart";
}
