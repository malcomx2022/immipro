import {
  CRITIQUE_NON_BRANCHEE,
  REDACTEUR_NON_BRANCHE,
  critiqueClaude,
  redacteurClaude,
  type Critique,
  type Redacteur,
} from "./adaptateur";
import { modeleConfigure } from "@/lib/ai";

/**
 * Les deux points de branchement de WF-08, branchés le 22/09/2026.
 *
 * Des fonctions et non des constantes : l'appelant demande le service au
 * moment de s'en servir, et non au chargement du module — c'est-à-dire
 * au démarrage du serveur, avant qu'une recette ait reçu sa clé.
 *
 * L'état de service interroge ces fonctions-là, jamais un registre tenu
 * à la main : comparer ce qu'elles rendent aux fonctions non branchées
 * dit si un adaptateur existe, sans qu'aucune déclaration puisse
 * survivre au code qu'elle décrit.
 */
const cleDe = (environnement: Readonly<Record<string, string | undefined>>): string =>
  (environnement.ANTHROPIC_API_KEY ?? "").trim();

export const leRedacteur = (
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): Redacteur => {
  const cle = cleDe(environnement);
  return cle === "" ? REDACTEUR_NON_BRANCHE : redacteurClaude(cle, modeleConfigure(environnement));
};

export const laCritique = (
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): Critique => {
  const cle = cleDe(environnement);
  return cle === "" ? CRITIQUE_NON_BRANCHEE : critiqueClaude(cle, modeleConfigure(environnement));
};
