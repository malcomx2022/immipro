import { z } from "zod";
import {
  INTERDITS_ECRAN_CANDIDAT,
  verifierTexte,
} from "@/domain/copy/vocabulaire-interdit";

/**
 * Documents éditoriaux — guides pays (P-05) et articles (P-07), B-08.
 *
 * Les deux écrans publics lisaient un fichier du dépôt. Un guide ne se
 * changeait donc pas sans un développeur, un déploiement et une relecture
 * de code — et surtout, le vocabulaire interdit ne protégeait personne là
 * où `CLAUDE.md` promet qu'il protège : « un administrateur qui saisit une
 * promesse dans un guide pays bute sur la même règle qu'un développeur, et
 * sa publication est bloquée tant que la formulation est refusée. » Cette
 * phrase décrivait un dispositif qui n'existait pas, faute d'écran où
 * saisir un guide.
 *
 * Deux règles de forme, et elles ne sont pas décoratives :
 *
 * **Rien de dérivable n'est saisi.** Le sommaire d'un guide était une liste
 * écrite à la main à côté des intertitres, et un test existait pour vérifier
 * qu'elle leur correspondait — la preuve que la duplication coûtait déjà.
 * Il se calcule. La durée de lecture aussi : annoncer « 6 min » sur un texte
 * qu'on a rallongé depuis est un petit mensonge que personne ne corrige.
 *
 * **Rien ne se publie sans sa source et sa date** (INV-8). Le type l'exige,
 * et la base le refuse aussi.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type GenreDocument = "GUIDE" | "ARTICLE";
export type EtatDocument = "BROUILLON" | "PUBLIE" | "RETIRE";

export const LIBELLE_GENRE: Record<GenreDocument, string> = {
  GUIDE: "Guide pays",
  ARTICLE: "Article",
};

export const LIBELLE_ETAT: Record<EtatDocument, string> = {
  BROUILLON: "Brouillon",
  PUBLIE: "Publié",
  RETIRE: "Retiré",
};

/** Seul un document publié est servi au public. Le filtrage est en requête. */
export const estPublic = (etat: EtatDocument): boolean => etat === "PUBLIE";

// ── Corps ────────────────────────────────────────────────────────────────

export const blocSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraphe"), texte: z.string().min(1) }),
  z.object({ type: z.literal("intertitre"), texte: z.string().min(1) }),
  z.object({ type: z.literal("encadre"), titre: z.string().min(1), texte: z.string().min(1) }),
  z.object({ type: z.literal("citation"), texte: z.string().min(1) }),
  z.object({ type: z.literal("liste"), items: z.array(z.string().min(1)).min(1) }),
]);

export type Bloc = z.infer<typeof blocSchema>;

export const appelSchema = z.object({
  titre: z.string().min(1),
  texte: z.string().min(1),
  action: z.string().min(1),
  /** Une adresse interne : un guide n'envoie pas ailleurs. */
  href: z.string().regex(/^\/[\w\-/]*$/u, "L'adresse doit être interne et commencer par « / »."),
});

export type AppelAction = z.infer<typeof appelSchema>;

export const corpsSchema = z.object({
  blocs: z.array(blocSchema).min(1),
  appel: appelSchema,
});

export type Corps = z.infer<typeof corpsSchema>;

// ── Ce qui se dérive, et ne se saisit donc pas ───────────────────────────

/**
 * Le sommaire d'un guide, tiré de ses intertitres.
 *
 * Il était saisi à côté d'eux, et le prototype s'était déjà trompé : il
 * annonçait « Le permis de recherche d'emploi », section que le corps ne
 * contenait pas — une entrée de sommaire qui ne menait nulle part.
 */
export const sommaireDe = (blocs: readonly Bloc[]): readonly string[] =>
  blocs.flatMap((b) => (b.type === "intertitre" ? [b.texte] : []));

/** Mots par minute d'une lecture attentive, sur un sujet administratif. */
export const MOTS_PAR_MINUTE = 200;

const motsDuBloc = (bloc: Bloc): number => {
  const texte =
    bloc.type === "liste"
      ? bloc.items.join(" ")
      : bloc.type === "encadre"
        ? `${bloc.titre} ${bloc.texte}`
        : bloc.texte;
  return texte.split(/\s+/u).filter(Boolean).length;
};

