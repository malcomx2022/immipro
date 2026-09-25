import { z } from "zod";
import { route } from "@/server/http/route";
import { dossierDuCandidat } from "@/server/acces/dossiers";
import { declarerLeDepot } from "@/server/dossiers/parcours";
import { fuseauDuCandidat } from "@/server/comptes/rappels";
import { CONSERVATION_SOUMIS_MOIS } from "@/domain/dossiers/conservation";
import { MENTION_DECLARATION, depuisDateCivile } from "@/domain/dossiers/depot";

/**
 * Déclaration de dépôt — WF-10, étape 1 ; date réelle, arbitrage S.89.
 *
 * La décision vit dans `server/dossiers/parcours.ts` : c'est elle qui
 * portait le défaut, et une route ne s'appelle pas depuis une fumée.
 * Cette route lit le dossier du candidat, la date qu'il déclare, et rend
 * la réponse.
 *
 * Le corps porte la **date réelle** du dépôt, obligatoire. Elle se valide
 * dans le fuseau du candidat ; un refus est rendu sur le champ, avec la
 * raison et ce qu'il faut saisir à la place.
 */
export const POST = route({
  nom: "dossier.depot",
  acces: "candidat_verifie",
  limite: "sensible",
  corps: z.object({
    deposeLe: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u, "Indique la date de ton dépôt : jour, mois et année."),
  }),
  async traiter({ params, acteur, corps }) {
    const dossier = await dossierDuCandidat(params.id!, acteur!.id);
    const maj = await declarerLeDepot(dossier, {
      deposeLe: corps.deposeLe,
      fuseau: await fuseauDuCandidat(acteur!.id),
    });
    return {
      statut: maj.status,
      deposeLe: maj.depositedOn ? depuisDateCivile(maj.depositedOn) : null,
      declareLe: maj.submittedAt?.toISOString() ?? null,
      piecesConserveesJusquAu: maj.retentionUntil?.toISOString() ?? null,
      mention: `${MENTION_DECLARATION} Tes pièces sont conservées ${CONSERVATION_SOUMIS_MOIS} mois après la date de ton dépôt ; nous t'écrirons avant cette échéance.`,
    };
  },
});
