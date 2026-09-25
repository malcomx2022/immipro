import { PACKS, getPack } from "./pricing";
import { CODE_MONTEE_DOSSIER, PACK_D_ARRIVEE } from "./montee";

/**
 * Les droits qu'une couverture ouvre sur un dossier — arbitrage S.80.
 *
 * ── La frontière ────────────────────────────────────────────────────
 *
 * Elle porte sur l'intervention du service d'IA, pas sur le droit du
 * candidat à écrire son propre document. Avec Essentiel, il garde
 * l'entretien guidé et ses réponses, l'écriture et la réécriture
 * manuelles, les versions et leur restauration, les exports, et les
 * recoupements déterministes qui n'appellent aucun service. Dossier et
 * Dossier Pro ajoutent ce que le service fait pour lui : proposer un texte
 * à partir des réponses, reformuler, analyser le texte, recouper avec les
 * pièces lues automatiquement.
 *
 * ── Ce qui décide ───────────────────────────────────────────────────
 *
 * La couverture **attribuée au dossier**, lue dans le grand livre des
 * analyses : les octrois `ACHAT_PACK` qu'il a reçus, et le pack de la
 * transaction qui les porte. Jamais le dernier pack acheté par le compte :
 * un Pro dont les trois destinations sont déjà servies n'ouvre rien sur un
 * quatrième dossier, et un Essentiel acheté ensuite pour un autre dossier
 * ne retire rien à celui qu'un Dossier couvre.
 *
 * Une recharge d'analyses n'est pas une couverture : elle rallonge un
 * quota, elle n'ouvre aucun droit. Une couverture dont le paiement est en
 * cours de remboursement ne compte plus — ses analyses restantes sont
 * retirées au même moment, et le droit suit.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export interface CouvertureDuDossier {
  /** Code du pack de la transaction qui a crédité le dossier. */
  packCode: string;
  /** Le paiement est remboursé, ou son remboursement est engagé. */
  retiree: boolean;
}

/** Les packs qui ouvrent la rédaction assistée, lus dans la grille. */
export const PACKS_REDACTION_ASSISTEE: readonly string[] = PACKS.filter(
  (p) => p.redactionAssistee,
).map((p) => p.code);

/**
 * Les codes d'achat dont un octroi ouvre la rédaction assistée : les packs
 * qui la portent, et le passage d'Essentiel à Dossier (S.88). La montée
 * n'est pas un pack de la grille, mais elle fait du dossier un dossier
 * couvert par Dossier — et son remboursement retire le droit comme celui
 * d'un pack, par `retiree`.
 */
export const CODES_REDACTION_ASSISTEE: readonly string[] = [
  ...PACKS_REDACTION_ASSISTEE,
  CODE_MONTEE_DOSSIER,
];

export const redactionAssisteeOuverte = (couvertures: readonly CouvertureDuDossier[]): boolean =>
  couvertures.some((c) => !c.retiree && CODES_REDACTION_ASSISTEE.includes(c.packCode));

/** Les noms, dans l'ordre de la grille : « Dossier et Dossier Pro ». */
export const packsDeLaRedactionAssistee = (): string => {
  const noms = PACKS.filter((p) => p.redactionAssistee).map((p) => p.libelle);
  return noms.length <= 1 ? (noms[0] ?? "") : `${noms.slice(0, -1).join(", ")} et ${noms.at(-1)}`;
};

/**
 * Ce que le candidat lit quand le geste lui est refusé. La phrase dit
 * d'abord ce qui reste — c'est la première question de quelqu'un qui vient
 * de passer vingt minutes sur son entretien —, puis ce qui ouvre le geste.
 */
export const MENTION_REDACTION_RESERVEE = `Tes réponses, ton texte et tes versions restent ici, et tu peux écrire ta pièce toi-même. La proposition de texte et l'analyse critique s'ouvrent avec les packs ${packsDeLaRedactionAssistee()}.`;

