import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { journaliser } from "@/server/acces/journal";
import { emettreUnCode } from "@/server/acces/comptes";
import { envoyerCodeDeVerification } from "@/server/courrier";
import { suiteDeLEnvoi } from "@/domain/courrier/transport";
import { MOTIF_MINIMUM_COMPTE } from "@/domain/backoffice/comptes";

/**
 * Renvoyer le code de vérification d'un compte — B-03, S.121.
 *
 * Le candidat sait déjà le demander pour lui-même (A-03). Le faire à sa
 * place sert quand il ne retrouve plus son écran de vérification : même
 * émission (`emettreUnCode`, qui annule les codes précédents), même
 * courrier, même validité de dix minutes. Aucune règle de plus, aucun
 * contournement : le code n'est ni rendu ni journalisé, il part à
 * l'adresse du compte et à elle seule.
 *
 * RG-15.1 : motif obligatoire, écrit au journal avant l'envoi.
 */
export const POST = route({
  nom: "admin.utilisateurs.verification",
  acces: "admin",
  limite: "sensible",
  corps: z.object({
    userId: z.guid(),
    motif: z.string().trim().min(MOTIF_MINIMUM_COMPTE).max(500),
  }),
  async traiter({ corps, acteur }) {
    const cible = await db.user.findUnique({
      where: { id: corps.userId },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        deletedAt: true,
        deletionRequestedAt: true,
      },
    });
    if (!cible || cible.deletedAt) throw echec("introuvable");
    // Rien à renvoyer à une adresse déjà vérifiée, ni à un compte qui
    // s'efface : un code émis n'ouvrirait plus rien d'utile.
    if (cible.emailVerified) {
      throw echec("etat_incompatible", {
        corps: "L'adresse de ce compte est déjà vérifiée : il n'y a pas de code à renvoyer. Recharge la liste, le statut a changé.",
      });
    }
    if (cible.deletionRequestedAt) {
      throw echec("etat_incompatible", {
        corps: "Ce compte a demandé sa suppression : un code de vérification n'ouvrirait plus rien. Traite la demande de suppression à la place.",
      });
    }

    await journaliser({
      acteurId: acteur!.id,
      action: "compte.verification",
      cible: `user:${cible.id}`,
      motif: corps.motif,
    });

    const code = await emettreUnCode(cible.id, "VERIFICATION_EMAIL");
    const envoi = await envoyerCodeDeVerification(cible.email, code);
    // Même règle qu'à l'écran du candidat : un transport muet n'est pas
    // un envoi, et l'opérateur doit le lire comme tel.
    if (!suiteDeLEnvoi(envoi.issue).parti) throw echec("service_indisponible");
    return { envoye: true };
  },
});
