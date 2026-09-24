/**
 * Journal d'audit — B-06, WF-15.
 *
 * Écritures non modifiables, conservation cinq ans. Le journal ne comble
 * jamais une période vide : s'il n'affiche rien, il ne s'est rien passé —
 * et l'export d'une période vide reste possible, puisqu'il atteste
 * précisément cette absence.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

import type { ActeurLisible } from "./acteur";
import { nomDatable, nombre, texte, vide, type Cellule } from "@/domain/format/csv";
import { jourCivil } from "@/domain/format/fuseau";

export type CategorieAudit = "PAIEMENT" | "REGLE" | "ACCES_PIECE" | "COMPTE";

export const LIBELLE_CATEGORIE: Record<CategorieAudit, string> = {
  PAIEMENT: "Paiements",
  REGLE: "Règles",
  ACCES_PIECE: "Accès aux pièces",
  COMPTE: "Comptes",
};

export const CATEGORIES: readonly CategorieAudit[] = [
  "PAIEMENT",
  "REGLE",
  "ACCES_PIECE",
  "COMPTE",
];

export interface EcritureAudit {
  id: string;
  /** Horodatage, ISO. */
  horodatage: string;
  /**
   * Qui a agi — libellé lisible d'abord, identifiant durable ensuite
   * (arbitrage du 21/09/2026). Une chaîne unique ne pouvait pas porter
   * les deux, et c'est l'identifiant qui gagnait.
   */
  acteur: ActeurLisible;
  categorie: CategorieAudit;
  action: string;
  objet: string;
  /** Précision, y compris le motif déclaré pour un accès à une pièce. */
  detail: string;
  /** D'où vient l'écriture : back-office, webhook, tâche planifiée. */
  origine: string;
}

/** Durée de conservation des écritures, en années (WF-15). */
export const CONSERVATION_ANNEES = 5;

export const MENTION_IMMUABLE =
  `Écritures non modifiables, conservation ${CONSERVATION_ANNEES} ans. Aucune entrée ne peut être supprimée ni modifiée depuis l'interface.`;

export const MENTION_MOTIF_ACCES =
  "Les accès aux pièces d'un candidat apparaissent avec le motif déclaré.";

export interface Periode {
  /** Bornes incluses, ISO. */
  du: string;
  au: string;
}

/**
 * Le jour d'une écriture est celui du fuseau d'affichage, comme l'heure que
 * le journal écrit à côté. Pris sur les dix premiers caractères de l'ISO,
 * c'était le jour UTC : une écriture de 0 h 30 le 16, affichée « 16/09 ·
 * 00 h 30 », sortait d'une période « du 16 » et tombait dans celle du 15.
 */
const jourDe = (e: EcritureAudit) => jourCivil(new Date(e.horodatage));

const dansLaPeriode = (e: EcritureAudit, periode: Periode) =>
  jourDe(e) >= periode.du && jourDe(e) <= periode.au;

export function filtrerAudit(
  ecritures: readonly EcritureAudit[],
  periode: Periode,
  categories: readonly CategorieAudit[],
): EcritureAudit[] {
  return ecritures
    .filter((e) => dansLaPeriode(e, periode))
    .filter((e) => categories.length === 0 || categories.includes(e.categorie))
    .sort((a, b) => b.horodatage.localeCompare(a.horodatage));
}

export interface PeriodeVide {
  message: string;
  /** Première écriture postérieure, quand il y en a une. */
  suivante?: { horodatage: string; message: string };
  /** Catégorie dont le retrait ramènerait des écritures. */
  categorieExcluante?: CategorieAudit;
}

/**
 * Une période sans écriture se dit, et se distingue d'un filtre trop
 * étroit. Les deux affichent une table vide ; ils n'appellent pas le même
 * geste.
 */
export function diagnostiquerPeriode(
  ecritures: readonly EcritureAudit[],
  periode: Periode,
  categories: readonly CategorieAudit[],
  formaterMoment: (iso: string) => string,
): PeriodeVide | null {
  if (filtrerAudit(ecritures, periode, categories).length > 0) return null;

  const sansCategorie = filtrerAudit(ecritures, periode, []);
  if (categories.length > 0 && sansCategorie.length > 0) {
    return {
      message: `Aucune écriture ${categories.map((c) => LIBELLE_CATEGORIE[c].toLowerCase()).join(", ")} sur cette période`,
      categorieExcluante: categories[0],
    };
  }

  const categorie = categories[0];
  const libelle = categorie ? ` ${LIBELLE_CATEGORIE[categorie].toLowerCase()}` : "";
  const suivante = [...ecritures]
    .filter((e) => jourDe(e) > periode.au)
    .filter((e) => categories.length === 0 || categories.includes(e.categorie))
    .sort((a, b) => a.horodatage.localeCompare(b.horodatage))[0];

  return {
    message: `Aucune écriture${libelle} entre le ${periode.du} et le ${periode.au}`,
    suivante: suivante
      ? {
          horodatage: suivante.horodatage,
          message: `La première écriture${libelle} suivante date du ${formaterMoment(suivante.horodatage)}. Le journal ne comble jamais une période vide : s'il n'affiche rien, il ne s'est rien passé.`,
        }
      : undefined,
  };
}

