import type { EditorialDoc } from "@prisma/client";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import {
  corpsSchema,
  dureeLecture,
  sommaireDe,
  MENTION_SUITE,
  verifierLeDocument,
  type Corps,
  type EtatDocument,
  type FauteEditoriale,
  type GenreDocument,
} from "@/domain/editorial/document";

/**
 * Lecture des documents éditoriaux — P-05, P-07 et B-08.
 *
 * Une assemblée, deux entrées, et la différence tient en un mot : le public
 * ne voit que `PUBLIE`, et **le filtrage est dans la requête**. Un document
 * retiré qui arriverait jusqu'à l'écran pour y être masqué serait déjà sorti
 * de la base, et une erreur d'affichage suffirait à le montrer.
 *
 * Le corps est validé à la lecture comme à l'écriture. Une colonne `Json`
 * n'a pas de forme : celle d'hier n'est pas garantie d'être celle
 * d'aujourd'hui, et un guide dont le corps ne se relit plus vaut mieux
 * absent qu'à moitié rendu.
 */

const iso = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

export interface DocumentPublic {
  genre: GenreDocument;
  slug: string;
  titre: string;
  chapeau: string;
  corps: Corps;
  /** Calculé depuis les intertitres, jamais saisi. */
  sommaire: readonly string[];
  /** Calculé depuis le nombre de mots. */
  dureeLecture: string;
  mention: { source: string; verifieeLe: string };
  mentionSuite: string;
  /** Guide seulement. */
  pays: string | null;
  /** Article seulement. */
  rubrique: string | null;
  auteur: string | null;
  publieLe: string | null;
}

function versPublic(doc: EditorialDoc): DocumentPublic | null {
  const lu = corpsSchema.safeParse(doc.body);
  if (!lu.success) {
    // Un corps illisible ne se rend pas à moitié. Il est journalisé pour
    // que quelqu'un le voie, et la page répond « introuvable ».
    console.error(`[editorial] corps illisible — ${doc.kind}/${doc.slug}`, lu.error.issues);
    return null;
  }
  const genre = doc.kind as GenreDocument;
  return {
    genre,
    slug: doc.slug,
    titre: doc.title,
    chapeau: doc.standfirst,
    corps: lu.data,
    sommaire: sommaireDe(lu.data.blocs),
    dureeLecture: dureeLecture(lu.data.blocs),
    // La contrainte `editorial_publie_porte_sa_source` garantit les deux
    // sur un document publié : le repli ne sert que si l'on vient à lire
    // un brouillon depuis l'aperçu du back-office.
    mention: { source: doc.sourceLabel ?? "—", verifieeLe: iso(doc.verifiedAt) ?? "—" },
    mentionSuite: MENTION_SUITE[genre],
    pays: doc.countryLabel,
    rubrique: doc.section,
    auteur: doc.author,
    publieLe: iso(doc.publishedAt),
  };
}

/** Le document servi au public. `null` hors publication — INV-4, même esprit. */
export async function documentPublie(
  genre: GenreDocument,
  slug: string,
): Promise<DocumentPublic | null> {
  const doc = await db.editorialDoc.findFirst({
    where: { kind: genre, slug, status: "PUBLIE" },
  });
  return doc ? versPublic(doc) : null;
}

/**
 * Les adresses publiées d'un genre, pour le plan du site et les liens
 * internes. Jamais pour `generateStaticParams` : le build se fait en
 * intégration continue, sans base de données (J.8).
 */
export async function adressesPubliees(genre: GenreDocument): Promise<readonly string[]> {
  const docs = await db.editorialDoc.findMany({
    where: { kind: genre, status: "PUBLIE" },
    select: { slug: true },
    orderBy: { publishedAt: "desc" },
  });
  return docs.map((d) => d.slug);
}

// ── Back-office ──────────────────────────────────────────────────────────

export interface LigneDocument {
  id: string;
  genre: GenreDocument;
  etat: EtatDocument;
  slug: string;
  titre: string;
  /** Ce qui bloque la publication, compté pour la liste. */
  fautes: number;
  source: string | null;
  verifieeLe: string | null;
  publieLe: string | null;
  modifieLe: string;
}

/** B-08 — la liste, tous genres et tous états confondus. */
export async function documentsEditoriaux(): Promise<LigneDocument[]> {
  const docs = await db.editorialDoc.findMany({
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 200,
  });

  return docs.map((doc) => {
    const lu = corpsSchema.safeParse(doc.body);
    return {
      id: doc.id,
      genre: doc.kind as GenreDocument,
      etat: doc.status as EtatDocument,
      slug: doc.slug,
      titre: doc.title,
      fautes: lu.success
        ? verifierLeDocument({ titre: doc.title, chapeau: doc.standfirst }, lu.data).length
        : 0,
      source: doc.sourceLabel,
      verifieeLe: iso(doc.verifiedAt),
      publieLe: iso(doc.publishedAt),
      modifieLe: doc.updatedAt.toISOString(),
    };
  });
}

export interface DocumentEnEdition extends LigneDocument {
  chapeau: string;
  corps: Corps | null;
  pays: string | null;
  rubrique: string | null;
  auteur: string | null;
  /** Le détail de ce qui bloque, avec le champ où le corriger. */
  refus: readonly FauteEditoriale[];
  /** Dérivés, montrés en lecture seule pour qu'on voie ce qu'ils valent. */
  sommaire: readonly string[];
  duree: string | null;
}

export async function documentPourEdition(id: string): Promise<DocumentEnEdition> {
  const doc = await db.editorialDoc.findUnique({ where: { id } });
  if (!doc) throw echec("introuvable");

  const lu = corpsSchema.safeParse(doc.body);
  const corps = lu.success ? lu.data : null;
  const refus = corps
    ? verifierLeDocument({ titre: doc.title, chapeau: doc.standfirst }, corps)
    : [];

  return {
    id: doc.id,
    genre: doc.kind as GenreDocument,
    etat: doc.status as EtatDocument,
    slug: doc.slug,
    titre: doc.title,
    chapeau: doc.standfirst,
    corps,
    fautes: refus.length,
    refus,
    sommaire: corps ? sommaireDe(corps.blocs) : [],
    duree: corps ? dureeLecture(corps.blocs) : null,
    source: doc.sourceLabel,
    verifieeLe: iso(doc.verifiedAt),
    pays: doc.countryLabel,
    rubrique: doc.section,
    auteur: doc.author,
    publieLe: iso(doc.publishedAt),
    modifieLe: doc.updatedAt.toISOString(),
  };
}
