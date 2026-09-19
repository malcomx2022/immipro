import { route } from "@/server/http/route";
import { db } from "@/lib/db";

/**
 * Alertes — T-01, WF-11.
 *
 * RG-11.2 : les alertes sont ciblées par dossier, jamais diffusées à toute
 * la base. La requête le tient : elle filtre par compte, et chaque ligne
 * porte le dossier qu'elle concerne.
 *
 * `dueAt` est rendue plutôt qu'un délai calculé : « dans 7 jours » écrit
 * côté serveur resterait « dans 7 jours » le jour même, puis une semaine
 * après. L'écran recalcule à l'affichage, avec `titreAlerte`.
 */
export const GET = route({
  nom: "notifications",
  acces: "candidat",
  limite: "lecture",
  async traiter({ acteur }) {
    const alertes = await db.notification.findMany({
      where: { userId: acteur!.id },
      orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
      take: 50,
    });

    return {
      alertes: alertes.map((a) => ({
        id: a.id,
        genre: a.kind,
        titre: a.title,
        corps: a.body,
        dossierId: a.applicationId,
        // INV-8 : une alerte réglementaire porte la source qu'elle cite.
        source: a.sourceUrl,
        echeanceLe: a.dueAt?.toISOString().slice(0, 10) ?? null,
        migrationId: a.migrationId,
        lueLe: a.readAt?.toISOString() ?? null,
        creeeLe: a.createdAt.toISOString(),
      })),
      nonLues: alertes.filter((a) => a.readAt === null).length,
    };
  },
});
