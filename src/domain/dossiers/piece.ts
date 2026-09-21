import type { CompletenessPublic, DocumentState } from "@/domain/completeness/score";
import { computeCompleteness, versClient } from "@/domain/completeness/score";
import { TAILLE_MAXI_MO } from "@/domain/dossiers/televersement";

/**
 * Pièce d'une checklist de dossier — C-06, C-07, C-08, C-09 (WF-06, WF-07).
 *
 * Une seule description de pièce sert les quatre écrans. Le prototype les a
 * écrits séparément et a divergé : la même attestation y est « Ajouter » sur
 * la checklist et « Déposer » sur la complétude, la photo d'identité y est
 * illisible sur C-06 et déjà conforme sur C-09. Deux libellés pour une même
 * pièce, c'est déjà un doute pour le candidat ; deux états, c'est une erreur.
 * L'action et le regroupement se déduisent donc de la pièce, ils ne
 * s'écrivent pas dans l'écran.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type FamillePiece = "OBLIGATOIRE" | "COMPLEMENTAIRE";

/**
 * Ce qui lève le manque. C'est le remède, et non l'état, qui détermine le
 * libellé du bouton : un passeport trop court se remplace à la Direction de
 * l'émigration, pas dans l'application, et « Ajouter » y serait un mensonge
 * sur l'effort demandé.
 */
export type RemedePiece = "TELEVERSER" | "REMPLACER" | "REDIGER" | "DEMARCHE";

export interface Piece {
  /** Segment de route : `dossiers/[id]/pieces/[pieceId]`. */
  id: string;
  /** Code court affiché en pastille monospace : ID, DIP, REL, FIN, ADM. */
  code: string;
  libelle: string;
  famille: FamillePiece;
  etat: DocumentState;
  remede: RemedePiece;
  /** Constat puis action, adressé au candidat (RG-06.3). Absent si conforme. */
  message?: string;
  /** Le même constat en forme brève : mesure constatée, exigence, action. */
  constat?: string;
  /**
   * Date de péremption, ISO. Une pièce conforme aujourd'hui peut ne plus
   * l'être le jour du dépôt : la date vit sur la pièce, l'échéancier la lit.
   */
  perimeLe?: string;
  /**
   * Conseil propre à cette pièce, affiché au moment du dépôt. « Le PDF
   * téléchargé depuis ton application bancaire se lit mieux qu'une photo »
   * ne vaut que pour un relevé : le prototype l'affichait sur l'écran de
   * téléversement, donc sur toutes les pièces, y compris une lettre.
   */
  astuce?: string;
}

export const LIBELLE_FAMILLE: Record<FamillePiece, string> = {
  OBLIGATOIRE: "Obligatoires",
  COMPLEMENTAIRE: "Complémentaires",
};

export const estConforme = (piece: Piece): boolean => piece.etat === "CONFORME";

/**
 * Déposée, conservée, jamais analysée — RG-06.5.
 *
 * L'état se dérive sans champ nouveau, et la dérivation est exacte :
 * `remede` ne passe à `REMPLACER` qu'après un dépôt, et l'état ne revient à
 * `ATTENDUE` qu'après un balayage sain **sans** analyse — c'est le cas du
 * quota épuisé. Un dépôt analysé finit `CONFORME`, `A_CORRIGER`,
 * `ILLISIBLE` ou `HORS_SUJET` ; une pièce jamais déposée garde
 * `TELEVERSER`.
 *
 * Sans cette distinction, la pastille affiche « Attendue » sur une pièce
 * dont le fichier est sur le serveur, à côté d'une action « Remplacer » :
 * le candidat lit qu'on attend toujours sa pièce et la renvoie. Le lot qui
 * a branché « Téléverser sans analyse » a rendu cet état atteignable
 * exprès — il fallait qu'il se lise.
 */
export const estDeposeeNonVerifiee = (piece: Piece): boolean =>
  piece.etat === "ATTENDUE" && piece.remede === "REMPLACER";

/**
 * La pastille dit ce qui est vrai des deux : le fichier est là, la
 * vérification n'a pas eu lieu. « Conservée » d'abord, parce que c'est ce
 * qu'on veut savoir quand on vient de dépenser ses données mobiles.
 */
export const LIBELLE_CONSERVEE_NON_VERIFIEE = "Conservée, non vérifiée";