/**
 * Le pack qui couvre un dossier, tel que le candidat doit le lire — S.88.
 *
 * Il se lisait sur la **dernière transaction confirmée** du dossier. Une
 * recharge ou un passage à Dossier en est une, et `getPack("recharge")`
 * ne rendant rien, l'écran de dépôt affichait « sans pack » à un dossier
 * qui venait d'en acheter un de plus.
 *
 * Il se lit maintenant sur la couverture : parmi les octrois encore
 * valables, le pack le plus complet de la grille. Une montée compte pour
 * Dossier. Rend `null` quand rien ne couvre le dossier.
 */
export function packDeLaCouverture(couvertures: readonly CouvertureDuDossier[]): string | null {
  const rang = (code: string) => PACKS.findIndex((p) => p.code === code);
  const codes = couvertures
    .filter((c) => !c.retiree)
    .map((c) => (c.packCode === CODE_MONTEE_DOSSIER ? PACK_D_ARRIVEE : c.packCode))
    .filter((code) => rang(code) >= 0)
    .sort((a, b) => rang(b) - rang(a));
  return codes[0] ? (getPack(codes[0])?.libelle ?? null) : null;
}

/**
 * Le pack effectif d'un dossier et ce qu'il a réellement coûté — S.92.
 *
 * ── Ce que le back-office lisait ────────────────────────────────────
 *
 * B-03 prenait la **première transaction confirmée** du compte, B-07 le
 * premier achat de catégorie « pack » du dossier. Après un passage à
 * Dossier, les deux désignaient l'Essentiel d'origine : pack affiché
 * « Essentiel », prix 5 000 F, quota de jetons d'Essentiel — et une
 * marge calculée sur le tiers de ce que le candidat avait payé. Une
 * recharge confirmée en premier donnait, elle, « aucun ».
 *
 * ── Ce qu'il lit maintenant ─────────────────────────────────────────
 *
 * Les achats qui **couvrent** le dossier — ses octrois `ACHAT_PACK`, qui
 * excluent par construction les recharges et les consultations —, sans
 * ceux dont le remboursement est engagé. Une montée compte pour Dossier,
 * et son prix est **la somme réellement encaissée** : l'Essentiel
 * d'origine plus la différence, dans leur devise commune. Parmi ce qui
 * reste, le pack le plus complet de la grille.
 */
export interface AchatCouvrant {
  id: string;
  packCode: string;
  montant: number;
  devise: string;
  /** L'achat Essentiel d'où part une montée. */
  sourceTransactionId: string | null;
  retiree: boolean;
}

export interface PackEffectif {
  code: string;
  prixPaye: number;
  devise: string;
  /** Le pack a été atteint par un passage à Dossier. */
  parMontee: boolean;
}

export function packEffectif(achats: readonly AchatCouvrant[]): PackEffectif | null {
  const rang = (code: string) => PACKS.findIndex((p) => p.code === code);
  const valables = achats.filter((a) => !a.retiree);
  const candidats: PackEffectif[] = valables.flatMap((a): PackEffectif[] => {
    if (a.packCode === CODE_MONTEE_DOSSIER) {
      const source = achats.find((s) => s.id === a.sourceTransactionId);
      // La montée n'a de sens qu'avec sa source : même devise, par
      // construction (S.88). Sans elle, on ne devine pas un prix.
      if (!source || source.devise !== a.devise) return [];
      return [
        {
          code: PACK_D_ARRIVEE,
          prixPaye: source.montant + a.montant,
          devise: a.devise,
          parMontee: true,
        },
      ];
    }
    return [{ code: a.packCode, prixPaye: a.montant, devise: a.devise, parMontee: false }];
  });
  return (
    [...candidats].sort(
      (a, b) => rang(b.code) - rang(a.code) || Number(b.parMontee) - Number(a.parMontee),
    )[0] ?? null
  );
}
