/**
 * La notation du banc des fournisseurs d'IA — S.99.
 *
 * ── Juger comme le produit juge ─────────────────────────────────────
 *
 * Une lecture n'est pas notée sur sa ressemblance avec la lecture
 * attendue seulement, mais sur **le verdict qu'elle aurait produit** : le
 * même enchaînement que `server/jobs/analyse.ts`, dans le même ordre.
 *
 * 1. Pas de lecture : la pièce part en revue humaine (`ILLISIBLE`).
 * 2. Une autre pièce de la checklist est reconnue : `HORS_SUJET`.
 * 3. Sinon, `mesurer` puis `evaluerConditions`, avec la date cible du
 *    dossier pour repère.
 *
 * L'enchaînement est recopié et non importé, parce que le job le tient
 * au milieu de ses écritures en base. `tests/banc-ia.test.ts` vérifie que
 * la copie rend, pour chaque cas, le verdict écrit à la main dans le jeu.
 *
 * ── Les quatre issues d'un champ ────────────────────────────────────
 *
 * - **juste** : la valeur attendue, ou `null` quand rien n'est écrit ;
 * - **manquée** : une valeur écrite et non lue. La pièce part en
 *   revue ou est jugée à tort incomplète ; le coût est du temps ;
 * - **inventée** : une valeur rendue alors que la pièce n'en porte pas ;
 * - **fausse** : une autre valeur que celle qui est écrite.
 *
 * Les deux dernières sont celles qui peuvent faire déclarer conforme une
 * pièce qui ne l'est pas. Elles sont comptées à part, et la fausse
 * conformité, qui en est la conséquence, disqualifie.
 *
 * Module pur : aucune dépendance à Prisma, Next, au réseau ou à un SDK.
 */
import {
  OBSTACLES_DU_MODELE,
  mesurer,
  natureDuChamp,
  type ObstacleDuModele,
} from "@/domain/dossiers/extraction";
import {
  conditionsDeLaPiece,
  evaluerConditions,
  type ChampsExtraits,
  type Condition,
} from "@/domain/dossiers/verification";
import { INTERDITS_ECRAN_CANDIDAT, verifierTexte, type Faute } from "@/domain/copy/vocabulaire-interdit";
import {
  FAUSSES_CONFORMITES_ADMISES,
  type CasDeLecture,
  type CasDeRedaction,
  type VerdictDuProduit,
} from "@/domain/banc-ia/jeu-d-essai";

/* ------------------------------------------------------------------ *
 * La lecture.
 * ------------------------------------------------------------------ */

/**
 * Ce que rend un adaptateur, réduit à ce que le banc juge. La forme est
 * celle de `Lecture` (`server/dossiers/extracteur.ts`), sans en dépendre.
 */
export type LectureObtenue =
  | { etat: "LUE"; pieceIdentifiee: string | null; bruts: ChampsExtraits }
  | { etat: "NON_LUE"; cause: string };

/** Le verdict que le job d'analyse aurait écrit pour cette lecture. */
export function verdictDuProduit(
  conditions: readonly Condition[],
  codeAttendu: string,
  lecture: LectureObtenue,
  repere: string | null,
): VerdictDuProduit {
  if (lecture.etat === "NON_LUE") return "ILLISIBLE";
  if (lecture.pieceIdentifiee !== null && lecture.pieceIdentifiee !== codeAttendu) {
    return "HORS_SUJET";
  }
  const deLaPiece = conditionsDeLaPiece(conditions, codeAttendu);
  const mesures = mesurer(deLaPiece, lecture.bruts, repere);
  return evaluerConditions(deLaPiece, mesures.champs, mesures.reserves).verdict;
}

export type IssueDuChamp = "juste" | "manquee" | "inventee" | "fausse";

export interface ChampNote {
  code: string;
  attendu: string | number | null;
  obtenu: string | number | null;
  issue: IssueDuChamp;
}

export interface NoteDeLecture {
  id: string;
  champs: readonly ChampNote[];
  /** `null` quand le cas attend un obstacle : rien n'est à identifier. */
  identificationJuste: boolean | null;
  obstacle: "juste" | "manque" | "signale_a_tort" | "sans_objet";
  /** Le service n'a pas répondu : ni le modèle ni la pièce ne sont en cause. */
  echecTechnique: boolean;
  verdictAttendu: VerdictDuProduit;
  verdictObtenu: VerdictDuProduit;
  fausseConformite: boolean;
}

const vide = (v: unknown): boolean => v === null || v === undefined || v === "";

const normaliserTexte = (v: string | number): string =>
  String(v).normalize("NFC").toLowerCase().replace(/\s+/gu, " ").trim();

