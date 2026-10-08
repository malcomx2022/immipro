import { z } from "zod";
import { revalidateTag } from "next/cache";
import { route } from "@/server/http/route";
import { ETIQUETTE_TEXTES_JURIDIQUES } from "@/server/juridique/cache";
import { echec } from "@/server/http/echecs";
import { enregistrerLesVariables } from "@/server/juridique/ecriture";

/**
 * Les variables des textes juridiques — S.101.
 *
 * Réservé à l'administration : ce sont l'identité de l'éditeur et des
 * engagements contractuels, pas du contenu éditorial. Enregistrer une
 * variable republie aussitôt les textes déjà validés qui l'emploient
 * (décision du 02/10/2026), et la réponse dit lesquels — et pourquoi les
 * autres ne l'ont pas été.
 *
 * Une valeur vide s'enregistre, comme un brouillon : c'est la validation
 * d'un texte qui exige ses variables.
 */
export const PUT = route({
  nom: "admin.juridique.variables",
  acces: "admin",
  limite: "sensible",
  corps: z.object({
    valeurs: z.record(z.string().max(64), z.string().max(4000)),
  }),
  async traiter({ corps, acteur }) {
    const issue = await enregistrerLesVariables(corps.valeurs, acteur!.id);
    if (!issue.ok) throw echec("champs_invalides", { champs: issue.refus });
    // Le pied de page des pages publiques se relit tout de suite (M14).
    revalidateTag(ETIQUETTE_TEXTES_JURIDIQUES);
    return issue;
  },
});
