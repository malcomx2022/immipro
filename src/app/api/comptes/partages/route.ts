import { route } from "@/server/http/route";
import { partagesDuCandidat } from "@/server/lecture/consultants";

/**
 * Les dossiers ouverts à un consultant — A-05, RG-12.2.
 *
 * L'accord est annoncé révocable par T-04, par la case de T-05 et par le
 * courrier de confirmation. Il n'existait aucun endroit pour le voir ni
 * pour le retirer : la mention nommait « Mes consentements », qui ne
 * parlait que des autorisations générales, et le lien de l'annuaire menait
 * au profil.
 */
export const GET = route({
  nom: "comptes.partages",
  acces: "candidat",
  limite: "lecture",
  async traiter({ acteur }) {
    return { partages: await partagesDuCandidat(acteur!.id) };
  },
});
