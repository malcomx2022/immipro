/**
 * Le rail de paiement suit la devise — N.A, tranché pour la V1 le
 * 20/09/2026.
 *
 * Francs CFA par Mobile Money, euros par carte. Il n'y a pas de choix
 * d'opérateur, et il n'y en aura pas tant que le fournisseur n'en expose
 * pas un et que le besoin ne sera pas constaté : une option d'interface
 * sans capacité derrière est un faux choix, et un faux choix coûte plus
 * cher qu'une absence de choix — il fait chercher un réglage qui n'existe
 * pas au moment précis où un paiement vient d'échouer.
 *
 * **Ce module existe parce que la règle n'était écrite nulle part.** Elle
 * vivait dans un `create` Prisma — `provider: devise === "XOF" ? …` — et
 * quatre écrans la redisaient chacun à leur façon. C'est ainsi que les
 * trois pastilles du prototype ont survécu à leur propre correction : la
 * page d'échec avait été reprise, la page des packs annonçait encore « MTN
 * MoMo · Moov Money · Carte bancaire » comme s'il y avait à choisir.
 *
 * Deux opérateurs Mobile Money sont bien joignables — c'est le
 * fournisseur qui route selon le numéro, pas le produit qui sélectionne.
 * Les nommer côté produit promettait une commande qui n'existe pas.
 *
 * La seule alternative réelle est de changer de grille, et elle en est
 * une : les deux grilles sont distinctes, ce n'est pas une conversion.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

import type { Devise } from "./pricing";

export type Rail = "MOBILE_MONEY" | "CARTE";

/**
 * La correspondance, et elle est exhaustive : ajouter une devise oblige à
 * dire par quel rail elle se règle, plutôt qu'à le découvrir au premier
 * paiement qui part chez le mauvais fournisseur.
 */
export const RAIL_DE_LA_DEVISE: Record<Devise, Rail> = {
  XOF: "MOBILE_MONEY",
  EUR: "CARTE",
};

export const railDe = (devise: Devise): Rail => RAIL_DE_LA_DEVISE[devise];

/** Le fournisseur technique, déduit du rail. Jamais du client (N.A). */
export const FOURNISSEUR: Record<Rail, "FEDAPAY" | "STRIPE"> = {
  MOBILE_MONEY: "FEDAPAY",
  CARTE: "STRIPE",
};

export const fournisseurDe = (devise: Devise) => FOURNISSEUR[railDe(devise)];

/** Ce que le candidat lit. Le nom du fournisseur technique n'y est jamais. */
export const LIBELLE_RAIL: Record<Rail, string> = {
  MOBILE_MONEY: "Mobile Money",
  CARTE: "Carte bancaire",
};

/**
 * Le même, au fil d'une phrase.
 *
 * Deux formes et non une mise en bas de casse : « carte bancaire » se
 * décapitalise, « Mobile Money » non — c'est une désignation, et l'écran
 * affichait « se règle par mobile money ». Le passer par `toLowerCase`
 * était une économie d'une table, payée par une faute à chaque phrase.
 */
export const RAIL_DANS_LA_PHRASE: Record<Rail, string> = {
  MOBILE_MONEY: "Mobile Money",
  CARTE: "carte bancaire",
};

export const libelleDuRail = (devise: Devise): string => LIBELLE_RAIL[railDe(devise)];
const dansLaPhrase = (devise: Devise): string => RAIL_DANS_LA_PHRASE[railDe(devise)];

const AUTRE: Record<Devise, Devise> = { XOF: "EUR", EUR: "XOF" };
export const autreDevise = (devise: Devise): Devise => AUTRE[devise];

const NOM_DE_LA_GRILLE: Record<Devise, string> = {
  XOF: "francs CFA",
  EUR: "euros",
};

/**
 * Sous le montant, au récapitulatif : par quoi il sera débité.
 *
 * Elle dit « ton opérateur » et non « ton opérateur MTN » : c'est le
 * fournisseur qui route selon le numéro, et nommer un opérateur ferait
 * douter celui qui en a un autre.
 */
export const mentionDuRail = (devise: Devise): string =>
  devise === "XOF"
    ? "Grille en francs CFA, débitée par ton opérateur Mobile Money."
    : "Grille en euros, prélevée par carte.";

/**
 * L'alternative, et la seule : changer de grille. Elle est présentée comme
 * telle — pas comme une conversion, que les deux grilles ne sont pas.
 */
export const mentionDeLAutreGrille = (devise: Devise): string =>
  `La grille en ${NOM_DE_LA_GRILLE[autreDevise(devise)]} se règle par ${dansLaPhrase(autreDevise(devise))}. Ce n'est pas une conversion : c'est une autre grille.`;

export const actionVersLAutreGrille = (devise: Devise): string =>
  devise === "XOF" ? "Payer par carte, en euros" : "Payer par Mobile Money";

/** Ce qui va se passer, juste avant de payer. */
export const deroulement = (devise: Devise): string =>
  devise === "XOF"
    ? "Une notification Mobile Money arrive sur ton téléphone. Tu saisis ton code PIN, et ton dossier s'ouvre aussitôt."
    : "Tu es conduit vers la page de paiement de notre prestataire. Une fois la carte validée, ton dossier s'ouvre aussitôt.";

