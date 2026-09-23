import { route } from "@/server/http/route";
import { dossierAvecPieces } from "@/server/acces/dossiers";
import { versPiece } from "@/server/vue/dossier";
import { completudeDesPieces, libelleBlocage } from "@/domain/dossiers/piece";
import { codesConformes } from "@/domain/completeness/conditions";

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
    /*
      Le jour est fixé une fois pour toute la réponse : passer `versPiece`
      directement à `map` lui donnerait l'index du tableau comme date, et
      la deuxième pièce serait jugée au 1er janvier 1970.
    */
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const pieces = dossier.documents.map((d) => versPiece(d, aujourdhui));
    return {
      /*
        La règle **figée** entre dans le calcul : ses conditions
        déterministes en font partie, et sans elles cet écran conclut
        « complet » sur un dossier que le serveur refuse de déclarer prêt.
      */
      completude: completudeDesPieces(pieces, {
        regle: dossier.visaRule?.rules,
        conformes: codesConformes(dossier.documents),
      }),
      blocage: libelleBlocage(pieces),
      pieces,
    };
  },
});
