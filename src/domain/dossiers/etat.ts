/**
 * L'état stocké d'un dossier, et la date qui va avec — RG-07.2.
 *
 * ── Ce que la base exige, et que personne ne disait ─────────────────
 *
 * Une garde de `20260918000100_garde_fous` tient depuis le premier jour :
 *
 *     CHECK (("status" = 'PRET') = ("readyAt" IS NOT NULL))
 *
 * Elle est juste. « Prêt à déposer » est un état **calculé**, et la date
 * où il a été atteint en fait partie : un dossier prêt sans date ne dit
 * plus depuis quand, et une date sans l'état prétend une mise en état qui
 * n'a pas eu lieu. La contrainte refuse les deux.
 *
 * Seulement, la règle ne vivait nulle part dans le code. Sept écritures
 * changeaient `status` ; une seule posait la date avec — et encore,
 * depuis le 22/09 seulement, après que la même garde eut transformé
 * l'analyse d'une pièce en panne (S.38). Les six autres écrivaient l'état
 * seul, et la base les refusait **toutes** dès que le dossier était prêt :
 *
 *   - la déclaration de dépôt (WF-10 étape 1), dont `PRET` est le **seul**
 *     état accepté — donc impossible, toujours, pour tout le monde ;
 *   - la clôture avec issue déclarée ;
 *   - la mise en pause d'une divergence critique (WF-11), qui emportait
 *     la passe entière et laissait sans alerte tous les dossiers suivants ;
 *   - l'arbitrage d'une divergence ;
 *   - l'activation d'un pack payé ;
 *   - l'archivage de fin de purge, où le refus faisait survivre une pièce
 *     d'identité à sa propre purge (INV-5).
 *
 * Une garde de cohérence n'est pas une panne : elle le devient quand la
 * règle qu'elle énonce n'existe qu'en SQL. Elle existe ici désormais, et
 * les sept écritures passent par elle.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/**
 * Le vocabulaire **stocké**, celui de `ApplicationStatus`.
 *
 * Distinct de `StatutDossier`, qui est ce que le candidat lit : `SUSPENDU`
 * s'y affiche « en cours », et trois états de fin s'y confondent en
 * « clôturé ». Les deux listes sont tenues par `tests/schema-domaine`.
 */
export type EtatStocke =
  | "BROUILLON"
  | "ACTIF"
  | "PRET"
  | "SOUMIS"
  | "SUSPENDU"
  | "ISSUE_DECLAREE"
  | "ABANDONNE"
  | "ARCHIVE";

/** Ce que toute écriture d'état doit poser, jamais l'un sans l'autre. */
export interface MiseEnEtat {
  status: EtatStocke;
  readyAt: Date | null;
  /**
   * La date de la mise en pause — arbitrage S.78. La base exige qu'un
   * dossier `SUSPENDU` la porte, et qu'aucun autre ne la porte : c'est la
   * même forme de garde que `readyAt`, et pour la même raison. La durée
   * d'une suspension décide de la purge de ses pièces, et une date qui
   * survivrait à la reprise ferait purger un dossier qui ne l'est plus.
   */
  suspendedAt: Date | null;
}

/**
 * L'état visé, et sa date.
 *
 * `readyAt` **ne se renouvelle pas** quand le dossier était déjà prêt :
 * c'est la date où il l'est devenu, et un simple recalcul qui confirme
 * l'état ne la déplace pas. La repousser ferait vieillir un dossier à
 * l'envers — l'échéancier et la file de revue lisent cette date.
 */
export function miseEnEtat(
  vise: EtatStocke,
  /**
   * Les dates **actuelles** du dossier, les deux ensemble. La date de
   * pause était un quatrième paramètre facultatif, et quatre écritures sur
   * cinq l'omettaient : la purge, le recalcul de complétude, l'activation
   * d'un pack et l'arbitrage réécrivaient `SUSPENDU` sur un dossier déjà
   * suspendu, et chacune remettait sa pause à zéro — la fumée l'a vu sur
   * la purge, et une analyse de pièce l'aurait fait chaque jour, reculant
   * sans fin la purge de ses pièces. Obligatoire, elle ne s'oublie plus.
   */
  actuel: Pick<MiseEnEtat, "readyAt" | "suspendedAt">,
  maintenant: Date = new Date(),
): MiseEnEtat {
  return {
    status: vise,
    readyAt: vise === "PRET" ? (actuel.readyAt ?? maintenant) : null,
    // Même règle que `readyAt` : une suspension qui se confirme ne se
    // renouvelle pas, sa durée court depuis le premier jour.
    suspendedAt: vise === "SUSPENDU" ? (actuel.suspendedAt ?? maintenant) : null,
  };
}

