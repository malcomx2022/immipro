import { analysesParDestination, getPack, type Devise } from "./pricing";

/**
 * La montée en gamme d'Essentiel à Dossier — arbitrage S.88.
 *
 * ── Ce qui manquait ─────────────────────────────────────────────────
 *
 * Un dossier couvert par Essentiel ne pouvait pas passer à Dossier. La
 * page des packs renvoyait au dossier tout candidat qui en avait déjà
 * payé un, et le récapitulatif, lui, vendait Dossier **au prix plein** à
 * qui en forgeait l'adresse : 15 000 F de plus pour un dossier déjà
 * payé 5 000, et 40 analyses au lieu de 30.
 *
 * ── Ce qui est tranché ──────────────────────────────────────────────
 *
 * Sur un même dossier, le passage se paie **la différence** :
 *
 *     prix actuel de Dossier, dans la devise de l'achat Essentiel
 *   − montant effectivement payé pour cet achat Essentiel
 *   = montant dû, jamais négatif
 *
 * Aucune conversion : les grilles XOF et EUR restent natives, et la
 * montée garde la devise de l'achat d'origine. Aux tarifs actuels,
 * 15 000 − 5 000 = 10 000 F, et 29 − 12 = 17 €.
 *
 * Elle transforme la couverture du dossier : le quota issu du pack passe
 * de 10 à 30 analyses — **vingt ajoutées, jamais trente** — et la
 * rédaction assistée s'ouvre. Les recharges sont des achats séparés :
 * elles ne réduisent ni le prix ni les vingt analyses.
 *
 * Un achat de Dossier au prix plein reste possible. C'est un achat
 * supplémentaire, et rien ne le présente comme une montée en gamme.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/** Le code écrit dans `Transaction.packCode`, et le paramètre `achat` du récapitulatif. */
export const CODE_MONTEE_DOSSIER = "montee-dossier";

/** Le pack de départ et celui d'arrivée — lus sur la grille, jamais recopiés. */
export const PACK_DE_DEPART = "essentiel";
export const PACK_D_ARRIVEE = "dossier";

const depart = () => getPack(PACK_DE_DEPART)!;
const arrivee = () => getPack(PACK_D_ARRIVEE)!;

export const LIBELLE_MONTEE = `Passage d'${depart().libelle} à ${arrivee().libelle}`;

/** Le quota du pack avant et après, sur ce dossier : 10 puis 30. */
export const ANALYSES_AVANT = analysesParDestination(depart());
export const ANALYSES_APRES = analysesParDestination(arrivee());

/** Vingt, et non trente : les dix d'Essentiel restent, elles ne se rachètent pas. */
export const ANALYSES_AJOUTEES = ANALYSES_APRES - ANALYSES_AVANT;

/**
 * Le montant dû pour passer à Dossier.
 *
 * `paye` est ce que l'achat Essentiel a **réellement** encaissé, dans sa
 * devise — et non le prix d'Essentiel aujourd'hui : un Essentiel acheté
 * avant une hausse n'a pas payé le nouveau tarif, et lui retrancher ce
 * nouveau tarif le ferait payer moins que la différence réelle.
 */
export function prixDeLaMontee(paye: { montant: number; devise: Devise }): number {
  return Math.max(0, arrivee().prix[paye.devise] - paye.montant);
}

// ── L'achat source, et ce qu'il permet ──────────────────────────────────

/**
 * Un achat Essentiel candidat, tel que la base le décrit — sans rien de
 * Prisma.
 */
export interface AchatSource {
  transactionId: string;
  reference: string;
  packCode: string;
  statut: "INITIEE" | "EN_ATTENTE" | "CONFIRMEE" | "ECHOUEE" | "EXPIREE" | "REMBOURSEE";
  montant: number;
  devise: Devise;
  /** Un octroi `ACHAT_PACK` de cet achat existe sur ce dossier. */
  couvreLeDossier: boolean;
  /** `refundDueAt` posé : un remboursement est décidé ou en cours. */
  remboursementOuvert: boolean;
  /**
   * La montée déjà partie de cet achat, sur ce dossier : aucune, en
   * attente de paiement, confirmée, ou confirmée mais dont le
   * remboursement est engagé. Une montée remboursée compte pour aucune.
   */
  montee: "AUCUNE" | "EN_COURS" | "CONFIRMEE" | "EN_REMBOURSEMENT";
}

