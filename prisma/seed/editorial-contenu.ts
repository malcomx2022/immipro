import type { PrismaClient } from "@prisma/client";
import { corpsSchema } from "../../src/domain/editorial/document";

/**
 * Contenus éditoriaux de départ — J.C, B-08.
 *
 * Les deux documents du prototype, repris tels quels depuis
 * `src/lib/contenu/editorial.ts`, qui n'existe plus : ils sont maintenant
 * des lignes que le back-office relit et republie, comme les suivants.
 *
 * Ce qui a changé en route, et seulement cela : le sommaire du guide n'est
 * plus écrit à côté des intertitres — il s'en déduit —, et la durée de
 * lecture de l'article n'est plus une constante. Le prototype annonçait au
 * sommaire « Le permis de recherche d'emploi », section que le corps ne
 * contenait pas ; l'entrée disparaît d'elle-même, sans qu'un test ait à la
 * surveiller.
 *
 * Deux modes, selon qui l'appelle (S.120) :
 *
 * - `ecraser: true` (`npm run seed:editorial`, développement) : relancé, il
 *   remet les textes d'origine sans dupliquer les lignes ni perdre l'état de
 *   publication d'un document déjà retiré.
 * - `ecraser: false` (`dist/graine-editoriale.mjs`, production) : il ne crée
 *   que les lignes absentes. Un document existant — retouché, republié ou
 *   dépublié en B-08 — n'est jamais relu ni réécrit.
 */

const VERIFIE_LE = new Date("2026-09-11T00:00:00Z");

const GUIDE_PAYS_BAS = {
  kind: "GUIDE" as const,
  slug: "pays-bas",
  countryLabel: "Pays-Bas",
  title: "Étudier aux Pays-Bas depuis le Bénin",
  standfirst:
    "Ce que coûte l'année, ce qu'il faut prouver, et ce qui se passe après le diplôme.",
  sourceLabel: "ind.nl, studyinnl.org, nuffic.nl",
  body: {
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
  },
};

const ARTICLE_RELEVE = {
  kind: "ARTICLE" as const,
  slug: "releve-bancaire-quatre-mois",
  section: "Blog · Dossier",
  author: "Rédaction ImmiPro",
  title: "Pourquoi un relevé bancaire de quatre mois fait tomber un dossier",
  standfirst:
    "La règle tient en une phrase : le relevé doit avoir moins de trois mois au moment de l'instruction, pas au moment où tu le télécharges.",
  sourceLabel: "ind.nl, canada.ca",
  body: {
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
  },
};

export type IssueGraine = { kind: string; slug: string; issue: "cree" | "mis_a_jour" | "laisse" };

export async function chargerEditorial(
  db: PrismaClient,
  options: { ecraser: boolean },
): Promise<IssueGraine[]> {
  const issues: IssueGraine[] = [];
  for (const document of [GUIDE_PAYS_BAS, ARTICLE_RELEVE]) {
    // Le corps passe par le même schéma que l'écran d'édition : une graine
    // qui produirait un document illisible serait pire qu'une base vide.
    const corps = corpsSchema.parse(document.body);
    const commun = {
      title: document.title,
      standfirst: document.standfirst,
      body: corps,
      sourceLabel: document.sourceLabel,
      verifiedAt: VERIFIE_LE,
      countryLabel: "countryLabel" in document ? document.countryLabel : null,
      section: "section" in document ? document.section : null,
      author: "author" in document ? document.author : null,
    };
    const cle = { kind_slug: { kind: document.kind, slug: document.slug } };
    const existant = await db.editorialDoc.findUnique({ where: cle, select: { id: true } });

    if (existant && !options.ecraser) {
      issues.push({ kind: document.kind, slug: document.slug, issue: "laisse" });
      continue;
    }
    await db.editorialDoc.upsert({
      where: cle,
      update: commun,
      create: {
        ...commun,
        kind: document.kind,
        slug: document.slug,
        status: "PUBLIE",
        publishedAt: VERIFIE_LE,
      },
    });
    issues.push({ kind: document.kind, slug: document.slug, issue: existant ? "mis_a_jour" : "cree" });
  }
  return issues;
}