export const MENTION_EXPORT_VIDE =
  "L'export d'une période vide reste possible : il produit un fichier attestant l'absence d'écriture.";

// ── L'export de la période — ce que la mention promettait ──────────────

/**
 * L'export existe enfin.
 *
 * `MENTION_EXPORT_VIDE` promettait depuis le début qu'« exporter une
 * période vide produit un fichier attestant l'absence d'écriture ». Le
 * bouton n'était relié à rien : la promesse la plus précise de l'écran
 * était celle qu'aucune ligne de code ne tenait.
 *
 * Une attestation d'absence n'est pas un fichier vide. Un fichier vide se
 * confond avec un export qui a échoué, et c'est l'inverse de ce qu'un
 * contrôle demande : il demande une pièce qui dit « sur cette période, ce
 * périmètre, rien ». D'où l'en-tête, qui parle même quand le corps se tait.
 */
export const nomDeLExport = (periode: Periode): string =>
  nomDatable("journal-audit", periode.du, periode.au);

export const COLONNES_AUDIT: readonly string[] = [
  "Horodatage (UTC)",
  "Catégorie",
  "Action",
  "Acteur",
  "Identifiant de l'acteur",
  "Objet",
  "Motif",
  "Origine",
];

/**
 * L'en-tête du fichier, avant les colonnes.
 *
 * Il dit le périmètre exact : sans lui, un fichier de trois lignes ne
 * distingue pas « trois écritures sur la période » de « trois écritures
 * parce qu'un filtre en cachait quarante ». C'est la même exigence que le
 * diagnostic de période vide tient à l'écran.
 */
export function enteteDeLExport(
  periode: Periode,
  categories: readonly CategorieAudit[],
  retenues: number,
): readonly (readonly Cellule[])[] {
  const perimetre =
    categories.length === 0
      ? "toutes catégories"
      : categories.map((c) => LIBELLE_CATEGORIE[c]).join(", ");

  return [
    [texte("Journal d'audit ImmiPro")],
    [texte("Période"), texte(`du ${periode.du} au ${periode.au}`)],
    [texte("Catégories"), texte(perimetre)],
    [texte("Écritures"), nombre(retenues)],
    [
      texte("Conservation"),
      texte(`${CONSERVATION_ANNEES} ans, écritures non modifiables`),
    ],
    // L'attestation n'apparaît que lorsqu'il y a une absence à attester.
    // Une ligne vide tenant sa place ajoutait une rangée vide au tableur —
    // et l'en-tête n'avait pas la même hauteur selon qu'il attestait ou
    // non, ce qui ne se voit qu'en ouvrant les deux fichiers côte à côte.
    ...(retenues === 0 ? [[texte("Attestation"), texte(ATTESTATION_ABSENCE)]] : []),
    [vide],
  ];
}

export const ATTESTATION_ABSENCE =
  "Aucune écriture sur cette période et ce périmètre. Le journal ne comble jamais une période vide : s'il n'affiche rien, il ne s'est rien passé.";

/**
 * Une écriture, en cellules.
 *
 * L'acteur y tient deux colonnes, comme à l'écran depuis l'arbitrage du
 * 21/09/2026 : le libellé lisible pour qui relit, l'identifiant durable
 * pour qui recoupe. Les fondre en une seule perdait l'identifiant, et
 * c'est lui qui sert dans un contrôle.
 */
export const ligneDExport = (e: EcritureAudit): readonly Cellule[] => [
  texte(e.horodatage),
  texte(LIBELLE_CATEGORIE[e.categorie]),
  texte(e.action),
  texte(e.acteur.libelle),
  texte(e.acteur.identifiant),
  texte(e.objet),
  texte(e.detail),
  texte(e.origine),
];

export function exportDuJournal(
  ecritures: readonly EcritureAudit[],
  periode: Periode,
  categories: readonly CategorieAudit[],
): readonly (readonly Cellule[])[] {
  const retenues = filtrerAudit(ecritures, periode, categories);
  return [
    ...enteteDeLExport(periode, categories, retenues.length),
    COLONNES_AUDIT.map(texte),
    ...retenues.map(ligneDExport),
  ];
}
