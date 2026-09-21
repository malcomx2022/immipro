import { z } from "zod";
import { route } from "@/server/http/route";
import { consommerUnCode, emettreUnCode } from "@/server/acces/comptes";
import { envoyerCodeDeVerification } from "@/server/courrier";
import { suiteDeLEnvoi } from "@/domain/courrier/transport";
import { echec } from "@/server/http/echecs";
import { db } from "@/lib/db";
import { LONGUEUR_CODE, normaliserCode } from "@/domain/comptes/code-verification";

/**
 * Vérification de l'adresse — A-03.
 *
 * Six chiffres valables dix minutes, et non le lien de vingt-quatre heures
 * décrit par DOC-11 : le prototype fait foi pour les textes et les règles
 * d'écran, et un code se recopie depuis une application de messagerie sans
 * quitter le formulaire — ce qui compte quand l'email arrive sur le même
 * téléphone que le navigateur.
 */
export const POST = route({
  nom: "comptes.verification",
  acces: "candidat",
  limite: "sensible",
  corps: z.object({ code: z.string() }),
  async traiter({ corps, acteur }) {
    const code = normaliserCode(corps.code);
    if (code.length !== LONGUEUR_CODE) {
      throw echec("champs_invalides", {
        champs: { code: `Le code compte ${LONGUEUR_CODE} chiffres.` },
      });
    }
    const juste = await consommerUnCode(acteur!.id, "VERIFICATION_EMAIL", code);
    if (!juste) {
      throw echec("champs_invalides", {
        champs: {
          code: "Ce code ne correspond pas, ou il a expiré. Demande-en un nouveau.",
        },
      });
    }
    await db.user.update({ where: { id: acteur!.id }, data: { emailVerified: new Date() } });
    return { emailVerifie: true };
  },
});

/** Renvoi d'un code. Les précédents sont annulés à l'émission du suivant. */
export const PUT = route({
  nom: "comptes.verification.renvoi",
  acces: "candidat",
  limite: "sensible",
  async traiter({ acteur }) {
    const code = await emettreUnCode(acteur!.id, "VERIFICATION_EMAIL");
    const envoi = await envoyerCodeDeVerification(acteur!.email, code);
    /*
      L'écran répondait « un nouveau code est parti » quel que soit le
      sort du courrier — devant un transport muet, il n'en partait
      aucun, et le candidat attendait un message qui n'existait pas.
      L'échec est maintenant rendu tel quel : le bloc d'échec dit à quoi
      s'en tenir, et le code émis reste valable si un envoi finit par
      passer.
    */
    if (!suiteDeLEnvoi(envoi.issue).parti) throw echec("service_indisponible");
    return { envoye: true };
  },
});
