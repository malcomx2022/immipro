import { z } from "zod";
import { route } from "@/server/http/route";
import { reglesPubliees, mentionDe } from "@/server/acces/regles";
import { versEvaluable } from "@/server/vue/destinations";
import { classer, TROIS_MEILLEURES } from "@/domain/simulateur/classement";
import { rangAffiche } from "@/domain/destinations/fiche";
import { MENTION_NON_COMPARABLE } from "@/domain/format/change";

/**
 * WF-01 — simulateur d'éligibilité.
 *
 * RG-01.1 : « le résultat est calculé en mémoire, sans écriture, tant que le
 * visiteur n'est pas authentifié. » La route n'écrit rien, pas même une
 * trace : un simulateur qui enregistre les réponses d'un visiteur anonyme
 * constitue un profil sans consentement, et c'est ce que la règle refuse.
 * Les réponses restent sur l'appareil (`sessionStorage`), la route les reçoit
 * le temps d'un calcul.
 *
 * Le nombre pondéré ne sort pas : l'écran reçoit un rang et des raisons
 * chiffrées (INV-1, arbitrage C-09).
 */
const reponses = z.object({
  objectif: z.string().optional(),
  diplome: z.string().optional(),
  budget: z.string().optional(),
  langue: z.string().optional(),
  depart: z.string().optional(),
  famille: z.string().optional(),
});

export const POST = route({
  nom: "simulations",
  acces: "public",
  limite: "sensible",
  corps: reponses,
  async traiter({ corps }) {
    const regles = await reglesPubliees();
    const evaluables = regles.flatMap((r) => {
      const e = versEvaluable(r);
      return e ? [{ regle: r, evaluable: e }] : [];
    });

    const resultat = classer(
      evaluables.map((e) => e.evaluable),
      corps,
    );
    const regleDe = (slug: string) => evaluables.find((e) => e.evaluable.slug === slug)?.regle;

    return {
      retenues: resultat.retenues.slice(0, TROIS_MEILLEURES).map((r, index) => {
        const regle = regleDe(r.destination.slug);
        return {
          rang: rangAffiche(index),
          slug: r.destination.slug,
          code: r.destination.code,
          pays: r.destination.pays,
          motifs: r.motifs,
          ...(r.destination.coutPremiereAnneeXOF === null
            ? { reserve: MENTION_NON_COMPARABLE }
            : {}),
          // INV-8 : chaque donnée affichée porte sa source et sa date.
          mention: regle ? mentionDe(regle) : undefined,
        };
      }),
      ecartees: resultat.ecartees.map((e) => {
        const regle = regleDe(e.destination.slug);
        return {
          code: e.destination.code,
          pays: e.destination.pays,
          motif: e.motif,
          ecart: e.ecart,
          // INV-8 aussi ici : un écart chiffré — « 12 000 000 F demandés » —
          // est une donnée réglementaire. Quand aucune destination ne passe,
          // l'écran n'affiche que des écartées : sans cette mention, il ne
          // porte alors plus aucune source.
          mention: regle ? mentionDe(regle) : undefined,
        };
      }),
      // RG-01.3 : l'écran montre les plus proches plutôt qu'un vide.
      aucuneNePasse: resultat.aucuneNePasse,
      composantesAbsentes: resultat.composantesAbsentes,
    };
  },
});
