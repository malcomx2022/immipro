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

import type { CauseRefus } from "@/domain/paiement/echec";
import type { IssueEcart } from "./ecart";

export type EtatRapprochement =
  | "RAPPROCHE"
  | "REMBOURSEMENT_DU"
  | "REMBOURSE"
  | "EN_ATTENTE"
  | "ECART"
  | "ECHEC_DELAI"
  | "ECHEC";

export const LIBELLE_RAPPROCHEMENT: Record<EtatRapprochement, string> = {
  RAPPROCHE: "Rapproché",
  // Un remboursement n'avait pas d'état, et retombait donc sur le cas par
  // défaut : « Écart à traiter », dès la dixième minute (M.B). Un opérateur
  // ouvrait une enquête sur une somme rendue exprès, et le compteur
  // d'écarts la comptait. Rendre l'argent est une issue, pas un désaccord.
  // K.C — décidé n'est pas versé. Un remboursement dû rangé sous
  // « Remboursé » ferait croire l'argent parti alors que rien n'est
  // sorti : c'est une file à traiter, et elle doit se voir comme telle.
  REMBOURSEMENT_DU: "Remboursement à verser",
  REMBOURSE: "Remboursé",
  EN_ATTENTE: "En attente de rapprochement",
  ECART: "Écart à traiter",
  ECHEC_DELAI: "Délai dépassé",
  // « Échec », et non « Solde insuffisant » : l'état disait une cause, la
  // même pour tous les refus. Une panne du prestataire et un renoncement du
  // payeur s'y lisaient comme un problème d'argent, et un opérateur qui
  // rappelle en parlant du solde se trompe de conversation (N.B). La cause,
  // quand l'émetteur l'a donnée, est une colonne à part.
  ECHEC: "Échec",
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
  /** Pourquoi l'émetteur a refusé, quand il l'a dit (N.B). */
  cause?: CauseRefus;
  /** Pourquoi un remboursement est dû, quand il l'est (K.C). */
  motifDuRemboursement?: string;
  /**
   * L'écart, et sa résolution si elle a eu lieu — arbitrage du 21/09/2026.
   *
   * Les deux voyagent ensemble parce que l'un ne se lit pas sans l'autre :
   * refermer un écart sans relire ce qu'il disait, c'est signer un texte
   * qu'on n'a pas sous les yeux.
   */
  ecart?: {
    constat: string;
    resolution?: {
      issue: IssueEcart;
      note: string;
      par: string;
      le: string;
    };
  };
}

export const estConfirme = (p: Paiement): boolean => p.etat === "RAPPROCHE";
/** Rendre l'argent n'est pas le refuser : un remboursement n'est pas un échec. */
export const estRembourse = (p: Paiement): boolean => p.etat === "REMBOURSE";
/** Décidé, pas encore versé (K.C). C'est une dette, et elle se compte. */
export const estRemboursementDu = (p: Paiement): boolean => p.etat === "REMBOURSEMENT_DU";
export const estEnAttente = (p: Paiement): boolean => p.etat === "EN_ATTENTE";
export const estEnEchec = (p: Paiement): boolean =>
  p.etat === "ECHEC_DELAI" || p.etat === "ECHEC";

export interface EtatOperateur {
  /** Faux quand l'API de l'opérateur ne répond plus. */
  disponible: boolean;
  /** Dernier rapprochement automatique réussi, ISO. */
  dernierRapprochement: string;
  operateur: string;
}

/**
 * Une somme par monnaie — et jamais une somme tout court.
 *
 * Les totaux additionnaient des francs et des euros pour les afficher
 * suivis d'un « F » : vingt-cinq mille francs et vingt-neuf euros
 * donnaient « 25 029 F ». C'est précisément ce que ce module refuse deux
 * paragraphes plus haut — un chiffre qui n'est pas ce qu'il annonce. Le
 * défaut ne s'est vu qu'à l'écran, avec les deux rails côte à côte.
 */
export type Totaux = Record<string, number>;

const parDevise = (paiements: readonly Paiement[]): Totaux => {
  const totaux: Totaux = {};
  for (const p of paiements) totaux[p.devise] = (totaux[p.devise] ?? 0) + p.montant;
  return totaux;
};

/**
 * Ce qu'une carte affiche : une ligne par monnaie, et « 0 » dans la monnaie
 * de référence quand il n'y a rien — une carte vide se lit comme une carte
 * en panne.
 */
export const DEVISE_DE_REFERENCE = "XOF";

export function lignesDeTotal(totaux: Totaux): { devise: string; montant: number }[] {
  const lignes = Object.entries(totaux)
    .map(([devise, montant]) => ({ devise, montant }))
    .sort((a, b) => a.devise.localeCompare(b.devise));
  return lignes.length > 0 ? lignes : [{ devise: DEVISE_DE_REFERENCE, montant: 0 }];
}

export interface Agregats {
  encaisse: Totaux;
  confirmes: number;
  enAttente: Totaux;
  transactionsEnAttente: number;
  echecs: number;
  ecarts: number;
  /**
   * Ce qui est reparti — M.B.
   *
   * Un paiement remboursé sort d'`encaisse`, ce qui est juste : la somme
   * n'est plus acquise. Mais il ne rentrait alors dans aucun compteur, et
   * une journée où trois paiements ont été rendus se lisait comme une
   * journée où ils n'avaient jamais eu lieu.
   */
  rembourses: number;
  rembourse: Totaux;
  /**
   * Ce qui est décidé et pas encore versé — K.C.
   *
   * Une dette, et le seul compteur de ce tableau qui en soit une. Elle ne
   * se confond ni avec l'encaissé — la somme est encore là — ni avec le
   * remboursé — elle n'est pas partie. La laisser sans compteur, c'est la
   * laisser vieillir : un remboursement décidé et jamais versé ne se
   * signale nulle part ailleurs.
   */
  remboursementsDus: number;
  remboursementDu: Totaux;
}

export function agreger(paiements: readonly Paiement[]): Agregats {
  const confirmes = paiements.filter(estConfirme);
  const attente = paiements.filter(estEnAttente);
  const rendus = paiements.filter(estRembourse);
  const dus = paiements.filter(estRemboursementDu);
  return {
    encaisse: parDevise(confirmes),
    confirmes: confirmes.length,
    enAttente: parDevise(attente),
    transactionsEnAttente: attente.length,
    echecs: paiements.filter(estEnEchec).length,
    ecarts: paiements.filter((p) => p.etat === "ECART").length,
    rembourses: rendus.length,
    rembourse: parDevise(rendus),
    remboursementsDus: dus.length,
    remboursementDu: parDevise(dus),
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
