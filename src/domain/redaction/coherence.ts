/**
 * Recoupements déterministes d'une pièce rédigée — RG-08.3, WF-08 étape 4.
 *
 * ── Ce que ce module fait, et pourquoi il existe malgré `extraction` ────
 *
 * RG-08.3 exige la cohérence croisée, et son exemple canonique — « la
 * lettre mentionne un financement familial, le relevé est au nom du
 * candidat » — demande de lire le relevé. Cette lecture n'est pas branchée.
 * J'en avais conclu que la règle entière attendait `extraction`, et c'était
 * trop large : WF-08 étape 4 dit « cohérence avec **le reste du dossier** »,
 * et le dossier sait déjà, sans lire une seule pièce jointe, sur quelle
 * destination il a été ouvert et ce que sa règle figée demande.
 *
 * La règle d'architecture 2 s'applique alors telle quelle : *tout ce qui est
 * vérifiable sans IA l'est sans IA*. Deux recoupements le sont — une
 * comparaison de chaînes, aucun jeton débité, aucun service à brancher.
 *
 * ── Le faux positif coûte plus cher que le recoupement manqué ───────────
 *
 * Une incohérence inventée apprend à ignorer l'analyse : le candidat qui
 * lit « ta lettre cite la France » sur une phrase où il raconte ses études
 * passées en France cessera de lire les suivantes, y compris la vraie.
 * Chaque recoupement est donc écrit pour ne se déclencher que sur un
 * faisceau qui ne laisse pas d'autre lecture — et deux comparaisons
 * envisagées ont été écartées pour cette seule raison, dites en clair par
 * `recoupementsEcartes` plutôt que tentées à moitié.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

import type { Remarque } from "./relecture";

// ── Lexique ────────────────────────────────────────────────────────────

export interface DestinationNommee {
  /** ISO 3166-1 alpha-2, tel que `VisaRule.countryCode`. */
  code: string;
  /** Nom avec son article, pour une phrase : « ne nomme jamais le Canada ». */
  nom: string;
  /**
   * Formes reconnues dans un texte, normalisées (minuscules, sans accent).
   *
   * Des noms de pays, et rien d'autre. Les adjectifs en sont absents :
   * « le néerlandais » est une langue, « un diplôme canadien » peut être
   * celui d'une filière suivie sur place. Aucun des deux ne dit où le
   * candidat demande à aller.
   */
  formes: readonly string[];
}

/**
 * Le lexique de détection, volontairement limité aux destinations que la
 * plateforme ouvre. Un pays absent d'ici ne déclenche rien : un code de
 * destination inconnu désactive le recoupement au lieu de deviner.
 *
 * Le pays d'origine n'y figure pas et n'a pas à y figurer : une lettre
 * écrite depuis Cotonou parle du Bénin, et ce n'est pas une incohérence.
 */
export const DESTINATIONS_NOMMEES: readonly DestinationNommee[] = [
  { code: "NL", nom: "les Pays-Bas", formes: ["pays-bas", "pays bas", "hollande"] },
  { code: "DE", nom: "l'Allemagne", formes: ["allemagne"] },
  { code: "CA", nom: "le Canada", formes: ["canada"] },
  { code: "FR", nom: "la France", formes: ["france"] },
  { code: "BE", nom: "la Belgique", formes: ["belgique"] },
  { code: "CH", nom: "la Suisse", formes: ["suisse"] },
  { code: "AU", nom: "l'Australie", formes: ["australie"] },
  {
    code: "GB",
    nom: "le Royaume-Uni",
    formes: ["royaume-uni", "royaume uni", "angleterre", "grande-bretagne"],
  },
  {
    code: "AE",
    nom: "les Émirats arabes unis",
    formes: ["emirats arabes unis", "emirats"],
  },
];

export const destinationNommee = (code: string): DestinationNommee | undefined =>
  DESTINATIONS_NOMMEES.find((d) => d.code === code);

