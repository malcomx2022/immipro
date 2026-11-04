import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { estUneCoursePerdue } from "@/server/http/concurrence";
import { journaliser } from "@/server/acces/journal";
import {
  lireLaCreation,
  verdictDeSuspension,
  type SaisieDeCreation,
} from "@/domain/comptes/gestion-interne";
import { estRole, peutCreerUnCompteInterne, type RoleDeCompte } from "@/domain/comptes/hierarchie";
import type { Acteur } from "@/server/securite/session";

/**
 * Gestion des comptes depuis B-03 — S.210.
 *
 * La décision est au domaine (`gestion-interne`), l'écriture ici : le
 * geste, la fermeture des sessions et la ligne de journal tiennent ou
 * tombent ensemble. Aucune de ces fonctions ne rend un mot de passe, une
 * empreinte ou un jeton : le client n'en reçoit jamais.
 */

const acteurDuDomaine = (acteur: Acteur) => ({ id: acteur.id, role: acteur.role as RoleDeCompte });

export type IssueDeLaCreation =
  | { issue: "cree"; id: string; email: string; role: RoleDeCompte }
  | { issue: "existe"; email: string };

/**
 * Crée un compte interne (veilleur ou administrateur), sans mot de passe.
 *
 * La personne le choisit depuis « Mot de passe oublié » : le code part à
 * son adresse, si bien que personne n'entre dans un compte créé au nom
 * d'un autre sans lire sa messagerie. Une adresse déjà inscrite n'est pas
 * réutilisée : son rôle se change par le geste prévu, qui exige une
 * adresse vérifiée.
 */
export async function creerUnCompteInterne(
  acteur: Acteur,
  saisie: SaisieDeCreation,
): Promise<IssueDeLaCreation> {
  if (!peutCreerUnCompteInterne(acteur.role as RoleDeCompte)) throw echec("droits_insuffisants");
  const lue = lireLaCreation(saisie);
  if (!lue.ok) throw echec("champs_invalides", { champs: lue.champs });
  const { creation } = lue;
  // `lireLaCreation` a déjà normalisé l'adresse (blancs et casse).
  const { email } = creation;

  try {
    return await db.$transaction(async (tx) => {
      const existant = await tx.user.findUnique({ where: { email }, select: { id: true } });
      if (existant) return { issue: "existe", email } as const;
      const cree = await tx.user.create({
        data: {
          email,
          passwordHash: null,
          firstName: creation.prenom,
          lastName: creation.nom,
          role: creation.role as Role,
        },
        select: { id: true },
      });
      await journaliser(
        {
          acteurId: acteur.id,
          action: "compte.creation.interne",
          cible: `user:${cree.id}`,
          motif: creation.motif,
          details: { role: creation.role },
        },
        tx,
      );
      return { issue: "cree", id: cree.id, email, role: creation.role } as const;
    });
  } catch (erreur) {
    // Créée entre la lecture et l'écriture : même issue qu'une adresse prise.
    if ((erreur as { code?: unknown } | null)?.code === "P2002") return { issue: "existe", email };
    throw erreur;
  }
}

/**
 * Suspend ou rétablit un compte — WF-15, resserré en S.210, atomique en S.214.
 *
 * Un candidat se suspend depuis le rôle administrateur, comme avant. Un
 * compte interne, depuis le rôle super-administrateur seulement, et le
 * dernier super-administrateur actif ne se suspend pas.
 *
 * **Tout passe ici, candidat compris (S.214).** La route lisait le rôle de
 * la cible hors transaction, puis suspendait un « candidat » en trois
 * écritures séparées : un compte promu entre la lecture et l'écriture
 * était suspendu par un administrateur, au mépris de la règle ci-dessus,
 * et une panne entre deux écritures laissait une trace sans suspension ou
 * une suspension sans fermeture des sessions. Désormais : lecture du rôle,
 * décompte des super-administrateurs, écriture conditionnée à l'état lu,
 * fermeture des sessions et ligne de journal, dans une transaction
 * sérialisable. Deux suspensions simultanées de deux super-administrateurs
 * ne laissent pas la plateforme sans sommet : la base en refuse une.
 */
export async function suspendreOuRetablir(
  acteur: Acteur,
  demande: { userId: string; suspendre: boolean; motif: string },
): Promise<{ suspendu: boolean; sessionsFermees: number }> {
  try {
    return await db.$transaction(
      async (tx) => {
        const cible = await tx.user.findUnique({
          where: { id: demande.userId },
          select: { id: true, role: true, suspendedAt: true, deletedAt: true },
        });
        if (!cible) throw echec("introuvable");
        // L'acteur relu dans la même transaction (S.214) : un opérateur
        // suspendu, ou dont le rôle a baissé, pendant que sa requête était
        // en vol ne décide plus rien avec l'autorité qu'il n'a plus.
        const auteur = await tx.user.findUnique({
          where: { id: acteur.id },
          select: { role: true, suspendedAt: true, deletedAt: true },
        });
        if (!auteur || auteur.suspendedAt || auteur.deletedAt || auteur.role !== acteur.role) {
          throw echec("droits_insuffisants");
        }
        const superAdminsActifs = await tx.user.count({
          where: { role: "SUPER_ADMIN", deletedAt: null, suspendedAt: null },
        });
        const role: RoleDeCompte = estRole(String(cible.role)) ? (cible.role as RoleDeCompte) : "CANDIDAT";
        const verdict = verdictDeSuspension(
          acteurDuDomaine(acteur),
          {
            id: cible.id,
            role,
            suspendu: cible.suspendedAt !== null,
            supprime: cible.deletedAt !== null,
          },
          demande.suspendre,
          superAdminsActifs,
        );
        if (!verdict.permis) throw echec("etat_incompatible", { corps: verdict.raison });

        // La trace d'abord : un journal qui échoue n'a rien laissé changer.
        await journaliser(
          {
            acteurId: acteur.id,
            action: demande.suspendre ? "compte.suspension" : "compte.retablissement",
            cible: `user:${cible.id}`,
            motif: demande.motif,
            details: { role },
          },
          tx,
        );
        // Conditionnée au rôle et à l'état lus : si l'un a changé entre-temps,
        // ce geste raisonne sur le passé et ne s'écrit pas.
        const { count } = await tx.user.updateMany({
          where: { id: cible.id, role: cible.role },
          data: { suspendedAt: demande.suspendre ? (cible.suspendedAt ?? new Date()) : null },
        });
        if (count !== 1) throw new Concurrence();
        const sessionsFermees = demande.suspendre
          ? (await tx.session.deleteMany({ where: { userId: cible.id } })).count
          : 0;
        return { suspendu: demande.suspendre, sessionsFermees };
      },
      { isolationLevel: "Serializable" },
    );
  } catch (erreur) {
    if (erreur instanceof Concurrence || estUneCoursePerdue(erreur)) {
      throw echec("etat_incompatible", {
        corps: "Ce compte vient d'être modifié par une autre action. Recharge la page pour lire son état actuel, puis recommence.",
      });
    }
    throw erreur;
  }
}

class Concurrence extends Error {}
