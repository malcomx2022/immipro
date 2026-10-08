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
   * Ce qui est rendu ou à rendre, dans l'unité de `montant` — RG-15.2.
   * Présent dès qu'un remboursement est dû ou fait ; inférieur à
   * `montant` pour un pack entamé, remboursé au prorata.
   */
  montantRembourse?: number;
  /**
   * Un remboursement attend que la direction fixe sa somme — RG-15.2, M4.
   * Hors de la règle du prorata, rien ne part tant qu'elle n'est pas
   * tranchée ; B-04 propose alors la tranche au lieu de l'issue générique.
   */
  revueATrancher?: true;
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

const parDevise = (
  paiements: readonly Paiement[],
  montant: (p: Paiement) => number = (p) => p.montant,
): Totaux => {
  const totaux: Totaux = {};
  for (const p of paiements) totaux[p.devise] = arrondiAuCentime((totaux[p.devise] ?? 0) + montant(p));
  return totaux;
};

/** Un prorata en euros porte des centimes : 7,2 + 0,1 ne doit pas devenir 7,300000000000001. */
const arrondiAuCentime = (n: number): number => Math.round(n * 100) / 100;

/** Ce que B-04 écrit sous un remboursement partiel, montants déjà mis en forme. */
export const libelleRemboursementPartiel = (rendu: string, paye: string, verse: boolean): string =>
  `${rendu} ${verse ? "rendus" : "à rendre"} sur ${paye} payés, au prorata des analyses restantes`;

/** La somme rendue, ou à rendre (RG-15.2) — le prix payé à défaut. */
export const sommeRendue = (p: Paiement): number => p.montantRembourse ?? p.montant;

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
    rembourse: parDevise(rendus, sommeRendue),
    remboursementsDus: dus.length,
    remboursementDu: parDevise(dus, sommeRendue),
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
  // RG-15.2 : un pack entamé ne rend pas ce qu'il a coûté. Vide quand
  // aucun remboursement n'est dû ni fait.
  "Montant remboursé",
];

export const ATTESTATION_TOTAL_SUSPENDU =
  "Total non calculé : l'opérateur ne répondait pas au moment de l'export, et un total partiel présenté comme un total est une erreur comptable. Les lignes ci-dessous sont exactes ; leur somme ne l'est pas encore.";

/**
 * Une journée sans paiement — B-04, et la case de `CLAUDE.md` qui demande
 * que l'état vide soit traité.
 *
 * ── Le tableau n'avait pas d'état vide, et son titre était faux ──────
 *
 * L'écran annonce « Journée du 24 septembre 2026 » et son tableau porte
 * « Paiements de la journée ». Le lecteur rendait les **cent dernières
 * transactions, toutes dates confondues**. Exécuté :
 *
 *     l'écran annonce « Journée du 24 septembre 2026 » et reçoit 3 lignes
 *     total affiché : 100 000 XOF
 *     total réel de la journée : 50 000 XOF
 *
 * Les deux paiements du 20 entraient dans les totaux du 24. Et l'export,
 * lui, porte le jour dans son nom de fichier et dans sa ligne de journal —
 * `grand-livre:2026-09-24` — en appelant le même lecteur non filtré : un
 * livre attesté pour une date qu'il ne couvre pas.
 *
 * Une fois la journée réellement bornée, une journée creuse devient
 * fréquente, et un tableau vide sous quatre compteurs à zéro ne dit pas si
 * la lecture a échoué. Il le dit maintenant, comme le journal d'audit le
 * fait déjà : « s'il n'affiche rien, il ne s'est rien passé ».
 *
 * Une journée à venir se distingue d'une journée creuse : rien n'a pu y
 * être encaissé, et l'annoncer comme un fait épargne de chercher une
 * panne.
 */
export interface JourneeSansPaiement {
  message: string;
  /** Ce que l'absence ne veut pas dire. */
  precision: string;
}

export function diagnostiquerLaJournee(
  paiements: readonly Paiement[],
  jourIso: string,
  aujourdhuiIso: string,
): JourneeSansPaiement | null {
  if (paiements.length > 0) return null;
  if (jourIso > aujourdhuiIso) {
    return {
      message: "Cette journée n'est pas encore venue.",
      precision:
        "Aucun paiement ne peut y figurer : le livre d'une journée à venir est vide par construction.",
    };
  }
  return {
    message: "Aucun paiement ce jour-là.",
    precision:
      "Le tableau ne comble jamais une journée creuse : s'il n'affiche rien, rien n'a été encaissé ni tenté. L'export reste possible et produit un livre attestant l'absence.",
  };
}

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
  p.montantRembourse === undefined
    ? vide
    : nombre(p.montantRembourse, p.devise === "EUR" ? 2 : 0),
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

