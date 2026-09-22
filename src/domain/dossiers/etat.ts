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

/** Le couple que toute écriture d'état doit poser, jamais l'un sans l'autre. */
export interface MiseEnEtat {
  status: EtatStocke;
  readyAt: Date | null;
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
  readyAtActuelle: Date | null,
  maintenant: Date = new Date(),
): MiseEnEtat {
  return vise === "PRET"
    ? { status: vise, readyAt: readyAtActuelle ?? maintenant }
    : { status: vise, readyAt: null };
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
