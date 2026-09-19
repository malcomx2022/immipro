import { z } from "zod";
import { route } from "@/server/http/route";
import {
  changerLeMotDePasse,
  consommerUnCode,
  emettreUnCode,
  normaliserEmail,
} from "@/server/acces/comptes";
import { envoyerCodeDeReinitialisation } from "@/server/courrier";
import { echec } from "@/server/http/echecs";
import { db } from "@/lib/db";
import { LONGUEUR_MINIMALE } from "@/domain/comptes/mot-de-passe";

/**
 * Mot de passe oublié — A-04.
 *
 * La demande répond toujours la même chose. Une adresse sans compte ne
 * produit ni erreur ni délai différent : sinon ce formulaire dit qui est
 * client, exactement comme l'inscription.
 */
export const POST = route({
  nom: "comptes.motdepasse.demande",
  acces: "public",
  limite: "sensible",
  corps: z.object({ email: z.string().email() }),
  async traiter({ corps }) {
    const user = await db.user.findUnique({
      where: { email: normaliserEmail(corps.email) },
      select: { id: true, email: true },
    });
    if (user) {
      const code = await emettreUnCode(user.id, "REINITIALISATION_MOT_DE_PASSE");
      await envoyerCodeDeReinitialisation(user.email, code);
    }
    return { envoye: true };
  },
});

/**
 * Nouveau mot de passe. Le changement ferme toutes les sessions : c'est le
 * geste qu'on fait après avoir perdu un téléphone, et il serait sans effet
 * si l'appareil perdu restait connecté.
 */
export const PUT = route({
  nom: "comptes.motdepasse.reinitialisation",
  acces: "public",
  limite: "sensible",
  corps: z.object({
    email: z.string().email(),
    code: z.string(),
    motDePasse: z.string().min(LONGUEUR_MINIMALE, "Au moins dix caractères."),
  }),
  async traiter({ corps }) {
    const user = await db.user.findUnique({
      where: { email: normaliserEmail(corps.email) },
      select: { id: true },
    });
    const juste =
      user !== null &&
      (await consommerUnCode(user.id, "REINITIALISATION_MOT_DE_PASSE", corps.code));
    if (!user || !juste) {
      throw echec("champs_invalides", {
        champs: { code: "Ce code ne correspond pas, ou il a expiré. Demande-en un nouveau." },
      });
    }
    await changerLeMotDePasse(user.id, corps.motDePasse);
    return { change: true };
  },
});
