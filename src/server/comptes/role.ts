import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { journaliser } from "@/server/acces/journal";
import {
  auteurConsole,
  verdictDuChangement,
  type DemandeDeChangement,
  type RoleDeCompte,
} from "@/domain/comptes/role";

/**
 * Le changement de rôle et sa ligne de journal, ensemble — S.115.
 *
 * Les deux s'écrivent dans **une** transaction : un rôle changé sans trace
 * est précisément ce que ce module remplace, et une trace sans changement
 * mentirait. Le nombre d'administrateurs est relu dans la même
 * transaction, pour que deux retraits simultanés ne laissent pas la
 * plateforme sans personne.
 *
 * Le rôle prend effet à la requête suivante : la session ne le copie pas,
 * elle le relit en base (`server/securite/session`).
 */
export type IssueDuChangement =
  | { issue: "change"; de: RoleDeCompte; vers: RoleDeCompte }
  | { issue: "inchange"; raison: string }
  | { issue: "refuse"; raison: string }
  | { issue: "introuvable" };

class Refus extends Error {
  constructor(readonly issue: IssueDuChangement) {
    super("refus");
  }
}

export async function changerLeRole(demande: DemandeDeChangement): Promise<IssueDuChangement> {
  try {
    return await db.$transaction(
      async (tx) => {
        const cible = await tx.user.findUnique({ where: { email: demande.email } });
        if (!cible) throw new Refus({ issue: "introuvable" });
        const administrateurs = await tx.user.count({ where: { role: "ADMIN", deletedAt: null } });
        const verdict = verdictDuChangement(
          {
            role: cible.role as RoleDeCompte,
            emailVerifie: cible.emailVerified !== null,
            suspendu: cible.suspendedAt !== null,
            supprime: cible.deletedAt !== null,
          },
          demande.role,
          administrateurs,
        );
        if (!verdict.permis) {
          throw new Refus(
            verdict.inchange
              ? { issue: "inchange", raison: verdict.raison }
              : { issue: "refuse", raison: verdict.raison },
          );
        }

        // La condition porte sur le rôle lu : s'il a changé entre-temps,
        // une autre commande est passée et celle-ci raisonne sur le passé.
        const { count } = await tx.user.updateMany({
          where: { id: cible.id, role: cible.role },
          data: { role: demande.role as Role },
        });
        if (count !== 1) {
          throw new Refus({ issue: "refuse", raison: "Le rôle a changé pendant la commande : relancez-la pour lire l'état actuel." });
        }
        await journaliser(
          {
            acteurId: auteurConsole(demande.par),
            action: "compte.role",
            cible: `user:${cible.id}`,
            motif: demande.motif,
            details: { de: cible.role, vers: demande.role },
          },
          tx,
        );
        return { issue: "change", de: cible.role as RoleDeCompte, vers: demande.role } as const;
      },
      { isolationLevel: "Serializable" },
    );
  } catch (erreur) {
    if (erreur instanceof Refus) return erreur.issue;
    // Deux commandes simultanées : la base en sérialise une, l'autre échoue
    // plutôt que de raisonner sur un état périmé.
    if ((erreur as { code?: unknown }).code === "P2034") {
      return { issue: "refuse", raison: "Une autre commande a modifié les rôles en même temps : relancez celle-ci." };
    }
    throw erreur;
  }
}
