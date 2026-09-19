import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { getPack, SEUIL_MARGE_IA, type Devise } from "@/domain/payments/pricing";

/**
 * Coûts IA — B-07, WF-16.
 *
 * RG-16.1 : le coût marginal moyen d'un dossier doit rester sous 15 % du
 * prix du pack correspondant. La route rapproche le coût réel enregistré à
 * chaque appel du prix effectivement payé, dossier par dossier, plutôt que
 * d'une moyenne : une moyenne saine masque exactement le dossier qui
 * déborde, et c'est celui-là qu'il faut voir (RG-16.2).
 *
 * Les jetons ne sortent pas d'ici vers un écran candidat : cette route est
 * en accès administrateur, et sa réponse est sérialisée pour un opérateur.
 */
export const GET = route({
  nom: "admin.couts",
  acces: "admin",
  limite: "lecture",
  async traiter() {
    const usages = await db.aiUsage.groupBy({
      by: ["applicationId"],
      _sum: { costMicros: true, inputTokens: true, outputTokens: true },
      _count: { _all: true },
    });

    const dossiers = await db.application.findMany({
      where: { id: { in: usages.flatMap((u) => (u.applicationId ? [u.applicationId] : [])) } },
      include: {
        transactions: { where: { status: "CONFIRMEE" }, orderBy: { confirmedAt: "asc" } },
      },
    });

    const lignes = usages.flatMap((u) => {
      if (!u.applicationId) return [];
      const dossier = dossiers.find((d) => d.id === u.applicationId);
      const achat = dossier?.transactions[0];
      const pack = achat ? getPack(achat.packCode) : undefined;
      const prix = pack && achat ? pack.prix[achat.currency as Devise] : null;
      const coutMicros = u._sum.costMicros ?? 0;

      return [
        {
          dossierId: u.applicationId,
          appels: u._count._all,
          jetonsEntree: u._sum.inputTokens ?? 0,
          jetonsSortie: u._sum.outputTokens ?? 0,
          coutMicros,
          pack: pack?.code ?? null,
          prixPack: prix,
          devise: achat?.currency ?? null,
          /** Part du prix du pack consommée en IA. Nulle si le pack n'est pas payé. */
          partDuPrix: prix ? coutMicros / 1_000_000 / prix : null,
          depasse: prix ? coutMicros / 1_000_000 / prix > SEUIL_MARGE_IA : false,
        },
      ];
    });

    return {
      seuil: SEUIL_MARGE_IA,
      dossiers: lignes.sort((a, b) => (b.partDuPrix ?? 0) - (a.partDuPrix ?? 0)),
      // La mesure sur dix dossiers réels reste à faire : tant qu'elle
      // manque, les quotas de la grille sont des ordres de grandeur.
      dossiersMesures: lignes.length,
    };
  },
});
