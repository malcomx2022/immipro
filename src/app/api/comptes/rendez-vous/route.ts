import { route } from "@/server/http/route";
import { rendezVousDuCandidat } from "@/server/lecture/consultants";

/**
 * Les rendez-vous à venir d'un candidat — T-05, WF-12.
 *
 * Il n'existait aucune surface pour les voir. L'écran de confirmation de
 * paiement les affiche une fois, puis on le quitte ;
 * `/consultants/[id]/rendez-vous` ne lit aucun rendez-vous existant, si
 * bien qu'un candidat qui y revient repart de l'accord de partage. La
 * référence ne survivait que dans le courrier de confirmation.
 *
 * Trois surfaces lui promettaient pourtant « annulation ou report sans
 * frais jusqu'au […] » : une promesse sans écran où l'exercer n'en est
 * pas une.
 */
export const GET = route({
  nom: "comptes.rendezvous",
  acces: "candidat",
  limite: "lecture",
  async traiter({ acteur }) {
    return { rendezVous: await rendezVousDuCandidat(acteur!.id) };
  },
});
