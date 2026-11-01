import type { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { journaliser } from "@/server/acces/journal";
import {
  auteurConsole,
  verdictDuChangement,
  type DemandeDeChangement,
  type RoleDeCompte,
} from "@/domain/comptes/role";
import { rolesAuMoins } from "@/domain/comptes/hierarchie";

/**
 * Le changement de rôle et sa ligne de journal, ensemble — S.115, S.210.
 *
 * Les deux s'écrivent dans **une** transaction : un rôle changé sans trace
 * est précisément ce que ce module remplace, et une trace sans changement
 * mentirait. Le nombre d'administrateurs et de super-administrateurs
 * actifs est relu dans la même transaction, sérialisable, pour que deux
 * retraits simultanés ne laissent pas la plateforme sans personne.
 *
 * Deux auteurs possibles :
 *
 * - la **console du serveur** (`changer-role`), qui garde son autorité :
 *   c'est elle qui nomme le premier super-administrateur ;
 * - un **compte super-administrateur**, depuis B-03 (S.210). Le domaine
 *   refuse tout autre rôle et l'auto-promotion.
 *
 * **Les sessions du compte changé sont fermées dans la transaction.** La
 * session relit déjà le rôle en base à chaque appel ; les fermer en plus
 * oblige la personne à se reconnecter, et un écran resté ouvert sur
 * l'ancien rôle ne continue pas à envoyer des gestes que le nouveau rôle
 * n'autorise plus — ni, pour une promotion, à hériter d'une session
 * ouverte avant que le rôle ne soit donné.
 */
export type IssueDuChangement =
  | { issue: "change"; de: RoleDeCompte; vers: RoleDeCompte; sessionsFermees: number }
  | { issue: "inchange"; raison: string }
  | { issue: "refuse"; raison: string }
  | { issue: "introuvable" };

export type AuteurDuChangement =
  | { genre: "console"; par: string }
  | { genre: "compte"; id: string; role: RoleDeCompte };

export interface ChangementDeRole {
  cible: { email: string } | { id: string };
  vers: RoleDeCompte;
  motif: string;
  auteur: AuteurDuChangement;
}

class Refus extends Error {
  constructor(readonly issue: IssueDuChangement) {
    super("refus");
  }
}

/** Actif : ni suspendu, ni supprimé. C'est ce que la borne des deux compte. */
const SUPER_ADMINS_ACTIFS: Prisma.UserWhereInput = {
  role: "SUPER_ADMIN",
  deletedAt: null,
  suspendedAt: null,
};

export async function appliquerLeChangementDeRole(
  changement: ChangementDeRole,
): Promise<IssueDuChangement> {
  const { auteur } = changement;
  try {
    return await db.$transaction(
      async (tx) => {
        const cible = await tx.user.findUnique({
          where: "email" in changement.cible ? { email: changement.cible.email } : { id: changement.cible.id },
        });
        if (!cible) throw new Refus({ issue: "introuvable" });

        const [administrateurs, superAdminsActifs] = await Promise.all([
          tx.user.count({
            where: { role: { in: rolesAuMoins("ADMIN") as Role[] }, deletedAt: null },
          }),
          tx.user.count({ where: SUPER_ADMINS_ACTIFS }),
        ]);
        const verdict = verdictDuChangement(
          {
            id: cible.id,
            role: cible.role as RoleDeCompte,
            emailVerifie: cible.emailVerified !== null,
            suspendu: cible.suspendedAt !== null,
            supprime: cible.deletedAt !== null,
          },
          changement.vers,
          administrateurs,
          {
            superAdminsActifs,
            ...(auteur.genre === "compte" ? { acteur: { id: auteur.id, role: auteur.role } } : {}),
          },
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
          data: { role: changement.vers as Role },
        });
        if (count !== 1) {
          throw new Refus({ issue: "refuse", raison: "Le rôle a changé pendant la commande : relancez-la pour lire l'état actuel." });
        }
        const { count: sessionsFermees } = await tx.session.deleteMany({ where: { userId: cible.id } });
        await journaliser(
          {
            acteurId: auteur.genre === "console" ? auteurConsole(auteur.par) : auteur.id,
            action: "compte.role",
            cible: `user:${cible.id}`,
            motif: changement.motif,
            details: {
              de: cible.role,
              vers: changement.vers,
              sessionsFermees,
              origine: auteur.genre === "console" ? "console" : "back-office",
            },
          },
          tx,
        );
        return {
          issue: "change",
          de: cible.role as RoleDeCompte,
          vers: changement.vers,
          sessionsFermees,
        } as const;
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

/** La commande de la console (S.115) : l'adresse, le rôle, l'opérateur et le motif. */
export const changerLeRole = (demande: DemandeDeChangement): Promise<IssueDuChangement> =>
  appliquerLeChangementDeRole({
    cible: { email: demande.email },
    vers: demande.role,
    motif: demande.motif,
    auteur: { genre: "console", par: demande.par },
  });
