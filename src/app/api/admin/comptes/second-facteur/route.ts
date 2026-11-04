import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { confirmationJuste } from "@/domain/comptes/gestion-interne";
import { MOTIF_MAX, MOTIF_MIN } from "@/domain/comptes/role";
import { reinitialiserLeSecondFacteur } from "@/server/comptes/second-facteur";

/**
 * Réinitialiser la double authentification d'un compte — B-03, S.214.
 *
 * Le geste de qui a perdu son téléphone et ses codes de secours. Réservé
 * au super-administrateur (403 et `acces.refuse` au journal pour tout autre
 * rôle), sous le régime `critique`, avec la même double confirmation qu'un
 * changement de rôle : l'adresse du compte ressaisie, revérifiée ici. Le
 * second facteur part, les sessions du compte se ferment, et la ligne
 * `compte.second_facteur.reinitialisation` porte le motif, ensemble.
 */
export const POST = route({
  nom: "admin.comptes.second_facteur",
  acces: "super_admin",
  limite: "critique",
  corps: z.object({
    userId: z.guid(),
    motif: z.string().trim().min(MOTIF_MIN).max(MOTIF_MAX),
    confirmation: z.string().max(254),
  }),
  async traiter({ corps, acteur }) {
    const cible = await db.user.findUnique({ where: { id: corps.userId }, select: { id: true, email: true } });
    if (!cible) throw echec("introuvable");
    if (!confirmationJuste(corps.confirmation, cible.email)) {
      throw echec("champs_invalides", {
        champs: { confirmation: "Ressaisis exactement l'adresse du compte pour confirmer la réinitialisation." },
      });
    }
    return reinitialiserLeSecondFacteur(acteur!, cible.id, corps.motif);
  },
});
