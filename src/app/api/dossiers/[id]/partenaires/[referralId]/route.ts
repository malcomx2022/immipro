import { z } from "zod";
import { route } from "@/server/http/route";
import { enregistrerLaSuite } from "@/server/acces/partenaires";

/**
 * Suite donnée à une proposition de partenaire — T-03, WF-13.
 *
 * La route enregistre l'issue et, pour une redirection, rend l'adresse du
 * partenaire. Elle la rend plutôt que de rediriger elle-même : un `302`
 * depuis une route d'API ferait sortir le navigateur d'un appel `fetch`
 * sans que l'écran sache ce qui s'est passé, et le candidat mérite de voir
 * où il part avant d'y aller.
 *
 * `acces: "candidat"` et non `candidat_verifie` : décliner une proposition
 * commerciale ne doit exiger aucune formalité. Le refus est toujours plus
 * facile que l'acceptation, jamais l'inverse.
 */
export const POST = route({
  nom: "dossier.partenaire.suite",
  acces: "candidat",
  limite: "sensible",
  corps: z.object({
    suite: z.enum(["CRENEAUX", "CONTINUER_SEUL", "NE_PLUS_PROPOSER"]),
  }),
  async traiter({ corps, params, acteur }) {
    return enregistrerLaSuite(params.referralId!, acteur!.id, corps.suite);
  },
});
