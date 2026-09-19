/**
 * Annuaire des consultants habilités — T-04, WF-12.
 *
 * L'habilitation atteste qu'un titre d'exercice a été vérifié pour une
 * destination. Elle ne dit rien de l'issue d'une demande, et l'écran sépare
 * les deux explicitement : c'est la distinction la plus facile à laisser
 * glisser sur un annuaire, et la plus coûteuse (INV-1).
 *
 * Elle se fait destination par destination, parce qu'elle vérifie un titre
 * local. L'état vide le dit et nomme où il y en a — sans quoi « aucun
 * consultant » se lit comme « le service ne marche pas ».
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export interface ConsultantHabilite {
  id: string;
  nom: string;
  cabinet: string;
  /** Date d'habilitation, ISO. */
  habiliteLe: string;
  /** Codes destination couverts, alignés sur `Habilitation.destination`. */
  destinations: readonly string[];
  langues: readonly string[];
  /** Délai de réponse annoncé, en heures. */
  delaiReponseHeures: number;
}

export const habilitesPour = (
  consultants: readonly ConsultantHabilite[],
  destination: string,
): ConsultantHabilite[] => consultants.filter((c) => c.destinations.includes(destination));

/** « Répond en 24 h », « Répond en 3 jours » au-delà de deux jours. */
export function libelleDelai(consultant: ConsultantHabilite): string {
  const heures = consultant.delaiReponseHeures;
  if (heures < 48) return `Répond en ${heures} h`;
  const jours = Math.round(heures / 24);
  return `Répond en ${jours} jours`;
}

export type FiltreDelai = "TOUS" | "SOUS_48H";

export function filtrerAnnuaire(
  consultants: readonly ConsultantHabilite[],
  destination: string,
  langue: string | null,
  delai: FiltreDelai,
): ConsultantHabilite[] {
  return habilitesPour(consultants, destination)
    .filter((c) => langue === null || c.langues.includes(langue))
    .filter((c) => delai === "TOUS" || c.delaiReponseHeures <= 48)
    .sort((a, b) => a.delaiReponseHeures - b.delaiReponseHeures);
}

/** Langues proposées au filtre : celles réellement couvertes, pas une liste fixe. */
export function languesDisponibles(
  consultants: readonly ConsultantHabilite[],
  destination: string,
): string[] {
  const langues = new Set<string>();
  for (const c of habilitesPour(consultants, destination)) {
    for (const langue of c.langues) langues.add(langue);
  }
  return [...langues].sort((a, b) => a.localeCompare(b, "fr"));
}

export interface AnnuaireVide {
  titre: string;
  /** Où l'habilitation existe, et pourquoi elle est par destination. */
  explication: string;
}

/**
 * État vide. Il nomme les destinations couvertes : « aucun consultant » seul
 * se lit comme une panne, alors que c'est une couverture qui s'étend
 * destination par destination.
 */
export function annuaireVide(
  consultants: readonly ConsultantHabilite[],
  destination: string,
  nomDeLaDestination: string,
  nomParCode: (code: string) => string,
): AnnuaireVide | null {
  if (habilitesPour(consultants, destination).length > 0) return null;

  const couverture = new Map<string, number>();
  for (const c of consultants) {
    for (const d of c.destinations) couverture.set(d, (couverture.get(d) ?? 0) + 1);
  }

  const ailleurs = [...couverture.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, n]) => `${n} pour ${nomParCode(code)}`);

  const debut =
    ailleurs.length === 0
      ? "Aucun consultant n'est encore habilité."
      : `${ailleurs.join(", ")}.`;

  return {
    titre: `Aucun consultant habilité pour ${nomDeLaDestination}`,
    explication: `${debut} L'habilitation se fait destination par destination, parce qu'elle vérifie un titre d'exercice local.`,
  };
}

/** Ce que le dossier continue de faire sans consultant. */
export const SANS_CONSULTANT =
  "Ton dossier avance sans rendez-vous. Les pièces, l'analyse et l'échéancier ne dépendent pas d'un consultant.";

/**
 * La mention qui tient tout l'écran : ce que l'habilitation atteste, et ce
 * qu'elle n'atteste pas.
 */
export const MENTION_HABILITATION =
  "Le conseil donné en rendez-vous engage le consultant, pas ImmiPro. L'habilitation atteste que son titre d'exercice a été vérifié pour cette destination, pas que ta demande aboutira.";

/**
 * « 3 consultants habilités », « 1 consultant habilité ».
 *
 * L'accord suit le compte. Écrit au pluriel en toutes circonstances, il
 * annonçait « 1 consultants » — une faute d'accord sur un écran qui promet
 * une vérification d'habilitation entame la confiance dans la vérification
 * elle-même.
 */
export const libelleNombre = (combien: number): string =>
  combien > 1 ? `${combien} consultants habilités` : `${combien} consultant habilité`;
