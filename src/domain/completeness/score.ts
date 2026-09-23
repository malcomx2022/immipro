/**
 * Complétude du dossier — WF-07.
 *
 * Le résultat exposé au candidat est une liste ordonnée de manques et un
 * palier nommé. Aucun entier sur 100 ne remonte à l'interface (INV-1, arbitrage
 * C-09 du 13/09/2026) : « 68 sur 100 » se retient comme une probabilité
 * d'obtenir le visa, et le démenti écrit dessous ne survit pas à la mémoire
 * du chiffre. Le libellé affiché est « complétude de votre dossier ».
 *
 * Le score pondéré reste calculé pour ordonner les lignes et pour le
 * back-office ; il vit dans `interne` et n'est jamais sérialisé vers le client.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type DocumentState =
  | "ATTENDUE" | "EN_ANALYSE" | "CONFORME" | "A_CORRIGER"
  | "ILLISIBLE" | "HORS_SUJET" | "EXPIREE" | "PURGEE";

export interface DocumentInput {
  code: string;
  /**
   * Nom lisible de la pièce — « Relevé bancaire ».
   *
   * Facultatif par compatibilité, mais toujours fourni en pratique : sans
   * lui, les messages de repli nomment la pièce par son code, et l'export
   * de L.A rendait « Il te reste à téléverser : MOT ».
   */
  libelle?: string;
  required: boolean;
  status: DocumentState;
}

export interface ConditionInput {
  code: string;
  bloquant: boolean;
  satisfaite: boolean;
  messageEchec: string;
}

export interface CompletenessInput {
  documents: DocumentInput[];
  conditions: ConditionInput[];
  /** Cohérence entre documents, 0 à 1. */
  coherence: number;
  /** Qualité rédactionnelle des pièces libres, 0 à 1. */
  redaction: number;
}

export interface MissingPoint {
  code: string;
  /** Message actionnable — jamais « document non conforme » (RG-06.3). */
  message: string;
  bloquant: boolean;
  /**
   * D'où vient le manque : une pièce de la checklist, ou une exigence de la
   * règle figée qu'aucune pièce n'établit.
   *
   * Les deux se lisaient pareil dans cette liste, et un écran ne pouvait
   * donc pas les distinguer — celui qui s'intitule « ce qui bloque le
   * dépôt » n'affichait que les pièces, et omettait le seul blocage sur un
   * dossier qu'une exigence tient à « incomplet ».
   *
   * Le rapprocher par le code était exclu : `Piece.code` est une pastille
   * de trois lettres, et rapprocher `PAS` de `passeport` ne rapproche rien.
   * L'origine se déclare ici, où elle est connue.
   */
  origine: "piece" | "exigence";
}

/**
 * Palier nommé, seul état d'ensemble montré au candidat.
 * - INCOMPLET : au moins une pièce obligatoire ou une condition bloquante manque.
 * - PRESQUE_COMPLET : le déterministe passe, il reste des pièces facultatives.
 * - COMPLET : rien ne manque.
 */
export type Palier = "INCOMPLET" | "PRESQUE_COMPLET" | "COMPLET";

export const LIBELLE_PALIER: Record<Palier, string> = {
  INCOMPLET: "Dossier incomplet",
  PRESQUE_COMPLET: "Presque complet",
  COMPLET: "Dossier complet",
};

export interface CompletenessResult {
  palier: Palier;
  /** Vrai uniquement si 100 % des composantes déterministes passent (RG-07.2). */
  ready: boolean;
  /** Bloquants d'abord, puis facultatifs ; à l'intérieur, ordre du gain interne décroissant. */
  missing: MissingPoint[];
  /**
   * Compteurs affichables : « 2 pièces obligatoires manquent, 2
   * complémentaires restent à traiter ».
   *
   * `obligatoiresManquantes` ne compte **que des pièces**. Il additionnait
   * les conditions bloquantes non tenues, et quatre écrans disaient donc
   * « 1 pièce obligatoire manque » sur un dossier dont la checklist est
   * entièrement verte — le candidat voyait la contradiction de ses yeux.
   * C'est resté invisible tant que le chemin des écrans passait
   * `conditions: []` ; le lot qui a réuni les deux calculs l'a rendu
   * visible, et celui-ci le répare.
   */
  compteurs: {
    obligatoiresManquantes: number;
    /** Conditions bloquantes de la règle figée qu'aucune pièce ne tient. */
    exigencesNonTenues: number;
    facultativesManquantes: number;
    conformes: number;
  };
  /** Back-office seul. Ne jamais inclure dans une réponse destinée au candidat. */
  interne: {
    score: number;
    breakdown: { documents: number; conditions: number; coherence: number; redaction: number };
  };
}

