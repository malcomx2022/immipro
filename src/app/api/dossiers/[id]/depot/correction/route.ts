import { z } from "zod";
import { route } from "@/server/http/route";
import { dossierDuCandidat } from "@/server/acces/dossiers";
import { demanderUneCorrectionDuDepot } from "@/server/dossiers/parcours";
import { fuseauDuCandidat } from "@/server/comptes/rappels";
import { demandeEnAttente, depuisDateCivile } from "@/domain/dossiers/depot";
import { jourCivil } from "@/domain/format/fuseau";

/**
 * Demande de correction de la date réelle du dépôt — arbitrage S.90.
 *
 * Le candidat ne modifie pas la date : il la signale, et un opérateur
 * l'applique par l'action auditée de S.89, ou la refuse avec une réponse.
 * Les deux champs sont validés côté serveur comme à l'écran, et chaque
 * refus est rendu sur son champ.
 */
export const POST = route({
  nom: "dossier.depot.correction",
  acces: "candidat_verifie",
  limite: "sensible",
  corps: z.object({
    deposeLe: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u, "Indique la date de ton dépôt : jour, mois et année."),
    explication: z.string().max(1000, "Mille caractères au plus : l'essentiel suffit."),
  }),
  async traiter({ params, acteur, corps }) {
    const dossier = await dossierDuCandidat(params.id!, acteur!.id);
    const demande = await demanderUneCorrectionDuDepot(dossier, {
      deposeLe: corps.deposeLe,
      explication: corps.explication,
      fuseau: await fuseauDuCandidat(acteur!.id),
    });
    const deposeLe = depuisDateCivile(demande.requestedDate);
    return {
      deposeLe,
      message: demandeEnAttente(deposeLe, jourCivil(demande.createdAt)),
    };
  },
});
