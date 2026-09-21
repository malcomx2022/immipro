import { HORS_LIGNE, type Resultat } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";

/**
 * Télécharger un fichier produit par une route.
 *
 * `appeler()` ne convient pas : il lit du JSON pour un écran, or ici le
 * succès est un fichier et l'échec seul est du JSON. La distinction était
 * déjà traitée à la main dans « Mes données » — ce module en fait le
 * chemin unique, plutôt que de la recopier dans chaque écran qui exporte.
 *
 * L'échec reste le contrat du serveur : mêmes titres, mêmes actions, même
 * bloc à l'écran. Un export qui échoue avec sa propre formulation ferait
 * douter du reste de l'application.
 */
const ILLISIBLE: EchecCandidat = {
  titre: "Le fichier n'a pas pu être préparé",
  corps: "Le serveur a répondu quelque chose d'inattendu.",
  conserve: "Rien n'a changé : un export ne modifie aucune donnée.",
  action: "Réessayer",
  ton: "echec",
};

/**
 * `replis` porte la formulation de l'écran appelant quand le serveur n'a
 * rien dit d'exploitable. L'espace candidat tutoie et parle de « ton
 * compte » ; le back-office vouvoie son opérateur. Une formulation unique
 * imposée ici ferait perdre la plus précise des deux.
 */
export async function telechargerFichier(
  url: string,
  nomParDefaut: string,
  replis: EchecCandidat = ILLISIBLE,
): Promise<Resultat<void>> {
  let reponse: Response;
  try {
    reponse = await fetch(url, { cache: "no-store" });
  } catch {
    return { ok: false, echec: HORS_LIGNE };
  }

  if (!reponse.ok) {
    const charge: unknown = await reponse.json().catch(() => null);
    return {
      ok: false,
      echec: (charge as { echec?: EchecCandidat } | null)?.echec ?? replis,
    };
  }

  /**
   * Le nom vient du serveur quand il le donne. C'est lui qui connaît le
   * périmètre exact du fichier — la période retenue, les catégories
   * filtrées —, et un nom recalculé côté client s'en écarterait le jour où
   * la route changerait de bornes.
   */
  const nom =
    nomDeLEntete(reponse.headers?.get("content-disposition") ?? null) ?? nomParDefaut;

  const contenu = await reponse.blob();
  const adresse = URL.createObjectURL(contenu);
  const lien = document.createElement("a");
  lien.href = adresse;
  lien.download = nom;
  lien.click();
  URL.revokeObjectURL(adresse);
  return { ok: true, donnees: undefined };
}

/** `attachment; filename="immipro-journal-audit-2026-09-01_2026-09-21.csv"`. */
export function nomDeLEntete(entete: string | null): string | null {
  if (!entete) return null;
  const guillemets = /filename="([^"]+)"/u.exec(entete);
  if (guillemets?.[1]) return guillemets[1];
  const nu = /filename=([^;]+)/u.exec(entete);
  return nu?.[1]?.trim() || null;
}
