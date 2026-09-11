/**
 * Score de complétude du dossier — WF-07.
 *
 * Ce score mesure l'avancement objectif d'un dossier. Ce n'est en aucun cas
 * une prédiction d'acceptation (INV-1). Le libellé affiché à l'utilisateur
 * est « complétude de votre dossier ».
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type DocumentState =
  | "ATTENDUE" | "EN_ANALYSE" | "CONFORME" | "A_CORRIGER"
  | "ILLISIBLE" | "HORS_SUJET" | "EXPIREE" | "PURGEE";

export interface DocumentInput {
  code: string;
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
}

export interface CompletenessResult {
  /** 0 à 100. */
  score: number;
  /** Vrai uniquement si 100 % des composantes déterministes passent (RG-07.2). */
  ready: boolean;
  missing: MissingPoint[];
  breakdown: { documents: number; conditions: number; coherence: number; redaction: number };
}

const POIDS = { documents: 50, conditions: 25, coherence: 15, redaction: 10 } as const;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function computeCompleteness(input: CompletenessInput): CompletenessResult {
  const requis = input.documents.filter((d) => d.required);
  const conformes = requis.filter((d) => d.status === "CONFORME");
  const ratioDocs = requis.length === 0 ? 1 : conformes.length / requis.length;

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

  const missing: MissingPoint[] = [
    ...requis
      .filter((d) => d.status !== "CONFORME")
      .map((d) => ({
        code: d.code,
        message: messagePourPiece(d),
        bloquant: true,
      })),
    ...bloquantes
      .filter((c) => !c.satisfaite)
      .map((c) => ({ code: c.code, message: c.messageEchec, bloquant: true })),
  ];

  // Une bonne lettre de motivation ne compense jamais une pièce bloquante
  // manquante : le passage en PRET exige 100 % du déterministe (RG-07.2).
  const ready = ratioDocs === 1 && ratioCond === 1;

  return { score, ready, missing, breakdown };
}

function messagePourPiece(d: DocumentInput): string {
  switch (d.status) {
    case "ATTENDUE":
      return `Il vous reste à téléverser : ${d.code}.`;
    case "EN_ANALYSE":
      return `Analyse en cours : ${d.code}.`;
    case "ILLISIBLE":
      return `Le document ${d.code} n'a pas pu être lu. Reprenez la photo à plat, bien éclairée, sans reflet.`;
    case "HORS_SUJET":
      return `Le document téléversé pour ${d.code} ne correspond pas au type attendu.`;
    case "EXPIREE":
      return `Le document ${d.code} a dépassé sa durée de validité. Téléversez une version récente.`;
    case "PURGEE":
      return `Le document ${d.code} a été supprimé conformément à la politique de rétention.`;
    default:
      return `Le document ${d.code} demande une correction.`;
  }
}
