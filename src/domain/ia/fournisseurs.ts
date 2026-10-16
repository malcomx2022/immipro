import { tarifDepuisEnvironnement, type TarifIA } from "@/domain/backoffice/couts";
import {
  MOTIF_DU_COMPTE,
  VARIABLE_COMPTE_DE_SERVICE,
  lireCompteDeService,
} from "@/domain/ia/compte-de-service";

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
 * **L'autorisation désigne une société, pas un protocole** — S.171,
 * REV11-L1. `openai_compatible` est un protocole que servent Mistral,
 * Google, OpenAI ou n'importe quel serveur : l'autorisation porte donc
 * aussi l'origine validée (`AI_OPENAI_ORIGINE_AUTORISEE`), qui doit être
 * celle de `AI_OPENAI_URL`. Changer d'adresse sans revoir l'autorisation
 * arrête l'envoi des pièces ; cela ne change jamais de sous-traitant en
 * silence.
 *
 * **Aucune bascule automatique.** Un fournisseur en panne rend sa cause
 * ordinaire (`injoignable`, `service_sature`…) ; rien ne réessaie chez un
 * autre, qui recevrait une pièce que personne ne lui a destinée.
 *
 * **Le quota se compte en analyses, les jetons se mesurent** (INV-6, D-1
 * du 09/10/2026) : la contrepartie en jetons du pack reste le repère de
 * marge de B-07. Un jeton n'a pas la même taille d'un fournisseur à
 * l'autre, et l'écart s'y lit, ventilé par fournisseur.
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
    libelle: "API compatible OpenAI (OpenAI, Mistral, Gemini sur Vertex AI…)",
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

/**
 * L'origine du sous-traitant compatible validé pour les pièces — S.171.
 * `https://api.mistral.ai`, sans chemin : la société qu'on a validée,
 * reconnaissable à son adresse, et non le protocole qu'elle parle.
 */
export const VARIABLE_ORIGINE_AUTORISEE = "AI_OPENAI_ORIGINE_AUTORISEE";

/** Le fournisseur compatible OpenAI lit les PDF seulement si l'exploitant le déclare. */
export const VARIABLE_PDF_COMPATIBLE = "AI_OPENAI_PDF";

/**
 * Le niveau de raisonnement demandé au fournisseur compatible — S.181.
 *
 * Envoyé tel quel comme `reasoning_effort`. Vide : rien n'est envoyé et le
 * fournisseur garde son défaut. Gemini 3 sur Vertex raisonne en MEDIUM par
 * défaut et facture ces jetons en sortie ; la campagne L5 impose `low`.
 */
export const VARIABLE_RAISONNEMENT_COMPATIBLE = "AI_OPENAI_RAISONNEMENT";
export const NIVEAUX_DE_RAISONNEMENT = ["low", "medium", "high"] as const;
export type NiveauDeRaisonnement = (typeof NIVEAUX_DE_RAISONNEMENT)[number];

type Environnement = Readonly<Record<string, string | undefined>>;
const lire = (env: Environnement, nom: string): string => (env[nom] ?? "").trim();

/**
 * La forme sous laquelle un PDF part chez un fournisseur compatible — S.99.
 *
 * Le protocole est commun, le bloc PDF ne l'est pas :
 *
 * - `file` — `{type: "file", file: {file_data}}`, la forme d'OpenAI ;
 * - `document_url` — `{type: "document_url", document_url}`, celle de
 *   Mistral, qui refuse un bloc `file` sans identifiant de fichier ;
 * - `image_url` — le PDF en data URL dans un bloc image, ce que Vertex AI
 *   admet pour toute entrée multimodale.
 *
 * `oui` reste la valeur d'OpenAI, pour ne rien renommer chez qui l'a déjà
 * posée. Une valeur inconnue n'est pas lue comme `non` : elle est dite,
 * comme un fournisseur inconnu, parce que l'exploitant qui l'a écrite
 * croit que ses PDF partent.
 */
export const FORMES_DU_PDF = ["file", "document_url", "image_url"] as const;
export type FormeDuPdf = (typeof FORMES_DU_PDF)[number];

const VALEURS_PDF: Readonly<Record<string, FormeDuPdf | null>> = {
  "": null,
  non: null,
  oui: "file",
  file: "file",
  document_url: "document_url",
  image_url: "image_url",
};

export function formeDuPdf(
  env: Environnement,
): { connue: true; forme: FormeDuPdf | null } | { connue: false; valeur: string } {
  const valeur = lire(env, VARIABLE_PDF_COMPATIBLE).toLowerCase();
  return valeur in VALEURS_PDF ? { connue: true, forme: VALEURS_PDF[valeur]! } : { connue: false, valeur };
}

