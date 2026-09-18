import type { Mention } from "@/domain/destinations/fiche";

/**
 * Contenu éditorial — guides pays (P-05) et articles (P-07).
 *
 * Même statut provisoire que les fiches destination : le contenu viendra
 * d'un back-office de publication. Les textes sont ceux du prototype, qui
 * sont définitifs, et chacun porte sa mention de source (INV-8).
 */

export type Bloc =
  | { type: "paragraphe"; texte: string }
  | { type: "intertitre"; texte: string }
  | { type: "encadre"; titre: string; texte: string }
  | { type: "citation"; texte: string }
  | { type: "liste"; items: readonly string[] };

export interface AppelAction {
  titre: string;
  texte: string;
  action: string;
  href: string;
}

export interface Guide {
  slug: string;
  pays: string;
  titre: string;
  chapeau: string;
  /** Ancres du sommaire, dans l'ordre des intertitres. */
  sommaire: readonly string[];
  blocs: readonly Bloc[];
  appel: AppelAction;
  mention: Mention;
  mentionSuite: string;
}

export interface Article {
  slug: string;
  rubrique: string;
  dureeLecture: string;
  titre: string;
  auteur: string;
  publieLe: string;
  chapeau: string;
  blocs: readonly Bloc[];
  appel: AppelAction;
  mention: Mention;
  mentionSuite: string;
}

const VERIFIE_LE = "2026-09-11";

const GUIDE_PAYS_BAS: Guide = {
  slug: "pays-bas",
  pays: "Pays-Bas",
  titre: "Étudier aux Pays-Bas depuis le Bénin",
  chapeau:
    "Ce que coûte l'année, ce qu'il faut prouver, et ce qui se passe après le diplôme. Mis à jour le 11 septembre 2026.",
  // Le prototype annonce en plus « Le permis de recherche d'emploi », dont
  // le corps du guide ne contient aucune section : l'entrée produirait un
  // lien mort. Elle revient quand la section est écrite — le test
  // `sommaire des guides` échoue si l'une des deux manque à l'autre.
  sommaire: [
    "Le budget réel de la première année",
    "Les bourses ouvertes aux candidats béninois",
    "Les erreurs qui coûtent un refus",
  ],
  blocs: [
    { type: "intertitre", texte: "Le budget réel de la première année" },
    {
      type: "paragraphe",
      texte:
        "Les frais de scolarité d'une licence en université de sciences appliquées vont de 8 000 à 12 000 € par an pour un candidat hors Union européenne. À cela s'ajoutent le logement, entre 450 et 700 € par mois selon la ville, et l'assurance obligatoire.",
    },
    {
      type: "paragraphe",
      texte:
        "Le montant que l'administration demande de prouver, 1 130,77 € par mois sur douze mois, ne couvre que la vie courante. Il ne remplace pas les frais de scolarité, qui se paient en plus.",
    },
    {
      type: "encadre",
      titre: "Ce que la ville change",
      texte:
        "À Groningue ou Enschede, le logement descend à 400 € par mois. À Amsterdam, comptez le double et une recherche de plusieurs mois.",
    },
    { type: "intertitre", texte: "Les bourses ouvertes aux candidats béninois" },
    {
      type: "paragraphe",
      texte:
        "Le programme Orange Knowledge a fermé en 2024. Restent les bourses d'établissement, décidées par chaque université, et la bourse Holland Scholarship de 5 000 € versée la première année seulement.",
    },
    {
      type: "paragraphe",
      texte:
        "Les dossiers de bourse se déposent en même temps que la candidature académique, entre octobre et février selon l'établissement. Une bourse obtenue réduit le montant de ressources à prouver d'autant.",
    },
    { type: "intertitre", texte: "Les erreurs qui coûtent un refus" },
    {
      type: "paragraphe",
      texte:
        "Trois causes reviennent : un passeport dont la validité ne couvre pas six mois après le retour, un relevé bancaire de plus de trois mois, et des relevés de notes non traduits par un traducteur assermenté.",
    },
  ],
  appel: {
    titre: "Voir si les Pays-Bas te correspondent",
    texte: "Six questions, aucun compte à créer.",
    action: "Lancer le simulateur",
    href: "/simulateur",
  },
  mention: { source: "ind.nl, studyinnl.org, nuffic.nl", verifieeLe: VERIFIE_LE },
  mentionSuite: "Ce guide est informatif et ne constitue pas un conseil juridique.",
};

export const GUIDES: readonly Guide[] = [GUIDE_PAYS_BAS];

const ARTICLE_RELEVE: Article = {
  slug: "releve-bancaire-quatre-mois",
  rubrique: "Blog · Dossier",
  dureeLecture: "6 min",
  titre: "Pourquoi un relevé bancaire de quatre mois fait tomber un dossier",
  auteur: "Rédaction ImmiPro",
  publieLe: "2026-09-11",
  chapeau:
    "La règle tient en une phrase : le relevé doit avoir moins de trois mois au moment de l'instruction, pas au moment où tu le télécharges.",
  blocs: [
    {
      type: "paragraphe",
      texte:
        "Entre le téléchargement du relevé et l'examen du dossier, il s'écoule en général six à dix semaines : constitution des pièces, traduction, prise de rendez-vous, puis instruction. Un relevé daté du 2 janvier déposé le 15 mars est encore valable. Le même relevé déposé le 20 avril ne l'est plus.",
    },
    {
      type: "citation",
      texte:
        "Le refus le plus fréquent n'est pas un refus de fond. C'est une pièce qui a vieilli pendant que le dossier se constituait.",
    },
    { type: "intertitre", texte: "Ce qu'il faut faire à la place" },
    {
      type: "paragraphe",
      texte:
        "Réunis d'abord les pièces qui ne périment pas : diplômes, relevés de notes, traductions assermentées. Le relevé bancaire et l'attestation de ressources se demandent en dernier, une fois le rendez-vous de dépôt obtenu.",
    },
    { type: "intertitre", texte: "Les trois pièces qui périment" },
    {
      type: "liste",
      items: [
        "Relevé bancaire — trois mois",
        "Casier judiciaire — trois à six mois selon le pays",
        "Certificat médical — trois mois, parfois un mois",
      ],
    },
  ],
  appel: {
    titre: "L'échéancier le fait pour toi",
    texte:
      "ImmiPro calcule la date à laquelle demander chaque pièce périssable, à partir de ta date de dépôt visée.",
    action: "Ouvrir un dossier",
    href: "/inscription",
  },
  mention: { source: "ind.nl, canada.ca", verifieeLe: VERIFIE_LE },
  mentionSuite: "Cet article est informatif et ne constitue pas un conseil juridique.",
};

export const ARTICLES: readonly Article[] = [ARTICLE_RELEVE];

export const guideParPays = (pays: string) => GUIDES.find((g) => g.slug === pays);
export const articleParSlug = (slug: string) => ARTICLES.find((a) => a.slug === slug);
