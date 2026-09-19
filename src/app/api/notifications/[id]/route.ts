import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { sansContenu } from "@/server/http/reponse";

/** Marquage en lu. Idempotent : relire une alerte lue ne change pas sa date. */
export const PUT = route({
  nom: "notification.lue",
  acces: "candidat",
  limite: "sensible",
  async traiter({ params, acteur }) {
    const { count } = await db.notification.updateMany({
      where: { id: params.id, userId: acteur!.id, readAt: null },
      data: { readAt: new Date() },
    });
    if (count === 0) {
      const existe = await db.notification.count({
        where: { id: params.id, userId: acteur!.id },
      });
      if (existe === 0) throw echec("introuvable");
    }
    return sansContenu();
  },
});
