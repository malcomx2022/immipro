import { z } from "zod";
import { route } from "@/server/http/route";
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
    return validerUnTexte(page, corps, acteur!.id);
  },
});