/**
 * « 6 min ». Arrondie au supérieur, jamais à zéro : un article d'une ligne
 * se lit en moins d'une minute, et « 0 min » se lirait comme une erreur.
 */
export const dureeLecture = (blocs: readonly Bloc[]): string =>
  `${Math.max(1, Math.round(blocs.reduce((n, b) => n + motsDuBloc(b), 0) / MOTS_PAR_MINUTE))} min`;

/**
 * La mention finale, par genre. Elle ne se saisit pas : c'est la même
 * phrase sur tous les documents du même genre, et la laisser à la main
 * garantit qu'un jour l'un d'eux ne l'aura pas (INV-1).
 */
export const MENTION_SUITE: Record<GenreDocument, string> = {
  GUIDE: "Ce guide est informatif et ne constitue pas un conseil juridique.",
  ARTICLE: "Cet article est informatif et ne constitue pas un conseil juridique.",
};

// ── Le point d'application du vocabulaire interdit ───────────────────────

export interface FauteEditoriale {
  /** Où corriger : « Chapeau », « Bloc 3 », « Appel à l'action · titre ». */
  chemin: string;
  extrait: string;
  raison: string;
}

/** Tous les textes d'un document qui s'affichent chez le candidat. */
export function textesDuDocument(
  document: { titre: string; chapeau: string },
  corps: Corps,
): readonly { chemin: string; texte: string }[] {
  const textes = [
    { chemin: "Titre", texte: document.titre },
    { chemin: "Chapeau", texte: document.chapeau },
  ];
  corps.blocs.forEach((bloc, i) => {
    const place = `Bloc ${i + 1}`;
    if (bloc.type === "liste") {
      bloc.items.forEach((item, j) => textes.push({ chemin: `${place} · item ${j + 1}`, texte: item }));
    } else if (bloc.type === "encadre") {
      textes.push({ chemin: `${place} · titre`, texte: bloc.titre });
      textes.push({ chemin: place, texte: bloc.texte });
    } else {
      textes.push({ chemin: place, texte: bloc.texte });
    }
  });
  textes.push({ chemin: "Appel à l'action · titre", texte: corps.appel.titre });
  textes.push({ chemin: "Appel à l'action", texte: corps.appel.texte });
  textes.push({ chemin: "Appel à l'action · bouton", texte: corps.appel.action });
  return textes;
}

/**
 * Validation à l'enregistrement — le point d'application que `CLAUDE.md`
 * annonçait et qui n'existait pas.
 *
 * Même liste que `check:copy` et que le test de l'interface candidat, même
 * reconnaissance de la négation : « ImmiPro ne garantit pas l'obtention du
 * visa » est exactement la phrase qu'un guide doit pouvoir écrire.
 */
export function verifierLeDocument(
  document: { titre: string; chapeau: string },
  corps: Corps,
): FauteEditoriale[] {
  const fautes: FauteEditoriale[] = [];
  for (const { chemin, texte } of textesDuDocument(document, corps)) {
    for (const faute of verifierTexte(texte, INTERDITS_ECRAN_CANDIDAT)) {
      fautes.push({ chemin, extrait: faute.extrait, raison: faute.raison });
    }
  }
  return fautes;
}

/**
 * Message de refus. Il cite la formulation exacte et dit où la corriger :
 * un rédacteur qui ne voit pas quel mot bloque réécrit tout au hasard.
 */
export const messageDeRefusEditorial = (faute: FauteEditoriale): string =>
  `« ${faute.extrait} » ne peut pas s'afficher chez le candidat — ${faute.raison}. Reformule « ${faute.chemin} ».`;

/** Rien ne se publie tant qu'un texte est refusé. */
export const publiable = (
  document: { titre: string; chapeau: string },
  corps: Corps,
): boolean => verifierLeDocument(document, corps).length === 0;

/**
 * Le slug, dérivé du titre à la création et figé ensuite.
 *
 * Figé parce qu'il est l'adresse publique : le changer casse les liens
 * entrants, qui sont tout l'intérêt d'un contenu de référencement.
 */
export const slugDe = (texte: string): string =>
  texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 80);

