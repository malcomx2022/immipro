import { db } from "@/lib/db";
import { acheverLesSuppressionsEnAttente } from "@/server/acces/suppression";
import { purgerCeQuiEstEchu, purgerLesPiecesEchues, type Bilan, type BilanConservation } from "./purge";

/**
 * La passe de rétention — INV-5, RG-10.1 ; une seule définition pour la
 * tâche de 3 h 30 et pour la commande lancée après une restauration
 * (RF-4, S.152).
 *
 * Une sauvegarde ressuscite les pièces échues depuis la nuit sauvegardée
 * (E10). La procédure attendait le passage du worker avant de rouvrir le
 * service ; `dist/purge-retention.mjs` lance la même passe tout de suite.
 * Deux définitions finiraient par diverger : c'est celle-ci que le worker
 * appelle aussi.
 *
 * **Une passe à la fois.** La commande peut tomber pendant la passe du
 * worker, et la purge du périmètre de l'inventaire pendant l'une ou
 * l'autre. Les suppressions sont idempotentes, les transitions d'état d'un
 * dossier ne le sont pas toutes : le verrou consultatif est pris pour
 * toute la durée, et une passe qui le trouve pris ne fait rien et le dit.
 */
export const CLE_DU_VERROU_DE_PURGE = "purge-retention";

/** Au-delà, la transaction qui tient le verrou est abandonnée par la base. */
const DUREE_MAXIMALE_D_UNE_PURGE_MS = 30 * 60 * 1000;

/**
 * Exécute la passe sous le verrou de purge, ou rend `null` si une autre
 * passe le tient. La transaction ne sert qu'à porter le verrou : la passe
 * écrit par ses propres connexions, comme la réconciliation (S.122).
 */
export async function sousLeVerrouDePurge<T>(passe: () => Promise<T>): Promise<T | null> {
  return db.$transaction(
    async (tx) => {
      const verrou = await tx.$queryRaw<{ pris: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtextextended(${CLE_DU_VERROU_DE_PURGE}, 0)) AS pris`;
      if (!verrou[0]?.pris) return null;
      return passe();
    },
    { timeout: DUREE_MAXIMALE_D_UNE_PURGE_MS, maxWait: 5_000 },
  );
}

export interface BilanDeRetention {
  purge: Bilan;
  conservation: BilanConservation;
  suppressions: { reprises: number; achevees: number };
}

/**
 * Les pièces échues, puis les autres durées, puis les suppressions de
 * compte restées à mi-chemin — l'ordre de la tâche de 3 h 30.
 */
export async function passeDeRetention(
  options: { maintenant?: Date; acteurId?: string } = {},
): Promise<BilanDeRetention | null> {
  const maintenant = options.maintenant ?? new Date();
  return sousLeVerrouDePurge(async () => ({
    purge: await purgerLesPiecesEchues(maintenant, undefined, options.acteurId),
    // Les durées annoncées ailleurs qu'INV-5 — six mois pour les alertes,
    // cinq ans pour le journal — et les sessions échues.
    conservation: await purgerCeQuiEstEchu(maintenant),
    // Une suppression de compte restée à mi-chemin faute de stockage se
    // rattrape ici ; les jours ordinaires, elle ne trouve rien (RG-10.4).
    suppressions: await acheverLesSuppressionsEnAttente(maintenant),
  }));
}
