import { route } from "@/server/http/route";
import { db } from "@/lib/db";

/**
 * File de veille — B-01, WF-14 étape 1.
 *
 * La requête est celle de DOC-11, à une chose près : le back-office voit
 * **aussi** les règles de source secondaire, avec leur marque. INV-4 dit
 * qu'elles ne sont jamais visibles par l'utilisateur, pas qu'elles sont
 * invisibles au veilleur — c'est lui qui doit savoir qu'une source
 * secondaire attend d'être remplacée par une source officielle.
 *
 * `acces: "veilleur"` : le moindre privilège (RG-15.3). Un veilleur relit
 * des sources ; il n'a rien à faire dans les paiements.
 */
export const GET = route({
  nom: "admin.veille",
  acces: "veilleur",
  limite: "lecture",
  async traiter() {
    const horizon = new Date();
    horizon.setUTCDate(horizon.getUTCDate() + 30);

    const regles = await db.visaRule.findMany({
      where: { status: { in: ["PUBLISHED", "DRAFT"] }, nextReviewAt: { lte: horizon } },
      orderBy: { nextReviewAt: "asc" },
      select: {
        id: true,
        countryCode: true,
        visaType: true,
        version: true,
        status: true,
        sourceTier: true,
        sourceUrl: true,
        verifiedAt: true,
        verifiedBy: true,
        nextReviewAt: true,
      },
    });

    const releves = await db.sourceCheck.findMany({
      orderBy: { checkedAt: "desc" },
      take: 50,
    });

    return {
      file: regles.map((r) => ({
        ...r,
        verifiedAt: r.verifiedAt.toISOString().slice(0, 10),
        nextReviewAt: r.nextReviewAt.toISOString().slice(0, 10),
        // INV-4 vu du back-office : la marque est là pour être traitée.
        jamaisAffichee: r.sourceTier === "SECONDAIRE",
        enRetard: r.nextReviewAt.getTime() < Date.now(),
      })),
      sources: {
        relevees: releves.length,
        joignables: releves.filter((s) => s.reachable).length,
        ecarts: releves.filter((s) => s.difference !== null).length,
      },
    };
  },
});