export const AIDE_SLUG =
  "L'adresse publique du document. Elle ne change plus après la première publication : un lien entrant qui tombe est un lecteur perdu.";

export const AIDE_SOURCE =
  "D'où vient l'information, et quand elle a été vérifiée. Affiché en bas du document (INV-8).";

export const MENTION_DERIVES =
  "Le sommaire et la durée de lecture se calculent depuis le corps : ils n'ont pas de champ, et ne peuvent donc pas le contredire.";

// ── Les index de rubrique — P.A ──────────────────────────────────────────

/**
 * Ce qu'une rubrique montre d'un document, sans son corps.
 *
 * `verifieeLe` et `publieLe` sont tous les deux là, parce que les deux
 * rubriques ne s'appuient pas sur la même date — voir `ordonner`.
 */
export interface EnTete {
  genre: GenreDocument;
  slug: string;
  titre: string;
  chapeau: string;
  /** Guide : le pays. Article : la rubrique. */
  surtitre: string;
  dureeLecture: string;
  verifieeLe: string;
  publieLe: string;
}

/**
 * L'ordre d'une rubrique, et ce n'est pas le même des deux côtés — c'était
 * la question que P.A laissait ouverte.
 *
 * **Un article est daté.** C'est du journalisme : le plus récent d'abord,
 * parce qu'un texte de l'an dernier sur une règle qui a changé depuis n'est
 * pas ce qu'on veut lire en premier.
 *
 * **Un guide ne l'est pas.** Il porte un pays, et celui qu'on cherche est
 * celui où l'on veut aller — pas le dernier écrit. Classer des guides par
 * date de publication, c'est mettre en tête celui qu'on a eu le temps de
 * rédiger, ce qui n'est une information sur rien. L'ordre alphabétique du
 * pays est neutre, et surtout prévisible : on sait où regarder avant
 * d'avoir lu.
 *
 * `localeCompare` en français, pour que « Émirats » se range à sa place et
 * non après « Suisse ».
 */
export function ordonner(entetes: readonly EnTete[], genre: GenreDocument): EnTete[] {
  const triees = [...entetes];
  if (genre === "ARTICLE") {
    return triees.sort((a, b) => b.publieLe.localeCompare(a.publieLe));
  }
  return triees.sort((a, b) => a.surtitre.localeCompare(b.surtitre, "fr"));
}

/**
 * La date qu'une rubrique affiche, et c'est la même distinction.
 *
 * Sur un guide, la date de publication ne dit rien de sa fiabilité : un
 * guide écrit il y a deux ans mais revérifié le mois dernier vaut mieux
 * qu'un guide publié le mois dernier et jamais relu depuis. C'est la date
 * de vérification qui compte, et c'est déjà celle qu'INV-8 impose en pied
 * de page. Sur un article, daté par nature, c'est la parution.
 */
export const DATE_AFFICHEE: Record<GenreDocument, { cle: "verifieeLe" | "publieLe"; libelle: string }> = {
  GUIDE: { cle: "verifieeLe", libelle: "Vérifié le" },
  ARTICLE: { cle: "publieLe", libelle: "Publié le" },
};

export const dateDeLaRubrique = (entete: EnTete): string =>
  entete[DATE_AFFICHEE[entete.genre].cle];

export const TITRE_RUBRIQUE: Record<GenreDocument, string> = {
  GUIDE: "Guides pays",
  ARTICLE: "Articles",
};

export const CHAPEAU_RUBRIQUE: Record<GenreDocument, string> = {
  GUIDE: "Ce que coûte une année, ce qu'il faut prouver, et les erreurs qui reviennent — destination par destination.",
  ARTICLE: "Des points de règle expliqués une fois, pour ne pas les découvrir au moment du dépôt.",
};

/**
 * Ce que dit une rubrique vide. Elle ne se présente pas comme une panne :
 * un site jeune n'a pas encore de guide, et c'est un état normal.
 */
export const RUBRIQUE_VIDE: Record<GenreDocument, string> = {
  GUIDE: "Aucun guide n'est publié pour l'instant. Les fiches destination, elles, sont à jour.",
  ARTICLE: "Aucun article n'est publié pour l'instant.",
};
