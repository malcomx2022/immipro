import { db } from "@/lib/db";
import { blocSchema, type Bloc } from "@/domain/editorial/document";
import { MODELES, PAGES_JURIDIQUES, type PageJuridique } from "@/domain/juridique/modeles";
import {
  etatDuTexte,
  messageDesManquantes,
  type EtatDuTexte,
  type VersionPubliee,
} from "@/domain/juridique/publication";
import { fautesDuRendu, rendre, variablesDuModele, type Rendu } from "@/domain/juridique/rendu";
import type { Valeurs } from "@/domain/juridique/variables";

/**
 * Lecture des textes juridiques — S.101.
 *
 * La page publique ne lit **que** la dernière version publiée : jamais le
 * modèle, jamais les variables du moment. Ce qu'un candidat lit est ce qui
 * a été validé, et c'est ce que la version garde.
 */

/** Les valeurs saisies dans le back-office. Une variable jamais saisie est absente. */
export async function valeursDesVariables(): Promise<Record<string, string>> {
  const lignes = await db.legalVariable.findMany();
  return Object.fromEntries(lignes.map((l) => [l.key, l.value]));
}

/** Ce que la page publique affiche. */
export interface TexteServi {
  page: PageJuridique;
  rang: number;
  titre: string;
  chapeau: string;
  blocs: Bloc[];
  publieLe: Date;
}

const blocsDe = (corps: unknown): Bloc[] => {
  if (!Array.isArray(corps)) return [];
  return corps.flatMap((b) => {
    const lu = blocSchema.safeParse(b);
    return lu.success ? [lu.data] : [];
  });
};

/** La version que la page publique sert, ou `null` : la page répond alors 404. */
export async function texteServi(page: PageJuridique): Promise<TexteServi | null> {
  const v = await db.legalPublication.findFirst({ where: { page }, orderBy: { rang: "desc" } });
  if (!v) return null;
  return {
    page,
    rang: v.rang,
    titre: v.title,
    chapeau: v.standfirst,
    blocs: blocsDe(v.body),
    publieLe: v.publishedAt,
  };
}

/**
 * Les pages publiées, avec leur numéro de version.
 *
 * C'est ce que lisent les liens (pied de page, cases d'acceptation) et
 * l'enregistrement de l'acceptation : une page jamais validée n'est ni
 * promise ni acceptée.
 */
export async function pagesPubliees(): Promise<Partial<Record<PageJuridique, number>>> {
  const lignes = await db.legalPublication.groupBy({ by: ["page"], _max: { rang: true } });
  const publiees: Partial<Record<PageJuridique, number>> = {};
  for (const l of lignes) {
    if ((PAGES_JURIDIQUES as readonly string[]).includes(l.page) && l._max.rang !== null) {
      publiees[l.page as PageJuridique] = l._max.rang;
    }
  }
  return publiees;
}

/** La dernière version d'une page, dans la forme que le domaine juge. */
export async function derniereVersion(page: PageJuridique): Promise<VersionPubliee | null> {
  const v = await db.legalPublication.findFirst({ where: { page }, orderBy: { rang: "desc" } });
  if (!v) return null;
  return {
    rang: v.rang,
    empreinte: v.templateHash,
    variables: (v.variables ?? {}) as Record<string, string>,
    relecteur: v.reviewer,
    relueLe: v.reviewedAt.toISOString().slice(0, 10),
  };
}

/* ------------------------------------------------------------------ *
 * Ce que montre le back-office.
 * ------------------------------------------------------------------ */

export interface VersionResumee {
  rang: number;
  genre: "VALIDATION" | "MISE_A_JOUR_VARIABLES";
  relecteur: string;
  relueLe: string;
  publieePar: string;
  motif: string;
  publieeLe: string;
}

export interface EtatDuTexteJuridique {
  page: PageJuridique;
  titre: string;
  adresse: string;
  etat: EtatDuTexte;
  /** Les variables que le texte emploie. */
  variables: readonly string[];
  /** Le texte tel qu'il serait publié maintenant, avec les valeurs saisies. */
  apercu: Pick<Rendu, "titre" | "chapeau" | "blocs">;
  /** Ce qui empêche de le valider, côté contenu ; l'attestation se vérifie à l'envoi. */
  manque: string | null;
  fautes: readonly string[];
  versions: readonly VersionResumee[];
}

export async function etatDesTextes(): Promise<{
  valeurs: Valeurs;
  textes: readonly EtatDuTexteJuridique[];
}> {
  const valeurs = await valeursDesVariables();
  const toutes = await db.legalPublication.findMany({
    orderBy: [{ page: "asc" }, { rang: "desc" }],
    select: {
      page: true,
      rang: true,
      kind: true,
      templateHash: true,
      reviewer: true,
      reviewedAt: true,
      publishedBy: true,
      reason: true,
      publishedAt: true,
    },
  });
  const auteurs = await db.user.findMany({
    where: { id: { in: [...new Set(toutes.map((v) => v.publishedBy))] } },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  const nom = (id: string) => {
    const u = auteurs.find((a) => a.id === id);
    return u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email : "compte supprimé";
  };

  const textes = PAGES_JURIDIQUES.map((page) => {
    const modele = MODELES[page];
    const versions = toutes.filter((v) => v.page === page);
    const rendu = rendre(modele, valeurs);
    return {
      page,
      titre: modele.titre,
      adresse: modele.adresse,
      etat: etatDuTexte(modele, versions[0] ? { empreinte: versions[0].templateHash } : null),
      variables: variablesDuModele(modele),
      apercu: { titre: rendu.titre, chapeau: rendu.chapeau, blocs: rendu.blocs },
      manque: rendu.manquantes.length > 0 ? messageDesManquantes(rendu.manquantes) : null,
      fautes: fautesDuRendu(rendu).map((f) => `« ${f.extrait} » : ${f.raison}`),
      versions: versions.map((v) => ({
        rang: v.rang,
        genre: v.kind,
        relecteur: v.reviewer,
        relueLe: v.reviewedAt.toISOString().slice(0, 10),
        publieePar: nom(v.publishedBy),
        motif: v.reason,
        publieeLe: v.publishedAt.toISOString(),
      })),
    } satisfies EtatDuTexteJuridique;
  });

  return { valeurs, textes };
}
