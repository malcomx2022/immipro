import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { journaliser } from "@/server/acces/journal";
import { fermerToutesLesSessions } from "@/server/securite/session";

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
 */
export const GET = route({
  nom: "admin.utilisateurs",
  acces: "admin",
  limite: "lecture",
  requete: z.object({ recherche: z.string().min(2).optional() }),
  async traiter({ requete }) {
    const comptes = await db.user.findMany({
      where: requete.recherche
        ? { email: { contains: requete.recherche, mode: "insensitive" } }
        : {},
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { _count: { select: { applications: true, transactions: true } } },
    });

    return {
      comptes: comptes.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        emailVerifie: u.emailVerified !== null,
        suspendu: u.suspendedAt !== null,
        suspenduLe: u.suspendedAt?.toISOString() ?? null,
        dossiers: u._count.applications,
        paiements: u._count.transactions,
        creeLe: u.createdAt.toISOString(),
      })),
    };
  },
});

export const PUT = route({
  nom: "admin.utilisateurs.suspension",
  acces: "admin",
  limite: "sensible",
  corps: z.object({
    userId: z.string().uuid(),
    suspendre: z.boolean(),
    motif: z.string().trim().min(3).max(500),
  }),
  async traiter({ corps, acteur }) {
    const cible = await db.user.findUnique({ where: { id: corps.userId } });
    if (!cible) throw echec("introuvable");

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
