import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { appliquerLeChangementDeRole } from "@/server/comptes/role";
import { confirmationJuste } from "@/domain/comptes/gestion-interne";
import { ROLES, type RoleDeCompte } from "@/domain/comptes/hierarchie";
import { MOTIF_MAX, MOTIF_MIN } from "@/domain/comptes/role";

/**
 * Changement de rôle depuis B-03 — S.210.
 *
 * Réservé au super-administrateur (`acces: "super_admin"`) : un ADMIN, un
 * VEILLEUR ou un candidat reçoit 403, et l'essai part au journal. Contrôle
 * d'origine (CSRF) et limite sensible comme toute écriture.
 *
 * **Double confirmation.** L'écran demande un premier clic, puis l'adresse
 * du compte ressaisie ; la route vérifie la seconde, qu'un script qui
 * rejouerait un ancien corps ne connaît pas forcément. Une confirmation
 * fausse n'écrit rien et ne journalise rien.
 *
 * Le changement ferme les sessions du compte et écrit sa ligne
 * `compte.role` dans la même transaction (`appliquerLeChangementDeRole`).
 */
export const POST = route({
  nom: "admin.comptes.role",
  acces: "super_admin",
  limite: "sensible",
  corps: z.object({
    userId: z.guid(),
    role: z.enum(ROLES),
    motif: z.string().trim().min(MOTIF_MIN).max(MOTIF_MAX),
    confirmation: z.string().max(254),
  }),
  async traiter({ corps, acteur }) {
    const cible = await db.user.findUnique({
      where: { id: corps.userId },
      select: { id: true, email: true },
    });
    if (!cible) throw echec("introuvable");
    if (!confirmationJuste(corps.confirmation, cible.email)) {
      throw echec("champs_invalides", {
        champs: {
          confirmation: "Ressaisis exactement l'adresse du compte pour confirmer le changement de rôle.",
        },
      });
    }

    const issue = await appliquerLeChangementDeRole({
      cible: { id: cible.id },
      vers: corps.role,
      motif: corps.motif,
      auteur: { genre: "compte", id: acteur!.id, role: acteur!.role as RoleDeCompte },
    });
    if (issue.issue === "introuvable") throw echec("introuvable");
    if (issue.issue === "refuse") throw echec("etat_incompatible", { corps: issue.raison });
    return issue;
  },
});
