import { z } from "zod";
import { route } from "@/server/http/route";
import { ouvrirDossier } from "@/server/acces/dossiers";
import { tableauDeBord } from "@/server/lecture/dossiers";
import { reglePubliieParSlug } from "@/server/acces/regles";
import { echec } from "@/server/http/echecs";

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
    return { dossiers: await tableauDeBord(acteur!.id) };
  },
});

/**
 * Ouverture — WF-04. L'adresse email doit être vérifiée : un dossier engage
 * des échanges, et une alerte réglementaire envoyée à une adresse non
 * confirmée n'arrive nulle part (RG-11.3).
 *
 * ── La destination, et non l'identifiant de la règle — 02/10/2026 ──────
 *
 * L'écran envoyait `visaRuleId`, un identifiant technique qu'il recevait de
 * la page, validé ici comme un UUID. En test de production, l'ouverture
 * échouait sur « Identifiant attendu » à chaque essai, sur deux parcours :
 * l'identifiant n'arrivait pas tel que la route l'exigeait. La page ne
 * devrait pas avoir à porter un identifiant de base pour que le serveur
 * retrouve ce qu'il sait déjà.
 *
 * L'écran envoie désormais la **destination** (le `slug` de la fiche, celui
 * de l'adresse), et la route retrouve elle-même la règle publiée du jour,
 * avec le même filtre que la fiche affichée (INV-4, RG-14.1). Une
 * destination inconnue ou retirée entre-temps reçoit un refus qui le dit.
 * `visaRuleId` reste accepté, sans exiger le format UUID : c'est
 * `ouvrirDossier` qui vérifie que la règle existe et qu'elle est publiée.
 */
export const POST = route({
  nom: "dossiers.ouverture",
  acces: "candidat_verifie",
  limite: "sensible",
  corps: z
    .object({
      destination: z.string().trim().min(1).max(80).optional(),
      visaRuleId: z.string().trim().min(1).max(64).optional(),
      dateCible: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/u, "Format attendu : AAAA-MM-JJ.")
        .optional(),
    })
    .refine((c) => Boolean(c.destination ?? c.visaRuleId), {
      message: "Choisis une destination depuis le catalogue avant d'ouvrir un dossier.",
      path: ["destination"],
    }),
  async traiter({ corps, acteur }) {
    let visaRuleId = corps.visaRuleId;
    if (corps.destination) {
      const regle = await reglePubliieParSlug(corps.destination);
      if (!regle) {
        throw echec("champs_invalides", {
          champs: {
            destination:
              "Cette destination n'est pas ouverte en ce moment. Choisis-en une dans le catalogue des destinations.",
          },
        });
      }
      visaRuleId = regle.id;
    }
    const dossier = await ouvrirDossier(
      acteur!.id,
      visaRuleId!,
      corps.dateCible ? new Date(`${corps.dateCible}T00:00:00Z`) : null,
    );
    return { id: dossier.id, statut: dossier.status };
  },
});
