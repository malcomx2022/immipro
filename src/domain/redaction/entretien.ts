/**
 * Entretien guidé — R-01 et R-02, WF-08.
 *
 * Le principe tient en une phrase : aucun fait n'est inventé. Chaque phrase
 * produite vient d'une réponse donnée, et si une information manque, la
 * question revient. C'est ce qui sépare une mise en forme d'une fabrication,
 * et c'est ce que l'écran doit dire avant de commencer, pas après.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/** Pièce que l'entretien sait mettre en forme. */
export interface PieceRedigeable {
  /** Segment de route : `redaction/[type]`. */
  type: string;
  /** Code court en pastille monospace : MOT, PRO, RET, GAR. */
  code: string;
  libelle: string;
  /** Ce que la pièce couvre, en une phrase. */
  objet: string;
  /** Exigence de la destination, ou motif de la recommandation. */
  exigence: string;
  questions: readonly Question[];
}

export interface Question {
  /** Intertitre du paragraphe que la réponse nourrit : PARCOURS, FINANCEMENT… */
  section: string;
  intitule: string;
  /**
   * Pourquoi la question est posée. Sans cette ligne, l'entretien ressemble
   * à un formulaire administratif de plus ; avec elle, la personne comprend
   * ce que l'administration va lire.
   */
  motif: string;
  /** Exemple de réponse, en gris dans le champ. Jamais un libellé. */
  exemple: string;
  /** Deux repères de rédaction, pas davantage : au-delà, personne ne les lit. */
  reperes: readonly [string, string];
}

/** Minutes comptées par question. Deux, mesurées sur les réponses du prototype. */
export const MINUTES_PAR_QUESTION = 2;

/**
 * « 8 questions · environ 16 minutes ».
 *
 * L'estimation ne s'arrondit pas à la tranche de cinq : arrondie, elle
 * donnait vingt-cinq minutes pour huit questions, et contredisait le
 * « prévois vingt minutes pour l'entretien et la relecture » écrit sur le
 * même écran. Deux chiffres qui se contredisent à trois lignes d'écart
 * décrédibilisent les deux.
 */
export const dureeEstimee = (piece: PieceRedigeable): string =>
  `${piece.questions.length} questions · environ ${piece.questions.length * MINUTES_PAR_QUESTION} minutes`;

/**
 * « Question 3 sur 8 ».
 *
 * Le prototype affichait aussi une part : `Math.round((i + 1) / 8 * 100) + "%"`.
 * Un pourcentage sur un écran de dossier se relit comme une note (arbitrage
 * C-09) ; le rang sur le total dit la même chose et ne se confond avec rien.
 */
export const libelleRang = (index: number, total: number): string =>
  `Question ${index + 1} sur ${total}`;

/** Nombre de mots d'une réponse. Une réponse vide n'en compte aucun. */
export function compterMots(reponse: string): number {
  const propre = reponse.trim();
  return propre.length === 0 ? 0 : propre.split(/\s+/u).length;
}

/**
 * Le compteur encourage avant d'écrire, puis mesure. « 0 mot » sous un champ
 * vide se lit comme un reproche adressé à quelqu'un qui vient d'arriver.
 */
export function libelleReponse(reponse: string): string {
  const mots = compterMots(reponse);
  if (mots === 0) return "Deux ou trois phrases suffisent.";
  return `${mots} ${mots > 1 ? "mots écrits" : "mot écrit"}`;
}

export const estDerniereQuestion = (index: number, total: number): boolean =>
  index === total - 1;

export const libelleSuivant = (index: number, total: number): string =>
  estDerniereQuestion(index, total) ? "Mettre en forme ma lettre" : "Question suivante";

/** Bornes de navigation : l'entretien ne sort jamais de sa plage. */
export const questionSuivante = (index: number, total: number): number =>
  Math.min(total - 1, index + 1);
export const questionPrecedente = (index: number): number => Math.max(0, index - 1);

/**
 * Une question passée reste sans réponse, et le texte produit ne comblera
 * pas le trou : il ne peut pas, puisqu'il n'invente rien. L'écran le dit au
 * moment du saut plutôt qu'au moment de la relecture.
 */
export const MENTION_PASSER =
  "Cette question restera sans réponse : le paragraphe correspondant ne sera pas écrit, et tu pourras y revenir.";

/** Ce que la plateforme ne fait pas — affiché avant l'entretien, pas après. */
export const LIMITES_REDACTION: readonly string[] = [
  "Nous n'inventons aucun fait, aucune expérience, aucun montant. Si une information manque, la question te revient.",
  "Nous ne notons pas ton texte et nous ne prédisons pas la décision de l'administration.",
];

export const AVERTISSEMENT_RELECTURE =
  "Un texte généré et non relu se repère. Prévois vingt minutes pour l'entretien et la relecture.";

/** Réponses saisies, indexées par rang de question. */
export type Reponses = Readonly<Record<number, string>>;

export const nombreDeReponses = (reponses: Reponses, total: number): number => {
  let n = 0;
  for (let i = 0; i < total; i += 1) if (compterMots(reponses[i] ?? "") > 0) n += 1;
  return n;
};

/** « 6 réponses sur 8 » : ce qui reste à répondre avant la mise en forme. */
export const libelleAvancementEntretien = (reponses: Reponses, total: number): string => {
  // « 1 réponses sur 8 » — l'accord se voyait rarement tant que le
  // compteur partait de zéro à chaque chargement : il fallait répondre à
  // exactement une question pour le lire. Depuis que l'entretien reprend
  // où il s'est arrêté, il s'affiche au chargement.
  const n = nombreDeReponses(reponses, total);
  return `${n} réponse${n > 1 ? "s" : ""} sur ${total}`;
};

// ── La conservation des réponses ─────────────────────────────────────────

/**
 * Ce que l'entretien conserve d'une réponse — WF-08, R-02.
 *
 * L'écran le promet en toutes lettres depuis le début : « Tes réponses
 * sont conservées à mesure : tu peux interrompre l'entretien et le
 * reprendre. » Elles ne l'étaient pas. L'état partait de `{}` à chaque
 * chargement, rien ne quittait le navigateur, et `InterviewAnswer`
 * n'était écrite nulle part — seule la purge la connaissait, pour
 * l'effacer. Un candidat qui répondait à huit questions puis fermait
 * l'onglet perdait tout, après avoir lu qu'il pouvait s'interrompre.
 *
 * **Une réponse vide n'est pas une réponse.** Elle ne s'enregistre pas,
 * et si une réponse existait elle est retirée : c'est la seule lecture
 * possible d'un champ qu'on vient d'effacer. La même symétrie que pour la
 * réserve d'une règle en B-02 — ce que la lecture rend, l'écriture le
 * reprend.
 *
 * Passer une question est donc conservé comme tel : aucune ligne. Rien ne
 * distingue en base « passée » de « jamais atteinte », et rien ne doit
 * les distinguer — `MENTION_PASSER` dit qu'une question passée pourra
 * être reprise, pas qu'elle laisse une trace.
 */
export const reponseAConserver = (texte: string): string | null => texte.trim() || null;
