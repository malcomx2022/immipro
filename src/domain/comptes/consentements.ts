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
    /*
      Le refus coûte quelque chose, et il faut le dire : c'est précisément
      pour les changements graves que l'email existe — WF-11 met le dossier
      en pause, et une notification dans l'application n'est pas lue par
      quelqu'un qui n'ouvre pas l'application. La phrase dit donc aussi où
      l'information reste, pour qu'un refus n'ait pas l'air d'un renoncement.
    */
    siRefuse:
      "Sans cette autorisation, aucun email ne part, y compris quand un changement met ton dossier en pause. L'alerte reste dans ton dossier, avec la source et sa date : il faut ouvrir l'application pour la voir.",
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

/**
 * Ce qui applique chaque autorisation, et ce qui ne l'applique pas.
 *
 * ── Trois interrupteurs sur cinq ne commandaient rien ───────────────
 *
 * Les cinq autorisations s'affichaient, s'enregistraient, se retiraient —
 * et trois n'étaient lues par aucun code. « Alertes de changement de
 * règles : email quand une exigence de ta destination change » était du
 * nombre : `jobs/divergence` n'ouvrait pas le registre, et l'email partait
 * pour qui l'avait refusé comme pour qui l'avait accordé. Constaté en
 * exécution sur une base réelle, avant correction.
 *
 * Un interrupteur qui ne commande rien est pire qu'un interrupteur absent :
 * il fait croire à un choix fait. La table ci-dessous nomme, pour chaque
 * autorisation, ce qui l'applique — et `null` dit qu'il n'y a rien, avec la
 * raison, plutôt que de laisser l'absence se découvrir par hasard. Un essai
 * vérifie que chaque nom cité existe bel et bien dans le dépôt.
 *
 * Les deux `null` restants ne se comblent pas d'ici : ce sont des décisions
 * de produit.
 *
 * - **`pieces_financieres`** demanderait de savoir quelles pièces sont
 *   financières. Le référentiel ne porte aucune catégorie de donnée sur
 *   `pieces_requises`, et la déduire de l'orthographe du code est
 *   exactement le piège déjà tombé une fois — `/releve|bancaire|ressources|
 *   fonds/` décidait d'une durée de validité, et renommer `preuve_fonds`
 *   faisait disparaître l'échéance. La catégorie se déclare, elle ne se
 *   devine pas ; l'ajouter au schéma des règles est un arbitrage.
 * - **`mesure_audience`** ne commande rien parce qu'il n'y a rien à
 *   commander : aucune mesure d'audience n'existe dans le produit. La
 *   question est de savoir si l'interrupteur doit attendre la mesure ou
 *   disparaître jusque-là.
 */
export const APPLIQUE_PAR: Record<CodeConsentement, readonly string[] | null> = {
  pieces_identite: [
    "src/server/acces/pieces.ts",
    "src/server/jobs/analyse.ts",
    "src/server/jobs/balayage.ts",
  ],
  alertes_regles: ["src/server/jobs/divergence.ts"],
  partenaires: ["src/server/lecture/partenaires.ts"],
  pieces_financieres: null,
  mesure_audience: null,
};

/**
 * Les codes, dans l'ordre d'affichage. La route les lisait dans une copie
 * littérale : une autorisation ajoutée ici aurait été rendue à l'écran et
 * refusée à l'enregistrement.
 *
 * Le tuple — et non un tableau — parce que `z.enum` en a besoin, et parce
 * qu'une liste vide n'aurait aucun sens.
 */
export const CODES_CONSENTEMENT = CONSENTEMENTS.map((c) => c.code) as unknown as [
  CodeConsentement,
  ...CodeConsentement[],
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
