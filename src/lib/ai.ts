import Anthropic from "@anthropic-ai/sdk";
import { FOURNISSEURS } from "@/domain/ia/fournisseurs";

/**
 * Le client d'appel au modèle. Deux règles tiennent ce module :
 *  - tout ce qui est vérifiable sans IA l'est sans IA (RG-06.1) ;
 *  - chaque appel débite un quota, jamais de dépassement silencieux
 *    (INV-6) — l'appelant enregistre `AiUsage`, y compris quand l'appel
 *    n'a rien rendu : les jetons ont été consommés quand même.
 *
 * ── Construit à l'usage, pas au chargement ──────────────────────────
 *
 * Même raison que pour le stockage : un client construit au chargement
 * du module fige la configuration au démarrage du processus, ce qui rend
 * intestable tout ce qui dépend d'une clé, et fait dépendre des écrans
 * publics d'une dépendance qu'ils ne touchent jamais.
 */
let client: Anthropic | null = null;

export function leClient(cle: string): Anthropic {
  if (client) return client;
  client = new Anthropic({ apiKey: cle, maxRetries: 0 });
  return client;
}

/** Les essais rendent leur propre client ; sans cela rien ne s'éprouve. */
export const poserLeClient = (leur: Anthropic | null): void => {
  client = leur;
};

/**
 * Le modèle, et pourquoi ce défaut-là.
 *
 * Une pièce mal lue envoie quelqu'un refaire un document qui n'a rien,
 * ou laisse passer un document qui manque — les deux se paient au
 * guichet, pas ici. Le défaut est donc le modèle le plus capable, et
 * `AI_MODEL` reste là pour qu'une installation en décide autrement.
 */
export const AI_MODEL_PAR_DEFAUT = FOURNISSEURS.anthropic.modele.defaut!;

export const modeleConfigure = (
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): string => (environnement.AI_MODEL ?? "").trim() || AI_MODEL_PAR_DEFAUT;

export interface QuotaCheck {
  restant: number;
  suffisant: boolean;
}

export function verifierQuota(consomme: number, alloue: number, estimation: number): QuotaCheck {
  const restant = alloue - consomme;
  return { restant, suffisant: restant >= estimation };
}
