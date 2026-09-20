import { route } from "@/server/http/route";
import { collecte, fichesSuivies } from "@/server/lecture/backoffice";

/**
 * File de veille — B-01, WF-14 étape 1.
 *
 * Le back-office voit **aussi** les règles de source secondaire, avec leur
 * marque. INV-4 dit qu'elles ne sont jamais visibles par l'utilisateur, pas
 * qu'elles sont invisibles au veilleur — c'est lui qui doit savoir qu'une
 * source secondaire attend d'être remplacée par une source officielle.
 *
 * `acces: "veilleur"` : le moindre privilège (RG-15.3). Un veilleur relit
 * des sources ; il n'a rien à faire dans les paiements.
 */
export const GET = route({
  nom: "admin.veille",
  acces: "veilleur",
  limite: "lecture",
  async traiter() {
    return { fiches: await fichesSuivies(), collecte: await collecte() };
  },
});
