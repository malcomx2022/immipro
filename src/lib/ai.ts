import Anthropic from "@anthropic-ai/sdk";

/**
 * Appels IA. Deux règles tiennent tout ce module :
 *  - tout ce qui est vérifiable sans IA l'est sans IA (RG-06.1) ;
 *  - chaque appel débite un quota de tokens, jamais de dépassement
 *    silencieux (INV-6) — l'appelant enregistre AiUsage.
 */
export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const AI_MODEL = process.env.AI_MODEL ?? "claude-sonnet-5";

export interface QuotaCheck {
  restant: number;
  suffisant: boolean;
}

export function verifierQuota(consomme: number, alloue: number, estimation: number): QuotaCheck {
  const restant = alloue - consomme;
  return { restant, suffisant: restant >= estimation };
}
