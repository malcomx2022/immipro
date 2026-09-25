import { tarifDepuisEnvironnement, type TarifIA } from "@/domain/backoffice/couts";

/**
 * Les fournisseurs d'IA, et lequel sert chaque fonction — S.94.
 *
 * ── Ce qui est tranché ici ───────────────────────────────────────────
 *
 * **Le choix appartient à l'exploitant, par configuration**, et vaut par
 * fonction : la lecture des pièces d'un côté, la rédaction (mise en forme
 * et relecture) de l'autre. Ni le candidat ni l'opérateur ne le changent
 * à l'écran : on sait toujours qui a reçu quoi, et c'est la condition de
 * tout le reste. Sans configuration, rien ne change : Anthropic sert les
 * deux, comme en V1.
 *
 * **Une pièce d'identité ne part chez un nouveau sous-traitant que sur une
 * autorisation écrite.** Choisir un autre fournisseur pour la lecture ne
 * suffit pas : il faut aussi `AI_PIECES_SOUS_TRAITANT_AUTORISE` égale à
 * son code, posée par qui a tranché la conformité (convention de
 * traitement, mention dans la page des données personnelles). Sans elle,
 * la lecture n'est pas branchée — la pièce part en revue humaine, comme
 * sans clé — et l'écran B-07 dit pourquoi. La rédaction ne reçoit aucune
 * pièce et n'a pas cette garde.
 *
 * **Aucune bascule automatique.** Un fournisseur en panne rend sa cause
 * ordinaire (`injoignable`, `service_sature`…) ; rien ne réessaie chez un
 * autre, qui recevrait une pièce que personne ne lui a destinée.
 *
 * **Le quota reste compté en jetons** (option a du document de décision) :
 * un jeton n'a pas la même taille d'un fournisseur à l'autre, et l'écart
 * se lit dans B-07, ventilé par fournisseur.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export const FONCTIONS_IA = ["extraction", "redaction"] as const;
export type FonctionIA = (typeof FONCTIONS_IA)[number];

export const LIBELLE_FONCTION: Record<FonctionIA, string> = {
  extraction: "Lecture des pièces",
  redaction: "Rédaction assistée et relecture",
};

export const CODES_FOURNISSEURS = ["anthropic", "openai_compatible"] as const;
export type CodeFournisseur = (typeof CODES_FOURNISSEURS)[number];

export const FOURNISSEUR_PAR_DEFAUT: CodeFournisseur = "anthropic";

export interface Fournisseur {
  code: CodeFournisseur;
  libelle: string;
  /** Les variables sans lesquelles aucun appel ne part. */
  variables: readonly string[];
  /** La variable qui nomme le modèle, et son défaut quand il en a un. */
  modele: { variable: string; defaut: string | null };
  /** Les trois noms du tarif de ce fournisseur, dans cet ordre : entrée, sortie, devise. */
  tarif: readonly [string, string, string];
  /** Ce qu'il sait lire. Un PDF qu'il ne lit pas part en revue humaine, jamais converti en silence. */
  lit: { image: boolean; pdf: "oui" | "non" | "selon_configuration" };
}

export const FOURNISSEURS: Readonly<Record<CodeFournisseur, Fournisseur>> = {
  anthropic: {
    code: "anthropic",
    libelle: "Anthropic (Claude)",
    variables: ["ANTHROPIC_API_KEY"],
    modele: { variable: "AI_MODEL", defaut: "claude-opus-5" },
    // Le tarif historique reste celui d'Anthropic : aucune installation
    // existante n'a de variable à renommer.
    tarif: ["AI_TARIF_ENTREE_PAR_MILLION", "AI_TARIF_SORTIE_PAR_MILLION", "AI_TARIF_DEVISE"],
    lit: { image: true, pdf: "oui" },
  },
  /*
    Un protocole plutôt qu'une marque : l'interface « chat completions »
    d'OpenAI est aussi servie par Mistral, Google (Gemini), DeepSeek, Groq
    ou un serveur local. L'adresse de base et le modèle se déclarent ; le
    produit ne devine aucun nom de modèle, et n'en a donc aucun par défaut.
  */
  openai_compatible: {
    code: "openai_compatible",
    libelle: "API compatible OpenAI (OpenAI, Mistral, Gemini…)",
    variables: ["AI_OPENAI_URL", "AI_OPENAI_API_KEY", "AI_OPENAI_MODEL"],
    modele: { variable: "AI_OPENAI_MODEL", defaut: null },
    tarif: [
      "AI_TARIF_OPENAI_COMPATIBLE_ENTREE_PAR_MILLION",
      "AI_TARIF_OPENAI_COMPATIBLE_SORTIE_PAR_MILLION",
      "AI_TARIF_OPENAI_COMPATIBLE_DEVISE",
    ],
    lit: { image: true, pdf: "selon_configuration" },
  },
};

