import { db } from "@/lib/db";
import {
  coutMicrosDesJetons,
  tarifDepuisEnvironnement,
} from "@/domain/backoffice/couts";

/**
 * Ce qu'un appel a consommé — WF-16, INV-6.
 *
 * Écrit même quand l'appel n'a rien rendu : une réponse coupée au
 * plafond a coûté ses jetons. L'omettre en ferait un appel gratuit dans
 * B-07, ce que l'invariant appelle un dépassement silencieux.
 *
 * Le prix du jeton n'est pas mesuré tant qu'aucun tarif n'est
 * configuré ; `costMicros` porte alors zéro, et B-07 ne le lit pas — il
 * recalcule depuis les jetons et le tarif du jour, pour qu'une ligne
 * écrite avant le tarif ne compte pas comme gratuite. La route de
 * rédaction écrivait `0` en dur, ce qui donnait le même nombre pour une
 * raison différente : elle ne l'aurait pas mis à jour le jour du tarif.
 */
export async function noterLesJetons(
  userId: string,
  applicationId: string,
  operation: string,
  jetonsEntree: number,
  jetonsSortie: number,
): Promise<void> {
  if (jetonsEntree === 0 && jetonsSortie === 0) return;
  await db.aiUsage.create({
    data: {
      userId,
      applicationId,
      operation,
      inputTokens: jetonsEntree,
      outputTokens: jetonsSortie,
      costMicros:
        coutMicrosDesJetons(
          tarifDepuisEnvironnement(process.env),
          jetonsEntree,
          jetonsSortie,
        ) ?? 0,
    },
  });
}
