import { z } from "zod";
import { route } from "@/server/http/route";
import { creerUnCompteInterne } from "@/server/comptes/gestion";

/**
 * Création d'un compte interne — B-03, S.210.
 *
 * Réservée au super-administrateur (`acces: "super_admin"`) : le
 * composeur refuse tout autre rôle avec 403 et journalise l'essai. Comme
 * toute écriture, la requête passe le contrôle d'origine (CSRF) et la
 * limite sensible avant d'atteindre le service.
 *
 * Le compte naît sans mot de passe : la personne le choisit par « Mot de
 * passe oublié », dont le code part à son adresse. La réponse ne porte ni
 * empreinte ni jeton — l'identifiant, l'adresse et le rôle, rien d'autre.
 *
 * Le corps n'est borné ici que dans sa forme ; les règles (rôles admis à
 * la création, bornes des noms, motif) sont celles du domaine
 * (`lireLaCreation`), que l'écran applique aussi avant l'envoi.
 */
export const POST = route({
  nom: "admin.comptes.creation",
  acces: "super_admin",
  limite: "sensible",
  corps: z.object({
    email: z.string().max(254),
    prenom: z.string().max(200),
    nom: z.string().max(200),
    role: z.string().max(20),
    motif: z.string().max(1000),
  }),
  async traiter({ corps, acteur }) {
    return creerUnCompteInterne(acteur!, corps);
  },
});
