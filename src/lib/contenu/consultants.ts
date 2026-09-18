import type { ConsultantHabilite } from "@/domain/consultants/annuaire";
import type { Creneau } from "@/domain/consultants/rendez-vous";

/**
 * Consultants habilités et disponibilités — provisoires.
 *
 * Ils viendront des tables d'habilitation et de l'agenda des partenaires.
 * Les écrans ne connaissent que les types du domaine.
 */
export const CONSULTANTS: readonly ConsultantHabilite[] = [
  {
    id: "vermeulen",
    nom: "Maître A. Vermeulen",
    cabinet: "Vermeulen Immigratierecht, Amsterdam",
    habiliteLe: "2026-03-12",
    destinations: ["NL"],
    langues: ["Français", "Néerlandais"],
    delaiReponseHeures: 24,
  },
  {
    id: "adjovi",
    nom: "Maître S. Adjovi",
    cabinet: "Cabinet Adjovi, Cotonou et La Haye",
    habiliteLe: "2026-06-04",
    destinations: ["NL", "BE"],
    langues: ["Français", "Fon", "Anglais"],
    delaiReponseHeures: 48,
  },
  {
    id: "bakker",
    nom: "Maître L. Bakker",
    cabinet: "Bakker & Partners, Rotterdam",
    habiliteLe: "2026-07-27",
    destinations: ["NL"],
    langues: ["Néerlandais", "Anglais"],
    delaiReponseHeures: 72,
  },
  {
    id: "tremblay",
    nom: "Maître J. Tremblay",
    cabinet: "Tremblay Immigration, Montréal",
    habiliteLe: "2026-02-19",
    destinations: ["CA"],
    langues: ["Français", "Anglais"],
    delaiReponseHeures: 36,
  },
  {
    id: "sow",
    nom: "Maître F. Sow",
    cabinet: "Sow & Associés, Dakar et Québec",
    habiliteLe: "2026-05-11",
    destinations: ["CA"],
    langues: ["Français", "Wolof"],
    delaiReponseHeures: 48,
  },
];

export const consultantParId = (id: string) => CONSULTANTS.find((c) => c.id === id);

/** Nom lisible d'une destination, pour les messages d'état vide. */
export const NOM_DESTINATION: Record<string, string> = {
  NL: "les Pays-Bas",
  DE: "l'Allemagne",
  CA: "le Canada",
  BE: "la Belgique",
};

export const nomDestination = (code: string) => NOM_DESTINATION[code] ?? code;

/**
 * Disponibilités posées en jours à venir plutôt qu'en dates fixes : des
 * créneaux figés finissent tous dans le passé, et l'écran propose alors des
 * rendez-vous impossibles.
 */
const OUVERTURES = [
  { dansNJours: 2, heures: ["09:00", "11:30", "15:30"] },
  { dansNJours: 4, heures: ["09:00", "11:30", "15:30", "16:30", "18:00"] },
  { dansNJours: 5, heures: ["11:30", "16:30"] },
];

/** Un créneau déjà pris dans le jeu de démonstration : l'écran doit savoir le montrer. */
const PRIS = new Set(["11:30"]);

export function creneaux(aujourdhui: Date): readonly Creneau[] {
  const base = Date.UTC(
    aujourdhui.getUTCFullYear(),
    aujourdhui.getUTCMonth(),
    aujourdhui.getUTCDate(),
  );
  return OUVERTURES.flatMap(({ dansNJours, heures }) =>
    heures.map((heure) => {
      const [h, m] = heure.split(":").map(Number);
      const debut = new Date(base + dansNJours * 86_400_000);
      debut.setUTCHours(h!, m!, 0, 0);
      return {
        debut: debut.toISOString(),
        disponible: !(dansNJours === 2 && PRIS.has(heure)),
      };
    }),
  );
}

/** Fuseaux annoncés sur T-05 : celui du candidat, celui du consultant. */
export const FUSEAU_CANDIDAT = "Cotonou";
export const FUSEAU_CONSULTANT = "Amsterdam";
