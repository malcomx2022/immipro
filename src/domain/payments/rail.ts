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
