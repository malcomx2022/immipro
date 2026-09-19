import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";

/**
 * Journal d'audit — B-06, RG-15.1.
 *
 * Il se lit, il ne s'écrit pas depuis ici, et il ne s'efface pas : un
 * journal qu'un administrateur peut modifier ne prouve rien. Le motif est
 * rendu tel quel, entier — c'est lui qu'on relit six mois plus tard.
 */
export const GET = route({
  nom: "admin.journal",
  acces: "admin",
  limite: "lecture",
  requete: z.object({
    cible: z.string().optional(),
    acteur: z.string().optional(),
  }),
  async traiter({ requete }) {
    const lignes = await db.auditLog.findMany({
      where: {
        ...(requete.cible ? { target: { contains: requete.cible } } : {}),
        ...(requete.acteur ? { actorId: requete.acteur } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return {
      journal: lignes.map((l) => ({
        id: l.id,
        acteurId: l.actorId,
        action: l.action,
        cible: l.target,
        motif: l.reason,
        details: l.metadata,
        survenuLe: l.createdAt.toISOString(),
      })),
    };
  },
});
