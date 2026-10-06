import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { journaliser } from "@/server/acces/journal";
import { acheverLaSuppression } from "@/server/acces/suppression";
import { MOTIF_MINIMUM_COMPTE } from "@/domain/backoffice/comptes";

/**
 * Relancer la suppression d'un compte — B-03, RG-10.4, S.121.
 *
 * C'est la fonction que la tâche de nuit reprend déjà
 * (`acheverLesSuppressionsEnAttente`), appelée à la demande : utile le
 * jour où le stockage objet a laissé une suppression à mi-chemin et
 * qu'on n'attend pas le lendemain. Un administrateur ne **déclenche** pas
 * une suppression : seul le candidat la demande, et un compte sans
 * `deletionRequestedAt` est refusé.
 *
 * Idempotente : un compte déjà anonymisé rend `anonymise: true` sans rien
 * réécrire ni journaliser, et rejouer une purge partielle ne purge que ce
 * qui reste. Si une pièce résiste encore, la réponse dit `anonymise:
 * false` et rien n'est anonymisé.
 */
export const POST = route({
  nom: "admin.utilisateurs.suppression",
  acces: "admin",
  limite: "sensible",
  corps: z.object({
    userId: z.string().uuid(),
    motif: z.string().trim().min(MOTIF_MINIMUM_COMPTE).max(500),
  }),
  async traiter({ corps, acteur }) {
    const cible = await db.user.findUnique({
      where: { id: corps.userId },
      select: { id: true, deletedAt: true, deletionRequestedAt: true },
    });
    if (!cible) throw echec("introuvable");
    if (cible.deletedAt) return { anonymise: true, dossiers: 0, versions: 0 };
    if (!cible.deletionRequestedAt) {
      throw echec("etat_incompatible", {
        corps: "Ce compte n'a pas demandé sa suppression. Seul le candidat la demande, depuis son espace : rien n'a été supprimé.",
      });
    }

    await journaliser({
      acteurId: acteur!.id,
      action: "compte.relance",
      cible: `user:${cible.id}`,
      motif: corps.motif,
    });

    return acheverLaSuppression(cible.id);
  },
});
