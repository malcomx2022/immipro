import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import type { ConsultantHabilite } from "@/domain/consultants/annuaire";
import type { Creneau } from "@/domain/consultants/rendez-vous";
import { editorialDe } from "@/lib/contenu/destinations";

/**
 * Lecture des consultants — T-04 et T-05, WF-12.
 *
 * RG-12.1 : le filtre porte sur l'habilitation, destination par destination,
 * et non sur le consultant. Quelqu'un d'habilité au Canada n'apparaît pas
 * pour un dossier néerlandais, et une habilitation retirée reste en table
 * — datée — sans plus être servie.
 */

export async function annuaire(countryCode?: string): Promise<ConsultantHabilite[]> {
  const consultants = await db.consultant.findMany({
    where: {
      active: true,
      accreditations: {
        some: { revokedAt: null, ...(countryCode ? { countryCode } : {}) },
      },
    },
    include: { accreditations: { where: { revokedAt: null } } },
    orderBy: { responseHours: "asc" },
  });

  return consultants.map((c) => ({
    id: c.id,
    nom: c.name,
    cabinet: c.firm,
    habiliteLe: c.accreditations
      .map((a) => a.verifiedAt.toISOString().slice(0, 10))
      .sort()
      .at(0)!,
    destinations: c.accreditations.map((a) => a.countryCode),
    langues: Array.isArray(c.languages) ? (c.languages as string[]) : [],
    delaiReponseHeures: c.responseHours,
  }));
}

export const consultantParId = async (id: string): Promise<ConsultantHabilite | null> =>
  (await annuaire()).find((c) => c.id === id) ?? null;

/** Nom affichable d'une destination, depuis la part éditoriale du référentiel. */
export async function nomDeLaDestination(countryCode: string): Promise<string> {
  const regle = await db.visaRule.findFirst({
    where: { countryCode, status: "PUBLISHED" },
    select: { countryCode: true, visaType: true },
  });
  if (!regle) return countryCode;
  return editorialDe(regle.countryCode, regle.visaType)?.pays ?? countryCode;
}

/**
 * Créneaux proposés — T-05.
 *
 * Ils sont générés à partir d'aujourd'hui et non figés : des horaires écrits
 * en dur finissent tous dans le passé, et l'écran propose alors des
 * rendez-vous impossibles (écart H.2 du lot WF-12). La disponibilité vient
 * de la table : un créneau déjà réservé chez ce consultant sort indisponible
 * plutôt que d'échouer à la réservation.
 */
export const JOURS_PROPOSES = 3;
export const HEURES_PROPOSEES = [9, 11, 15, 17] as const;

export async function creneaux(consultantId: string, aujourdhui = new Date()): Promise<Creneau[]> {
  const consultant = await db.consultant.findFirst({
    where: { id: consultantId, active: true },
    select: { id: true },
  });
  if (!consultant) throw echec("introuvable");

  const debut = new Date(
    Date.UTC(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth(), aujourdhui.getUTCDate()),
  );
  const proposes: Date[] = [];
  for (let jour = 1; jour <= JOURS_PROPOSES; jour += 1) {
    for (const heure of HEURES_PROPOSEES) {
      const quand = new Date(debut);
      quand.setUTCDate(quand.getUTCDate() + jour);
      quand.setUTCHours(heure, 0, 0, 0);
      proposes.push(quand);
    }
  }

  const pris = await db.appointment.findMany({
    where: {
      consultantId,
      startsAt: { in: proposes },
      status: { in: ["RESERVE", "REPORTE"] },
    },
    select: { startsAt: true },
  });
  const occupes = new Set(pris.map((p) => p.startsAt.getTime()));

  return proposes.map((quand) => ({
    debut: quand.toISOString(),
    disponible: !occupes.has(quand.getTime()),
  }));
}
