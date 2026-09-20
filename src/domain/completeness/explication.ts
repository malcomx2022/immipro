/**
 * Ce que la complétude pèse, dit en clair — L.A, décision produit
 * provisoire du 20/09/2026.
 *
 * L'article 20 (portabilité) ne couvre que les données fournies par la
 * personne ; l'article 15 (accès) ne fait pas cette distinction, et
 * l'information sur la logique d'un traitement automatisé est encore autre
 * chose. L'arbitrage entre les trois ne relève pas de l'équipe produit, et
 * **il reste soumis à validation juridique avant lancement.**
 *
 * Ce que la décision tranche en attendant : l'export porte les données
 * fournies, les résultats effectivement utilisés, le palier, le
 * dénombrement, et **une explication intelligible des principaux
 * facteurs** — sans réintroduire le nombre que C-09 a retiré, et sans
 * restituer le barème comme s'il s'agissait d'une donnée personnelle
 * brute.
 *
 * **L'explication décrit le calcul qui décide, pas celui que le document
 * décrit.** WF-07 énumère quatre composantes pondérées ; le palier montré
 * au candidat n'en pèse qu'une. Les conditions chiffrées sont reportées
 * sur la pièce qui les porte, et la cohérence comme la qualité
 * rédactionnelle sont neutres dans ce calcul-là. Réciter les quatre aurait
 * été plus flatteur et faux : quelqu'un qui lit « la cohérence entre tes
 * pièces compte » en tire une conclusion sur un calcul qui ne la regarde
 * pas.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

import type { CompletenessPublic } from "./score";

export interface ExplicationCompletude {
  /** Ce qui décide du palier, du plus au moins déterminant. */
  ceQuiDecide: readonly string[];
  /** Ce que le référentiel prévoit et qui ne pèse pas ici, avec la raison. */
  ceQuiNePesePas: readonly string[];
  /** Ce qui pèse sur ce dossier précis, en clair. */
  surTonDossier: readonly string[];
  /** Ce que la complétude n'est pas (INV-1). */
  horsCalcul: string;
  /** Ce que l'export ne restitue pas, et pourquoi. */
  limite: string;
}

/**
 * Les facteurs, dans l'ordre où ils pèsent. L'ordre est l'information :
 * il dit lequel déplace le palier, sans donner la pondération — qui n'est
 * ni une donnée fournie par la personne, ni nécessaire pour comprendre.
 */
export const CE_QUI_DECIDE: readonly string[] = [
  "L'état de chaque pièce obligatoire de ta checklist. C'est le facteur principal : tant qu'il en manque une, le dossier reste incomplet, quoi que disent les autres.",
  "L'état des pièces complémentaires. Elles ne bloquent rien ; elles font la différence entre « presque complet » et « complet ».",
];

export const CE_QUI_NE_PESE_PAS: readonly string[] = [
  "Les conditions chiffrées de la destination — durée de validité d'un passeport, montant de ressources à prouver. Elles sont vérifiées pièce par pièce, et leur résultat est le verdict de la pièce concernée, que cet export contient.",
  "La cohérence entre tes pièces et la qualité rédactionnelle de tes textes. Le référentiel les prévoit ; elles n'entrent pas dans le palier qui t'est montré aujourd'hui.",
];

export const HORS_CALCUL =
  "La complétude mesure ce qui manque à ton dossier. Elle ne dit rien de la décision de l'administration du pays de destination, qui n'appartient qu'à elle.";

/**
 * La limite de la restitution, énoncée plutôt que passée sous silence.
 *
 * Elle est vérifiable par qui lit le fichier : l'ordre des manques est le
 * seul effet visible de la pondération, et il est dans l'export.
 */
export const LIMITE_DE_LA_RESTITUTION =
  "La pondération interne des facteurs n'est pas restituée ici. Son seul effet visible est l'ordre dans lequel les manques te sont présentés, et cet ordre figure dans l'export.";

/**
 * L'explication d'un dossier. Les phrases de situation sortent des
 * compteurs et des manques déjà calculés : aucune n'est réécrite ici, pour
 * qu'un message d'échec reste celui que le candidat a lu à l'écran.
 */
export function expliquerLaCompletude(
  completude: CompletenessPublic,
): ExplicationCompletude {
  return {
    ceQuiDecide: CE_QUI_DECIDE,
    ceQuiNePesePas: CE_QUI_NE_PESE_PAS,
    surTonDossier: surTonDossier(completude),
    horsCalcul: HORS_CALCUL,
    limite: LIMITE_DE_LA_RESTITUTION,
  };
}

function surTonDossier(completude: CompletenessPublic): string[] {
  const { obligatoiresManquantes, facultativesManquantes, conformes } =
    completude.compteurs;

  const phrases = [
    majuscule(
      `${nombre(conformes)} pièce${pluriel(conformes)} conforme${pluriel(conformes)} à ce jour.`,
    ),
  ];

  if (obligatoiresManquantes > 0) {
    phrases.push(
      majuscule(
        `${nombre(obligatoiresManquantes)} pièce${pluriel(obligatoiresManquantes)} obligatoire${pluriel(obligatoiresManquantes)} manque${obligatoiresManquantes > 1 ? "nt" : ""} : c'est ce qui tient le palier à « incomplet ».`,
      ),
    );
  }
  if (facultativesManquantes > 0) {
    phrases.push(
      majuscule(
        `${nombre(facultativesManquantes)} pièce${pluriel(facultativesManquantes)} complémentaire${pluriel(facultativesManquantes)} reste${facultativesManquantes > 1 ? "nt" : ""} à traiter.`,
      ),
    );
  }
  if (obligatoiresManquantes === 0 && facultativesManquantes === 0) {
    phrases.push("Rien ne manque : le palier ne peut pas monter plus haut.");
  }
  return phrases;
}

const pluriel = (n: number) => (n > 1 ? "s" : "");

/**
 * Les nombres sont écrits en lettres, et une phrase commence par une
 * majuscule. Sans elle, l'export s'ouvrait sur « une pièce conforme à ce
 * jour. » — seul énoncé du fichier à commencer en minuscule, ce qui se
 * lit comme un fragment plutôt que comme une phrase.
 */
const majuscule = (texte: string) => texte.charAt(0).toUpperCase() + texte.slice(1);

/** Les petits nombres en toutes lettres, comme partout ailleurs dans le produit. */
const MOTS = ["aucune", "une", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"];
const nombre = (n: number) => (n < MOTS.length ? MOTS[n]! : String(n));
