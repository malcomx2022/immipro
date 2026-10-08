import { writeFile } from "node:fs/promises";
import { db } from "@/lib/db";

/**
 * Le battement du worker — revue du 07/10/2026, M15.
 *
 * Le conteneur `worker` n'avait aucune sonde : un processus vivant mais
 * figé (connexion perdue, boucle bloquée) restait « Up » dans `docker
 * compose ps`, et la purge comme la réconciliation s'arrêtaient sans que
 * rien ne le dise. Toutes les trente secondes, le worker interroge la base
 * puis réécrit un fichier ; la sonde du compose regarde l'âge du fichier.
 * Une base injoignable ou une boucle bloquée laissent le fichier vieillir,
 * et le conteneur passe `unhealthy`. Le chemin est celui que lit la sonde
 * du service `worker` dans `docker-compose.prod.yml`.
 */
export const FICHIER_DU_BATTEMENT = "/tmp/worker-battement";
export const PERIODE_DU_BATTEMENT_MS = 30_000;

export async function battre(maintenant = new Date()): Promise<boolean> {
  try {
    await db.$queryRaw`SELECT 1`;
    await writeFile(FICHIER_DU_BATTEMENT, maintenant.toISOString());
    return true;
  } catch (erreur) {
    // Le fichier n'est pas réécrit : c'est son âge qui alerte.
    console.warn(`[battement] manqué : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    return false;
  }
}

/** Bat tout de suite, puis toutes les trente secondes. Rend la minuterie, pour l'arrêt. */
export function demarrerLeBattement(): NodeJS.Timeout {
  void battre();
  const minuterie = setInterval(() => void battre(), PERIODE_DU_BATTEMENT_MS);
  minuterie.unref();
  return minuterie;
}