/** Le niveau de raisonnement déclaré, `null` si rien n'est à envoyer ; une valeur inconnue est dite. */
export function niveauDeRaisonnement(
  env: Environnement,
): { connu: true; niveau: NiveauDeRaisonnement | null } | { connu: false; valeur: string } {
  const valeur = lire(env, VARIABLE_RAISONNEMENT_COMPATIBLE).toLowerCase();
  if (valeur === "") return { connu: true, niveau: null };
  return (NIVEAUX_DE_RAISONNEMENT as readonly string[]).includes(valeur)
    ? { connu: true, niveau: valeur as NiveauDeRaisonnement }
    : { connu: false, valeur };
}

/**
 * Comment le fournisseur compatible s'authentifie — S.99.
 *
 * Une clé fixe (`AI_OPENAI_API_KEY`) pour OpenAI, Mistral et les autres ;
 * un compte de service Google pour Vertex AI, qui n'accepte qu'un jeton
 * OAuth d'une heure, renouvelé par le serveur.
 */
export const VARIABLE_AUTH_COMPATIBLE = "AI_OPENAI_AUTH";
export const MODES_D_AUTHENTIFICATION = ["cle", "compte_de_service_google"] as const;
export type ModeDAuthentification = (typeof MODES_D_AUTHENTIFICATION)[number];

export function modeDAuthentification(
  env: Environnement,
): { connu: true; mode: ModeDAuthentification } | { connu: false; valeur: string } {
  const valeur = lire(env, VARIABLE_AUTH_COMPATIBLE).toLowerCase();
  if (valeur === "") return { connu: true, mode: "cle" };
  return (MODES_D_AUTHENTIFICATION as readonly string[]).includes(valeur)
    ? { connu: true, mode: valeur as ModeDAuthentification }
    : { connu: false, valeur };
}


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

/**
 * Les variables sans lesquelles aucun appel ne part, dans cette
 * configuration : le fournisseur compatible authentifié par un compte de
 * service Google n'a pas de clé fixe, et n'en demande donc pas.
 */
export function variablesExigees(env: Environnement, code: CodeFournisseur): readonly string[] {
  const auth = modeDAuthentification(env);
  if (code === "openai_compatible" && auth.connu && auth.mode === "compte_de_service_google") {
    return FOURNISSEURS.openai_compatible.variables.filter((v) => v !== "AI_OPENAI_API_KEY");
  }
  return FOURNISSEURS[code].variables;
}

/** Ce qui manque pour qu'un fournisseur puisse être appelé, ou `null`. */
export function manqueDuFournisseur(env: Environnement, code: CodeFournisseur): string | null {
  if (code === "openai_compatible") {
    const auth = modeDAuthentification(env);
    if (!auth.connu) {
      return `${VARIABLE_AUTH_COMPATIBLE} vaut « ${auth.valeur} » : écrire ${MODES_D_AUTHENTIFICATION.join(" ou ")}, ou vider la variable pour une clé d'API`;
    }
  }
  const absentes = variablesExigees(env, code).filter((v) => lire(env, v) === "");
  if (absentes.length > 0) return `renseigner ${absentes.join(", ")}`;
  if (code !== "openai_compatible") return null;

  if (adresseDeBase(lire(env, "AI_OPENAI_URL")) === null) {
    return "AI_OPENAI_URL doit être une adresse https (http n'est admis que sur la boucle locale)";
  }
  const pdf = formeDuPdf(env);
  if (!pdf.connue) {
    return `${VARIABLE_PDF_COMPATIBLE} vaut « ${pdf.valeur} » : écrire oui (OpenAI), document_url (Mistral), image_url (Vertex AI) ou non`;
  }
  const raisonnement = niveauDeRaisonnement(env);
  if (!raisonnement.connu) {
    return `${VARIABLE_RAISONNEMENT_COMPATIBLE} vaut « ${raisonnement.valeur} » : écrire ${NIVEAUX_DE_RAISONNEMENT.join(", ")}, ou vider la variable pour laisser le défaut du fournisseur`;
  }
  const auth = modeDAuthentification(env);
  if (auth.connu && auth.mode === "compte_de_service_google") {
    const compte = lireCompteDeService(env[VARIABLE_COMPTE_DE_SERVICE]);
    if (!compte.ok) return MOTIF_DU_COMPTE[compte.defaut];
  }
  return null;
}