/**
 * La destination, nommée — pour ce qui se lit, et pour ce qui écrit.
 *
 * ── « Destination du dossier : NL » ─────────────────────────────────
 *
 * La matière donnée au modèle portait le **code ISO** de la règle figée,
 * et les deux instructions le recopiaient tel quel :
 *
 *     Destination du dossier : NL. Les attendus d'une administration à
 *     l'autre diffèrent — écris pour celle-là.
 *     Tu relis une pièce d'un dossier d'immigration : lettre-motivation,
 *     pour une demande vers NL.
 *
 * Ce que ces lignes existent pour dire — écris pour **cette**
 * administration-là — tient au nom, pas à deux lettres. Et le nom était
 * là, dans ce module même, à quelques lignes de l'appel.
 *
 * ── Le repli, et pourquoi il ne sert jamais ─────────────────────────
 *
 * Un code absent du lexique rend le code. Refuser d'écrire ferait payer
 * au candidat une lacune qu'il ne peut pas combler, et un message
 * d'échec doit être actionnable par qui le lit. Un essai compare le
 * lexique aux destinations du référentiel : le repli ne peut donc pas
 * servir pour une destination que le produit ouvre.
 */
export const nomDeLaDestination = (code: string): string =>
  destinationNommee(code)?.nom ?? code;

/** Minuscules, sans accent : « Émirats » et « emirats » sont le même mot. */
export const normaliser = (texte: string): string =>
  texte
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const echapper = (forme: string) => forme.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/**
 * Une forme est reconnue entière. Sans les bornes, « suisse » se trouverait
 * dans un mot plus long et « emirats » dans un nom propre quelconque.
 */
const citee = (texteNormalise: string, forme: string): boolean =>
  new RegExp(`(?<![\\p{L}\\p{N}])${echapper(forme)}(?![\\p{L}\\p{N}])`, "u").test(
    texteNormalise,
  );

/** Les destinations du lexique que ce texte nomme, dans l'ordre du lexique. */
export function destinationsCitees(texte: string): readonly DestinationNommee[] {
  const normalise = normaliser(texte);
  return DESTINATIONS_NOMMEES.filter((d) => d.formes.some((f) => citee(normalise, f)));
}

// ── Niveaux CECRL ──────────────────────────────────────────────────────

export const NIVEAUX_CECRL = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type NiveauCecrl = (typeof NIVEAUX_CECRL)[number];

export const estNiveauCecrl = (valeur: string): valeur is NiveauCecrl =>
  (NIVEAUX_CECRL as readonly string[]).includes(valeur.trim().toUpperCase());

const rang = (niveau: NiveauCecrl) => NIVEAUX_CECRL.indexOf(niveau);

/** Les niveaux CECRL que le texte annonce, sans doublon, dans l'ordre du texte. */
export function niveauxCites(texte: string): readonly NiveauCecrl[] {
  /*
    Deux bornes en assertion, et non en groupes : un groupe consomme le
    séparateur, et « B1 et C1 » ne rendait alors que le premier des deux —
    le second niveau, celui qui désamorce la remarque, disparaissait.
  */
  const trouves = normaliser(texte).match(/(?<![\p{L}\p{N}])[abc][12](?![\p{L}\p{N}])/gu);
  if (!trouves) return [];
  const vus: NiveauCecrl[] = [];
  for (const brut of trouves) {
    const niveau = brut.toUpperCase() as NiveauCecrl;
    if (!vus.includes(niveau)) vus.push(niveau);
  }
  return vus;
}

// ── Ce que le dossier sait de lui-même ─────────────────────────────────

export interface FaitsDuDossier {
  /**
   * Destination du dossier, depuis la règle **figée** (INV-3). `null` quand
   * aucune règle n'est figée, ou quand son code est hors du lexique.
   */
  destination: DestinationNommee | null;
  /**
   * `niveau_langue_min` de la règle figée, tel qu'il y est écrit : « B2 »,
   * « IELTS 6.5 », ou `null`.
   */
  niveauLangueMin: string | null;
}

export interface Recoupements {
  /** Les écarts relevés, prêts à rejoindre les remarques de l'analyse. */
  remarques: readonly Remarque[];
  /** Ce qui a réellement été comparé. Vide : rien n'était comparable. */
  effectues: readonly string[];
  /** Ce qui ne l'a pas été, avec le motif. Jamais vide. */
  ecartes: readonly string[];
}

const ECARTE_PIECES_JOINTES =
  "Les montants, les noms et les dates portés par tes pièces jointes : leur lecture automatique n'est pas branchée, nous ne comparons donc rien à ce qu'elles contiennent.";

const ECARTE_MONTANTS =
  "Les montants cités dans ta lettre : un même chiffre y désigne aussi bien des frais de scolarité qu'un budget annuel, et nous ne signalons pas un écart que nous ne savons pas lire.";

