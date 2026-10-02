import { cookies } from "next/headers";
import { z } from "zod";
import { route } from "@/server/http/route";
import { inscrire, emettreUnCode } from "@/server/acces/comptes";
import { ouvrirSession, attributsCookie, COOKIE_SESSION } from "@/server/securite/session";
import { envoyerCodeDeVerification, envoyerCompteDejaOuvert } from "@/server/courrier";
import { LONGUEUR_MINIMALE } from "@/domain/comptes/mot-de-passe";
import { versionAcceptee } from "@/domain/comptes/acceptation";
import { pagesPubliees } from "@/server/juridique/lecture";
import { db } from "@/lib/db";

/**
 * Inscription — A-01, WF-02.
 *
 * La réponse est identique que l'adresse soit libre ou déjà prise : c'est
 * l'email qui distingue les deux cas. Le formulaire d'inscription ne doit
 * pas servir à vérifier si quelqu'un a un compte ici.
 *
 * Conséquence assumée : une adresse déjà inscrite n'ouvre pas de session. Le
 * navigateur revient sur l'écran de vérification, et l'email reçu dit quoi
 * faire. C'est un écran de plus pour une personne qui s'est inscrite deux
 * fois, et une fuite de moins pour tout le monde.
 */
export const POST = route({
  nom: "comptes.inscription",
  acces: "public",
  limite: "sensible",
  corps: z.object({
    email: z.string().email("Vérifie l'adresse : il manque le @ ou le domaine."),
    motDePasse: z.string().min(LONGUEUR_MINIMALE, "Au moins dix caractères."),
    prenom: z.string().trim().min(1).max(80).optional(),
    nom: z.string().trim().min(1).max(80).optional(),
    pays: z.string().length(2).optional(),
  }),
  async traiter({ corps }) {
    const { user, existait } = await inscrire(corps);

    if (existait || !user) {
      await envoyerCompteDejaOuvert(corps.email);
      return { etape: "verification" };
    }

    /*
      L'acceptation des textes publiés, avec leur version — S.101. L'écran
      ne laisse créer le compte qu'une fois la case cochée ; ce qui manquait
      était la preuve de ce qui a été accepté. Un texte jamais publié ne
      s'accepte pas : rien n'est enregistré tant qu'aucun ne l'est.
    */
    const version = versionAcceptee(["conditions", "donnees"], await pagesPubliees());
    if (version) {
      await db.consent.create({ data: { userId: user.id, kind: "CGU", granted: true, version } });
    }

    const code = await emettreUnCode(user.id, "VERIFICATION_EMAIL");
    /*
      Même raison qu'à la réinitialisation : les deux branches de cette
      route répondent la même chose, et faire échouer celle-ci sur un
      courrier manqué distinguerait une adresse nouvelle d'une adresse
      déjà inscrite. Le compte est créé, la session est ouverte, et
      l'écran de vérification porte « Renvoyer le code » — qui, lui, dit
      la vérité sur l'envoi.
    */
    await envoyerCodeDeVerification(user.email, code);

    const session = await ouvrirSession(user.id);
    (await cookies()).set(COOKIE_SESSION, session.valeur, attributsCookie(session.expireLe));
    return { etape: "verification" };
  },
});