// ── Lancer le rapprochement — rétabli, S.122 ───────────────────────────

/**
 * Le compte rendu d'une passe de rapprochement lancée à la main.
 *
 * Le bouton avait été retiré parce que rapprocher demande d'interroger
 * l'opérateur, et que l'interrogation n'était pas branchée. Elle l'est :
 * le job de réconciliation consulte FedaPay. Le bouton revient donc, et
 * il appelle **la même fonction que le worker** — il n'a ni sa propre
 * logique, ni son propre chemin d'écriture (INV-7) : un état retrouvé
 * s'applique par le service des webhooks signés, jamais par l'écran.
 *
 * Quatre nombres, et ils se somment : les transactions **consultées**
 * (le fournisseur a répondu) se partagent entre celles dont l'état
 * retrouvé a été **appliqué** et celles **inchangées** ; les
 * **indisponibles** sont les autres, celles dont rien n'a été écrit.
 */
export interface BilanDeLaPasse {
  /** Transactions en attente assez anciennes pour être consultées. */
  examinees: number;
  /** Parmi elles, celles dont le fournisseur n'a pas répondu. */
  indisponibles: number;
  /** États retrouvés chez le fournisseur et appliqués. */
  rattrapees: number;
}

export interface ResumeDuRapprochement {
  /** Transactions pour lesquelles le fournisseur a répondu. */
  consultees: number;
  /** Dont l'état retrouvé a été appliqué. */
  appliquees: number;
  /** Dont la réponse n'a rien changé : état identique, ou anomalie portée en écart. */
  inchangees: number;
  /** Sans réponse : rien n'a été écrit, une absence de réponse n'est pas un refus. */
  indisponibles: number;
}

export function resumerLeRapprochement(bilan: BilanDeLaPasse): ResumeDuRapprochement {
  const indisponibles = Math.min(Math.max(bilan.indisponibles, 0), bilan.examinees);
  const consultees = bilan.examinees - indisponibles;
  const appliquees = Math.min(Math.max(bilan.rattrapees, 0), consultees);
  return { consultees, appliquees, inchangees: consultees - appliquees, indisponibles };
}

const pluriel = (n: number, un: string, plusieurs: string): string =>
  `${n} ${n > 1 ? plusieurs : un}`;

/**
 * Ce que la passe a fait, en une phrase — jamais « terminé » tout court.
 *
 * Trois cas se distinguent parce qu'ils appellent trois gestes : rien
 * n'attendait (rien à faire), personne n'a répondu (la passe n'a rien
 * prouvé : elle le dit et dit quand elle reviendra), ou le fournisseur a
 * répondu pour tout ou partie.
 */
export function phraseDuRapprochement(resume: ResumeDuRapprochement): string {
  const total = resume.consultees + resume.indisponibles;
  if (total === 0) {
    return "Aucune transaction n'attendait de rapprochement : il n'y avait rien à consulter.";
  }
  if (resume.consultees === 0) {
    return `Le fournisseur n'a répondu pour aucune des ${pluriel(total, "transaction", "transactions")}. Rien n'a été modifié : une absence de réponse n'est pas un refus. Relancez la passe quand l'API répondra ; la passe automatique repasse de toute façon toutes les quinze minutes.`;
  }
  const base = `${pluriel(resume.consultees, "transaction consultée", "transactions consultées")} : ${pluriel(resume.appliquees, "état appliqué", "états appliqués")}, ${pluriel(resume.inchangees, "inchangée", "inchangées")}.`;
  return resume.indisponibles > 0
    ? `${base} ${pluriel(resume.indisponibles, "transaction sans réponse du fournisseur, laissée", "transactions sans réponse du fournisseur, laissées")} en l'état.`
    : base;
}

export const MENTION_RAPPROCHEMENT_MANUEL =
  "Une passe interroge le fournisseur sur les transactions en attente de plus de dix minutes, comme celle qui tourne seule toutes les quinze minutes. Elle applique l'état retrouvé par le même service que les notifications signées, et ne force aucun paiement.";

/**
 * Ce que B-04 devrait porter et ne porte pas encore.
 *
 * Même registre qu'`ACTIONS_ATTENDUES` en B-03 et `COMMANDES_ATTENDUES`
 * en B-07 : le bouton part, le besoin reste nommé.
 *
 * **Vide depuis S.122** : « Lancer le rapprochement » était la seule
 * entrée, et l'interrogation de l'opérateur qui lui manquait est branchée.
 * Le registre est gardé — une commande retirée demain s'y nommera.
 */
export interface CommandeAttendue {
  cle: string;
  libelle: string;
  manque: string;
}

export const COMMANDES_ATTENDUES_B04: readonly CommandeAttendue[] = [];

