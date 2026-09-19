import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";

/**
 * Annuaire des consultants — T-04, WF-12.
 *
 * RG-12.1 : un consultant n'est référencé qu'après vérification de son
 * habilitation **dans la juridiction concernée**. Le filtre porte donc sur
 * l'habilitation, pays par pays, et non sur le consultant : quelqu'un
 * d'habilité au Canada n'apparaît pas pour un dossier néerlandais.
 *
 * Une habilitation retirée reste en table, datée — la retirer effacerait la
 * preuve qu'elle existait le jour d'un rendez-vous — d'où le filtre
 * `revokedAt: null`, qui écarte sans effacer.
 */
export const GET = route({
  nom: "consultants",
  acces: "candidat",
  limite: "lecture",
  requete: z.object({ pays: z.string().length(2).optional() }),
  async traiter({ requete }) {
    const consultants = await db.consultant.findMany({
      where: {
        active: true,
        accreditations: {
          some: { revokedAt: null, ...(requete.pays ? { countryCode: requete.pays } : {}) },
        },
      },
      include: { accreditations: { where: { revokedAt: null } } },
      orderBy: { responseHours: "asc" },
    });

    return {
      consultants: consultants.map((c) => ({
        id: c.id,
        nom: c.name,
        cabinet: c.firm,
        ville: c.city,
        qualification: c.qualification,
        langues: c.languages,
        delaiReponseHeures: c.responseHours,
        habilitations: c.accreditations.map((a) => ({
          pays: a.countryCode,
          titre: a.title,
          // INV-8 : la vérification porte sa date, comme toute donnée
          // opposable affichée au candidat.
          verifieeLe: a.verifiedAt.toISOString().slice(0, 10),
        })),
      })),
      mention:
        "ImmiPro met en relation. Le conseil est délivré par le consultant, sous sa responsabilité.",
    };
  },
});
