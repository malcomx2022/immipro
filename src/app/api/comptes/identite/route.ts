import { z } from "zod";
import { route } from "@/server/http/route";
import { enregistrerLIdentite, identiteDuCompte } from "@/server/acces/profil";

/**
 * Identité du compte — « Mon compte » (/compte), S.210.
 *
 * Tout compte y a accès, interne compris (`acces: "candidat"` admet tous
 * les rôles). La lecture ne rend que l'identité : ni empreinte, ni jeton,
 * ni compteur d'échecs. L'adresse électronique est rendue en lecture
 * seule ; aucune clé du corps ne l'écrit.
 *
 * Le corps n'est borné ici que dans sa forme ; les règles — bornes du nom
 * affiché, format E.164 et indicatif couvert, âge de 13 à 110 ans, pays,
 * langue, fuseau — sont celles du domaine (`validerIdentite`), que
 * l'écran applique avant l'envoi et que le service rejoue avant d'écrire.
 */
export const GET = route({
  nom: "comptes.identite",
  acces: "candidat",
  limite: "lecture",
  async traiter({ acteur }) {
    return { identite: await identiteDuCompte(acteur!.id) };
  },
});

export const PUT = route({
  nom: "comptes.identite.maj",
  acces: "candidat",
  limite: "sensible",
  corps: z.object({
    prenom: z.string().max(200),
    nom: z.string().max(200),
    nomAffiche: z.string().max(200),
    telephone: z.string().max(40),
    dateNaissance: z.string().max(10),
    pays: z.string().max(2),
    langue: z.string().max(5),
    fuseau: z.string().max(64),
  }),
  async traiter({ corps, acteur }) {
    return enregistrerLIdentite(acteur!.id, corps);
  },
});
