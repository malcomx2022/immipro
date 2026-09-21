/**
 * Administration des consultants — B-09, WF-15 et RG-12.1.
 *
 * ── Le registre qui attendait un écran ────────────────────────────────
 *
 * S.10 avait inscrit `Accreditation` au registre des habilitations sans
 * écrivain : `annuaire()` filtre sur les accréditations non révoquées,
 * rien dans le produit n'en crée, et l'annuaire des consultants était donc
 * vide pour toutes les destinations — définitivement. Le registre disait
 * aussi ce qui manquait : *« il manque un écran, et personne ne l'avait
 * remarqué parce qu'un registre vide se lit comme un registre en ordre. »*
 *
 * WF-15 nomme pourtant le domaine — « Consultants : validation
 * d'habilitation, suspension » — et RG-12.1 l'exige : *« un consultant
 * n'est référencé qu'après vérification de son habilitation dans la
 * juridiction concernée. »*
 *
 * ── Ce que l'écran décide, et ce qu'il ne décide pas ───────────────────
 *
 * S.10 notait que RG-12.1 ne dit pas **ce qui constitue** une preuve de
 * titre d'exercice. C'est exact, et ce n'est pas à l'écran de le dire :
 * un RCIC se vérifie au registre canadien, un avocat à son barreau, et la
 * pièce probante diffère d'une juridiction à l'autre.
 *
 * L'écran fait ce que le produit sait faire — la même chose que WF-14 fait
 * de la relecture d'une fiche : il **enregistre la vérification**. Quel
 * titre, dans quelle juridiction, à quelle date, et par qui. Le jugement
 * reste humain, la trace est le travail du produit, et `verifiedBy` est
 * l'administrateur connecté, jamais un nom saisi — un nom saisi peut être
 * celui de n'importe qui.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

import type { ActeurLisible } from "./acteur";

export interface Habilitation {
  /** ISO 3166-1 alpha-2 de la juridiction. */
  code: string;
  /** Nom lisible de la destination, quand la plateforme l'ouvre. */
  pays: string;
  /** Le titre vérifié, tel qu'il a été relevé : « RCIC », « avocat au barreau d'Amsterdam ». */
  titre: string;
  /** Date de la vérification, ISO. */
  verifieeLe: string;
  /**
   * Qui a vérifié. Un opérateur, jamais une saisie libre — et rendu
   * lisible plutôt que brut : l'arbitrage du 21/09/2026 a déjà tranché
   * pour le journal d'audit qu'« un identifiant n'est pas un nom », et
   * la colonne « vérifié par » promet une personne exactement comme la
   * colonne « Acteur ». L'identifiant durable reste, en second.
   */
  verifiePar: ActeurLisible;
  /** Retrait, le cas échéant : l'habilitation reste en table, datée. */
  retireeLe?: string;
}

export interface ConsultantAdministre {
  id: string;
  nom: string;
  cabinet: string;
  ville: string;
  /** Mention d'agrément et ancienneté, affichées telles quelles (T-04). */
  qualification: string;
  langues: readonly string[];
  delaiReponseHeures: number;
  actif: boolean;
  /** Toutes les habilitations, retirées comprises — la trace ne s'efface pas. */
  habilitations: readonly Habilitation[];
}

export type EtatConsultant = "VISIBLE" | "SANS_HABILITATION" | "SUSPENDU";

/**
 * L'état dit ce que le **candidat** voit, pas ce que la base contient.
 *
 * C'est la seule question utile ici : `annuaire()` filtre sur `active` et
 * sur les accréditations non révoquées, et un consultant peut donc être
 * parfaitement renseigné et invisible. Un écran d'administration qui
 * n'affiche que « actif / inactif » laisse ce cas sans nom.
 */
export function etatDuConsultant(consultant: ConsultantAdministre): EtatConsultant {
  if (!consultant.actif) return "SUSPENDU";
  return consultant.habilitations.some((h) => !h.retireeLe)
    ? "VISIBLE"
    : "SANS_HABILITATION";
}

export const LIBELLE_ETAT: Record<EtatConsultant, string> = {
  VISIBLE: "Visible dans l'annuaire",
  SANS_HABILITATION: "Aucune habilitation en cours",
  SUSPENDU: "Suspendu",
};

/** Ce que l'état implique pour le candidat, en une phrase. */
export const CONSEQUENCE_ETAT: Record<EtatConsultant, string> = {
  VISIBLE:
    "Les candidats des destinations habilitées peuvent demander un rendez-vous.",
  SANS_HABILITATION:
    "Ce consultant n'apparaît dans aucun annuaire : RG-12.1 ne le référence qu'une fois son habilitation vérifiée.",
  SUSPENDU:
    "Ce consultant n'apparaît dans aucun annuaire et ses créneaux ne sont plus proposés, quelles que soient ses habilitations.",
};

/** Les destinations que ce consultant couvre aujourd'hui, dans l'ordre. */
export const destinationsCouvertes = (
  consultant: ConsultantAdministre,
): readonly string[] =>
  consultant.habilitations
    .filter((h) => !h.retireeLe)
    .map((h) => h.pays)
    .sort((a, b) => a.localeCompare(b, "fr"));

/**
 * Ce que l'écran annonce en tête : la couverture réelle de l'annuaire.
 *
 * Un décompte de consultants ne dit rien — trois consultants tous habilités
 * au Canada laissent les dossiers néerlandais sans personne. C'est la
 * destination découverte qui appelle une action, pas le total.
 */
export function resumeCouverture(
  consultants: readonly ConsultantAdministre[],
  destinationsOuvertes: readonly string[],
): string {
  const couvertes = new Set(
    consultants
      .filter((c) => etatDuConsultant(c) === "VISIBLE")
      .flatMap((c) => c.habilitations.filter((h) => !h.retireeLe).map((h) => h.code)),
  );
  const sans = destinationsOuvertes.filter((d) => !couvertes.has(d));
  if (destinationsOuvertes.length === 0) {
    return "Aucune destination n'est ouverte : il n'y a pas d'annuaire à remplir.";
  }
  if (sans.length === 0) {
    return `Les ${destinationsOuvertes.length} destinations ouvertes ont au moins un consultant habilité.`;
  }
  const liste = sans.join(", ");
  return sans.length === destinationsOuvertes.length
    ? `Aucune destination ouverte n'a de consultant habilité : l'annuaire est vide pour ${liste}.`
    : `${sans.length} ${sans.length > 1 ? "destinations ouvertes n'ont" : "destination ouverte n'a"} aucun consultant habilité : ${liste}.`;
}

/**
 * Ce que l'écran rappelle à l'opérateur, au-dessus du formulaire.
 *
 * La phrase est là pour que personne n'enregistre une habilitation « parce
 * que le consultant l'a dit ». Elle nomme la responsabilité sans prétendre
 * définir la preuve, qui diffère d'une juridiction à l'autre.
 */
export const RAPPEL_VERIFICATION =
  "Enregistre l'habilitation après l'avoir vérifiée à la source : registre professionnel, ordre ou barreau de la juridiction. Ton nom et la date sont conservés avec la vérification.";

/** Le titre vérifié est relevé tel quel : c'est lui qu'on relira. */
export const TITRE_MINIMUM = 2;

export const motifDeRefusDuTitre = (titre: string): string | null =>
  titre.trim().length >= TITRE_MINIMUM
    ? null
    : "Indique le titre vérifié — « RCIC », « avocat au barreau d'Amsterdam » — tel qu'il figure au registre consulté.";