export type RaisonDuRefus =
  | "SANS_ESSENTIEL"
  | "DEJA_DOSSIER"
  | "DEJA_MONTE"
  | "MONTEE_EN_REMBOURSEMENT"
  | "REMBOURSEMENT"
  | "SANS_SUPPLEMENT";

export type VerdictDeLaMontee =
  | {
      ouverte: true;
      source: AchatSource;
      montant: number;
      devise: Devise;
      /** Une montée en attente existe : le récapitulatif la reprend. */
      reprise: boolean;
    }
  | { ouverte: false; raison: RaisonDuRefus; message: string };

/**
 * Chaque refus dit ce qui l'arrête et ce qui reste possible. Aucun ne
 * se contente de « non disponible ».
 */
export const MESSAGE_DU_REFUS: Record<RaisonDuRefus, string> = {
  SANS_ESSENTIEL:
    "Ce dossier n'est pas couvert par un achat Essentiel confirmé. Le passage à Dossier au prix de la différence ne concerne que ce cas ; les packs se choisissent depuis la page des packs.",
  DEJA_DOSSIER:
    "Ce dossier est déjà couvert par Dossier ou Dossier Pro : la rédaction assistée y est ouverte. Pour plus d'analyses, ajoute une recharge.",
  DEJA_MONTE:
    "Ce dossier est déjà passé à Dossier. Pour plus d'analyses, ajoute une recharge.",
  MONTEE_EN_REMBOURSEMENT:
    "Le passage à Dossier de ce dossier est en cours de remboursement. Une fois le remboursement versé, tu pourras le refaire.",
  REMBOURSEMENT:
    "L'achat Essentiel de ce dossier est remboursé ou en cours de remboursement : il ne peut plus servir de base au passage à Dossier.",
  SANS_SUPPLEMENT:
    "Ton achat Essentiel a coûté autant que Dossier aujourd'hui : il n'y a pas de différence à payer, et le passage ne se fait pas par paiement. Écris au support depuis ton dossier.",
};

const refus = (raison: RaisonDuRefus): VerdictDeLaMontee => ({
  ouverte: false,
  raison,
  message: MESSAGE_DU_REFUS[raison],
});

/**
 * Le passage à Dossier est-il ouvert sur ce dossier, et depuis quel achat ?
 *
 * Les conditions de l'arbitrage, dans l'ordre où un candidat les
 * rencontrerait :
 *
 * 1. le dossier n'est pas déjà couvert par un pack qui ouvre la rédaction
 *    assistée (`dejaCouvertParDossier`) ;
 * 2. un achat Essentiel **confirmé** couvre ce dossier ;
 * 3. il n'est ni remboursé, ni en cours de remboursement ;
 * 4. aucune montée confirmée n'en est déjà partie — une en attente est
 *    reprise, pas doublée ;
 * 5. la différence est positive.
 *
 * Plusieurs Essentiel sur un même dossier : le plus ancien qui convient.
 * Les candidats arrivent dans l'ordre de création.
 */
export function verdictDeLaMontee(
  sources: readonly AchatSource[],
  dejaCouvertParDossier: boolean,
): VerdictDeLaMontee {
  const essentiels = sources.filter(
    (s) => s.packCode === PACK_DE_DEPART && s.statut === "CONFIRMEE" && s.couvreLeDossier,
  );
  if (essentiels.some((s) => s.montee === "CONFIRMEE")) return refus("DEJA_MONTE");
  if (essentiels.some((s) => s.montee === "EN_REMBOURSEMENT")) {
    return refus("MONTEE_EN_REMBOURSEMENT");
  }
  if (dejaCouvertParDossier) return refus("DEJA_DOSSIER");
  if (essentiels.length === 0) return refus("SANS_ESSENTIEL");

  const valables = essentiels.filter((s) => !s.remboursementOuvert);
  if (valables.length === 0) return refus("REMBOURSEMENT");

  // Une montée en attente d'abord : c'est elle que le candidat a commencée.
  const source = valables.find((s) => s.montee === "EN_COURS") ?? valables[0]!;
  const montant = prixDeLaMontee({ montant: source.montant, devise: source.devise });
  if (montant <= 0) return refus("SANS_SUPPLEMENT");

  return { ouverte: true, source, montant, devise: source.devise, reprise: source.montee === "EN_COURS" };
}

