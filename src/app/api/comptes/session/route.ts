import { cookies, headers } from "next/headers";
import { z } from "zod";
import { route } from "@/server/http/route";
import { connecter } from "@/server/acces/comptes";
import {
  ouvrirSession,
  fermerSession,
  attributsCookie,
  attributsSuppression,
  COOKIE_SESSION,
} from "@/server/securite/session";
import { json, sansContenu } from "@/server/http/reponse";

/**
 * Connexion et déconnexion — A-02.
 *
 * L'échec ne dit jamais lequel des deux champs est en cause, et le corps
 * renvoie `essaisRestants` : l'écran l'affiche déjà, et une personne qui se
 * trompe de mot de passe a besoin de savoir qu'elle approche du blocage
 * avant d'y être.
 *
 * Le statut est 401 et non 422 : ce n'est pas une saisie malformée, c'est un
 * refus d'authentification.
 */
export const POST = route({
  nom: "comptes.connexion",
  acces: "public",
  limite: "sensible",
  corps: z.object({ email: z.string().email(), motDePasse: z.string().min(1) }),
  async traiter({ corps }) {
    const resultat = await connecter(corps.email, corps.motDePasse);

    if (!resultat.ouverte) {
      return json(
        {
          echec: {
            titre: "Email ou mot de passe incorrect",
            corps: resultat.message,
            action: resultat.verdict.bloque ? "Réinitialiser mon mot de passe" : "Réessayer",
            ton: resultat.verdict.bloque ? "limite" : "echec",
          },
          essaisRestants: resultat.verdict.essaisRestants,
        },
        { statut: 401 },
      );
    }

    const entetes = await headers();
    const session = await ouvrirSession(resultat.user.id, entetes.get("user-agent"));
    (await cookies()).set(COOKIE_SESSION, session.valeur, attributsCookie(session.expireLe));

    return {
      compte: {
        prenom: resultat.user.firstName,
        emailVerifie: resultat.user.emailVerified !== null,
        role: resultat.user.role,
      },
    };
  },
});

/** Déconnexion. La ligne de session est supprimée, pas seulement le cookie. */
export const DELETE = route({
  nom: "comptes.deconnexion",
  acces: "candidat",
  limite: "sensible",
  async traiter() {
    const magasin = await cookies();
    await fermerSession(magasin.get(COOKIE_SESSION)?.value);
    magasin.set(COOKIE_SESSION, "", attributsSuppression());
    return sansContenu();
  },
});
