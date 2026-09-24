/**
 * Consentements — WF-02, écran A-05, RG-02.1.
 *
 * Deux règles tenues par le type plutôt que par la relecture :
 *
 * 1. Aucune autorisation n'est active par défaut. `ETAT_INITIAL` les met
 *    toutes à faux, et un test le vérifie — une case pré-cochée n'est pas un
 *    consentement.
 * 2. Le traitement des pièces d'identité est un consentement à part,
 *    distingué par `sensible`. Il ne peut pas être groupé avec les autres
 *    dans un « tout accepter », et son refus ne bloque pas le compte.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type CodeConsentement =
  | "pieces_identite"
  | "pieces_financieres"
  | "alertes_regles"
  | "partenaires"
  | "mesure_audience";

export interface Consentement {
  code: CodeConsentement;
  titre: string;
  description: string;
  /** Conséquence du refus, écrite quand elle existe. Le refus n'est pas puni. */
  siRefuse?: string;
  /** Donnée sensible : consentement séparé, exigé par la réglementation. */
  sensible?: true;
}

export const CONSENTEMENTS: readonly Consentement[] = [
  {
    code: "pieces_identite",
    titre: "Analyse de mes pièces d'identité",
    description:
      "Passeport, carte d'identité, acte de naissance. Lecture automatique des dates et des noms pour vérifier la conformité. Données supprimées à la clôture du dossier.",
    /*
      Ce que la phrase disait — « tu téléverses tes pièces sans analyse
      automatique » — décrivait un parcours qui n'existe pas : RG-02.2
      refuse le dépôt lui-même tant que l'autorisation manque, et le
      candidat lisait donc, au moment de décider, l'inverse de ce qui
      allait se passer.

      Elle dit maintenant les deux moitiés de la règle : ce que le refus
      empêche, et ce que le retrait arrête — car il arrête désormais
      quelque chose.
    */
    siRefuse:
      "Sans cette autorisation, aucune pièce ne peut être déposée : conserver un document, c'est déjà le traiter. Tu peux la retirer à tout moment, et le retrait arrête aussi l'analyse des pièces déjà déposées.",
    sensible: true,
  },
  {
    code: "pieces_financieres",
    titre: "Analyse de mes pièces financières",
    description:
      "Relevés bancaires et attestations de ressources. Vérification du montant et de l'ancienneté du document.",
  },
  {
    code: "alertes_regles",
    titre: "Alertes de changement de règles",
    description:
      "Email quand une exigence de ta destination change. Ne concerne que tes dossiers ouverts.",
  },
  {
    // Le même interrupteur couvre le consultant et le partenaire de
    // service : T-03 propose les deux, et « ne plus me proposer » ne peut
    // pas valoir pour l'un et pas pour l'autre sans mentir à l'un des deux.
    code: "partenaires",
    titre: "Propositions de partenaires",
    description:
      "Mise en relation quand ton dossier demande une pièce que nous ne délivrons pas, ou présente une difficulté qu'un consultant traite mieux que nous.",
  },
  {
    code: "mesure_audience",
    titre: "Mesure d'audience anonyme",
    description:
      "Statistiques d'usage sans identifiant personnel, pour savoir quels écrans posent problème.",
  },
];

export type EtatConsentements = Record<CodeConsentement, boolean>;

/**
 * L'état d'une autorisation, quand savoir « pourquoi pas » compte autant que
 * « pas ».
 *
 * Un booléen suffit à décider — on traite, ou on ne traite pas. Il ne suffit
 * pas à écrire une phrase : « jamais donnée » et « retirée » se ressemblent
 * pour le code et ne se ressemblent pas du tout pour la personne. Un écran
 * qui les confond finit par annoncer à quelqu'un un geste qu'il n'a pas
 * fait, et c'est ce qui se passait sur T-06 — donc pour tout le monde, car
 * `ETAT_INITIAL` met chaque autorisation à faux au premier passage.
 */
export type EtatAutorisation = "accordee" | "retiree" | "jamais_donnee";

/** Aucune autorisation active au premier passage (RG-02.1). */
export const ETAT_INITIAL: EtatConsentements = Object.freeze(
  Object.fromEntries(CONSENTEMENTS.map((c) => [c.code, false])),
) as EtatConsentements;

export const consentementsActifs = (etat: EtatConsentements): number =>
  CONSENTEMENTS.filter((c) => etat[c.code]).length;

/** « 2 autorisations sur 5 actives », accordé. */
export function libelleActifs(etat: EtatConsentements): string {
  const n = consentementsActifs(etat);
  const total = CONSENTEMENTS.length;
  return n > 1
    ? `${n} autorisations sur ${total} actives`
    : `${n} autorisation sur ${total} active`;
}

/** Le consentement aux pièces d'identité, isolé pour qu'aucun écran ne le noie. */
export const CONSENTEMENT_SENSIBLE = CONSENTEMENTS.find((c) => c.sensible);