// ── Ce que l'écran en dit ───────────────────────────────────────────────

/**
 * Les lignes du récapitulatif. Le calcul est écrit en entier : le
 * candidat voit ce qu'il a payé, ce que coûte Dossier, et la différence.
 */
export function ceQueLaMonteeOuvre(): readonly string[] {
  return [
    `${ANALYSES_AJOUTEES} analyses ajoutées à ce dossier : le quota du pack passe de ${ANALYSES_AVANT} à ${ANALYSES_APRES}.`,
    "La rédaction assistée s'ouvre : proposition de texte et analyse critique.",
    "Tes recharges déjà achetées restent à toi, en plus : elles ne changent ni ce prix ni ces analyses.",
  ];
}

/** « 15 000 F − 5 000 F déjà payés = 10 000 F », sans rien arrondir. */
export interface DetailDuPrix {
  prixDossier: number;
  dejaPaye: number;
  montant: number;
  devise: Devise;
}

export const detailDuPrix = (paye: { montant: number; devise: Devise }): DetailDuPrix => ({
  prixDossier: arrivee().prix[paye.devise],
  dejaPaye: paye.montant,
  montant: prixDeLaMontee(paye),
  devise: paye.devise,
});

/**
 * La différence entre les deux gestes que l'écran propose, dite en une
 * phrase chacun. Ils ne se confondent pas : l'un change la couverture du
 * dossier, l'autre ajoute des analyses et rien d'autre.
 */
export const PHRASE_MONTEE = `Passer à ${arrivee().libelle} : tu paies la différence, ${ANALYSES_AJOUTEES} analyses s'ajoutent et la rédaction assistée s'ouvre.`;
export const PHRASE_RECHARGE =
  "Ajouter des analyses : une recharge indépendante, qui ne change pas ton pack.";

// ── Le remboursement du supplément ──────────────────────────────────────

/**
 * Ce que le remboursement d'une montée retire, lu sur le solde du dossier.
 *
 * Les consommations ne portent pas de transaction : un solde n'a pas de
 * couleur. Les analyses supplémentaires sont donc tenues pour consommées
 * **en dernier** — après celles d'Essentiel et des recharges. Tant que le
 * solde couvre les vingt, elles sont toutes encore disponibles et se
 * retirent ; en deçà, une partie a servi, et un humain tranche.
 *
 * Le remboursement ne touche jamais aux réponses, textes et versions :
 * il retire des analyses et le droit à de nouveaux appels, rien d'écrit.
 */
export type SuiteDuRemboursementDeLaMontee =
  | { suite: "RETRAIT_INTEGRAL"; retire: number }
  | { suite: "REVUE_MANUELLE"; ouvertes: number; consommees: number };

export function suiteDuRemboursementDeLaMontee(
  ajoutees: number,
  soldeDuDossier: number,
): SuiteDuRemboursementDeLaMontee {
  if (soldeDuDossier >= ajoutees) return { suite: "RETRAIT_INTEGRAL", retire: ajoutees };
  return {
    suite: "REVUE_MANUELLE",
    ouvertes: ajoutees,
    consommees: ajoutees - Math.max(0, soldeDuDossier),
  };
}

export const MOTIF_REVUE_MONTEE = (consommees: number, ouvertes: number): string =>
  `Remboursement d'un passage à Dossier : ${consommees} des ${ouvertes} analyses ajoutées ont déjà servi. Le montant à rendre se décide à la main.`;
