import { route } from "@/server/http/route";
import { ficheParSlugPubliee } from "@/server/lecture/destinations";
import { echec } from "@/server/http/echecs";

/** Fiche détaillée — P-04. Même filtre, même mention de source (INV-4, INV-8). */
export const GET = route({
  nom: "destination",
  acces: "public",
  limite: "lecture",
  cachePublicSecondes: 60,
  async traiter({ params }) {
    const fiche = params.slug ? await ficheParSlugPubliee(params.slug) : null;
    if (!fiche) throw echec("introuvable");
    return { destination: fiche };
  },
});
