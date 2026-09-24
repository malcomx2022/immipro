import { z } from "zod";
import { route } from "@/server/http/route";
import {
  enregistrerLesPreferencesDeRappel,
  etatDesRappels,
} from "@/server/comptes/rappels";
import { DELAIS_D_ALERTE, fuseauPropose } from "@/domain/dossiers/preferences-rappels";

/**
 * Préférences de rappel d'échéance — S.87, RG-09.4.
 *
 * Le fuseau est pris dans la liste proposée, et seulement là : un
 * identifiant libre serait accepté par la base et refusé par le moteur de
 * dates à la passe suivante.
 */
export const GET = route({
  nom: "comptes.rappels",
  acces: "candidat",
  limite: "lecture",
  async traiter({ acteur }) {
    return etatDesRappels(acteur!.id);
  },
});

export const PUT = route({
  nom: "comptes.rappels.maj",
  acces: "candidat",
  limite: "sensible",
  corps: z.object({
    actifs: z.boolean(),
    email: z.boolean(),
    fuseau: z
      .string()
      .refine(fuseauPropose, "Choisis ton fuseau dans la liste : la ville la plus proche de chez toi."),
    joursAvant: z
      .number()
      .int()
      .refine(
        (n): n is (typeof DELAIS_D_ALERTE)[number] => (DELAIS_D_ALERTE as readonly number[]).includes(n),
        "Choisis trois, sept ou quatorze jours avant l'échéance.",
      ),
  }),
  async traiter({ corps, acteur }) {
    await enregistrerLesPreferencesDeRappel(acteur!.id, {
      ...corps,
      joursAvant: corps.joursAvant as (typeof DELAIS_D_ALERTE)[number],
    });
    return etatDesRappels(acteur!.id);
  },
});
