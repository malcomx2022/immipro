import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import {
  GENRE_DU_CONSENTEMENT,
  VERSION_TEXTES,
  enregistrerLAutorisation,
} from "@/server/acces/consentements";
import { CONSENTEMENTS } from "@/domain/comptes/consentements";

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
 *
 * La correspondance code → genre et l'écriture vivent dans
 * `server/acces/consentements` : l'écran n'est plus seul à lire ces lignes,
 * la proposition de partenaire les lit aussi (RG-13.1).
 */
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
        const derniere = lignes.find((l) => l.kind === GENRE_DU_CONSENTEMENT[c.code]);
        return [c.code, Boolean(derniere?.granted && !derniere.revokedAt)];
      }),
    );

    return { consentements: CONSENTEMENTS, etat };
  },
});

export const PUT = route({
  nom: "comptes.consentements.maj",
  acces: "candidat",
  limite: "sensible",
  corps: z.object({
    code: z.enum([
      "pieces_identite",
      "pieces_financieres",
      "alertes_regles",
      "partenaires",
      "mesure_audience",
    ]),
    accorde: z.boolean(),
    /** Version du texte accepté. Elle date la preuve. */
    version: z.string().min(1).max(20).optional(),
  }),
  async traiter({ corps, acteur }) {
    await enregistrerLAutorisation(
      acteur!.id,
      corps.code,
      corps.accorde,
      corps.version ?? VERSION_TEXTES,
    );
    return { code: corps.code, accorde: corps.accorde };
  },
});