/**
 * Ce que la page des packs dit à la place des trois pastilles.
 *
 * Elle répond à la question que la section posait — « par quoi vais-je
 * payer ? » — au lieu d'offrir un choix qui n'existe pas. Et elle dit d'où
 * vient la réponse : la grille, que le candidat vient justement de
 * choisir sur cet écran.
 */
export const moyenDeLaGrille = (devise: Devise): string =>
  `La grille en ${NOM_DE_LA_GRILLE[devise]} se règle par ${dansLaPhrase(devise)}. Il n'y a rien à choisir ici : le moyen suit la grille.`;

/**
 * Et pour Mobile Money, la précision qui évite la question suivante : le
 * candidat n'a pas à se demander si son opérateur est pris en charge.
 */
export const PRECISION_MOBILE_MONEY =
  "Le débit passe par l'opérateur de ton numéro, quel qu'il soit. Tu n'as pas à le désigner.";

/* ------------------------------------------------------------------ *
 * Les fournisseurs ouverts — 03/10/2026.
 * ------------------------------------------------------------------ */

export type FournisseurDePaiement = (typeof FOURNISSEUR)[Rail];

export const FOURNISSEURS_CONNUS: readonly FournisseurDePaiement[] = ["FEDAPAY", "STRIPE"];

/**
 * Les fournisseurs que l'exploitant déclare ouverts — `PAIEMENT_FOURNISSEURS`.
 *
 * Le pilote s'ouvre sur FedaPay seul : les clés Stripe sont vides, et
 * c'est voulu. Sans déclaration, rien ne distinguait ce choix d'un oubli.
 * L'état de service exigeait les deux rails et lisait donc « non
 * configuré » une instance prête à encaisser en francs CFA, et l'écran
 * proposait de payer par carte un paiement que rien ne pouvait ouvrir.
 *
 * La déclaration est explicite plutôt que déduite des clés présentes :
 * une clé oubliée en production doit se voir à l'état de service, pas
 * fermer un rail en silence.
 *
 * Absente, vide ou sans aucun nom reconnu, elle vaut **les deux** — le
 * comportement d'avant, qui exige tout et le dit. Les noms inconnus sont
 * rendus pour que l'appelant puisse avertir.
 */
export function fournisseursDeclares(valeur: string | undefined): {
  fournisseurs: readonly FournisseurDePaiement[];
  inconnus: readonly string[];
  /**
   * Ce que la déclaration a donné : `absente` (vide ou non posée), `lue`
   * (au moins un nom reconnu), `illisible` (des noms, aucun reconnu).
   * Affiché par l'état de service : sans lui, une valeur mal lue ne se
   * distinguait pas d'une variable absente (03/10/2026).
   */
  declaration: "absente" | "lue" | "illisible";
} {
  /*
    Guillemets et commentaire de fin tolérés — 03/10/2026. Selon l'outil
    qui charge le fichier d'environnement, `PAIEMENT_FOURNISSEURS="FEDAPAY"`
    ou `FEDAPAY # pilote` arrivent tels quels au processus ; lus comme des
    noms inconnus, ils rouvraient les deux rails en silence.
  */
  const nette = (valeur ?? "").split("#")[0]!.replace(/["']/gu, "");
  const noms = nette
    .split(",")
    .map((n) => n.trim().toUpperCase())
    .filter((n) => n !== "");
  const connus = FOURNISSEURS_CONNUS.filter((f) => noms.includes(f));
  const inconnus = noms.filter((n) => !(FOURNISSEURS_CONNUS as readonly string[]).includes(n));
  return {
    fournisseurs: connus.length > 0 ? connus : FOURNISSEURS_CONNUS,
    inconnus,
    declaration: noms.length === 0 ? "absente" : connus.length > 0 ? "lue" : "illisible",
  };
}

/** Les devises qu'on peut régler, dans l'ordre de la grille. */
export const devisesOuvertes = (fournisseurs: readonly FournisseurDePaiement[]): Devise[] =>
  (["XOF", "EUR"] as const).filter((d) => fournisseurs.includes(fournisseurDe(d)));

/**
 * La devise proposée d'abord : celle du pays du compte si son rail est
 * ouvert, sinon la première qui l'est. Un compte français ne se voit pas
 * proposer un paiement par carte que rien ne peut ouvrir.
 */
export const deviseProposee = (suggeree: Devise, ouvertes: readonly Devise[]): Devise =>
  ouvertes.includes(suggeree) ? suggeree : (ouvertes[0] ?? suggeree);

/** Ce que l'écran dit d'un rail fermé, et ce qui reste possible. */
export const MENTION_RAIL_FERME: Record<Rail, string> = {
  CARTE:
    "Le paiement par carte bancaire, en euros, n'est pas encore ouvert. Tu peux régler la grille en francs CFA par Mobile Money.",
  MOBILE_MONEY:
    "Le paiement par Mobile Money, en francs CFA, n'est pas encore ouvert. Tu peux régler la grille en euros par carte bancaire.",
};

export const mentionRailFerme = (devise: Devise): string => MENTION_RAIL_FERME[railDe(devise)];
