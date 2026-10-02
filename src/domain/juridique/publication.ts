import { LIBELLE_GROUPE, variable, type Valeurs } from "@/domain/juridique/variables";
import { MODELES, type ModeleJuridique, type PageJuridique } from "@/domain/juridique/modeles";
import { empreinte, fautesDuRendu, rendre, variablesDuModele } from "@/domain/juridique/rendu";

/**
 * La validation et la republication des textes juridiques — S.101.
 *
 * ── Valider, c'est signer ───────────────────────────────────────────
 *
 * Q.A refusait un drapeau « validé » : « aucun test ne peut vérifier
 * qu'un juriste a relu un texte, et un drapeau serait coché ». La
 * validation n'est donc pas un booléen. C'est un **acte** :
 *
 * - posé par un administrateur connecté, dont l'identifiant est gardé ;
 * - qui **nomme le relecteur** et la date de sa relecture (décision du
 *   02/10/2026) ;
 * - qui atteste, case cochée, que la version affichée est celle relue ;
 * - et qui produit une version immuable : le texte exact, les valeurs
 *   exactes, l'empreinte du modèle.
 *
 * Le code ne prétend pas qu'un juriste a relu. Il garde qui l'a affirmé,
 * quand, et sur quel texte — ce qui est vérifiable.
 *
 * ── Les variables changent, le texte validé reste ───────────────────
 *
 * Décision du 02/10/2026 : changer une variable (une adresse, un numéro)
 * republie aussitôt les textes déjà validés qui l'emploient, en version
 * nouvelle et tracée. La relecture porte sur le texte ; les variables
 * sont des faits. Mais si le **texte** a changé dans le dépôt depuis la
 * validation (empreinte différente), rien ne se republie seul : la page
 * garde la version validée, et le back-office dit « à revalider ».
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export interface Attestation {
  /** Qui a relu : nom et qualité. « Me Dossou, avocat au barreau de Cotonou ». */
  relecteur: string;
  /** Date de la relecture, AAAA-MM-JJ. */
  relueLe: string;
  /** Pourquoi cette validation : première publication, mise à jour… */
  motif: string;
  /** La case : « J'atteste que la version affichée est celle qui a été relue. » */
  atteste: boolean;
}

/** Ce qu'une version publiée garde de sa validation. */
export interface VersionPubliee {
  rang: number;
  empreinte: string;
  /** Les valeurs employées par le texte publié. */
  variables: Readonly<Record<string, string>>;
  relecteur: string;
  relueLe: string;
}

export type EtatDuTexte =
  /** Jamais validé : la page répond 404. */
  | "NON_PUBLIE"
  /** Validé, et le texte du dépôt est celui qui a été validé. */
  | "PUBLIE"
  /** Validé, mais le texte a changé dans le dépôt : la page garde l'ancienne version. */
  | "A_REVALIDER";

export const LIBELLE_ETAT: Record<EtatDuTexte, string> = {
  NON_PUBLIE: "Non publié",
  PUBLIE: "Publié",
  A_REVALIDER: "À revalider",
};

export function etatDuTexte(modele: ModeleJuridique, derniere: Pick<VersionPubliee, "empreinte"> | null): EtatDuTexte {
  if (!derniere) return "NON_PUBLIE";
  return derniere.empreinte === empreinte(modele) ? "PUBLIE" : "A_REVALIDER";
}

const libelleDe = (cle: string): string => {
  const v = variable(cle);
  return v ? `« ${v.libelle} » (${LIBELLE_GROUPE[v.groupe]})` : `« ${cle} »`;
};

/** Le message qui nomme les variables à renseigner. Actionnable : il dit lesquelles. */
export const messageDesManquantes = (manquantes: readonly string[]): string =>
  manquantes.length === 1
    ? `Renseigner ${libelleDe(manquantes[0]!)} avant de valider ce texte.`
    : `Renseigner ces ${manquantes.length} variables avant de valider ce texte : ${manquantes.map(libelleDe).join(", ")}.`;