/**
 * Une origine déclarée : `https://hôte[:port]`, sans chemin, sans
 * paramètre ni identifiant — ou `null`. Les mêmes schémas qu'une adresse
 * de base : https, ou http sur la boucle locale seulement.
 */
export function origineDeclaree(valeur: string): string | null {
  const url = adresseDeBase(valeur);
  if (!url) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  return url.origin;
}

/** Les pièces peuvent-elles partir chez ce fournisseur, et sinon pourquoi. */
export type AutorisationDesPieces = { autorisee: true } | { autorisee: false; raison: string };

/**
 * L'autorisation d'envoyer des pièces d'identité — RG-06.7, S.171.
 *
 * Anthropic, sous-traitant par défaut, n'en demande pas. Un fournisseur
 * compatible en demande deux : son code dans `AI_PIECES_SOUS_TRAITANT_AUTORISE`,
 * et l'origine validée dans `AI_OPENAI_ORIGINE_AUTORISEE`, égale à celle
 * de `AI_OPENAI_URL`. Chaque refus dit quoi poser, et par qui.
 */
export function autorisationDesPieces(env: Environnement, code: CodeFournisseur): AutorisationDesPieces {
  if (code === FOURNISSEUR_PAR_DEFAUT) return { autorisee: true };
  const ecrite = lire(env, VARIABLE_AUTORISATION_PIECES);
  if (ecrite.toLowerCase() !== code) {
    return {
      autorisee: false,
      /*
        La valeur écrite est citée quand elle n'est pas le code — 06/10/2026.
        `oui` posé en production laissait la lecture non branchée, et rien ne
        disait que la variable attend le **code** du sous-traitant autorisé :
        un « oui » ne dit pas lequel, et une autorisation doit le dire.
      */
      raison:
        ecrite === ""
          ? `les pièces d'identité ne partent chez ${FOURNISSEURS[code].libelle} qu'une fois la sous-traitance tranchée : ${VARIABLE_AUTORISATION_PIECES}=${code}, posée par qui a validé la conformité`
          : `${VARIABLE_AUTORISATION_PIECES} vaut « ${ecrite} » : elle attend le code du sous-traitant autorisé, ici ${code}, et non une approbation générale`,
    };
  }

  const actuelle = adresseDeBase(lire(env, "AI_OPENAI_URL"))?.origin ?? null;
  const declaree = lire(env, VARIABLE_ORIGINE_AUTORISEE);
  if (declaree === "") {
    return {
      autorisee: false,
      raison: `l'autorisation ne désigne aucune société : ${VARIABLE_ORIGINE_AUTORISEE}=${actuelle ?? "<origine de AI_OPENAI_URL>"}, l'origine du sous-traitant validé, posée par qui a validé la conformité`,
    };
  }
  const origine = origineDeclaree(declaree);
  if (origine === null) {
    return {
      autorisee: false,
      raison: `${VARIABLE_ORIGINE_AUTORISEE} contient une valeur qui n'est pas une origine : écrire https://hôte, sans chemin ni identifiant`,
    };
  }
  if (actuelle !== origine) {
    return {
      autorisee: false,
      raison: `AI_OPENAI_URL désigne ${actuelle ?? "une adresse illisible"}, mais la sous-traitance a été validée pour ${origine} : les pièces ne partent pas tant que l'autorisation n'a pas été revue pour la nouvelle adresse`,
    };
  }
  return { autorisee: true };
}

/** Des pièces d'identité peuvent-elles partir chez ce fournisseur ? */
export const piecesAutoriseesChez = (env: Environnement, code: CodeFournisseur): boolean =>
  autorisationDesPieces(env, code).autorisee;

/** Ce fournisseur lit-il les PDF, dans cette configuration ? */
export function litLesPdf(env: Environnement, code: CodeFournisseur): boolean {
  const lit = FOURNISSEURS[code].lit.pdf;
  if (lit === "selon_configuration") {
    const pdf = formeDuPdf(env);
    return pdf.connue && pdf.forme !== null;
  }
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
    const autorisation = fonction === "extraction" ? autorisationDesPieces(env, code) : null;
    const interdit = autorisation && !autorisation.autorisee ? autorisation.raison : null;
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
  appelsARapprocher?: number;
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

export const MENTION_CONTREPARTIE_EN_JETONS =
  "Les packs se consomment en analyses ; leur contrepartie en jetons sert de repère de marge. Un jeton n'a pas la même taille d'un fournisseur à l'autre : l'écart se lit dans le tableau ci-dessous.";
