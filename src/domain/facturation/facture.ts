import type { Regime } from "@/domain/facturation/montants";

/**
 * Ce que porte une facture, et ce qui manque pour en émettre une vraie —
 * avis comptable M.C du 04/10/2026.
 *
 * L'avis liste les mentions obligatoires. Elles viennent de quatre
 * sources, et aucune ne se complète d'elle-même :
 *
 * - **l'émetteur** — dénomination, forme, capital, siège, RCCM, IFU,
 *   contact — des variables saisies une fois dans `/textes-juridiques`,
 *   les mêmes que les mentions légales et le reçu ;
 * - **le client** — nom et adresse, demandés avant le premier paiement
 *   réel (décision du 04/10/2026) puis figés sur la pièce ;
 * - **le régime de TVA** — déclaré par l'exploitant, jamais deviné ;
 * - **le code de certification** — rendu par le système de facture
 *   normalisée de l'administration fiscale. Aucun adaptateur n'est écrit :
 *   il demande l'immatriculation de Rêveur Digital et un accès que le
 *   dépôt n'a pas, et l'inventer produirait une pièce fausse.
 *
 * Tant qu'une source manque, la série réelle reste fermée, et le paiement
 * réel avec elle : l'avis demande de ne pas encaisser tant que le circuit
 * facture + avoir n'est pas en place.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/** Les variables de l'émetteur qu'une facture exige — le reçu n'en demandait pas le capital. */
export const CLES_EMETTEUR_FACTURE = [
  "denomination",
  "forme_juridique",
  "capital_social",
  "siege_social",
  "rccm",
  "ifu",
  "email_contact",
] as const;

/** Les lignes d'émetteur d'une facture, ou `null` tant qu'une mention manque. */
export function emetteurDeLaFacture(
  valeurs: Readonly<Record<string, string>>,
): readonly string[] | null {
  const v = (cle: (typeof CLES_EMETTEUR_FACTURE)[number]) => (valeurs[cle] ?? "").trim();
  if (CLES_EMETTEUR_FACTURE.some((cle) => v(cle) === "")) return null;
  return [
    `${v("denomination")}, ${v("forme_juridique")} au capital de ${v("capital_social")}`,
    v("siege_social"),
    `RCCM ${v("rccm")} · IFU ${v("ifu")}`,
    v("email_contact"),
  ];
}

/* ------------------------------------------------------------------ *
 * L'identité de facturation du client.
 * ------------------------------------------------------------------ */

export const NOM_FACTURATION = {
  libelle: "Nom à porter sur la facture",
  aide: "Prénom et nom, ou raison sociale si tu paies pour une structure.",
  max: 120,
} as const;

export const ADRESSE_FACTURATION = {
  libelle: "Adresse de facturation",
  aide: "Rue ou quartier, ville et pays. Elle figure sur chaque facture et y reste dix ans.",
  max: 300,
} as const;

/** Ce que l'avis demande pour un client sans IFU. */
export const QUALITE_CLIENT_PARTICULIER = "Particulier";

export interface IdentiteDeFacturation {
  nom: string;
  adresse: string;
}

/** Nom et adresse, nettoyés ; `null` tant que l'un des deux manque. */
export function identiteDeFacturation(
  nom: string | null | undefined,
  adresse: string | null | undefined,
): IdentiteDeFacturation | null {
  const n = (nom ?? "").trim().replace(/\s+/gu, " ");
  const a = (adresse ?? "").trim().replace(/[ \t]+/gu, " ");
  if (n === "" || a === "") return null;
  return { nom: n, adresse: a };
}

/* ------------------------------------------------------------------ *
 * Ce qui ferme la série réelle.
 * ------------------------------------------------------------------ */

export type ObstacleALaFacturation =
  /** Le système de facture normalisée n'a pas d'adaptateur. */
  | "certification_absente"
  /** Une mention de l'émetteur n'est pas saisie dans /textes-juridiques. */
  | "emetteur_incomplet"
  /** `FACTURATION_TVA` est vide ou illisible. */
  | "regime_tva_non_declare";

export interface EtatDeLaFacturation {
  certificationBranchee: boolean;
  emetteurComplet: boolean;
  regime: Regime;
}

/** Ce qui manque, côté exploitant, pour émettre une facture réelle. Vide : rien. */
export function obstaclesALaFacturation(etat: EtatDeLaFacturation): ObstacleALaFacturation[] {
  const obstacles: ObstacleALaFacturation[] = [];
  if (!etat.certificationBranchee) obstacles.push("certification_absente");
  if (!etat.emetteurComplet) obstacles.push("emetteur_incomplet");
  if (!etat.regime.declare) obstacles.push("regime_tva_non_declare");
  return obstacles;
}

/** Ce que l'exploitant lit pour chaque obstacle : quoi faire, pas seulement quoi manque. */
export const REMEDE: Record<ObstacleALaFacturation, string> = {
  certification_absente:
    "Le système de facture normalisée n'est pas branché : il faut l'immatriculation de Rêveur Digital et l'accès au service de certification, puis un adaptateur.",
  emetteur_incomplet:
    "Une mention de l'émetteur manque (dénomination, forme, capital, siège, RCCM, IFU ou contact) : à saisir dans /textes-juridiques.",
  regime_tva_non_declare:
    "Le régime de TVA n'est pas déclaré : renseigner FACTURATION_TVA (« non_assujettie » ou le taux, par exemple « 18 »).",
};

