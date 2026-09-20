import { cookies } from "next/headers";
import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { correspond } from "@/server/securite/secret";
import { COOKIE_SESSION, attributsSuppression } from "@/server/securite/session";
import { demanderLaSuppression } from "@/server/acces/suppression";

/**
 * Suppression de compte — A-05, RG-10.4.
 *
 * Le mot de passe est redemandé. Ce n'est pas une formalité : sans lui, un
 * téléphone laissé déverrouillé sur une table suffirait à effacer le dossier
 * de quelqu'un, définitivement et sans recours. Le geste le plus
 * irréversible du produit est aussi le seul qui redemande une preuve.
 *
 * Le cookie est retiré dans la réponse. Les sessions sont déjà fermées côté
 * base, mais laisser le navigateur porter un cookie mort le ferait rebondir
 * sur un écran de connexion sans explication — DOC-12 §16 demande de dire
 * pourquoi rien ne s'affiche, et le plus simple est qu'il n'y ait rien à
 * expliquer.
 */
export const POST = route({
  nom: "comptes.suppression",
  acces: "candidat",
  limite: "sensible",
  corps: z.object({
    motDePasse: z.string().min(1, "Saisis ton mot de passe pour confirmer."),
  }),
  async traiter({ corps, acteur }) {
    const compte = await db.user.findUnique({
      where: { id: acteur!.id },
      select: { passwordHash: true },
    });

    // Un compte sans mot de passe n'a pas de preuve à donner : refuser la
    // suppression serait pire que l'accepter, mais l'accepter sans preuve
    // ouvrirait la porte qu'on vient de fermer. Le cas n'existe pas
    // aujourd'hui — toute inscription passe par un mot de passe — et le
    // jour où il existera, il faudra une autre preuve, pas une dispense.
    const juste =
      compte?.passwordHash != null &&
      (await correspond(corps.motDePasse, compte.passwordHash));

    if (!juste) {
      throw echec("champs_invalides", {
        champs: { motDePasse: "Ce mot de passe ne correspond pas à ton compte." },
      });
    }

    const bilan = await demanderLaSuppression(acteur!.id);
    (await cookies()).set(COOKIE_SESSION, "", attributsSuppression());

    return {
      supprime: bilan.anonymise,
      dossiersPurges: bilan.dossiers,
      piecesSupprimees: bilan.versions,
    };
  },
});