function comparer(
  condition: Condition,
  attendu: string | number | null,
  obtenu: string | number | null,
): IssueDuChamp {
  if (vide(attendu)) return vide(obtenu) ? "juste" : "inventee";
  if (vide(obtenu)) return "manquee";
  const a = attendu as string | number;
  const o = obtenu as string | number;
  const nature = natureDuChamp(condition);
  switch (nature) {
    case "date":
      return String(o).slice(0, 10) === String(a).slice(0, 10) ? "juste" : "fausse";
    case "nombre": {
      const n = typeof o === "number" ? o : Number(o);
      return Number.isFinite(n) && Math.abs(n - Number(a)) < 0.005 ? "juste" : "fausse";
    }
    case "texte":
      // Une mention exigée (`exists`) se juge à sa présence, comme le
      // produit la juge : la recopier mot pour mot n'est pas demandé.
      if (condition.operateur === "exists") return "juste";
      return normaliserTexte(o) === normaliserTexte(a) ? "juste" : "fausse";
    default: {
      const jamais: never = nature;
      return jamais;
    }
  }
}

const estObstacle = (cause: string): cause is ObstacleDuModele =>
  (OBSTACLES_DU_MODELE as readonly string[]).includes(cause);

/**
 * Note une lecture contre le cas.
 *
 * `conditions` sont celles de la règle entière, telles que le référentiel
 * les porte ; la note ne retient que celles de la ligne de checklist où
 * la pièce est déposée, c'est-à-dire exactement ce qui a été demandé.
 */
export function noterUneLecture(
  cas: CasDeLecture,
  conditions: readonly Condition[],
  obtenue: LectureObtenue,
): NoteDeLecture {
  const deLaPiece = conditionsDeLaPiece(conditions, cas.codeAttendu);
  const bruts: ChampsExtraits = obtenue.etat === "LUE" ? obtenue.bruts : {};

  const champs: ChampNote[] = deLaPiece.map((condition) => {
    const attendu = cas.attendu.champs[condition.code] ?? null;
    const obtenu = bruts[condition.code] ?? null;
    return { code: condition.code, attendu, obtenu, issue: comparer(condition, attendu, obtenu) };
  });

  const obstacleObtenu =
    obtenue.etat === "NON_LUE" && estObstacle(obtenue.cause) ? obtenue.cause : null;
  const echecTechnique = obtenue.etat === "NON_LUE" && obstacleObtenu === null;

  let obstacle: NoteDeLecture["obstacle"] = "sans_objet";
  if (cas.attendu.obstacle !== null) {
    obstacle = obstacleObtenu === cas.attendu.obstacle ? "juste" : "manque";
  } else if (obstacleObtenu !== null) {
    obstacle = "signale_a_tort";
  }

  const identificationJuste =
    cas.attendu.obstacle !== null
      ? null
      : obtenue.etat === "LUE" && obtenue.pieceIdentifiee === cas.attendu.pieceIdentifiee;

  const verdictObtenu = verdictDuProduit(conditions, cas.codeAttendu, obtenue, cas.repere);

  return {
    id: cas.id,
    champs,
    identificationJuste,
    obstacle,
    echecTechnique,
    verdictAttendu: cas.verdictAttendu,
    verdictObtenu,
    fausseConformite: verdictObtenu === "CONFORME" && cas.verdictAttendu !== "CONFORME",
  };
}

/* ------------------------------------------------------------------ *
 * La rédaction.
 * ------------------------------------------------------------------ */

export interface NoteDeRedaction {
  id: string;
  /** Un texte a été rendu, assez long pour devenir une version. */
  ecrite: boolean;
  /** Le vocabulaire interdit de `CLAUDE.md`, négations admises. */
  fautesDeVocabulaire: readonly Faute[];
  /** Les nombres du texte qu'aucune réponse ne contient : des faits ajoutés. */
  nombresAjoutes: readonly string[];
  /** Les formules propres au piège du cas, à regarder en premier. */
  formulesSignalees: readonly string[];
  /** Le texte s'adresse au candidat au lieu de parler pour lui. */
  tutoiement: boolean;
  /** `null` quand la relecture n'a rien rendu. */
  incoherenceRelevee: boolean | null;
  incoherenceAttendue: boolean;
  /** Ce que la relecture humaine doit regarder, dans l'ordre. */
  aVerifier: readonly string[];
}

