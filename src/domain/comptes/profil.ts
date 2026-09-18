/**
 * Profil candidat — WF-02, écran C-02.
 *
 * Le prototype affichait « Profil rempli 80 % ». Le pourcentage tombe sous
 * l'arbitrage C-09 comme la note de dossier : il ne dit pas quoi faire, et il
 * se lit comme une évaluation. Le décompte du prototype — « Il manque 1 champ »
 * — dit la même chose en mieux, et c'est lui qui reste.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type CleChampProfil =
  | "nom"
  | "naissance"
  | "nationalite"
  | "diplome"
  | "anglais"
  | "personnesACharge"
  | "refusAnterieur";

export interface ChampProfil {
  cle: CleChampProfil;
  libelle: string;
  section: "Identité" | "Parcours" | "Situation";
  /** Précision affichée sous le champ, quand elle évite une erreur. */
  aide?: string;
  /** Un champ facultatif ne compte pas dans ce qui reste à renseigner. */
  facultatif?: true;
}

export const CHAMPS_PROFIL: readonly ChampProfil[] = [
  { cle: "nom", libelle: "Prénom et nom", section: "Identité" },
  {
    cle: "naissance",
    libelle: "Date de naissance",
    section: "Identité",
    aide: "Telle qu'elle figure sur ton passeport.",
  },
  { cle: "nationalite", libelle: "Nationalité", section: "Identité" },
  { cle: "diplome", libelle: "Plus haut diplôme obtenu", section: "Parcours" },
  { cle: "anglais", libelle: "Niveau d'anglais attesté", section: "Parcours" },
  {
    cle: "personnesACharge",
    libelle: "Personnes à charge",
    section: "Situation",
    aide: "Modifie les montants de ressources à prouver.",
  },
  {
    cle: "refusAnterieur",
    libelle: "Refus de visa antérieur",
    section: "Situation",
    aide: "À déclarer, il est visible des administrations.",
  },
];

export type Profil = Partial<Record<CleChampProfil, string>>;

const renseigne = (valeur: string | undefined): boolean =>
  typeof valeur === "string" && valeur.trim().length > 0;

export const champsObligatoires = CHAMPS_PROFIL.filter((c) => !c.facultatif);

export const champsRenseignes = (profil: Profil): number =>
  champsObligatoires.filter((c) => renseigne(profil[c.cle])).length;

export const champsRestants = (profil: Profil): number =>
  champsObligatoires.length - champsRenseignes(profil);

export const profilComplet = (profil: Profil): boolean => champsRestants(profil) === 0;

/**
 * Ce qui remplace « 80 % » : un décompte, et ce qu'il apporte. Le message dit
 * à quoi sert le champ suivant, pas où en est une jauge.
 */
export function libelleAvancementProfil(profil: Profil): string {
  const restants = champsRestants(profil);
  if (restants === 0) {
    return "Profil complet. Ta checklist tient compte de toutes ces informations.";
  }
  const champs = restants > 1 ? `${restants} champs` : "1 champ";
  return `Il manque ${champs}. Chaque champ rempli affine ta checklist.`;
}