export const MENTION_CONSERVEE_NON_VERIFIEE =
  "Ton fichier est bien arrivé. Il n'a pas été analysé : tes analyses du pack sont utilisées. Tu peux le relire toi-même, ou recharger des analyses.";

/**
 * Pièce qu'on photographie ou qu'on scanne, par opposition à une pièce qu'on
 * rédige. Les conseils de prise de vue n'ont de sens que pour la première :
 * les afficher sous une lettre de motivation fait douter de tout le reste.
 */
export const estAPhotographier = (piece: Piece): boolean => piece.remede !== "REDIGER";

/** Ce qu'on attend au dépôt. Une lettre ne se prend pas en photo. */
export const sousTitreDepot = (piece: Piece): string =>
  estAPhotographier(piece)
    ? `PDF ou photo, ${TAILLE_MAXI_MO} Mo maximum. Plusieurs pages acceptées.`
    : `Dépose ta lettre en PDF, ${TAILLE_MAXI_MO} Mo maximum, ou rédige-la avec l'entretien guidé.`;

/**
 * Libellé de l'issue d'une ligne de checklist. Une pièce, un libellé, sur
 * tous les écrans qui la montrent.
 */
export function libelleAction(piece: Piece): string {
  if (estConforme(piece)) return "Voir";
  if (piece.etat === "ILLISIBLE") return "Reprendre";
  switch (piece.remede) {
    case "TELEVERSER":
      return "Ajouter";
    case "REMPLACER":
      return "Remplacer";
    case "REDIGER":
      return "Rédiger";
    case "DEMARCHE":
      return "Voir";
  }
}

/** « 3 sur 5 conformes » — le sous-titre de la section Obligatoires de C-06. */
export function libelleAvancementFamille(
  pieces: readonly Piece[],
  famille: FamillePiece,
): string {
  const lot = pieces.filter((p) => p.famille === famille);
  return `${lot.filter(estConforme).length} sur ${lot.length} conformes`;
}

export interface GroupesCompletude {
  /** Obligatoires non conformes : sans elles, le dépôt est refusé. */
  bloquantes: Piece[];
  /** Complémentaires non conformes : elles renforcent le dossier. */
  ensuite: Piece[];
  conformes: Piece[];
}

/**
 * Regroupement de C-09. Le seul ordre affiché est celui qui bloque le dépôt :
 * un candidat qui ouvre cet écran doit savoir en une ligne par quoi commencer.
 */
export function grouperPourCompletude(pieces: readonly Piece[]): GroupesCompletude {
  return {
    bloquantes: pieces.filter((p) => p.famille === "OBLIGATOIRE" && !estConforme(p)),
    ensuite: pieces.filter((p) => p.famille === "COMPLEMENTAIRE" && !estConforme(p)),
    conformes: pieces.filter(estConforme),
  };
}

/**
 * Complétude calculée à partir de la checklist, jamais saisie à la main.
 *
 * C'est ce qui garantit que le tableau de bord, la checklist et l'écran de
 * complétude comptent la même chose : trois écrans, un seul calcul.
 * `versClient` retire le barème interne, qui ne franchit jamais la frontière
 * (arbitrage C-09).
 */
export function completudeDesPieces(
  pieces: readonly Piece[],
  options: { coherence?: number; redaction?: number } = {},
): CompletenessPublic {
  return versClient(
    computeCompleteness({
      documents: pieces.map((p) => ({
        code: p.code,
        libelle: p.libelle,
        required: p.famille === "OBLIGATOIRE",
        status: p.etat,
      })),
      conditions: [],
      coherence: options.coherence ?? 1,
      redaction: options.redaction ?? 1,
    }),
  );
}

/**
 * Péremption d'une pièce au regard de la date de dépôt.
 *
 * Le prototype affichait « Expire bientôt » sur un test d'anglais valable
 * jusqu'à sept semaines *après* le dépôt visé. « Bientôt » y alarme sans rien
 * demander, alors que la pièce passe. Les deux situations sont distinctes et
 * appellent des gestes différents : l'une se refait avant le dépôt, l'autre
 * se surveille seulement si la date de dépôt glisse.
 *
 * ── La même fausse alarme, par l'autre bout ────────────────────────────
 *
 * La fonction était juste et on lui donnait la mauvaise date : les écrans
 * passaient `Dossier.depotVise`, qui portait la date **cible** — la
 * rentrée. Une pièce expirant entre le dépôt et la rentrée était alors
 * annoncée « avant le dépôt visé », alors qu'elle est valable ce jour-là.
 * Sur le dossier néerlandais, cette fenêtre fait quatre-vingt-dix jours.
 *
 * Le paramètre s'appelle donc `depot`, et rien d'autre ne conviendra.
 */
