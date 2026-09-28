import {
  CRITIQUE_NON_BRANCHEE,
  REDACTEUR_NON_BRANCHE,
  critiqueClaude,
  redacteurClaude,
  type Critique,
  type Redacteur,
} from "./adaptateur";
import { critiqueCompatible, redacteurCompatible } from "@/server/ia/openai-compatible";
import { configurationCompatible } from "@/server/dossiers/extracteur";
import { fournisseurChoisi, manqueDuFournisseur, modeleDu } from "@/domain/ia/fournisseurs";

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
type Environnement = Readonly<Record<string, string | undefined>>;

/**
 * Le fournisseur de rédaction que l'environnement désigne — S.94.
 *
 * `AI_FOURNISSEUR_REDACTION`, Anthropic par défaut. La rédaction ne reçoit
 * aucune pièce : elle n'a pas la garde de sous-traitance de la lecture.
 * Tout empêchement rend la fonction non branchée, reconnue par identité.
 */
function fournisseurDeRedaction(environnement: Environnement) {
  const choix = fournisseurChoisi(environnement, "redaction");
  if (!choix.connu) return null;
  if (manqueDuFournisseur(environnement, choix.fournisseur) !== null) return null;
  if (choix.fournisseur === "anthropic") {
    return {
      code: "anthropic" as const,
      cle: (environnement.ANTHROPIC_API_KEY ?? "").trim(),
      modele: modeleDu(environnement, "anthropic")!,
    };
  }
  const config = configurationCompatible(environnement);
  return config ? { code: "openai_compatible" as const, config } : null;
}

export const leRedacteur = (environnement: Environnement = process.env): Redacteur => {
  const f = fournisseurDeRedaction(environnement);
  if (!f) return REDACTEUR_NON_BRANCHE;
  return f.code === "anthropic" ? redacteurClaude(f.cle, f.modele) : redacteurCompatible(f.config);
};

export const laCritique = (environnement: Environnement = process.env): Critique => {
  const f = fournisseurDeRedaction(environnement);
  if (!f) return CRITIQUE_NON_BRANCHEE;
  return f.code === "anthropic" ? critiqueClaude(f.cle, f.modele) : critiqueCompatible(f.config);
};
