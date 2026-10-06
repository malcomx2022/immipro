import { nomDatable, nombre, texte, vide, type Cellule } from "@/domain/format/csv";
import { jourCivil } from "@/domain/format/fuseau";
import { coutMicrosDesJetons, type TarifIA } from "@/domain/backoffice/couts";
import { FOURNISSEURS, type CodeFournisseur } from "@/domain/ia/fournisseurs";

/**
 * Export du détail des appels IA — B-07, WF-16.
 *
 * Le bouton « Exporter le détail des appels » était retiré faute d'écrivain
 * de fichier. L'écrivain existe depuis l'export du grand livre ; ce module
 * dit **ce que le fichier contient et ce qu'il ne contient pas**.
 *
 * ── Ce qui part, et seulement cela ─────────────────────────────────────
 *
 * Une ligne par appel, avec les colonnes que B-07 montre déjà, à une
 * échelle plus fine : le fournisseur, le modèle, les jetons d'entrée et de
 * sortie, le coût, le moment, la référence du dossier. B-07 porte
 * `MENTION_SANS_DONNEE_CANDIDAT` — « Aucune donnée de candidat n'apparaît
 * sur cet écran » — et le fichier tient la même promesse : ni identifiant
 * de compte, ni nom, ni courriel, ni la nature de l'opération (qui dirait
 * quel type de pièce un candidat a déposé). La référence du dossier est
 * celle que l'écran affiche déjà dans « Dépassements individuels ».
 *
 * ── Le coût est recalculé, comme à l'écran ─────────────────────────────
 *
 * Au tarif du jour de l'export, pas au `costMicros` stocké, qui valait un
 * zéro littéral. Sans tarif pour un fournisseur, la cellule reste vide : un
 * tarif absent ne vaut pas zéro (I.C). Le fichier le dit en en-tête.
 *
 * ── Une période bornée, jamais tronquée ────────────────────────────────
 *
 * Un export plafonné en silence est une attestation fausse. La période est
 * donc bornée **à la demande** — au-delà de `JOURS_MAXIMUM`, la requête est
 * refusée avec ce qu'il faut faire — et les lignes d'une période valide
 * partent toutes.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/** Un an : de quoi couvrir une revue de grille (WF-16 étape 4) sans lire toute la table. */
export const JOURS_MAXIMUM = 366;

export interface PeriodeDesAppels {
  du: string;
  au: string;
}

/** Un appel, tel que le lecteur le remonte : aucun champ nominatif. */
export interface AppelIA {
  /** ISO 8601, UTC. */
  horodatage: string;
  /** Déjà résolu : une ligne antérieure à S.94 vaut le fournisseur par défaut. */
  fournisseur: CodeFournisseur;
  modele: string | null;
  jetonsEntree: number;
  jetonsSortie: number;
  /** La référence du dossier, nulle pour un appel qui n'en a pas. */
  dossierId: string | null;
}

const JOUR_ISO = /^(\d{4})-(\d{2})-(\d{2})$/u;

const MS_PAR_JOUR = 86_400_000;

/** Un jour ISO valide du calendrier, en millisecondes UTC — ou `null`. */
function instantDuJour(jour: string): number | null {
  const m = JOUR_ISO.exec(jour);
  if (!m) return null;
  const [annee, mois, jourDuMois] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(annee, mois - 1, jourDuMois));
  return date.getUTCFullYear() === annee &&
    date.getUTCMonth() === mois - 1 &&
    date.getUTCDate() === jourDuMois
    ? date.getTime()
    : null;
}

/**
 * Ce qui empêche d'exporter la période, dit comme une action — ou `null`.
 */