const POIDS = { documents: 50, conditions: 25, coherence: 15, redaction: 10 } as const;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function computeCompleteness(input: CompletenessInput): CompletenessResult {
  const requis = input.documents.filter((d) => d.required);
  const facultatifs = input.documents.filter((d) => !d.required);
  const conformes = input.documents.filter((d) => d.status === "CONFORME");
  const requisConformes = requis.filter((d) => d.status === "CONFORME");
  const ratioDocs = requis.length === 0 ? 1 : requisConformes.length / requis.length;

  const bloquantes = input.conditions.filter((c) => c.bloquant);
  const satisfaites = bloquantes.filter((c) => c.satisfaite);
  const ratioCond = bloquantes.length === 0 ? 1 : satisfaites.length / bloquantes.length;

  const breakdown = {
    documents: ratioDocs * POIDS.documents,
    conditions: ratioCond * POIDS.conditions,
    coherence: clamp01(input.coherence) * POIDS.coherence,
    redaction: clamp01(input.redaction) * POIDS.redaction,
  };
  const score = Math.round(
    breakdown.documents + breakdown.conditions + breakdown.coherence + breakdown.redaction,
  );

  const requisManquants = requis.filter((d) => d.status !== "CONFORME");
  const facultatifsManquants = facultatifs.filter((d) => d.status !== "CONFORME");
  const conditionsEchouees = bloquantes.filter((c) => !c.satisfaite);

  const missing: MissingPoint[] = [
    ...requisManquants.map((d) => ({
      code: d.code,
      message: messagePourPiece(d),
      bloquant: true,
      origine: "piece" as const,
    })),
    ...conditionsEchouees.map((c) => ({
      code: c.code,
      message: c.messageEchec,
      bloquant: true,
      origine: "exigence" as const,
    })),
    ...facultatifsManquants.map((d) => ({
      code: d.code,
      message: messagePourPiece(d),
      bloquant: false,
      origine: "piece" as const,
    })),
  ];

  // Une bonne lettre de motivation ne compense jamais une pièce bloquante
  // manquante : le passage en PRET exige 100 % du déterministe (RG-07.2).
  const ready = ratioDocs === 1 && ratioCond === 1;

  const palier: Palier = !ready
    ? "INCOMPLET"
    : facultatifsManquants.length > 0
      ? "PRESQUE_COMPLET"
      : "COMPLET";

  return {
    palier,
    ready,
    missing,
    compteurs: {
      obligatoiresManquantes: requisManquants.length,
      exigencesNonTenues: conditionsEchouees.length,
      facultativesManquantes: facultatifsManquants.length,
      conformes: conformes.length,
    },
    interne: { score, breakdown },
  };
}

/** Vue candidat : tout sauf `interne`. À utiliser dans toute réponse d'API publique. */
export type CompletenessPublic = Omit<CompletenessResult, "interne">;
export const versClient = ({ interne: _ignore, ...reste }: CompletenessResult): CompletenessPublic => reste;

/**
 * Message de repli, quand la pièce n'en porte pas encore de sien.
 *
 * Il tutoie, comme tout ce que lit le candidat (DOC-12 §16, règle 5). Trois
 * de ces phrases vouvoyaient, et personne ne les avait vues : elles ne
 * s'affichaient nulle part — l'écran montre le message de la pièce. L'export
 * de L.A les a sorties au jour.
 */
function messagePourPiece(d: DocumentInput): string {
  const nom = d.libelle ?? d.code;
  switch (d.status) {
    case "ATTENDUE":
      return `Il te reste à téléverser : ${nom}.`;
    case "EN_ANALYSE":
      return `Analyse en cours : ${nom}.`;
    case "ILLISIBLE":
      return `${nom} n'a pas pu être lu. Reprends la photo à plat, bien éclairée, sans reflet.`;
    case "HORS_SUJET":
      return `Le document téléversé pour « ${nom} » ne correspond pas au type attendu.`;
    case "EXPIREE":
      return `${nom} a dépassé sa durée de validité. Téléverse une version récente.`;
    case "PURGEE":
      return `${nom} a été supprimé conformément à la politique de rétention.`;
    default:
      return `${nom} demande une correction.`;
  }
}