const DATE = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * Les motifs qui empêchent de valider un texte, ou une liste vide.
 *
 * Chacun dit le geste attendu : un message d'échec est actionnable.
 */
export function refusDeValidation(
  page: PageJuridique,
  valeurs: Valeurs,
  attestation: Attestation,
  aujourdhui: string,
): readonly string[] {
  const refus: string[] = [];
  const rendu = rendre(MODELES[page], valeurs);
  if (rendu.manquantes.length > 0) refus.push(messageDesManquantes(rendu.manquantes));
  for (const faute of fautesDuRendu(rendu)) {
    refus.push(`La formulation « ${faute.extrait} » est refusée (${faute.raison}) : la reformuler dans la variable qui la porte.`);
  }
  if (attestation.relecteur.trim().length < 5) {
    refus.push("Nommer le relecteur et sa qualité : par exemple « Me Dossou, avocat au barreau de Cotonou ».");
  }
  if (!DATE.test(attestation.relueLe) || Number.isNaN(Date.parse(attestation.relueLe))) {
    refus.push("Indiquer la date de la relecture.");
  } else if (attestation.relueLe > aujourdhui) {
    refus.push("La date de relecture ne peut pas être dans le futur : indiquer la date à laquelle le texte a été relu.");
  }
  if (attestation.motif.trim().length < 3) refus.push("Indiquer le motif de cette validation : il est consigné au journal.");
  if (!attestation.atteste) {
    refus.push("Cocher l'attestation : la version affichée est celle qui a été relue.");
  }
  return refus;
}

/**
 * Faut-il republier ce texte après un changement de variables ?
 *
 * Oui seulement si les trois conditions tiennent :
 *
 * - le texte a déjà été validé, et son modèle n'a pas changé depuis ;
 * - une valeur qu'il emploie a changé ;
 * - le nouveau rendu est complet et sans formulation refusée.
 *
 * Dans les autres cas, la page garde sa dernière version validée. La
 * raison est rendue pour que le back-office la dise.
 */
export function republication(
  modele: ModeleJuridique,
  derniere: VersionPubliee | null,
  valeurs: Valeurs,
): { republier: true } | { republier: false; raison: "jamais_valide" | "texte_change" | "inchange" | "incomplet" | "formulation_refusee" } {
  if (!derniere) return { republier: false, raison: "jamais_valide" };
  if (derniere.empreinte !== empreinte(modele)) return { republier: false, raison: "texte_change" };
  const employees = variablesDuModele(modele);
  const change = employees.some((cle) => (valeurs[cle] ?? "").trim() !== (derniere.variables[cle] ?? "").trim());
  if (!change) return { republier: false, raison: "inchange" };
  const rendu = rendre(modele, valeurs);
  if (rendu.manquantes.length > 0) return { republier: false, raison: "incomplet" };
  if (fautesDuRendu(rendu).length > 0) return { republier: false, raison: "formulation_refusee" };
  return { republier: true };
}

export const RAISON_SANS_REPUBLICATION: Record<
  Exclude<ReturnType<typeof republication>, { republier: true }>["raison"],
  string
> = {
  jamais_valide: "Ce texte n'a jamais été validé : les variables s'appliqueront à sa première validation.",
  texte_change: "Le texte a changé dans le dépôt depuis sa validation : il doit être revalidé avant que les nouvelles valeurs s'y appliquent.",
  inchange: "Aucune variable de ce texte n'a changé.",
  incomplet: "Une variable obligatoire de ce texte est vide : la page garde sa version validée jusqu'à ce qu'elle soit renseignée.",
  formulation_refusee: "Une formulation refusée apparaît dans les nouvelles valeurs : la page garde sa version validée jusqu'à ce qu'elle soit reformulée.",
};

/** Le motif consigné quand une modification de variables republie un texte. */
export const motifDeRepublication = (changees: readonly string[]): string =>
  `Variables modifiées : ${changees.map((c) => variable(c)?.libelle ?? c).join(", ")}.`;
