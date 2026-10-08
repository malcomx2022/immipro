import type { EchecCandidat } from "@/domain/echecs/catalogue";
import { MOTIF_FORMULATION_REFUSEE } from "./commande";

/**
 * Ce que l'écran dit quand une mise en forme ou une relecture n'a rien
 * produit — revue du 07/10/2026, M7.
 *
 * `produite: false` était ignoré : l'écran rechargeait et le candidat ne
 * savait pas si son geste avait été pris en compte. Trois issues, et
 * chacune dit ce qui est conservé : rien n'a été décompté, rien n'a été
 * écrit à sa place.
 */
export const MISE_EN_FORME_ECARTEE: EchecCandidat = {
  titre: "La proposition n'a pas été gardée",
  corps: "Elle contenait une promesse de résultat, qu'ImmiPro n'écrit pas en ton nom.",
  conserve: "Rien n'a été décompté, et tes réponses sont intactes.",
  action: "Relance la mise en forme, ou écris ta version à partir de tes réponses.",
  ton: "echec",
};

export const MISE_EN_FORME_SANS_REPONSE: EchecCandidat = {
  titre: "Le service de rédaction n'a pas répondu cette fois",
  corps: "Aucun texte n'a été écrit.",
  conserve: "Rien n'a été décompté, et tes réponses sont intactes.",
  action: "Réessaie dans quelques minutes.",
  ton: "attente",
};

export const RELECTURE_SANS_AVIS: EchecCandidat = {
  titre: "L'analyse n'a pas abouti",
  corps: "Le service n'a rien rendu cette fois. Ton texte n'a pas été analysé.",
  conserve: "Aucune analyse n'a été décomptée de ton quota, et ta version est intacte.",
  action: "Réessayer",
  ton: "attente",
};

export const RELECTURE_ECARTEE: EchecCandidat = {
  titre: "L'analyse n'a pas été gardée",
  corps: "Une de ses remarques contenait une promesse de résultat, qu'ImmiPro ne t'adresse pas.",
  conserve: "Aucune analyse n'a été décomptée de ton quota, et ta version est intacte.",
  action: "Réessayer",
  ton: "echec",
};

/** L'issue d'une mise en forme qui n'a pas produit de version, ou `null` si le service n'existe pas ici. */
export function issueDeLaMiseEnForme(reponse: {
  disponible: boolean;
  motif?: string | null;
}): EchecCandidat | null {
  if (!reponse.disponible) return null;
  return reponse.motif === MOTIF_FORMULATION_REFUSEE ? MISE_EN_FORME_ECARTEE : MISE_EN_FORME_SANS_REPONSE;
}

export const issueDeLaRelecture = (reponse: { motif?: string | null }): EchecCandidat =>
  reponse.motif === MOTIF_FORMULATION_REFUSEE ? RELECTURE_ECARTEE : RELECTURE_SANS_AVIS;