/** Les nombres d'un texte, sans séparateurs : « 14 250 », « 14.250 » et « 14250 » se valent. */
export function nombresDuTexte(texte: string): readonly string[] {
  const trouves = texte.match(/\d(?:[\d   .,']*\d)?/gu) ?? [];
  return [...new Set(trouves.map((n) => n.replace(/[^\d]/gu, "")))];
}

const TUTOIEMENT = /(^|[\s(«"'’])(tu|toi|ton|ta|tes)(?=[\s,.;:!?)»"]|$)/iu;

/**
 * Note une rédaction et sa relecture.
 *
 * Rien ici ne juge la qualité d'écriture : c'est l'affaire des deux
 * relecteurs humains, à l'aveugle. La notation ne relève que ce qui se
 * vérifie mécaniquement, et le range en tête de leur liste.
 */
export function noterUneRedaction(
  cas: CasDeRedaction,
  texte: string | null,
  remarques: readonly { genre: string }[] | null,
): NoteDeRedaction {
  const ecrite = texte !== null && texte.trim().length > 0;
  const corps = texte ?? "";

  const permis = new Set(nombresDuTexte(Object.values(cas.reponses).join("\n")));
  const nombresAjoutes = ecrite ? nombresDuTexte(corps).filter((n) => !permis.has(n)) : [];

  const fautesDeVocabulaire = ecrite ? verifierTexte(corps, INTERDITS_ECRAN_CANDIDAT) : [];
  const minuscule = corps.toLowerCase();
  const formulesSignalees = ecrite
    ? (cas.formulesAProscrire ?? []).filter((f) => minuscule.includes(f.toLowerCase()))
    : [];
  const tutoiement = ecrite && TUTOIEMENT.test(corps);

  const incoherenceRelevee =
    remarques === null ? null : remarques.some((r) => r.genre === "INCOHERENCE");

  const aVerifier: string[] = [];
  if (!ecrite) aVerifier.push("Aucun texte rendu.");
  if (fautesDeVocabulaire.length > 0) {
    aVerifier.push(`Vocabulaire interdit : ${fautesDeVocabulaire.map((f) => `« ${f.extrait} »`).join(", ")}.`);
  }
  if (nombresAjoutes.length > 0) {
    aVerifier.push(`Nombres absents des réponses : ${nombresAjoutes.join(", ")}.`);
  }
  if (formulesSignalees.length > 0) {
    aVerifier.push(`Formules du piège : ${formulesSignalees.map((f) => `« ${f} »`).join(", ")}.`);
  }
  if (tutoiement) aVerifier.push("Le texte tutoie : il s'adresse au candidat au lieu de parler pour lui.");
  if (cas.incoherenceAttendue && incoherenceRelevee === false) {
    aVerifier.push("La relecture n'a pas relevé l'incohérence que les réponses contiennent.");
  }

  return {
    id: cas.id,
    ecrite,
    fautesDeVocabulaire,
    nombresAjoutes,
    formulesSignalees,
    tutoiement,
    incoherenceRelevee,
    incoherenceAttendue: cas.incoherenceAttendue,
    aVerifier,
  };
}

/* ------------------------------------------------------------------ *
 * La synthèse.
 * ------------------------------------------------------------------ */

export interface SyntheseDuBanc {
  pieces: number;
  champs: { total: number; justes: number; manquees: number; inventees: number; fausses: number };
  identifications: { attendues: number; justes: number };
  obstacles: { attendus: number; justes: number; signalesATort: number };
  echecsTechniques: number;
  verdicts: { justes: number; revuesHumaines: number };
  fausseConformite: readonly string[];
  /** Le fournisseur sort du banc, quel que soit le reste. */
  disqualifie: boolean;
  redactions: {
    total: number;
    ecrites: number;
    avecVocabulaireInterdit: number;
    avecNombresAjoutes: number;
    incoherences: { attendues: number; relevees: number };
  };
}

export function synthetiser(
  lectures: readonly NoteDeLecture[],
  redactions: readonly NoteDeRedaction[],
): SyntheseDuBanc {
  const champs = lectures.flatMap((n) => n.champs);
  const compter = (issue: IssueDuChamp) => champs.filter((c) => c.issue === issue).length;
  const fausseConformite = lectures.filter((n) => n.fausseConformite).map((n) => n.id);
  const attendues = redactions.filter((r) => r.incoherenceAttendue);

  return {
    pieces: lectures.length,
    champs: {
      total: champs.length,
      justes: compter("juste"),
      manquees: compter("manquee"),
      inventees: compter("inventee"),
      fausses: compter("fausse"),
    },
    identifications: {
      attendues: lectures.filter((n) => n.identificationJuste !== null).length,
      justes: lectures.filter((n) => n.identificationJuste === true).length,
    },
    obstacles: {
      attendus: lectures.filter((n) => n.obstacle === "juste" || n.obstacle === "manque").length,
      justes: lectures.filter((n) => n.obstacle === "juste").length,
      signalesATort: lectures.filter((n) => n.obstacle === "signale_a_tort").length,
    },
    echecsTechniques: lectures.filter((n) => n.echecTechnique).length,
    verdicts: {
      justes: lectures.filter((n) => n.verdictObtenu === n.verdictAttendu).length,
      revuesHumaines: lectures.filter((n) => n.verdictObtenu === "ILLISIBLE").length,
    },
    fausseConformite,
    disqualifie: fausseConformite.length > FAUSSES_CONFORMITES_ADMISES,
    redactions: {
      total: redactions.length,
      ecrites: redactions.filter((r) => r.ecrite).length,
      avecVocabulaireInterdit: redactions.filter((r) => r.fautesDeVocabulaire.length > 0).length,
      avecNombresAjoutes: redactions.filter((r) => r.nombresAjoutes.length > 0).length,
      incoherences: {
        attendues: attendues.length,
        relevees: attendues.filter((r) => r.incoherenceRelevee === true).length,
      },
    },
  };
}
