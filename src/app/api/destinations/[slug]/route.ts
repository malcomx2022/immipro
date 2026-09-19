import { route } from "@/server/http/route";
import { reglePubliieParSlug, versFiche } from "@/server/acces/regles";
import { echec } from "@/server/http/echecs";

/** Fiche détaillée — P-04. Même filtre, même mention de source (INV-4, INV-8). */
export const GET = route({
  nom: "destination",
  acces: "public",
  limite: "lecture",
  cachePublicSecondes: 60,
  async traiter({ params }) {
    const regle = params.slug ? await reglePubliieParSlug(params.slug) : null;
    if (!regle) throw echec("introuvable");
    const fiche = versFiche(regle);
    if (!fiche) throw echec("introuvable");
    return { destination: fiche };
  },
});
