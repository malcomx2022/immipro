import { cookies } from "next/headers";
import { z } from "zod";
import { route } from "@/server/http/route";
import { json } from "@/server/http/reponse";
import { db } from "@/lib/db";
import { ouvrirSession, attributsCookie, COOKIE_SESSION } from "@/server/securite/session";
import { TITRE_CONNEXION_A_RECOMMENCER } from "@/domain/comptes/deux-facteurs";
import {
  COOKIE_DEFI,
  attributsSuppressionDefi,
  repondreAuDefi,
} from "@/server/comptes/second-facteur";

/**
 * Second temps de la connexion — S.214, A-02.
 *
 * Le mot de passe a été accepté par `POST /api/comptes/session`, qui a posé
 * le cookie du défi au lieu d'une session. Ici, le code à six chiffres ou un
 * code de secours. Publique — il n'y a pas encore de session — mais sous la
 * limite sensible, le contrôle d'origine, cinq essais par défi et le
 * blocage propre au second facteur.
 *
 * Un défi échu, épuisé ou déjà servi rend 401 et ramène au mot de passe :
 * c'est le seul geste qui en ouvre un nouveau.
 */
export const POST = route({
  nom: "comptes.connexion.second_facteur",
  acces: "public",
  limite: "sensible",
  corps: z.object({ code: z.string().trim().min(1).max(20) }),
  async traiter({ corps }) {
    const magasin = await cookies();
    const issue = await repondreAuDefi(magasin.get(COOKIE_DEFI)?.value, corps.code);

    if (issue.issue === "expire") {
      magasin.set(COOKIE_DEFI, "", attributsSuppressionDefi());
      return json(
        {
          echec: {
            titre: TITRE_CONNEXION_A_RECOMMENCER,
            corps:
              "Ce code arrive trop tard ou après trop d'essais : la connexion a expiré. Ressaisis ton adresse et ton mot de passe, puis le code affiché.",
            action: "Recommencer la connexion",
            ton: "echec",
          },
        },
        { statut: 401 },
      );
    }
    if (issue.issue === "refuse") {
      return json(
        {
          echec: {
            titre: "Code refusé",
            corps: issue.message,
            action: issue.bloque ? "Patienter" : "Réessayer",
            ton: issue.bloque ? "limite" : "echec",
          },
        },
        { statut: 401 },
      );
    }

    const user = await db.user.findUnique({
      where: { id: issue.userId },
      select: { id: true, firstName: true, emailVerified: true, role: true },
    });
    if (!user) {
      return json(
        {
          echec: {
            titre: TITRE_CONNEXION_A_RECOMMENCER,
            corps: "Ce compte n'est plus accessible. Ressaisis ton adresse et ton mot de passe.",
            action: "Recommencer la connexion",
            ton: "echec",
          },
        },
        { statut: 401 },
      );
    }

    const session = await ouvrirSession(user.id, issue.userAgent, issue.memoriser);
    magasin.set(COOKIE_SESSION, session.valeur, attributsCookie(session.cookieExpireLe));
    magasin.set(COOKIE_DEFI, "", attributsSuppressionDefi());

    return {
      compte: {
        prenom: user.firstName,
        emailVerifie: user.emailVerified !== null,
        role: user.role,
      },
      ...(issue.genre === "secours" ? { codesDeSecoursRestants: issue.codesRestants } : {}),
    };
  },
});