/**
 * Les états depuis lesquels un dossier reprend son cours après une pause.
 *
 * Une divergence critique met le dossier en pause « le temps que tu
 * regardes » — c'est le mot du courrier et de la notification. La pause
 * finit donc quand il a regardé, quelle que soit sa décision : migrer
 * vers la nouvelle version, ou garder la sienne. Elle ne finissait pas :
 * la branche « je conserve » n'écrivait que l'arbitrage, et le dossier
 * restait `SUSPENDU` — sans rappel d'échéance, qui s'arrête là aussi.
 *
 * `ACTIF` et non `PRET` : la reprise ne décide pas de la complétude, elle
 * rend la main au calcul qui la décide.
 */
export const REPRISE_APRES_PAUSE: EtatStocke = "ACTIF";

/**
 * Les états d'un dossier qu'une publication de règle doit prévenir — WF-11,
 * RG-11.2.
 *
 * Trois états, et le troisième manquait.
 *
 * `ACTIF` et `PRET` vont de soi : ce sont les dossiers en cours, et
 * l'alerte leur sert. `SOUMIS` n'y est pas — le dossier est parti chez
 * l'autorité, sa version est celle du dépôt, et lui proposer de migrer
 * n'aurait aucun sens. Les états de fin non plus.
 *
 * `SUSPENDU`, en revanche, est **l'état que cette passe elle-même écrit**.
 * Une divergence critique met le dossier en pause « le temps que tu
 * regardes » ; s'il ne regarde pas, la publication suivante ne le voyait
 * plus. Le résultat, exécuté :
 *
 *     v2 : {"dossiers":1,"alertes":1,"critiques":1}   dossier → SUSPENDU
 *     v3 : {"dossiers":0,"alertes":0,"critiques":0}
 *     divergences du dossier : [{"vers":"v2","impact":"CRITIQUE"}]
 *     à « migrer » : « Une version plus récente est entrée en vigueur
 *                      depuis : c'est elle qui t'est proposée. »
 *     dossier → SUSPENDU
 *
 * Elle ne lui était pas proposée. Sa seule divergence visait une v2 que v3
 * venait d'archiver, et migrer vers une version archivée est refusé
 * (RG-14.1) : il ne lui restait que « conserver », donc figer son dossier
 * sur une v1 vieille de deux versions, après avoir lu qu'on lui proposait
 * la plus récente.
 *
 * C'est le défaut que la passe disait avoir corrigé pour la **version** —
 * « un dossier qui n'a pas arbitré la fois d'avant est resté sur v1 […]
 * sans issue » — et que le filtre d'**état** rouvrait, pour la seule
 * classe d'impact que la passe met en pause, c'est-à-dire la plus grave.
 */
export const ETATS_A_PREVENIR: readonly EtatStocke[] = ["ACTIF", "PRET", "SUSPENDU"];

/**
 * Les dossiers **ouverts**, ceux que compte le plafond de C-01 — RF-1,
 * FON-01, 09/10/2026.
 *
 * Le serveur comptait `BROUILLON`, `ACTIF` et `PRET`, et oubliait
 * `SUSPENDU` : un dossier mis en pause par une divergence attend pourtant
 * une décision du candidat, et il le dit à l'écran (`ATTEND_UNE_SUITE`).
 * L'écran, lui, comptait la liste entière, historique compris : trois
 * démarches terminées retiraient « Ouvrir un nouveau dossier » et
 * invitaient à clôturer un dossier — alors qu'aucun ne l'était plus.
 *
 * Une liste, lue par le serveur et tenue face à celle de l'écran par
 * `tests/dossiers` : les états d'ici sont exactement ceux qui s'affichent
 * dans `ATTEND_UNE_SUITE`.
 */
export const ETATS_OUVERTS: readonly EtatStocke[] = ["BROUILLON", "ACTIF", "PRET", "SUSPENDU"];

/**
 * Un dossier déposé ou clôturé garde l'état qu'il avait ce jour-là — et la
 * version de règle qu'il avait figée (INV-3, DOC-11 §2.1).
 */
export const ETATS_FIGES: readonly EtatStocke[] = [
  "SOUMIS",
  "ISSUE_DECLAREE",
  "ABANDONNE",
  "ARCHIVE",
];

export const estFige = (etat: EtatStocke): boolean => ETATS_FIGES.includes(etat);
