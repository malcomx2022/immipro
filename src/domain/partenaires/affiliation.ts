/**
 * Affiliation partenaires — WF-13, écran T-06.
 *
 * Deux étapes seulement dans le workflow : une offre rattachée à une étape
 * de checklist, puis une redirection tracée avec commission au résultat.
 * Depuis K.A, tranché le 20/09/2026, l'offre ne s'affiche plus *dans* la
 * checklist — elle s'y rattache, et se lit sur une surface dédiée. Tout le
 * reste de ce module sert à empêcher les trois façons dont une affiliation
 * dérape :
 *
 * 1. **Hors contexte.** Une offre sans étape ni motif déclaré est une
 *    réclame (RG-13.1). Le type l'exige, la base le refuse.
 * 2. **Non déclarée.** Le taux annoncé à l'écran et le taux facturé doivent
 *    être le même nombre (RG-13.3). Ils le sont parce qu'un partenaire dont
 *    le taux diffère de celui qu'affiche l'écran n'est pas proposable.
 * 3. **Activée partout.** RG-13.4 demande une vérification destination par
 *    destination ; rien n'est donc proposable par défaut.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

import { COMMISSION_PARTENAIRE } from "@/domain/payments/pricing";

export type GenrePartenaire =
  | "ASSURANCE_SANTE"
  | "LOGEMENT"
  | "EQUIVALENCE_DIPLOME"
  | "TRANSFERT_FONDS"
  | "CONSULTANT";

export const LIBELLE_GENRE: Record<GenrePartenaire, string> = {
  ASSURANCE_SANTE: "Assurance santé",
  LOGEMENT: "Logement",
  EQUIVALENCE_DIPLOME: "Équivalence de diplôme",
  TRANSFERT_FONDS: "Transfert de fonds",
  CONSULTANT: "Consultant",
};

/**
 * État d'une proposition. `PROPOSEE` existe dès l'affichage et non au clic :
 * une proposition déclinée est une information, et ne compter que celles qui
 * rapportent revient à ne mesurer que ce qu'on espérait.
 */
export type EtatProposition =
  | "PROPOSEE"
  | "REDIRIGEE"
  | "ABOUTIE"
  | "SANS_SUITE"
  | "DECLINEE";

export const LIBELLE_ETAT: Record<EtatProposition, string> = {
  PROPOSEE: "Proposée",
  REDIRIGEE: "Redirection tracée",
  ABOUTIE: "Aboutie",
  SANS_SUITE: "Sans suite",
  DECLINEE: "Déclinée définitivement",
};

/**
 * Les trois issues, traduites en états.
 *
 * Deux d'entre elles n'ont plus de déclencheur depuis K.A : sur une surface
 * où l'on vient de son plein gré, on ne décline pas ce qui n'est pas
 * proposé, et l'interrupteur qui coupe les offres vit avec les autres
 * consentements. `SANS_SUITE` et `DECLINEE` restent des états valides d'une
 * ligne de suivi — le back-office les lit — et la table reste exhaustive
 * pour que le jour où une issue revient, elle retrouve son état.
 */
export const ETAT_APRES: Record<
  "CRENEAUX" | "CONTINUER_SEUL" | "NE_PLUS_PROPOSER",
  EtatProposition
> = {
  CRENEAUX: "REDIRIGEE",
  CONTINUER_SEUL: "SANS_SUITE",
  NE_PLUS_PROPOSER: "DECLINEE",
};

/**
 * Taux annoncé par l'écran, en points de base. Un entier : le taux affiché
 * et le taux facturé doivent être le même nombre, et 0,15 en virgule
 * flottante n'est pas exactement quinze centièmes.
 */
export const COMMISSION_BPS_ANNONCEE = Math.round(COMMISSION_PARTENAIRE * 10_000);

/**
 * Un partenaire n'est montrable que si son taux est celui que l'écran écrit
 * en toutes lettres.
 *
 * C'est volontairement rigide. L'écran porte une phrase littérale — la
 * transparence exige un nombre, pas une formule interpolée qui échapperait
 * au garde-fou du vocabulaire — et un partenaire à un autre taux la rendrait
 * fausse. Plutôt que de détecter la divergence, on la rend impossible : un
 * taux différent demande d'abord une phrase différente.
 */
export const tauxConformeALAnnonce = (commissionBps: number): boolean =>
  commissionBps === COMMISSION_BPS_ANNONCEE;

/**
 * Commission due sur un montant facturé par le partenaire, en plus petite
 * unité de la devise. Arrondie à l'entier inférieur : sur un différend
 * d'arrondi, c'est la plateforme qui perd le franc, pas le partenaire.
 */
export const commissionDue = (montant: number, commissionBps: number): number =>
  Math.floor((montant * commissionBps) / 10_000);

