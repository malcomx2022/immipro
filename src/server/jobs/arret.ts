import type PgBoss from "pg-boss";

/**
 * Arrêt propre du worker — revue du 07/10/2026, M9.
 *
 * Aucun gestionnaire de signal : `docker compose up -d` arrêtait le worker
 * d'un `SIGTERM` que personne n'écoutait, puis d'un `SIGKILL` au bout du
 * délai. Une tâche en cours — une propagation entre deux dossiers, une
 * purge entre deux objets — était coupée net, et pg-boss ne la relâchait
 * qu'à l'expiration de son bail.
 *
 * Sur `SIGTERM` ou `SIGINT`, pg-boss cesse de prendre du travail et laisse
 * finir celui en cours, trente secondes au plus ; le compose donne
 * quarante-cinq secondes avant de tuer (`stop_grace_period`). Le journal
 * dit « worker arrêté », et la sortie est 0 : un arrêt demandé n'est pas
 * une panne. Un second signal pendant l'arrêt est ignoré — c'est
 * l'impatience, pas un ordre différent.
 */
export const DELAI_D_ARRET_MS = 30_000;

export interface Sortie {
  (code: number): void;
}

export function arreterProprement(
  boss: Pick<PgBoss, "stop">,
  sortir: Sortie = (code) => process.exit(code),
): (signal: string) => Promise<void> {
  let enCours = false;
  const arreter = async (signal: string) => {
    if (enCours) {
      console.info(`[worker] ${signal} reçu pendant l'arrêt : ignoré`);
      return;
    }
    enCours = true;
    console.info(`[worker] ${signal} reçu : fin des tâches en cours, ${DELAI_D_ARRET_MS / 1000} s au plus`);
    try {
      await boss.stop({ graceful: true, wait: true, timeout: DELAI_D_ARRET_MS });
      console.log("worker arrêté");
      sortir(0);
    } catch (erreur) {
      console.error("[worker] arrêt en échec", erreur);
      sortir(1);
    }
  };
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => void arreter(signal));
  }
  return arreter;
}
