import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { journaliser } from "@/server/acces/journal";
import {
  lireLaCreation,
  verdictDeSuspension,
  type SaisieDeCreation,
} from "@/domain/comptes/gestion-interne";
import { peutCreerUnCompteInterne, type RoleDeCompte } from "@/domain/comptes/hierarchie";
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
 * Suspend ou rétablit un compte — WF-15, resserré en S.210.
 *
 * Un candidat se suspend depuis le rôle administrateur, comme avant. Un
 * compte interne, depuis le rôle super-administrateur seulement, et le
 * dernier super-administrateur actif ne se suspend pas. La suspension
 * ferme les sessions ouvertes, dans la même transaction que sa trace.
 */
export async function suspendreOuRetablir(
  acteur: Acteur,
  demande: { userId: string; suspendre: boolean; motif: string },
): Promise<{ suspendu: boolean; sessionsFermees: number }> {
  return db.$transaction(
    async (tx) => {
      const cible = await tx.user.findUnique({
        where: { id: demande.userId },
        select: { id: true, role: true, suspendedAt: true, deletedAt: true },
      });
      if (!cible) throw echec("introuvable");
      const superAdminsActifs = await tx.user.count({
        where: { role: "SUPER_ADMIN", deletedAt: null, suspendedAt: null },
      });
      const verdict = verdictDeSuspension(
        acteurDuDomaine(acteur),
        {
          id: cible.id,
          role: cible.role as RoleDeCompte,
          suspendu: cible.suspendedAt !== null,
          supprime: cible.deletedAt !== null,
        },
        demande.suspendre,
        superAdminsActifs,
      );
      if (!verdict.permis) throw echec("etat_incompatible", { corps: verdict.raison });

      await journaliser(
        {
          acteurId: acteur.id,
          action: demande.suspendre ? "compte.suspension" : "compte.retablissement",
          cible: `user:${cible.id}`,
          motif: demande.motif,
        },
        tx,
      );
      await tx.user.update({
        where: { id: cible.id },
        data: { suspendedAt: demande.suspendre ? new Date() : null },
      });
      const sessionsFermees = demande.suspendre
        ? (await tx.session.deleteMany({ where: { userId: cible.id } })).count
        : 0;
      return { suspendu: demande.suspendre, sessionsFermees };
    },
    { isolationLevel: "Serializable" },
  );
}
