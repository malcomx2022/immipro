import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { comptes } from "@/server/lecture/backoffice";
import { echec } from "@/server/http/echecs";
import { journaliser } from "@/server/acces/journal";
import { fermerToutesLesSessions } from "@/server/securite/session";
import { MOTIF_MINIMUM_COMPTE } from "@/domain/backoffice/comptes";
import { verdictDeSuspension } from "@/domain/comptes/gestion-interne";
import { estInterne, estRole, type RoleDeCompte } from "@/domain/comptes/hierarchie";
import { suspendreOuRetablir } from "@/server/comptes/gestion";

/**
 * Comptes — B-03, WF-15.
 *
 * RG-15.1 : le motif est obligatoire, et il l'est dans la signature. Une
 * suspension sans motif n'est pas refusée par politesse : c'est elle qu'on
 * relit quand quelqu'un conteste, et « suspendu le 12 » ne répond à rien.
 *
 * La suspension ferme les sessions ouvertes. Sans cela, elle ne prendrait
 * effet qu'à l'expiration du cookie — c'est-à-dire trente jours plus tard,
 * pendant lesquels la personne suspendue continuerait d'utiliser la
 * plateforme.
 *
 * ── Comptes internes — S.210 ────────────────────────────────────────
 *
 * Un candidat se suspend depuis le rôle administrateur, comme avant. Un
 * compte interne (veilleur et au-dessus), depuis le rôle
 * super-administrateur seulement : sinon un administrateur pourrait
 * écarter celui qui gère les rôles. Ce cas passe par
 * `suspendreOuRetablir`, en transaction sérialisable : deux
 * super-administrateurs qui se suspendraient l'un l'autre au même instant
 * ne laissent pas la plateforme sans sommet.
 */
export const GET = route({
  nom: "admin.utilisateurs",
  acces: "admin",
  limite: "lecture",
  requete: z.object({ recherche: z.string().min(2).optional() }),
  async traiter({ requete }) {
    return { comptes: await comptes(requete.recherche) };
  },
});

export const PUT = route({
  nom: "admin.utilisateurs.suspension",
  acces: "admin",
  limite: "sensible",
  corps: z.object({
    userId: z.guid(),
    suspendre: z.boolean(),
    // Même seuil que l'écran et les autres actions de compte (O-4, S.183).
    motif: z.string().trim().min(MOTIF_MINIMUM_COMPTE).max(500),
  }),
  async traiter({ corps, acteur }) {
    const cible = await db.user.findUnique({ where: { id: corps.userId } });
    if (!cible) throw echec("introuvable");

    const role: RoleDeCompte = typeof cible.role === "string" && estRole(cible.role) ? cible.role : "CANDIDAT";
    if (estInterne(role)) return suspendreOuRetablir(acteur!, corps);

    const verdict = verdictDeSuspension(
      { id: acteur!.id, role: acteur!.role as RoleDeCompte },
      { id: cible.id, role, suspendu: Boolean(cible.suspendedAt), supprime: Boolean(cible.deletedAt) },
      corps.suspendre,
      // Un candidat n'est jamais super-administrateur : la borne ne joue pas.
      Number.POSITIVE_INFINITY,
    );
    if (!verdict.permis) throw echec("etat_incompatible", { corps: verdict.raison });

    await journaliser({
      acteurId: acteur!.id,
      action: corps.suspendre ? "compte.suspension" : "compte.retablissement",
      cible: `user:${cible.id}`,
      motif: corps.motif,
    });

    await db.user.update({
      where: { id: cible.id },
      data: { suspendedAt: corps.suspendre ? new Date() : null },
    });

    const fermees = corps.suspendre ? await fermerToutesLesSessions(cible.id) : 0;
    return { suspendu: corps.suspendre, sessionsFermees: fermees };
  },
});
