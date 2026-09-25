import type { CompletenessPublic } from "@/domain/completeness/score";
import type { FicheDestination } from "@/domain/destinations/fiche";
import type { MotifProposition } from "@/domain/consultants/proposition";

/**
 * Dossier vu du candidat — WF-09, écran C-01.
 *
 * La vue ne porte que `CompletenessPublic` : le barème interne n'est pas dans
 * son type, il ne peut donc pas remonter au tableau de bord. C'est ce qui
 * remplace la note sur cent que le prototype affichait sur chaque carte
 * (arbitrage C-09, qui porte sur l'API et donc sur tous les écrans).
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/**
 * Ce que le candidat lit sur son dossier.
 *
 * `EN_PAUSE` a été ajouté le 23/09/2026. Il manquait, et la conséquence
 * n'était pas cosmétique : un dossier suspendu par une divergence critique
 * s'affichait « Actif », annonçait « Rien ne bloque un dépôt », et refusait
 * ensuite le dépôt en disant qu'il restait des pièces obligatoires à
 * réunir — alors qu'il n'en manquait aucune. Le candidat relisait une
 * checklist complète en cherchant ce qui n'y était pas.
 *
 * Le mot lui-même n'est pas nouveau : le courrier et la notification de
 * WF-11 disent déjà « ton dossier est mis en pause le temps que tu
 * regardes ». Il ne manquait qu'à l'écran du dossier.
 */
export type StatutDossier =
  | "BROUILLON"
  | "ACTIF"
  | "PRET"
  | "EN_PAUSE"
  | "SOUMIS"
  | "CLOTURE";

export const LIBELLE_STATUT: Record<StatutDossier, string> = {
  BROUILLON: "Brouillon",
  ACTIF: "Actif",
  PRET: "Prêt à déposer",
  EN_PAUSE: "En pause",
  SOUMIS: "Déposé",
  CLOTURE: "Clôturé",
};

/**
 * Ce qu'un dossier en pause attend, et où cela se décide.
 *
 * La phrase nomme le geste et l'écran : « ton dossier est en pause » seul
 * laisserait chercher. C'est la doctrine d'erreur du projet appliquée à un
 * état plutôt qu'à un échec — le constat, puis le geste.
 */
export const MENTION_EN_PAUSE =
  "Une exigence de ta destination a changé. Ton dossier est en pause le temps que tu regardes : rien n'est supprimé, et ta checklist reste celle de la version figée à l'ouverture. Ouvre tes alertes pour comparer les deux versions et décider.";

/**
 * Ce qu'un dossier **déposé** attend — WF-10.
 *
 * La prochaine action se déduisait de la checklist quel que soit l'état, et
 * la pause était le seul cas intercepté. Un dossier déposé dont une pièce
 * périssable arrive à échéance — ce qui finit toujours par arriver, la date
 * étant écrite au dépôt et relue chaque jour — affichait donc « Remplacer
 * ton relevé bancaire » sur un dossier parti à l'autorité, que le candidat
 * ne peut plus toucher.
 *
 * La phrase nomme l'état, puis le seul geste qui reste et où il se fait.
 */
export const MENTION_DEPOSE =
  "Ton dossier est déposé : il n'y a plus de pièce à corriger ici. Quand l'autorité aura répondu, viens déclarer l'issue depuis « Clôturer » — c'est elle qui sert à corriger les checklists.";

/**
 * Ce qu'un dossier **clôturé** attend, c'est-à-dire rien.
 *
 * Il affichait « Rien ne bloque un dépôt » quand ses pièces étaient
 * complètes, et « Ajouter ton passeport » quand elles ne l'étaient pas —
 * sur une démarche abandonnée ou dont l'issue est déjà déclarée.
 */
export const MENTION_CLOTURE =
  "Ce dossier est clôturé. Son archive reste consultable, et ses pièces seront supprimées à la date annoncée lors de la clôture.";

/**
 * Les états où le dossier attend encore quelque chose **du candidat**.
 *
 * Un dossier déposé attend l'autorité, un dossier clôturé n'attend rien :
 * ni l'un ni l'autre ne se compte parmi les dossiers « ouverts », et leurs
 * pièces ne sont pas « à réunir ».
 */
export const ATTEND_UNE_SUITE: readonly StatutDossier[] = [
  "BROUILLON",
  "ACTIF",
  "PRET",
  "EN_PAUSE",
];

export const attendUneSuite = (dossier: Dossier): boolean =>
  ATTEND_UNE_SUITE.includes(dossier.statut);

/** Ce que dit le résumé quand plus rien n'attend le candidat. */
export const AUCUNE_SUITE_ATTENDUE = "Aucun dossier n'attend une action de ta part.";

/** Ce qu'un dossier déposé sait de la conservation de ses pièces. */
export interface ConservationDuDepot {
  /** Fin de conservation en cours. */
  jusquAu: string;
  /** Purge annoncée, si le préavis est parti. */
  purgeLe: string | null;
  /** Purge faite : il n'y a plus rien à conserver. */
  purgeeLe: string | null;
  /** Premier jour où « l'instruction continue » se confirme. */
  confirmableLe: string;
  /** La confirmation est-elle ouverte aujourd'hui ? */
  confirmable: boolean;
  /** Date réelle du dépôt, `AAAA-MM-JJ` (S.89). */
  deposeLe?: string | null;
  /** Prochaine question sur l'issue — J+30 ou J+60 —, ou `null`. */
  prochaineQuestion?: string | null;
  /** Demande de correction de la date en attente (S.90), ou `null`. */
  correctionDemandee?: { deposeLe: string; demandeeLe: string } | null;
}

