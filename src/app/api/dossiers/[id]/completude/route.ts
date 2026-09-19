import { route } from "@/server/http/route";
import { dossierAvecPieces } from "@/server/acces/dossiers";
import { versPiece } from "@/server/vue/dossier";
import { completudeDesPieces, libelleBlocage } from "@/domain/dossiers/piece";

/**
 * Complétude — C-09, WF-07.
 *
 * `completudeDesPieces` passe par `versClient`, qui retire le barème
 * interne. Il n'y a donc pas de chemin par lequel un entier sur cent
 * atteindrait cet écran : le type renvoyé n'a pas le champ (arbitrage C-09).
 * Le back-office lit `internalScore` sur son propre chemin.
 */
export const GET = route({
  nom: "dossier.completude",
  acces: "candidat",
  limite: "lecture",
  async traiter({ params, acteur }) {
    const dossier = await dossierAvecPieces(params.id!, acteur!.id);
    const pieces = dossier.documents.map(versPiece);
    return {
      completude: completudeDesPieces(pieces),
      blocage: libelleBlocage(pieces),
      pieces,
    };
  },
});