export type AlertePeremption = "AUCUNE" | "AVANT_LE_DEPOT" | "APRES_LE_DEPOT";

export function alertePeremption(piece: Piece, depot?: string): AlertePeremption {
  if (!piece.perimeLe || !depot) return "AUCUNE";
  return piece.perimeLe < depot ? "AVANT_LE_DEPOT" : "APRES_LE_DEPOT";
}

const FORMAT_JOUR = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function libelleAlertePeremption(piece: Piece, depot?: string): string | null {
  const alerte = alertePeremption(piece, depot);
  if (alerte === "AUCUNE" || !piece.perimeLe) return null;
  const date = FORMAT_JOUR.format(new Date(`${piece.perimeLe}T00:00:00Z`));
  return alerte === "AVANT_LE_DEPOT"
    ? `Expire le ${date}, avant le dépôt visé`
    : `Valable jusqu'au ${date}`;
}

/**
 * Ce que la barre d'action annonce sous la checklist.
 *
 * « Pièces à reprendre » décrirait une correction ; une pièce jamais déposée
 * n'a rien à reprendre, et un passeport trop court se remplace à
 * l'administration, pas dans l'application. La phrase dit donc ce qui est
 * vrai des deux : elles bloquent le dépôt.
 */
export function libelleBlocage(pieces: readonly Piece[]): string {
  const bloquantes = grouperPourCompletude(pieces).bloquantes.length;
  if (bloquantes === 0) return "Rien ne bloque le dépôt";
  return bloquantes > 1
    ? `${bloquantes} pièces bloquent le dépôt`
    : "1 pièce bloque le dépôt";
}

/**
 * Où mène la ligne de checklist. Une pièce à rédiger ouvre l'entretien guidé,
 * pas l'écran de téléversement : proposer « dépose ton fichier » à quelqu'un
 * qui n'a rien écrit ne l'avance pas.
 */
export const lienDePiece = (dossierId: string, piece: Piece): string =>
  piece.remede === "REDIGER"
    ? `/dossiers/${dossierId}/redaction/${piece.id}`
    : `/dossiers/${dossierId}/pieces/${piece.id}`;

/** Première pièce à traiter : celle qui bloque, sinon celle qui renforce. */
export function premiereATraiter(pieces: readonly Piece[]): Piece | undefined {
  const { bloquantes, ensuite } = grouperPourCompletude(pieces);
  return bloquantes[0] ?? ensuite[0];
}

/** « le passeport, l'attestation de ressources et la photo d'identité ». */
const enumerer = (libelles: readonly string[]): string => {
  if (libelles.length <= 1) return libelles[0] ?? "";
  return `${libelles.slice(0, -1).join(", ")} et ${libelles[libelles.length - 1]}`;
};

/**
 * Ce qu'il reste à préparer, nommé — T-05, avant un rendez-vous.
 *
 * Le prototype écrivait « Ta checklist est à 80 % : les deux pièces à
 * reprendre sont le relevé bancaire et la photo d'identité ». Le pourcentage
 * était le dernier de l'interface candidat, et il était de trop : la phrase
 * nommait déjà les deux pièces, ce qui est la seule chose utile avant un
 * appel de quarante-cinq minutes. Le chiffre n'ajoutait qu'une note à
 * retenir de travers (arbitrage C-09).
 */
export function libelleAPreparer(pieces: readonly Piece[]): string {
  const { bloquantes, ensuite } = grouperPourCompletude(pieces);
  const aTraiter = bloquantes.length > 0 ? bloquantes : ensuite;

  if (aTraiter.length === 0) {
    return "Toutes les pièces demandées sont conformes : l'appel peut porter sur le fond du dossier.";
  }

  const noms = enumerer(aTraiter.map((p) => p.libelle.toLowerCase()));
  const nature = bloquantes.length > 0 ? "obligatoires" : "complémentaires";
  return aTraiter.length > 1
    ? `${aTraiter.length} pièces ${nature} restent à traiter : ${noms}.`
    : `1 pièce ${nature === "obligatoires" ? "obligatoire" : "complémentaire"} reste à traiter : ${noms}.`;
}