export interface Dossier {
  id: string;
  destination: FicheDestination;
  statut: StatutDossier;
  /**
   * Date cible — rentrée ou prise de poste, ISO. Absente tant qu'elle n'est
   * pas fixée.
   *
   * Elle s'appelait `depotVise`, et le nom mentait : DOC-11 WF-09 étape 1
   * construit l'échéancier « à rebours depuis la date cible (rentrée,
   * prise de poste) », et le dépôt s'en déduit en retirant le délai
   * d'instruction. Trois écrans l'affichaient comme une date de dépôt, et
   * deux calculs s'en servaient comme telle — d'où `depot`, juste en
   * dessous, qui est la vraie.
   */
  departVise?: string;
  /**
   * Date de dépôt, déduite de la cible en retirant le délai d'instruction
   * de la règle **figée** (RG-09.1, INV-3). Absente sans date cible.
   *
   * Sans délai annoncé par la procédure, elle retombe sur la date cible :
   * c'est l'approximation prudente que l'échéancier fait déjà, et elle ne
   * prétend pas à une précision qu'on n'a pas.
   *
   * C'est **elle** qu'il faut pour toute question de la forme « cette
   * pièce sera-t-elle encore valable ? » ou « quelle version de la règle
   * s'appliquera ? » : ce qui compte est le jour du dépôt, pas celui du
   * départ.
   */
  depot?: string;
  completude: CompletenessPublic;
  /**
   * Une seule action, celle qui débloque le plus. Un tableau de bord qui
   * liste tout ce qu'il reste ne dit pas par où commencer.
   */
  prochaineAction: string;
  /**
   * `SOUMIS` seul — la conservation de ses pièces (arbitrage S.78). Dates
   * `AAAA-MM-JJ`, au jour de Cotonou.
   */
  conservation?: ConservationDuDepot;
  /**
   * Situation déclarée par le candidat qui dépasse ce que la plateforme sait
   * faire (WF-13, écran T-03). Elle vit sur le dossier et non sur le profil :
   * un refus antérieur ne pèse que sur la destination concernée.
   */
  limiteDeclaree?: MotifProposition;
}

/** Trois dossiers en parallèle au maximum (C-01). */
export const DOSSIERS_MAX = 3;

export const peutOuvrirUnDossier = (dossiers: readonly Dossier[]): boolean =>
  dossiers.length < DOSSIERS_MAX;

/**
 * Les dossiers actifs d'abord, puis les brouillons, puis le reste : ce qui
 * demande une action passe avant ce qui attend.
 */
const RANG: Record<StatutDossier, number> = {
  // Un dossier en pause passe devant tout : c'est le seul qui attend une
  // décision du candidat et qu'aucune pièce ne fera avancer.
  EN_PAUSE: 0,
  ACTIF: 1,
  PRET: 2,
  BROUILLON: 3,
  SOUMIS: 4,
  CLOTURE: 5,
};

export const trierDossiers = (dossiers: readonly Dossier[]): Dossier[] =>
  [...dossiers].sort((a, b) => RANG[a.statut] - RANG[b.statut]);

/**
 * « Deux dossiers ouverts, neuf pièces obligatoires à réunir. »
 *
 * Le prototype écrivait « à reprendre ». Le compteur du domaine dénombre ce
 * qui manque, pas ce qui a été déposé puis refusé : un brouillon où rien n'a
 * encore été déposé n'a rien « à reprendre ». Le mot suit la donnée, sans
 * quoi le résumé décourage en annonçant un travail de correction qui n'existe
 * pas.
 */
export function resumeDuJour(tous: readonly Dossier[]): string {
  if (tous.length === 0) return "";
  /*
    Les dossiers qui attendent encore quelque chose du candidat, et eux
    seuls. Le résumé comptait tout : un dossier déposé et un dossier
    abandonné entraient dans « dossiers ouverts », et leurs pièces
    manquantes dans « à réunir ». Constaté en exécution — trois dossiers
    dont aucun n'est ouvert : « 3 dossiers ouverts, 3 pièces obligatoires à
    réunir ». Le mot suit la donnée, et ces deux-là ne la suivaient plus.
  */
  const dossiers = tous.filter(attendUneSuite);
  if (dossiers.length === 0) return AUCUNE_SUITE_ATTENDUE;
  const ouverts =
    dossiers.length > 1 ? `${dossiers.length} dossiers ouverts` : "1 dossier ouvert";
  const aReunir = dossiers.reduce(
    (total, d) => total + d.completude.compteurs.obligatoiresManquantes,
    0,
  );
  /*
    Une exigence qu'aucune pièce ne tient bloque le dépôt sans rien ajouter
    à la checklist. Depuis que le compteur des obligatoires ne compte plus
    que des pièces, l'ignorer ici ferait annoncer « rien ne bloque un
    dépôt » sur un dossier que le serveur refuse de déclarer prêt — la
    contradiction que le lot précédent est venu supprimer, reparue par la
    porte d'à côté.
  */
  const exigences = dossiers.reduce(
    (total, d) => total + d.completude.compteurs.exigencesNonTenues,
    0,
  );
  if (aReunir === 0 && exigences === 0) return `${ouverts}, rien ne bloque un dépôt.`;
  if (aReunir === 0) {
    const mot = exigences > 1 ? `${exigences} exigences à lever` : "1 exigence à lever";
    return `${ouverts}, ${mot}.`;
  }
  const pieces = aReunir > 1 ? `${aReunir} pièces obligatoires` : "1 pièce obligatoire";
  const suite = exigences > 0 ? ` et ${exigences > 1 ? `${exigences} exigences` : "1 exigence"} à lever` : "";
  return `${ouverts}, ${pieces} à réunir${suite}.`;
}