/** Ce qui déclenche une proposition. Toujours une situation déclarée. */
export interface Contexte {
  /** Code de l'étape de checklist qui la motive (RG-13.1). */
  etape: string;
  /** Situation déclarée par le candidat, telle qu'il l'a saisie. */
  motif: string;
}

/**
 * Une proposition est recevable quand les quatre conditions tiennent
 * ensemble. Elles sont énumérées ici plutôt que dispersées dans la requête :
 * une condition oubliée dans un `where` ne se voit pas à la relecture.
 */
export interface Recevabilite {
  /** Le partenaire est actif et activé sur la destination du dossier (RG-13.4). */
  activeSurLaDestination: boolean;
  /** Le candidat n'a pas retiré l'autorisation de recevoir des propositions. */
  autorise: boolean;
  /** Il n'a pas refusé définitivement (« ne plus me proposer »). */
  sansRefusDefinitif: boolean;
  /** Le taux du partenaire est celui qu'annonce l'écran (RG-13.3). */
  tauxConforme: boolean;
}

export const estProposable = (r: Recevabilite): boolean =>
  r.activeSurLaDestination && r.autorise && r.sansRefusDefinitif && r.tauxConforme;

/**
 * Ce que l'écran dit, selon ce qui est proposé.
 *
 * Une seule table, exhaustive : ajouter un genre de partenaire oblige à
 * écrire ses trois phrases, plutôt qu'à découvrir à l'écran laquelle parlait
 * encore de consultant. Et il a fallu l'écran pour les trouver — sous un
 * courtier en assurance, cette carte annonçait « Premier entretien :
 * 20 000 F, 45 minutes », une commission « sur cet entretien », proposait
 * de « continuer sans consultant » et renvoyait à l'annuaire.
 *
 * Ce qui ne dépend pas du genre n'est pas ici : la divulgation du taux, les
 * engagements et le fait qu'ImmiPro ne conseille pas juridiquement valent
 * pour tous les partenaires, et les décliner par genre serait une invitation
 * à les affaiblir un jour pour l'un d'eux.
 */
export interface Formulation {
  /** Titre de la carte et de la boîte de dialogue. */
  titre: string;
  /** Action principale. */
  action: string;
  /** Qui répond de la prestation. Jamais ImmiPro (RG-12.3, RG-12.4). */
  responsabilite: string;
}

const SERVICE = (quoi: string): Formulation => ({
  titre: "Un partenaire peut te fournir cette pièce",
  action: "Ouvrir le site du partenaire",
  responsabilite: `Les partenaires ${quoi} sont indépendants et responsables de leurs prestations.`,
});

/**
 * Ce que T-06 dit quand la liste ne s'affiche pas faute d'autorisation.
 *
 * Une seule phrase existait, et elle disait « tu as coupé les offres de
 * partenaire » — un geste. Or aucune autorisation n'est active au premier
 * passage (RG-02.1, `ETAT_INITIAL`), si bien que la phrase s'adressait
 * d'abord à ceux qui n'avaient rien coupé du tout, et les renvoyait
 * « rétablir » ce qu'ils n'avaient jamais accordé. Le mot présuppose un
 * passé que la plupart n'ont pas.
 *
 * Les deux textes disent la même chose du produit et une chose différente de
 * la personne, ce qui est exactement la distinction que porte
 * `EtatAutorisation`. Aucun ne reproche le refus : l'un annonce une question
 * jamais posée, l'autre prend acte d'une décision.
 */
export interface Silence {
  titre: string;
  explication: string;
  /** Libellé du lien vers les consentements, accordé à la situation. */
  lien: string;
}

export const SILENCE: Record<"retiree" | "jamais_donnee", Silence> = {
  jamais_donnee: {
    titre: "Tu n'as pas encore autorisé les propositions de partenaire",
    explication:
      "Aucune autorisation n'est active tant que tu ne l'as pas donnée. Cette page reste vide d'ici là, et ton dossier n'en dépend pas.",
    lien: "Autoriser depuis mes consentements",
  },
  retiree: {
    titre: "Tu as coupé les offres de partenaire",
    explication:
      "Cette page reste vide tant que l'autorisation n'est pas rétablie. Elle se règle depuis tes consentements, avec les autres.",
    lien: "Ouvrir mes consentements",
  },
};

export const FORMULATION: Record<GenrePartenaire, Formulation> = {
  CONSULTANT: {
    titre: "Ce point dépasse ce que nous savons faire",
    action: "Voir les créneaux",
    responsabilite:
      "Les consultants partenaires sont indépendants et responsables de leurs prestations.",
  },
  ASSURANCE_SANTE: SERVICE("d'assurance"),
  LOGEMENT: SERVICE("de logement"),
  EQUIVALENCE_DIPLOME: SERVICE("d'équivalence de diplôme"),
  TRANSFERT_FONDS: SERVICE("de transfert de fonds"),
};
