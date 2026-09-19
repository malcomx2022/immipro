import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { ouvrirDossier } from "@/server/acces/dossiers";
import { versDossier } from "@/server/vue/dossier";
import { versFiche } from "@/server/acces/regles";
import { trierDossiers } from "@/domain/dossiers/dossier";

/**
 * Dossiers du candidat — C-01, et ouverture (WF-04).
 *
 * La fiche affichée sur chaque carte vient de la règle **figée** par le
 * dossier, pas de la règle publiée du jour (INV-3). Elle est donc lue par la
 * relation, sans repasser par le filtre de publication : une version
 * archivée reste celle du dossier qui l'a figée. Le filtre d'INV-4 n'est pas
 * contourné pour autant — la base refuse la publication d'une règle de
 * source secondaire, et un dossier ne peut figer qu'une règle publiée.
 */
export const GET = route({
  nom: "dossiers.liste",
  acces: "candidat",
  limite: "lecture",
  async traiter({ acteur }) {
    const dossiers = await db.application.findMany({
      where: { userId: acteur!.id },
      include: { documents: true, visaRule: true },
      orderBy: { createdAt: "desc" },
    });

    const vues = dossiers.flatMap((d) => {
      const fiche = d.visaRule ? versFiche(d.visaRule) : null;
      return fiche ? [versDossier(d, d.documents, fiche)] : [];
    });

    return { dossiers: trierDossiers(vues) };
  },
});

/**
 * Ouverture — WF-04. L'adresse email doit être vérifiée : un dossier engage
 * des échanges, et une alerte réglementaire envoyée à une adresse non
 * confirmée n'arrive nulle part (RG-11.3).
 */
export const POST = route({
  nom: "dossiers.ouverture",
  acces: "candidat_verifie",
  limite: "sensible",
  corps: z.object({
    visaRuleId: z.string().uuid(),
    dateCible: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u, "Format attendu : AAAA-MM-JJ.")
      .optional(),
  }),
  async traiter({ corps, acteur }) {
    const dossier = await ouvrirDossier(
      acteur!.id,
      corps.visaRuleId,
      corps.dateCible ? new Date(`${corps.dateCible}T00:00:00Z`) : null,
    );
    return { id: dossier.id, statut: dossier.status };
  },
});
