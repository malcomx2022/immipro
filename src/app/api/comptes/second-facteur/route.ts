import { cookies } from "next/headers";
import { z } from "zod";
import { route } from "@/server/http/route";
import { COOKIE_SESSION } from "@/server/securite/session";
import {
  activerLeSecondFacteur,
  desactiverLeSecondFacteur,
  etatDuSecondFacteur,
  preparerLEnrolement,
  regenererLesCodesDeSecours,
} from "@/server/comptes/second-facteur";

/**
 * Double authentification du compte — « Sécurité » (/compte/securite), S.214.
 *
 * Tout compte y a accès, interne compris. Quatre gestes, un seul point
 * d'entrée en écriture (`action`), chacun sous la limite sensible et le
 * contrôle d'origine :
 *
 * - `preparer` : mot de passe ressaisi ; rend le secret et l'adresse
 *   `otpauth://` du code QR, une seule fois ;
 * - `activer` : premier code juste ; rend les dix codes de secours, une
 *   seule fois, et ferme les autres sessions ;
 * - `codes` : code à six chiffres ; dix nouveaux codes de secours ;
 * - `desactiver` : mot de passe et code ; ferme les autres sessions.
 *
 * La lecture ne rend jamais le secret, chiffré ou non, ni une empreinte.
 */
export const GET = route({
  nom: "comptes.second_facteur",
  acces: "candidat",
  limite: "lecture",
  async traiter({ acteur }) {
    return { secondFacteur: await etatDuSecondFacteur(acteur!.id) };
  },
});

export const POST = route({
  nom: "comptes.second_facteur.maj",
  acces: "candidat",
  limite: "sensible",
  corps: z.discriminatedUnion("action", [
    z.object({ action: z.literal("preparer"), motDePasse: z.string().min(1).max(200) }),
    z.object({ action: z.literal("activer"), code: z.string().trim().min(1).max(20) }),
    z.object({ action: z.literal("codes"), code: z.string().trim().min(1).max(20) }),
    z.object({
      action: z.literal("desactiver"),
      motDePasse: z.string().min(1).max(200),
      code: z.string().trim().min(1).max(20),
    }),
  ]),
  async traiter({ corps, acteur }) {
    const jetonCourant = (await cookies()).get(COOKIE_SESSION)?.value;
    switch (corps.action) {
      case "preparer":
        return preparerLEnrolement(acteur!, corps.motDePasse);
      case "activer":
        return activerLeSecondFacteur(acteur!, corps.code, jetonCourant);
      case "codes":
        return regenererLesCodesDeSecours(acteur!, corps.code);
      case "desactiver":
        return desactiverLeSecondFacteur(acteur!, corps.motDePasse, corps.code, jetonCourant);
    }
  },
});
