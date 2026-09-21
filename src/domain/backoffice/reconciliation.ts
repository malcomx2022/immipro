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
import { LIBELLE_ISSUE } from "./ecart";
import { LIBELLE_CAUSE } from "@/domain/paiement/echec";
import { nomDatable, nombre, texte, vide, type Cellule } from "@/domain/format/csv";

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

// ── Le grand livre — l'export qui n'existait pas ───────────────────────

/**
 * L'export du grand livre, et la règle que ce module énonçait déjà.
 *
 * `MENTION_TOTAL_SUSPENDU` le dit depuis le début : « un chiffre partiel
 * présenté comme un total est une erreur comptable, et elle se propage
 * **dans l'export puis dans le rapport** ». La phrase nommait l'export
 * comme le lieu où la faute devient durable — et l'export n'existait pas,
 * si bien que la règle n'était tenue qu'à l'écran, là où elle coûte le
 * moins cher.
 *
 * Un fichier survit à l'incident qui l'a produit. Un total faux affiché
 * disparaît au rechargement suivant ; le même total dans un fichier part
 * au comptable et revient dans un rapport six semaines plus tard, sans
 * l'encadré rouge qui disait pourquoi il était faux.
 *
 * Le fichier porte donc toujours ses lignes — elles sont exactes, chaque
 * paiement est ce qu'il est — et, à la place des totaux, la raison de leur
 * absence.
 */
export const COLONNES_GRAND_LIVRE: readonly string[] = [
  "Référence",
  "Reçu le (UTC)",
  "Compte",
  "Montant",
  "Devise",
  "Moyen",
  "État",
  "Référence opérateur",
  "Cause du refus",
  "Constat d'écart",
  "Issue de l'écart",
];

export const ATTESTATION_TOTAL_SUSPENDU =
  "Total non calculé : l'opérateur ne répondait pas au moment de l'export, et un total partiel présenté comme un total est une erreur comptable. Les lignes ci-dessous sont exactes ; leur somme ne l'est pas encore.";

export const MENTION_UNE_SOMME_PAR_MONNAIE =
  "Une somme par monnaie, jamais une somme tout court : additionner des francs et des euros produit un nombre qui n'est ce qu'il annonce dans aucune des deux.";

/** Le grand livre en cellules — en-tête, colonnes, lignes, totaux. */
export interface GrandLivre {
  /** Lignes du livre, toutes exactes quel que soit l'état de l'opérateur. */
  paiements: readonly Paiement[];
  /** `null` quand aucun rapprochement n'a encore abouti. */
  operateur: EtatOperateur | null;
  journee: string;
}

/**
 * Les totaux du fichier, ou la raison de leur absence.
 *
 * Renvoyer `null` plutôt qu'un tableau vide : un tableau vide se
 * rendrait en « 0 », et zéro encaissé n'est pas la même information
 * qu'un total qu'on ne sait pas calculer.
 */
export function totauxDeLExport(livre: GrandLivre): { devise: string; montant: number }[] | null {
  if (livre.operateur === null || !totalPubliable(livre.operateur)) return null;
  return lignesDeTotal(agreger(livre.paiements).encaisse);
}

/** Une ligne du livre. Les montants passent par `nombre`, jamais par `texte`. */
export const ligneDuGrandLivre = (p: Paiement): readonly Cellule[] => [
  texte(p.reference),
  texte(p.recuLe),
  texte(p.compte),
  // Un montant négatif commence par « - » : neutralisé comme du texte, il
  // cesserait d'être un nombre pour le tableur, et aucune somme ne le
  // reprendrait. C'est pourquoi la cellule est typée.
  nombre(p.montant, p.devise === "EUR" ? 2 : 0),
  texte(p.devise),
  texte(p.moyen),
  texte(LIBELLE_RAPPROCHEMENT[p.etat]),
  texte(p.transaction ?? ""),
  texte(p.cause ? LIBELLE_CAUSE[p.cause] : ""),
  texte(p.ecart?.constat ?? ""),
  texte(p.ecart?.resolution ? LIBELLE_ISSUE[p.ecart.resolution.issue] : ""),
];

export function exportDuGrandLivre(
  livre: GrandLivre,
): readonly (readonly Cellule[])[] {
  const totaux = totauxDeLExport(livre);

  return [
    [texte("Grand livre ImmiPro")],
    [texte("Journée"), texte(livre.journee)],
    [texte("Paiements"), nombre(livre.paiements.length)],
    ...(totaux === null
      ? [[texte("Total encaissé"), texte(ATTESTATION_TOTAL_SUSPENDU)]]
      : totaux.map((t) => [
          texte(`Total encaissé (${t.devise})`),
          nombre(t.montant, t.devise === "EUR" ? 2 : 0),
        ])),
    [texte("Monnaies"), texte(MENTION_UNE_SOMME_PAR_MONNAIE)],
    [vide],
    COLONNES_GRAND_LIVRE.map(texte),
    ...livre.paiements.map(ligneDuGrandLivre),
  ];
}

export const nomDuGrandLivre = (jour: string): string =>
  nomDatable("grand-livre", jour, jour);

/**
 * Ce que B-04 devrait porter et ne porte pas encore.
 *
 * Même registre qu'`ACTIONS_ATTENDUES` en B-03 et `COMMANDES_ATTENDUES`
 * en B-07 : le bouton part, le besoin reste nommé.
 */
export interface CommandeAttendue {
  cle: string;
  libelle: string;
  manque: string;
}

export const COMMANDES_ATTENDUES_B04: readonly CommandeAttendue[] = [
  {
    cle: "rapprochement-manuel",
    libelle: "Lancer le rapprochement",
    /**
     * Le bouton changeait de libellé selon l'état de l'opérateur —
     * « Lancer » quand il répondait, « Rapprocher à la main » quand il se
     * taisait — et ne faisait rien dans les deux cas. Le second libellé
     * était le plus trompeur : il proposait la seule chose qui aurait
     * servi pendant un incident.
     *
     * Rapprocher demande d'interroger l'opérateur, et `interrogation`
     * n'est pas branchée. Une relance manuelle n'a de sens que le jour où
     * il y a quelqu'un à relancer.
     */
    manque:
      "l'interrogation de l'opérateur, qui n'est pas branchée : sans elle il n'y a personne à interroger",
  },
];
