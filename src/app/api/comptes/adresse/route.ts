import { z } from "zod";
import { route } from "@/server/http/route";
import { corrigerLAdresse } from "@/server/acces/comptes";
import { envoyerAdresseDejaInscrite, envoyerCodeDeVerification } from "@/server/courrier";

/**
 * Correction de l'adresse avant vérification — A-03, « Mauvaise adresse ? ».
 *
 * La réponse est la même que l'adresse soit libre ou déjà prise : c'est le
 * courrier qui distingue les deux cas, comme à l'inscription. Le formulaire
 * ne doit pas servir à vérifier si quelqu'un a un compte ici.
 *
 * L'échec d'envoi du code n'est pas rendu, pour la même raison : il
 * distinguerait une adresse libre d'une adresse prise. L'écran de
 * vérification garde « Renvoyer le code », qui, lui, dit la vérité sur
 * l'envoi.
 */
export const PUT = route({
  nom: "comptes.adresse",
  acces: "candidat",
  limite: "sensible",
  corps: z.object({
    email: z.string().trim().email("Vérifie l'adresse : il manque le @ ou le domaine."),
    motDePasse: z.string().min(1, "Saisis ton mot de passe pour confirmer."),
  }),
  async traiter({ corps, acteur }) {
    const issue = await corrigerLAdresse(acteur!.id, corps.email, corps.motDePasse);
    if (issue.issue === "corrigee") await envoyerCodeDeVerification(issue.email, issue.code);
    else await envoyerAdresseDejaInscrite(issue.email);
    return { email: issue.email };
  },
});
