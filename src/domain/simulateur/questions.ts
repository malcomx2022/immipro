/**
 * Simulateur d'éligibilité — WF-01, écrans P-01 et P-02.
 *
 * Six questions, une par écran. Les libellés sont ceux du prototype 390 px,
 * qui fait foi pour les textes (DOC-12, §3 du guide de démarrage).
 *
 * Le simulateur ne crée pas de compte et ne conserve les réponses que le
 * temps de la session : ce module ne connaît donc ni base, ni stockage — il
 * décrit les questions et l'avancement, rien de plus.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type CleQuestion =
  | "objectif"
  | "diplome"
  | "budget"
  | "langue"
  | "depart"
  | "famille";

export interface Question {
  cle: CleQuestion;
  /** Intitulé affiché en titre d'étape, focalisé à chaque changement (règle clavier 7). */
  intitule: string;
  /** Précision sous le titre. Elle lève l'ambiguïté, elle ne vend rien. */
  aide: string;
  /** Libellé court repris sur P-01, où trois questions seulement sont posées. */
  libelleCourt: string;
  options: readonly string[];
}

export const QUESTIONS: readonly Question[] = [
  {
    cle: "objectif",
    intitule: "Quel est ton objectif ?",
    aide: "Tu pourras changer de destination plus tard sans refaire la simulation.",
    libelleCourt: "Objectif",
    options: ["Étudier", "Travailler", "Rejoindre ma famille", "Créer une activité"],
  },
  {
    cle: "diplome",
    intitule: "Quel est ton plus haut diplôme obtenu ?",
    aide: "Le diplôme en cours ne compte pas, seulement celui que tu as déjà.",
    libelleCourt: "Plus haut diplôme",
    options: ["Baccalauréat", "Licence", "Master", "Doctorat"],
  },
  {
    cle: "budget",
    intitule: "De quel budget disposes-tu pour la première année ?",
    aide: "Frais de scolarité, logement et vie courante, hors billet d'avion.",
    libelleCourt: "Budget annuel",
    options: [
      "Moins de 4 millions F",
      "4 à 8 millions F",
      "8 à 12 millions F",
      "Plus de 12 millions F",
    ],
  },
  {
    cle: "langue",
    intitule: "Quel est ton niveau d'anglais ?",
    aide: "Si tu as un test récent, indique le niveau qu'il atteste.",
    libelleCourt: "Niveau d'anglais",
    options: ["Débutant", "B1 — intermédiaire", "B2 — avancé", "C1 et plus"],
  },
  {
    cle: "depart",
    intitule: "Quand veux-tu partir ?",
    aide: "Les campagnes de candidature ouvrent six à douze mois avant la rentrée.",
    libelleCourt: "Départ",
    options: [
      "Rentrée de janvier 2027",
      "Rentrée de septembre 2027",
      "En 2028",
      "Je ne sais pas encore",
    ],
  },
  {
    cle: "famille",
    intitule: "Comptes-tu partir accompagné ?",
    aide: "Un conjoint ou un enfant change les montants de ressources à prouver.",
    libelleCourt: "Accompagnement",
    options: [
      "Seul",
      "Avec mon conjoint",
      "Avec mon conjoint et nos enfants",
      "Avec mes enfants",
    ],
  },
];

/** Les trois questions posées d'emblée sur l'accueil (P-01). */
export const QUESTIONS_ACCUEIL = QUESTIONS.slice(0, 3);

export type Reponses = Partial<Record<CleQuestion, string>>;

export const NOMBRE_ETAPES = QUESTIONS.length;

/** Étape bornée : un index hors plage ne casse pas l'écran, il le ramène. */
export const etapeValide = (etape: number) =>
  Math.min(NOMBRE_ETAPES - 1, Math.max(0, Math.trunc(etape)));

export const questionDeLEtape = (etape: number): Question => {
  const q = QUESTIONS[etapeValide(etape)];
  // `noUncheckedIndexedAccess` : l'index est borné juste au-dessus, mais le
  // type ne le sait pas. QUESTIONS n'est jamais vide.
  if (!q) throw new Error("Aucune question pour cette étape.");
  return q;
};

/** Part d'avancement, de 0 à 1. La mise en forme appartient à l'écran. */
export const avancement = (etape: number) =>
  (etapeValide(etape) + 1) / NOMBRE_ETAPES;

/** « 2 / 6 ». */
export const repereEtape = (etape: number) =>
  `${etapeValide(etape) + 1} / ${NOMBRE_ETAPES}`;

export const estDerniereEtape = (etape: number) =>
  etapeValide(etape) === NOMBRE_ETAPES - 1;

/** « 3 questions restantes », au singulier quand il n'en reste qu'une. */
export function questionsRestantes(etape: number): string {
  const reste = NOMBRE_ETAPES - etapeValide(etape) - 1;
  return reste > 1 ? `${reste} questions restantes` : `${reste} question restante`;
}

/** Vrai quand les six réponses sont données. */
export const simulationComplete = (reponses: Reponses) =>
  QUESTIONS.every((q) => Boolean(reponses[q.cle]));

/**
 * Résumé des réponses, affiché sur P-03 sous le titre.
 * Les réponses manquantes sont omises plutôt que remplacées par un tiret.
 */
export const resumeReponses = (reponses: Reponses): string =>
  QUESTIONS.map((q) => reponses[q.cle])
    .filter((v): v is string => Boolean(v))
    .join(", ");