export function obstacleALaPeriode(periode: PeriodeDesAppels): string | null {
  const debut = instantDuJour(periode.du);
  const fin = instantDuJour(periode.au);
  if (debut === null || fin === null) {
    return "Les dates se saisissent au format AAAA-MM-JJ, et doivent exister au calendrier.";
  }
  if (debut > fin) {
    return `La période commence le ${periode.du} et finit le ${periode.au} : inversez les deux dates.`;
  }
  const jours = Math.round((fin - debut) / MS_PAR_JOUR) + 1;
  if (jours > JOURS_MAXIMUM) {
    return `La période couvre ${jours} jours, et l'export en accepte ${JOURS_MAXIMUM} au plus : choisissez une période plus courte, ou exportez en plusieurs fois.`;
  }
  return null;
}

/** Le jour civil d'un appel, celui de Cotonou, comme l'histogramme de B-07. */
export const jourDeLAppel = (a: AppelIA): string => jourCivil(new Date(a.horodatage));

export const COLONNES_APPELS: readonly string[] = [
  "Horodatage (UTC)",
  "Jour (Cotonou)",
  "Fournisseur",
  "Modèle",
  "Jetons d'entrée",
  "Jetons de sortie",
  "Coût",
  "Devise",
  "Dossier",
];

export const MENTION_COUT_RECALCULE =
  "Coût recalculé à la lecture, au tarif en vigueur le jour de l'export. Une cellule vide signifie que le fournisseur n'a pas de tarif de jeton : ce n'est pas un coût nul.";

export const MENTION_SANS_DONNEE_CANDIDAT_EXPORT =
  "Aucune donnée de candidat dans ce fichier : ni compte, ni nom, ni nature d'opération. La référence du dossier est celle de l'écran B-07.";

export const MODELE_NON_CONSIGNE = "non consigné (avant S.94)";
export const SANS_DOSSIER = "sans dossier";

type Tarifs = (fournisseur: CodeFournisseur) => TarifIA | null;

/** Un appel, en cellules. Le coût est celui de **son** fournisseur, jamais d'un autre. */
export function ligneDeLAppel(a: AppelIA, tarifs: Tarifs): readonly Cellule[] {
  const tarif = tarifs(a.fournisseur);
  const micros = coutMicrosDesJetons(tarif, a.jetonsEntree, a.jetonsSortie);
  return [
    texte(a.horodatage),
    texte(jourDeLAppel(a)),
    texte(FOURNISSEURS[a.fournisseur].libelle),
    texte(a.modele ?? MODELE_NON_CONSIGNE),
    nombre(a.jetonsEntree),
    nombre(a.jetonsSortie),
    micros === null ? vide : nombre(micros / 1_000_000, 6),
    tarif === null ? vide : texte(tarif.devise),
    texte(a.dossierId ?? SANS_DOSSIER),
  ];
}

/**
 * Le fichier : un en-tête qui dit le périmètre, puis une ligne par appel.
 *
 * Une période sans appel produit un fichier qui l'atteste, comme le journal
 * d'audit : un fichier vide se confond avec un export qui a échoué.
 */
export function exportDesAppels(
  periode: PeriodeDesAppels,
  appels: readonly AppelIA[],
  tarifs: Tarifs,
): readonly (readonly Cellule[])[] {
  const tries = [...appels].sort((a, b) => a.horodatage.localeCompare(b.horodatage));
  const jetons = tries.reduce((s, a) => s + a.jetonsEntree + a.jetonsSortie, 0);
  return [
    [texte("Détail des appels IA ImmiPro")],
    [texte("Période"), texte(`du ${periode.du} au ${periode.au}`)],
    [texte("Appels"), nombre(tries.length)],
    [texte("Jetons (entrée + sortie)"), nombre(jetons)],
    [texte("Coût"), texte(MENTION_COUT_RECALCULE)],
    [texte("Confidentialité"), texte(MENTION_SANS_DONNEE_CANDIDAT_EXPORT)],
    ...(tries.length === 0
      ? [[texte("Attestation"), texte("Aucun appel IA enregistré sur cette période.")]]
      : []),
    [vide],
    COLONNES_APPELS.map(texte),
    ...tries.map((a) => ligneDeLAppel(a, tarifs)),
  ];
}

export const nomDesAppels = (periode: PeriodeDesAppels): string =>
  nomDatable("appels-ia", periode.du, periode.au);
