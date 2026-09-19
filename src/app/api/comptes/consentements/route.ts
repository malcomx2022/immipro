import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { CONSENTEMENTS, type CodeConsentement } from "@/domain/comptes/consentements";

/**
 * Consentements — A-05, RG-02.1.
 *
 * Chaque changement écrit une ligne : on ne modifie jamais la précédente. Un
 * consentement est une preuve datée, et une preuve qu'on réécrit n'en est
 * plus une — la question n'est pas « a-t-il accepté ? » mais « qu'avait-il
 * accepté le jour où la pièce a été analysée ? ».
 *
 * Le retrait est un retrait, pas une suppression : `revokedAt` sur la ligne
 * en cours, puis une nouvelle ligne à `granted: false`. L'historique reste
 * lisible dans les deux sens.
 */
const CORRESPONDANCE: Record<CodeConsentement, "PIECES_IDENTITE" | "CONFIDENTIALITE" | "MARKETING" | "CGU"> = {
  pieces_identite: "PIECES_IDENTITE",
  pieces_financieres: "PIECES_IDENTITE",
  alertes_regles: "CONFIDENTIALITE",
  consultants_partenaires: "MARKETING",
  mesure_audience: "MARKETING",
};

export const GET = route({
  nom: "comptes.consentements",
  acces: "candidat",
  limite: "lecture",
  async traiter({ acteur }) {
    const lignes = await db.consent.findMany({
      where: { userId: acteur!.id },
      orderBy: { grantedAt: "desc" },
    });

    const etat = Object.fromEntries(
      CONSENTEMENTS.map((c) => {
        const derniere = lignes.find((l) => l.kind === CORRESPONDANCE[c.code]);
        return [c.code, Boolean(derniere?.granted && !derniere.revokedAt)];
      }),
    );

    return { consentements: CONSENTEMENTS, etat };
  },
});

/**
 * Version des textes acceptés. Elle date la preuve : « il a accepté », sans
 * dire quoi, ne prouve rien le jour où le texte a changé.
 */
const VERSION_TEXTES = "1.0";

export const PUT = route({
  nom: "comptes.consentements.maj",
  acces: "candidat",
  limite: "sensible",
  corps: z.object({
    code: z.enum([
      "pieces_identite",
      "pieces_financieres",
      "alertes_regles",
      "consultants_partenaires",
      "mesure_audience",
    ]),
    accorde: z.boolean(),
    /** Version du texte accepté. Elle date la preuve. */
    version: z.string().min(1).max(20).optional(),
  }),
  async traiter({ corps, acteur }) {
    const kind = CORRESPONDANCE[corps.code];
    const maintenant = new Date();

    await db.$transaction([
      db.consent.updateMany({
        where: { userId: acteur!.id, kind, revokedAt: null },
        data: { revokedAt: maintenant },
      }),
      db.consent.create({
        data: {
          userId: acteur!.id,
          kind,
          granted: corps.accorde,
          version: corps.version ?? VERSION_TEXTES,
          grantedAt: maintenant,
        },
      }),
    ]);

    return { code: corps.code, accorde: corps.accorde };
  },
});
