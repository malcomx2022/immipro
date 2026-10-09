import { z } from "zod";
import { revalidateTag } from "next/cache";
import { route } from "@/server/http/route";
import { ETIQUETTE_TEXTES_JURIDIQUES } from "@/server/juridique/cache";
import { echec } from "@/server/http/echecs";
import { estUnePageJuridique } from "@/domain/juridique/modeles";
import { validerUnTexte } from "@/server/juridique/ecriture";

/**
 * La validation d'un texte juridique — S.101.
 *
 * C'est l'acte qui rend une page publique. Il nomme le relecteur et la
 * date de sa relecture, porte l'attestation de l'administrateur, et crée
 * une version immuable. Les refus sont rendus tels quels, chacun avec le
 * geste qui le lève : l'écran les affiche au-dessus du bouton.
 */
export const POST = route({
  nom: "admin.juridique.validation",
  acces: "admin",
  limite: "sensible",
  corps: z.object({
    relecteur: z.string().max(200),
    relueLe: z.string().max(10),
    motif: z.string().max(500),
    atteste: z.boolean(),
  }),
  async traiter({ corps, params, acteur }) {
    const page = params.page ?? "";
    if (!estUnePageJuridique(page)) throw echec("introuvable");
    const issue = await validerUnTexte(page, corps, acteur!.id);
    /*
      Revue M14 : le pied de page des pages publiques porte ce lien dès la
      validation, sans attendre les cinq minutes du cache. Ici et non dans
      `ecriture.ts` : la fumée appelle l'écriture hors de Next, où
      l'invalidation n'a pas de sens.
    */
    revalidateTag(ETIQUETTE_TEXTES_JURIDIQUES);
    return issue;
  },
});
