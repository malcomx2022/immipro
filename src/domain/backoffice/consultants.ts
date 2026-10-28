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

/**
 * ── La création, à l'écran (S.196) ────────────────────────────────────
 *
 * La route `POST /api/admin/consultants` existait sans écran : un
 * consultant ne s'ajoutait qu'à la main, par l'API. Le formulaire vit dans
 * B-09 et ses refus sont ceux de la route, champ par champ, dits avant
 * l'envoi : les bornes ci-dessous sont celles du schéma de la route, et un
 * essai le vérifie.
 *
 * Un consultant créé n'a aucune habilitation : l'annuaire candidat ne le
 * sert pas (RG-12.1) tant qu'une juridiction n'est pas vérifiée, et
 * l'écran le dit au moment même où il est créé.
 */
export const BORNES_CONSULTANT = {
  nom: { min: 2, max: 120 },
  cabinet: { min: 2, max: 160 },
  ville: { min: 2, max: 120 },
  qualification: { min: 2, max: 200 },
  langue: { min: 2 },
  delaiHeures: { min: 1, max: 24 * 14 },
  motif: { min: 3, max: 500 },
} as const;

export interface SaisieConsultant {
  nom: string;
  cabinet: string;
  ville: string;
  qualification: string;
  /** Les langues de travail, séparées par des virgules. */
  langues: string;
  /** Le délai de réponse annoncé, en heures, tel que saisi. */
  delai: string;
  /** Ce que l'administrateur a consulté avant de créer la fiche. */
  motif: string;
}

export const SAISIE_CONSULTANT_VIDE: SaisieConsultant = {
  nom: "",
  cabinet: "",
  ville: "",
  qualification: "",
  langues: "",
  delai: "",
  motif: "",
};

/** « Français, anglais ; wolof » → trois langues, sans doublon ni vide. */
export function languesSaisies(texte: string): string[] {
  const vues = new Set<string>();
  const langues: string[] = [];
  for (const brute of texte.split(/[,;]/u)) {
    const langue = brute.trim();
    if (!langue || vues.has(langue.toLocaleLowerCase("fr"))) continue;
    vues.add(langue.toLocaleLowerCase("fr"));
    langues.push(langue);
  }
  return langues;
}

const longueur = (
  valeur: string,
  { min, max }: { min: number; max: number },
  manque: string,
  trop: string,
): string | null => {
  const n = valeur.trim().length;
  if (n < min) return manque;
  if (n > max) return trop;
  return null;
};

/**
 * Champ par champ, ce qui empêche la création. Vide : la fiche peut partir.
 * Chaque message dit quoi écrire, pas seulement ce qui manque.
 */
export function refusDeLaCreation(
  saisie: SaisieConsultant,
): Partial<Record<keyof SaisieConsultant, string>> {
  const b = BORNES_CONSULTANT;
  const refus: Partial<Record<keyof SaisieConsultant, string>> = {};
  const poser = (champ: keyof SaisieConsultant, message: string | null) => {
    if (message) refus[champ] = message;
  };

  poser(
    "nom",
    longueur(saisie.nom, b.nom, "Indique le nom du consultant, tel qu'il exerce.", `Le nom dépasse ${b.nom.max} caractères.`),
  );
  poser(
    "cabinet",
    longueur(
      saisie.cabinet,
      b.cabinet,
      "Indique le cabinet ou la structure d'exercice.",
      `Le cabinet dépasse ${b.cabinet.max} caractères.`,
    ),
  );
  poser(
    "ville",
    longueur(saisie.ville, b.ville, "Indique la ville d'exercice.", `La ville dépasse ${b.ville.max} caractères.`),
  );
  poser(
    "qualification",
    longueur(
      saisie.qualification,
      b.qualification,
      "Indique la qualification et l'ancienneté : « Avocate, 12 ans ».",
      `La qualification dépasse ${b.qualification.max} caractères : garde la mention et l'ancienneté.`,
    ),
  );

  const langues = languesSaisies(saisie.langues);
  if (langues.length === 0) {
    poser("langues", "Indique au moins une langue de travail, séparées par des virgules.");
  } else {
    const courte = langues.find((l) => l.length < b.langue.min);
    if (courte) poser("langues", `« ${courte} » n'est pas une langue : écris-la en toutes lettres.`);
  }

  const delai = saisie.delai.trim();
  const heures = /^\d+$/u.test(delai) ? Number(delai) : Number.NaN;
  if (!Number.isInteger(heures) || heures < b.delaiHeures.min || heures > b.delaiHeures.max) {
    poser(
      "delai",
      `Indique le délai de réponse en heures, un nombre entier entre ${b.delaiHeures.min} et ${b.delaiHeures.max}.`,
    );
  }

  poser(
    "motif",
    longueur(
      saisie.motif,
      b.motif,
      "Indique ce que tu as consulté avant de créer la fiche.",
      `Le motif dépasse ${b.motif.max} caractères : garde l'essentiel.`,
    ),
  );
  return refus;
}

/** Le corps de `POST /api/admin/consultants`, à partir d'une saisie acceptée. */
export function corpsDeCreation(saisie: SaisieConsultant) {
  return {
    nom: saisie.nom.trim(),
    cabinet: saisie.cabinet.trim(),
    ville: saisie.ville.trim(),
    qualification: saisie.qualification.trim(),
    langues: languesSaisies(saisie.langues),
    delaiReponseHeures: Number(saisie.delai.trim()),
    motif: saisie.motif.trim(),
  };
}

/** Ce que l'écran dit juste après la création. */
export const APRES_CREATION =
  "Consultant créé. Il reste invisible dans l'annuaire tant qu'aucune habilitation n'est vérifiée : enregistre-la sur sa fiche, ci-dessous.";
