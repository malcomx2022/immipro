import { z } from "zod";
import { route } from "@/server/http/route";
import { corrigerLeDepot } from "@/server/dossiers/parcours";
import { depuisDateCivile } from "@/domain/dossiers/depot";

/**
 * Correction de la date réelle d'un dépôt — B-03, arbitrage S.89.
 *
 * Le candidat ne modifie pas librement la date une fois confirmée : il la
 * signale, et l'opérateur la corrige ici. Le motif est obligatoire et part
 * au journal avec l'ancienne et la nouvelle valeur ; les échéances sont
 * recalculées sans jamais rapprocher une purge déjà annoncée.
 */
export const POST = route({
  nom: "admin.dossier.depot.correction",
  acces: "admin",
  limite: "sensible",
  corps: z.object({
    deposeLe: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u, "Indique la date réelle du dépôt : jour, mois et année."),
    motif: z
      .string()
      .trim()
      .min(10, "Dis pourquoi la date change, en une phrase : le motif part au journal d'audit.")
      .max(500),
  }),
  async traiter({ params, corps, acteur }) {
    const { dossier, ancienne, nouvelle } = await corrigerLeDepot(params.id!, {
      deposeLe: corps.deposeLe,
      motif: corps.motif,
      acteurId: acteur!.id,
    });
    return {
      ancienne,
      nouvelle,
      deposeLe: dossier.depositedOn ? depuisDateCivile(dossier.depositedOn) : null,
      conservationJusquAu: dossier.retentionUntil?.toISOString() ?? null,
      purgeLe: dossier.purgeDueAt?.toISOString() ?? null,
    };
  },
});
