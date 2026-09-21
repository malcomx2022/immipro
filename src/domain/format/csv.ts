/**
 * Écriture de fichiers CSV — B-06 et B-04, WF-15.
 *
 * Le dépôt n'avait aucune ligne d'export : quatre boutons en promettaient
 * un, aucun ne produisait de fichier. Ce module est l'écrivain qui
 * manquait, et il tient trois choses qu'un `join(";")` ne tient pas.
 *
 * ── 1. Une cellule ne devient jamais une formule ───────────────────────
 *
 * Un tableur exécute le contenu d'une cellule qui commence par `=`, `+`,
 * `-`, `@`, une tabulation ou un retour chariot. Les deux exports portent
 * du texte libre — le motif qu'un opérateur a saisi en suspendant un
 * compte, le constat d'un écart, la référence rendue par un opérateur de
 * paiement. Un motif commençant par `=cmd|…` s'exécuterait à l'ouverture
 * du fichier, sur le poste d'un contrôleur, avec ses droits à lui.
 *
 * Le texte est donc préfixé d'une apostrophe, que le tableur consomme en
 * affichant la valeur telle quelle. **Les nombres ne passent pas par là** :
 * un montant négatif commence légitimement par `-`, et le neutraliser en
 * ferait du texte qu'aucune somme ne reprendrait. C'est pourquoi une
 * cellule est typée plutôt que devinée.
 *
 * ── 2. Le séparateur et la virgule décimale vont ensemble ──────────────
 *
 * Point-virgule, et décimales à la virgule : c'est ce qu'attend un tableur
 * en français, et c'est un contrôleur français qui ouvre ce fichier. Les
 * deux choix se tiennent — avec une virgule pour séparateur, « 1 234,50 »
 * couperait la ligne en deux.
 *
 * ── 3. La marque d'octets, sans quoi les accents tombent ───────────────
 *
 * Sans BOM, Excel lit l'UTF-8 comme du Latin-1 et « Écritures » s'affiche
 * « Ã‰critures ». Le fichier resterait juste et paraîtrait cassé.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export const SEPARATEUR = ";";

/** Marque d'ordre des octets. Sans elle, un tableur perd les accents. */
export const BOM = "﻿";

/**
 * Une cellule dit ce qu'elle est.
 *
 * Deviner au contenu ferait du texte d'un montant négatif ou d'un nombre
 * d'un motif qui commence par un chiffre. Le type porte la décision là où
 * la donnée est connue.
 */
export type Cellule =
  | { readonly texte: string }
  | { readonly nombre: number; readonly decimales?: number }
  | { readonly vide: true };

export const texte = (valeur: string): Cellule => ({ texte: valeur });
export const nombre = (valeur: number, decimales = 0): Cellule => ({
  nombre: valeur,
  decimales,
});
export const vide: Cellule = { vide: true };

/** Les amorces qu'un tableur interprète comme une formule. */
const AMORCES_DE_FORMULE = ["=", "+", "-", "@", "\t", "\r"];

/**
 * Le texte, rendu inerte. Exporté pour être éprouvé seul : c'est la
 * fonction dont l'oubli ferait exécuter le fichier.
 */
export function neutraliser(valeur: string): string {
  return AMORCES_DE_FORMULE.some((a) => valeur.startsWith(a)) ? `'${valeur}` : valeur;
}

const entreGuillemets = (valeur: string): string =>
  /[";\r\n]|^\s|\s$/u.test(valeur) ? `"${valeur.replace(/"/gu, '""')}"` : valeur;

/** Décimales à la virgule, sans séparateur de milliers : le tableur groupera. */
const formaterNombre = (valeur: number, decimales: number): string =>
  valeur.toFixed(decimales).replace(".", ",");

export function cellule(valeur: Cellule): string {
  if ("vide" in valeur) return "";
  if ("nombre" in valeur) return formaterNombre(valeur.nombre, valeur.decimales ?? 0);
  return entreGuillemets(neutraliser(valeur.texte));
}

export const ligne = (cellules: readonly Cellule[]): string =>
  cellules.map(cellule).join(SEPARATEUR);

/**
 * Le fichier entier. Les fins de ligne sont en CRLF (RFC 4180) : un tableur
 * sous Windows lit un LF seul comme une ligne unique.
 */
export function fichierCsv(lignes: readonly (readonly Cellule[])[]): string {
  return BOM + lignes.map(ligne).join("\r\n") + "\r\n";
}

/**
 * Nom de fichier daté. Le jour y est parce qu'un export se retrouve dans
 * un dossier de téléchargements six mois plus tard, à côté de six autres.
 */
export const nomDatable = (base: string, du: string, au: string): string =>
  du === au ? `immipro-${base}-${du}.csv` : `immipro-${base}-${du}_${au}.csv`;

export const TYPE_MIME = "text/csv; charset=utf-8";
