import { z } from "zod";
import { route } from "@/server/http/route";
import { annuaire } from "@/server/lecture/consultants";
import { MENTION_HABILITATION } from "@/domain/consultants/annuaire";

/**
 * Annuaire des consultants — T-04, WF-12.
 *
 * RG-12.1 : un consultant n'est référencé qu'après vérification de son
 * habilitation **dans la juridiction concernée**. Le filtre porte donc sur
 * l'habilitation, pays par pays : quelqu'un d'habilité au Canada
 * n'apparaît pas pour un dossier néerlandais.
 */
export const GET = route({
  nom: "consultants",
  acces: "candidat",
  limite: "lecture",
  requete: z.object({ pays: z.string().length(2).optional() }),
  async traiter({ requete }) {
    return { consultants: await annuaire(requete.pays), mention: MENTION_HABILITATION };
  },
});