/**
 * Les deux recoupements, sur le texte d'une version.
 *
 * Ils tournent toujours — ils ne coûtent ni jeton ni appel — et leur
 * résultat ne dépend que de la version lue : il se recalcule, il ne se
 * stocke pas. Un écart figé en base survivrait à la correction du texte.
 */
export function recoupements(texte: string, faits: FaitsDuDossier): Recoupements {
  const remarques: Remarque[] = [];
  const effectues: string[] = [];
  const ecartes: string[] = [ECARTE_PIECES_JOINTES, ECARTE_MONTANTS];

  // ── Destination ──────────────────────────────────────────────────────
  if (faits.destination) {
    const attendue = faits.destination;
    effectues.push(
      `La destination citée dans ta lettre, comparée à ${attendue.nom} — la destination de ce dossier.`,
    );
    const citees = destinationsCitees(texte);
    const nomme = citees.some((d) => d.code === attendue.code);
    /*
      La condition tient en deux morceaux, et le second fait tout le
      travail : une lettre qui cite les Pays-Bas **et** le Canada sur un
      dossier Canada raconte un parcours, elle ne se trompe pas de dossier.
      Seule celle qui ne nomme jamais sa propre destination est une lettre
      écrite pour ailleurs.
    */
    if (citees.length > 0 && !nomme) {
      const autres = citees.map((d) => d.nom).join(", ");
      remarques.push({
        id: "recoupement-destination",
        genre: "INCOHERENCE_DOSSIER",
        titre: `Ta lettre nomme ${autres}, jamais ${attendue.nom}`,
        corps: `Ce dossier est ouvert sur ${attendue.nom}. Une lettre qui ne nomme jamais la destination à laquelle elle s'adresse se lit comme un texte écrit pour une autre demande. Reprends les passages concernés et nomme ${attendue.nom}.`,
        ecarts: [
          { source: "Ta lettre", valeur: autres },
          { source: "Ce dossier", valeur: attendue.nom },
        ],
        action: "Corriger le passage",
      });
    }
  } else {
    ecartes.push(
      "La destination : ce dossier n'a pas de procédure figée, nous ne savons pas à quel pays comparer ta lettre.",
    );
  }

  // ── Niveau de langue ─────────────────────────────────────────────────
  const minimum = faits.niveauLangueMin;
  if (minimum !== null && estNiveauCecrl(minimum)) {
    const requis = minimum.trim().toUpperCase() as NiveauCecrl;
    effectues.push(
      `Le niveau de langue annoncé dans ta lettre, comparé au ${requis} que demande la procédure figée.`,
    );
    const cites = niveauxCites(texte);
    /*
      Tous en dessous, ou rien. Une lettre qui annonce « B1 en allemand et
      C1 en français » satisfait le minimum par l'un des deux, et nous ne
      savons pas déterminer lequel porte la langue du cursus — le signaler
      serait un faux écart.
    */
    if (cites.length > 0 && cites.every((n) => rang(n) < rang(requis))) {
      const annonces = cites.join(" et ");
      remarques.push({
        id: "recoupement-langue",
        genre: "INCOHERENCE_DOSSIER",
        titre: `Ta lettre annonce ${annonces}, la procédure demande ${requis}`,
        corps: `Les deux ne peuvent pas être à jour en même temps. Si ton niveau a progressé depuis, c'est la lettre qu'il faut reprendre ; s'il n'a pas changé, c'est le test de langue qui reste à passer avant le dépôt.`,
        ecarts: [
          { source: "Ta lettre", valeur: annonces },
          { source: "Procédure figée", valeur: requis },
        ],
        action: "Corriger le passage",
      });
    }
  } else if (minimum !== null) {
    ecartes.push(
      `Le niveau de langue : la procédure demande « ${minimum} », qui ne se compare pas à un niveau CECRL.`,
    );
  } else {
    ecartes.push("Le niveau de langue : la procédure figée n'en fixe aucun.");
  }

  return { remarques, effectues, ecartes };
}

export const AUCUN_RECOUPEMENT: Recoupements = {
  remarques: [],
  effectues: [],
  ecartes: [ECARTE_PIECES_JOINTES, ECARTE_MONTANTS],
};

export const TITRE_RECOUPEMENTS = "Ce que nous avons recoupé";
export const TITRE_ECARTES = "Ce que nous n'avons pas recoupé";
