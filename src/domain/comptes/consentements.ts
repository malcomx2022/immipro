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
  | "consultants_partenaires"
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
    siRefuse:
      "Sans cette autorisation, tu téléverses tes pièces sans analyse automatique.",
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
    code: "consultants_partenaires",
    titre: "Propositions de consultants partenaires",
    description:
      "Mise en relation quand ton dossier présente une difficulté qu'un consultant traite mieux que nous.",
  },
  {
    code: "mesure_audience",
    titre: "Mesure d'audience anonyme",
    description:
      "Statistiques d'usage sans identifiant personnel, pour savoir quels écrans posent problème.",
  },
];

export type EtatConsentements = Record<CodeConsentement, boolean>;

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