/** La variable qui choisit le fournisseur d'une fonction. */
export const VARIABLE_DU_CHOIX: Record<FonctionIA, string> = {
  extraction: "AI_FOURNISSEUR_EXTRACTION",
  redaction: "AI_FOURNISSEUR_REDACTION",
};

/** L'autorisation écrite d'envoyer des pièces à un autre sous-traitant qu'Anthropic. */
export const VARIABLE_AUTORISATION_PIECES = "AI_PIECES_SOUS_TRAITANT_AUTORISE";

/** Le fournisseur compatible OpenAI lit les PDF seulement si l'exploitant le déclare. */
export const VARIABLE_PDF_COMPATIBLE = "AI_OPENAI_PDF";

type Environnement = Readonly<Record<string, string | undefined>>;
const lire = (env: Environnement, nom: string): string => (env[nom] ?? "").trim();

export const estUnFournisseur = (valeur: string): valeur is CodeFournisseur =>
  (CODES_FOURNISSEURS as readonly string[]).includes(valeur);

export type Choix =
  | { connu: true; fournisseur: CodeFournisseur }
  /** Une valeur écrite mais inconnue : dite telle quelle, jamais remplacée par le défaut. */
  | { connu: false; valeur: string };

/**
 * Le fournisseur choisi pour une fonction.
 *
 * Une variable absente ou vide vaut le défaut. Une valeur **inconnue** ne
 * le vaut pas : un exploitant qui écrit `openai` au lieu de
 * `openai_compatible` croit avoir changé de fournisseur, et retomber en
 * silence sur Anthropic enverrait ses pièces là où il pense qu'elles ne
 * vont plus.
 */
export function fournisseurChoisi(env: Environnement, fonction: FonctionIA): Choix {
  const valeur = lire(env, VARIABLE_DU_CHOIX[fonction]).toLowerCase();
  if (valeur === "") return { connu: true, fournisseur: FOURNISSEUR_PAR_DEFAUT };
  return estUnFournisseur(valeur) ? { connu: true, fournisseur: valeur } : { connu: false, valeur };
}

/** L'adresse de base d'une API compatible : https, ou http sur la boucle locale seulement. */
export function adresseDeBase(valeur: string): URL | null {
  try {
    const url = new URL(valeur);
    const locale = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol === "https:" || (url.protocol === "http:" && locale)) return url;
  } catch {
    // Illisible : null.
  }
  return null;
}

/** Le modèle d'un fournisseur : celui déclaré, sinon son défaut, sinon rien. */
export const modeleDu = (env: Environnement, code: CodeFournisseur): string | null =>
  lire(env, FOURNISSEURS[code].modele.variable) || FOURNISSEURS[code].modele.defaut;

/** Ce qui manque pour qu'un fournisseur puisse être appelé, ou `null`. */
export function manqueDuFournisseur(env: Environnement, code: CodeFournisseur): string | null {
  const absentes = FOURNISSEURS[code].variables.filter((v) => lire(env, v) === "");
  if (absentes.length > 0) return `renseigner ${absentes.join(", ")}`;
  if (code === "openai_compatible" && adresseDeBase(lire(env, "AI_OPENAI_URL")) === null) {
    return "AI_OPENAI_URL doit être une adresse https (http n'est admis que sur la boucle locale)";
  }
  return null;
}

/** Des pièces d'identité peuvent-elles partir chez ce fournisseur ? */
export const piecesAutoriseesChez = (env: Environnement, code: CodeFournisseur): boolean =>
  code === FOURNISSEUR_PAR_DEFAUT || lire(env, VARIABLE_AUTORISATION_PIECES).toLowerCase() === code;

/** Ce fournisseur lit-il les PDF, dans cette configuration ? */
export function litLesPdf(env: Environnement, code: CodeFournisseur): boolean {
  const lit = FOURNISSEURS[code].lit.pdf;
  if (lit === "selon_configuration") return lire(env, VARIABLE_PDF_COMPATIBLE).toLowerCase() === "oui";
  return lit === "oui";
}

/** Le tarif d'un fournisseur, ou `null` : jamais celui d'un autre. */
export const tarifDu = (env: Environnement, code: CodeFournisseur): TarifIA | null =>
  tarifDepuisEnvironnement(env, FOURNISSEURS[code].tarif);

/**
 * Le fournisseur d'une ligne d'usage. Une ligne écrite avant S.94 n'en
 * porte pas : il n'y en avait qu'un, Anthropic. L'historique n'est pas
 * réécrit, il est lu.
 */
