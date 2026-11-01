import { cookies } from "next/headers";
import { route } from "@/server/http/route";
import {
  COOKIE_SESSION,
  attributsSuppression,
  fermerToutesLesSessions,
} from "@/server/securite/session";

/**
 * Fermer toutes mes sessions — « Sécurité » (/compte/securite), S.210.
 *
 * Le geste d'une personne qui a oublié sa session sur un poste partagé :
 * toutes ses sessions se ferment, celle-ci comprise, et le cookie du
 * navigateur est effacé. C'est ce que fait déjà un changement de mot de
 * passe (`changerLeMotDePasse`) ; ici sans changer le mot de passe.
 */
export const POST = route({
  nom: "comptes.sessions.fermeture",
  acces: "candidat",
  limite: "sensible",
  async traiter({ acteur }) {
    const fermees = await fermerToutesLesSessions(acteur!.id);
    (await cookies()).set(COOKIE_SESSION, "", attributsSuppression());
    return { sessionsFermees: fermees };
  },
});