/**
 * Ce que lit le candidat quand l'encaissement réel attend la facturation.
 * Ce n'est pas une panne : réessayer ne changera rien.
 */
export const MENTION_FACTURATION_EN_ATTENTE =
  "Le paiement en ligne ouvrira dès que notre facturation sera en place. Rien n'a été débité, et ton dossier reste tel quel.";

/** Ce que lit le candidat à qui il manque le nom ou l'adresse de facturation. */
export const MENTION_IDENTITE_MANQUANTE =
  "Chaque paiement donne lieu à une facture à ton nom. Renseigne ton nom et ton adresse de facturation dans ton profil, puis reviens payer.";

/* ------------------------------------------------------------------ *
 * Le règlement.
 * ------------------------------------------------------------------ */

/**
 * Le mode de règlement tel qu'il s'imprime. L'avis demande de préciser
 * l'opérateur Mobile Money ; tant que la notification ne l'a pas dit, la
 * pièce le dit aussi plutôt que d'en choisir un.
 */
export function modeDeReglement(fournisseur: string, operateur: string | null): string {
  if (fournisseur === "FEDAPAY") {
    return operateur
      ? `Mobile Money (${operateur}), via FedaPay`
      : "Mobile Money via FedaPay — opérateur non communiqué par le prestataire";
  }
  if (fournisseur === "STRIPE") return "Carte bancaire, via Stripe";
  return "Paiement en ligne";
}

/** La désignation d'une vente : ce qui a été acheté et, s'il y a lieu, pour quel dossier. */
export function designation(achat: string, dossier: string | null): string {
  return dossier ? `${achat} — ${dossier}` : achat;
}

/**
 * La date de la prestation qu'une pièce constate — revue du 07/10/2026,
 * F5 (D-14, option a).
 *
 * Le numéro et l'exercice suivent l'émission : la suite reste
 * chronologique et continue, et rien ne s'émet dans une série close. Mais
 * une vente du 31/12 à 23 h 50 dont la facture n'est émise que le 02/01,
 * par le filet de la réconciliation, ne portait plus aucune trace du
 * 31/12 — la note M.C demande « la date ou la période de la prestation ».
 *
 * Une facture constate la vente : la confirmation du paiement. Un avoir
 * constate le remboursement : sa confirmation. À défaut — une vente
 * confirmée sans date, qu'aucune transition ne produit —, l'émission,
 * c'est-à-dire ce que la pièce portait jusqu'ici.
 */
export function dateDeLaPrestation(
  genre: "FACTURE" | "AVOIR",
  vente: { confirmedAt: Date | null; refundedAt: Date | null },
  emiseLe: Date,
): Date {
  return (genre === "FACTURE" ? vente.confirmedAt : vente.refundedAt) ?? emiseLe;
}

/** Combien de temps une facture et un avoir se conservent (OHADA et fiscal béninois). */
export const CONSERVATION_PIECES_COMPTABLES_ANS = 10;

/** L'arrêté de la somme, formule d'usage. */
export const arreteDeLaSomme = (enLettres: string, genre: "FACTURE" | "AVOIR"): string =>
  `Arrêtée la présente ${genre === "FACTURE" ? "facture" : "facture d'avoir"} à la somme de ${enLettres}.`;

/* ------------------------------------------------------------------ *
 * Ce que /api/health en dit.
 * ------------------------------------------------------------------ */

export interface SurveillanceDeLaFacturation {
  /** La série dans laquelle une vente confirmée maintenant serait facturée. */
  serie: "REELLE" | "ESSAI";
  /** Vrai quand l'espace est réel et que la série réelle reste fermée : 503. */
  bloquante: boolean;
  obstacles: readonly ObstacleALaFacturation[];
  remedes: readonly string[];
  regimeTva: "non_assujettie" | "assujettie" | "non_declare" | "illisible";
  message: string;
}

/**
 * En bac à sable, la série d'essai suffit : rien ne bloque, et les
 * obstacles sont dits pour qu'on les lève avant l'encaissement réel. Dès
 * que l'espace est réel, un obstacle restant est une inaptitude — la même
 * logique que le remboursement manuel au-delà de son seuil.
 */
export function surveillanceDeLaFacturation(
  obstacles: readonly ObstacleALaFacturation[],
  espaceReel: boolean,
  regime: Regime,
): SurveillanceDeLaFacturation {
  const regimeTva = regime.declare
    ? regime.assujettie
      ? "assujettie"
      : "non_assujettie"
    : regime.illisible
      ? "illisible"
      : "non_declare";
  const bloquante = espaceReel && obstacles.length > 0;
  const message = !espaceReel
    ? obstacles.length === 0
      ? "Espace de test : les ventes reçoivent une facture d'essai. La série réelle est prête."
      : `Espace de test : les ventes reçoivent une facture d'essai. Avant l'encaissement réel, ${obstacles.length} point(s) à lever.`
    : bloquante
      ? "Espace réel sans facturation en place : aucun paiement réel ne s'ouvre, et l'instance se déclare inapte."
      : "Espace réel : chaque vente reçoit une facture certifiée, chaque remboursement un avoir.";
  return {
    serie: espaceReel ? "REELLE" : "ESSAI",
    bloquante,
    obstacles,
    remedes: obstacles.map((o) => REMEDE[o]),
    regimeTva,
    message,
  };
}