export const fournisseurDeLUsage = (provider: string | null): CodeFournisseur =>
  provider !== null && estUnFournisseur(provider) ? provider : FOURNISSEUR_PAR_DEFAUT;

// ── Ce que l'écran d'exploitation en dit ────────────────────────────────

export interface EtatDeLaFonction {
  fonction: FonctionIA;
  libelle: string;
  /** Le code choisi, ou la valeur inconnue écrite. */
  fournisseur: string;
  libelleFournisseur: string;
  modele: string | null;
  /** Des appels peuvent partir. */
  branche: boolean;
  /** Pourquoi rien ne part, dit comme une action à faire. */
  raison: string | null;
  tarife: boolean;
}

export function etatDesFonctions(env: Environnement): readonly EtatDeLaFonction[] {
  return FONCTIONS_IA.map((fonction) => {
    const choix = fournisseurChoisi(env, fonction);
    if (!choix.connu) {
      return {
        fonction,
        libelle: LIBELLE_FONCTION[fonction],
        fournisseur: choix.valeur,
        libelleFournisseur: "Fournisseur inconnu",
        modele: null,
        branche: false,
        raison: `${VARIABLE_DU_CHOIX[fonction]} vaut « ${choix.valeur} », qui n'est pas un fournisseur connu : écrire ${CODES_FOURNISSEURS.join(" ou ")}, ou vider la variable pour revenir à ${FOURNISSEUR_PAR_DEFAUT}.`,
        tarife: false,
      };
    }
    const code = choix.fournisseur;
    const manque = manqueDuFournisseur(env, code);
    const interdit =
      fonction === "extraction" && !piecesAutoriseesChez(env, code)
        ? `les pièces d'identité ne partent chez ${FOURNISSEURS[code].libelle} qu'une fois la sous-traitance tranchée : ${VARIABLE_AUTORISATION_PIECES}=${code}, posée par qui a validé la conformité`
        : null;
    const raison = manque ?? interdit;
    return {
      fonction,
      libelle: LIBELLE_FONCTION[fonction],
      fournisseur: code,
      libelleFournisseur: FOURNISSEURS[code].libelle,
      modele: modeleDu(env, code),
      branche: raison === null,
      raison: raison === null ? null : `${raison.charAt(0).toUpperCase()}${raison.slice(1)}.`,
      tarife: tarifDu(env, code) !== null,
    };
  });
}

/** La consommation d'un fournisseur et d'un modèle, telle que B-07 l'affiche. */
export interface ConsommationDuFournisseur {
  fournisseur: CodeFournisseur;
  modele: string | null;
  appels: number;
  jetonsEntree: number;
  jetonsSortie: number;
  /** Au tarif de ce fournisseur ; `null` sans tarif — jamais zéro. */
  coutMicros: number | null;
  devise: string | null;
}

/**
 * La devise commune des tarifs de ces fournisseurs, ou `null` si l'un n'a
 * pas de tarif ou si deux devises diffèrent : un total ne s'additionne
 * pas d'une monnaie à l'autre, ni avec un coût inconnu.
 */
export function deviseCommune(env: Environnement, codes: readonly CodeFournisseur[]): string | null {
  const devises = new Set<string>();
  for (const code of codes) {
    const tarif = tarifDu(env, code);
    if (!tarif) return null;
    devises.add(tarif.devise);
  }
  return devises.size === 1 ? [...devises][0]! : null;
}

/** Les fournisseurs à tarifer : ceux qui ont servi, sinon ceux qui sont choisis. */
export function fournisseursATarifer(
  env: Environnement,
  consommes: readonly CodeFournisseur[],
): readonly CodeFournisseur[] {
  if (consommes.length > 0) return [...new Set(consommes)];
  const choisis = FONCTIONS_IA.map((f) => fournisseurChoisi(env, f)).flatMap((c) =>
    c.connu ? [c.fournisseur] : [],
  );
  return [...new Set(choisis)];
}

export const MENTION_CHOIX_DU_FOURNISSEUR = `Le fournisseur de chaque fonction se choisit par configuration (${VARIABLE_DU_CHOIX.extraction}, ${VARIABLE_DU_CHOIX.redaction}), ${FOURNISSEUR_PAR_DEFAUT} par défaut. Aucune bascule automatique : un fournisseur indisponible ne renvoie pas les pièces chez un autre.`;

export const MENTION_QUOTA_EN_JETONS =
  "Le quota des packs reste compté en jetons. Un jeton n'a pas la même taille d'un fournisseur à l'autre : l'écart se lit dans le tableau ci-dessous.";
