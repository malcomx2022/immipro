import type { CreditReason, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { octroiAEntamer, type LigneDuGrandLivre } from "@/domain/payments/grand-livre";

/**
 * Quota d'analyses — INV-6, « jamais de dépassement silencieux ».
 *
 * Le solde est la somme d'un grand livre (`AnalysisCredit`), jamais une
 * colonne. Le choix a été arrêté avec le schéma ; il a une conséquence que
 * ce module doit assumer : une somme se lit, et entre la lecture et
 * l'écriture, une autre requête peut débiter. Deux analyses lancées en même
 * temps sur un quota d'une seule liraient toutes deux « il en reste une »,
 * et le solde finirait à moins un. C'est exactement le dépassement
 * silencieux que l'invariant interdit.
 *
 * D'où le débit en une seule instruction SQL : l'insertion ne se fait que si
 * la somme reste positive au moment où Postgres l'évalue, et le nombre de
 * lignes écrites dit si elle a eu lieu. Aucune fenêtre entre la lecture et
 * l'écriture, donc aucune course à perdre.
 */

export async function solde(applicationId: string): Promise<number> {
  const { _sum } = await db.analysisCredit.aggregate({
    where: { applicationId },
    _sum: { delta: true },
  });
  return _sum.delta ?? 0;
}

export interface Compteur {
  restantes: number;
  /** Total ouvert depuis l'ouverture du dossier : achats et gestes, hors consommation. */
  total: number;
}

/**
 * Ce que l'écran affiche : « Analyses restantes : 12 sur 30 ». Le total est
 * la somme des octrois et non la valeur du pack : une recharge l'augmente,
 * et afficher le pack seul ferait mentir le dénominateur.
 */
export async function compteur(applicationId: string): Promise<Compteur> {
  const lignes = await db.analysisCredit.groupBy({
    by: ["applicationId"],
    where: { applicationId },
    _sum: { delta: true },
  });
  const octrois = await db.analysisCredit.aggregate({
    where: { applicationId, delta: { gt: 0 } },
    _sum: { delta: true },
  });
  return {
    restantes: lignes[0]?._sum.delta ?? 0,
    total: octrois._sum.delta ?? 0,
  };
}

export interface Octroi {
  applicationId: string;
  analyses: number;
  motif: Extract<CreditReason, "ACHAT_PACK" | "RECHARGE" | "GESTE_COMMERCIAL">;
  transactionId?: string;
  note?: string;
}

export async function ouvrirDuQuota(octroi: Octroi): Promise<void> {
  if (octroi.analyses <= 0) throw new Error("un octroi de quota est strictement positif");
  await db.analysisCredit.create({
    data: {
      applicationId: octroi.applicationId,
      delta: octroi.analyses,
      reason: octroi.motif,
      transactionId: octroi.transactionId ?? null,
      note: octroi.note ?? null,
    },
  });
}

/**
 * Le grand livre d'un dossier, sous verrou — arbitrage S.92.
 *
 * Le débit se faisait en une seule instruction SQL : « insère si la somme
 * reste positive ». Elle tenait le solde, elle ne peut pas tenir
 * **l'octroi** : deux débits simultanés liraient tous deux « il reste une
 * analyse sur l'Essentiel » et l'entameraient deux fois, et la montée
 * paraîtrait intacte alors qu'une de ses analyses a servi.
 *
 * Un verrou consultatif de transaction, par dossier, sérialise donc tout
 * ce qui entame ou retire des analyses : les débits, et le retrait d'un
 * remboursement. Il ne bloque rien d'autre — ni les autres dossiers, ni
 * la lecture — et se relâche à la fin de la transaction, erreur comprise.
 */
export async function sousVerrouDuGrandLivre<T>(
  applicationId: string,
  travail: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`grand-livre:${applicationId}`}, 0))`;
    return travail(tx);
  });
}

/**
 * Le verrou de plusieurs grands livres, pris dans un ordre fixe — revue du
 * 07/10/2026, M4.
 *
 * Un pack Pro sert jusqu'à trois dossiers, et la tranche d'une revue
 * manuelle retire ses analyses restantes de chacun (D-11). Chaque dossier
 * se verrouille comme pour un débit ; l'ordre trié écarte l'interblocage
 * entre deux tranches qui viseraient les mêmes dossiers.
 */
export async function sousVerrouDesGrandsLivres<T>(
  applicationIds: readonly string[],
  travail: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const ordonnes = [...new Set(applicationIds)].sort();
  return db.$transaction(async (tx) => {
    for (const id of ordonnes) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`grand-livre:${id}`}, 0))`;
    }
    return travail(tx);
  });
}

/** Les lignes du grand livre d'un dossier, telles que le domaine les rejoue. */
export async function lignesDuGrandLivre(
  applicationId: string,
  client: Prisma.TransactionClient | typeof db = db,
): Promise<LigneDuGrandLivre[]> {
  return client.analysisCredit.findMany({
    where: { applicationId },
    select: {
      id: true,
      delta: true,
      reason: true,
      transactionId: true,
      analysisId: true,
      grantId: true,
      createdAt: true,
    },
  });
}

/**
 * Débite une analyse. Rend la ligne écrite et l'octroi entamé, ou lève
 * `quota_epuise` — jamais un solde négatif.
 *
 * Premier octroi entré, premier consommé (S.92) : l'octroi est choisi par
 * le rejeu du grand livre, et **écrit** sur la ligne. La consommation se
 * relit ainsi achat par achat, sans convention à reconstituer.
 *
 * `note` dit ce qui a consommé quand ce n'est pas la lecture d'une pièce :
 * la rédaction assistée s'y signale (`NOTE_REDACTION_ASSISTEE`), et c'est
 * sur cette trace, écrite **avant** l'appel, que le remboursement d'une
 * montée sait si elle a servi.
 */
export async function debiterUneAnalyse(
  applicationId: string,
  analysisId?: string,
  options: {
    note?: string;
    /**
     * La version de pièce que ce débit réserve — RF-3, E5. Avec elle, un
     * rejeu reprend la réservation ouverte de la version au lieu d'en
     * poser une seconde.
     */
    versionId?: string;
  } = {},
): Promise<{ ligne: string; octroi: string | null; reprise: boolean }> {
  return sousVerrouDuGrandLivre(applicationId, async (tx) => {
    if (options.versionId) {
      const ouverte = await reservationOuverte(applicationId, options.versionId, tx);
      if (ouverte) return { ...ouverte, reprise: true };
    }
    const lignes = await lignesDuGrandLivre(applicationId, tx);
    const restantes = lignes.reduce((n, l) => n + l.delta, 0);
    if (restantes <= 0) throw echec("quota_epuise");
    const grantId = octroiAEntamer(lignes);
    const ligne = await tx.analysisCredit.create({
      data: {
        applicationId,
        delta: -1,
        reason: "ANALYSE",
        analysisId: analysisId ?? null,
        grantId,
        versionId: options.versionId ?? null,
        note: options.note ?? null,
      },
      select: { id: true },
    });
    return { ligne: ligne.id, octroi: grantId, reprise: false };
  });
}

/**
 * La réservation ouverte d'une version, s'il y en a une — RF-3, E5,
 * 09/10/2026.
 *
 * Le débit précède l'appel au modèle (INV-6). Un arrêt entre les deux —
 * worker arrêté, base indisponible au moment du verdict — laissait une
 * ligne `ANALYSE` que rien ne rattachait à sa pièce : le rejeu ne la
 * voyait pas et débitait de nouveau. Exécuté avant correction, une
 * extraction interrompue puis rejouée coûtait deux analyses, et deux
 * reprises simultanées trois.
 *
 * Ouverte : les écritures de la version ne s'annulent pas (un débit sans
 * rendu) et son dernier débit n'est lié à aucune analyse. Un débit lié a
 * servi ; un débit rendu est soldé. À lire sous le verrou du grand livre,
 * qui sérialise déjà tous les débits du dossier.
 */
async function reservationOuverte(
  applicationId: string,
  versionId: string,
  client: Prisma.TransactionClient,
): Promise<{ ligne: string; octroi: string | null } | null> {
  const lignes = await client.analysisCredit.findMany({
    where: { applicationId, versionId, reason: { in: ["ANALYSE", "ANALYSE_RENDUE"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, delta: true, reason: true, analysisId: true, grantId: true },
  });
  if (lignes.reduce((n, l) => n + l.delta, 0) >= 0) return null;
  const debit = lignes.filter((l) => l.reason === "ANALYSE").at(-1);
  if (!debit || debit.analysisId !== null) return null;
  return { ligne: debit.id, octroi: debit.grantId };
}

/**
 * Rend la réservation ouverte d'une version, et seulement elle — RF-3, E5.
 *
 * Pour ce qui s'arrête sans verdict : une version remplacée ou une
 * autorisation retirée après un arrêt, ou l'exécution qui perd la course
 * contre une autre sur la même version. Un débit déjà lié à une analyse
 * a servi, un débit déjà rendu est soldé : rien n'est rendu deux fois.
 */
export async function rendreLaReservation(
  applicationId: string,
  versionId: string,
  note: string,
): Promise<boolean> {
  return sousVerrouDuGrandLivre(applicationId, async (tx) => {
    const ouverte = await reservationOuverte(applicationId, versionId, tx);
    if (!ouverte) return false;
    await tx.analysisCredit.create({
      data: {
        applicationId,
        delta: 1,
        reason: "ANALYSE_RENDUE",
        grantId: ouverte.octroi,
        versionId,
        note,
      },
    });
    return true;
  });
}

/**
 * Rend une analyse. Trois cas le justifient, et ils ont en commun que la
 * lecture n'a rien rendu : une pièce illisible, un échec technique, une
 * revue humaine qui reprend le travail de la machine (RG-06.3, B-05).
 *
 * Le rendu est idempotent par analyse : une revue rejouée ne recrédite pas
 * deux fois. Sans cette garde, la reprise d'un job après incident offrirait
 * des analyses gratuites à qui sait relancer.
 */
export async function rendreUneAnalyse(
  applicationId: string,
  analysisId: string,
  note: string,
  /** L'octroi entamé par le débit, quand l'appelant le tient (S.92). */
  grantId?: string | null,
  /**
   * La transaction de l'appelant, quand le rendu doit tomber avec ce qu'il
   * écrit : le verdict d'une analyse et son rendu ne se séparent pas.
   */
  client: Prisma.TransactionClient | typeof db = db,
): Promise<boolean> {
  const dejaRendue = await client.analysisCredit.findFirst({
    where: { applicationId, analysisId, reason: "ANALYSE_RENDUE" },
    select: { id: true },
  });
  if (dejaRendue) return false;
  // Rendue à l'octroi que son débit avait entamé (S.92).
  const debit =
    grantId !== undefined
      ? { grantId }
      : await client.analysisCredit.findFirst({
          where: { applicationId, analysisId, reason: "ANALYSE" },
          orderBy: { createdAt: "desc" },
          select: { grantId: true },
        });
  /*
    La lecture ci-dessus ne tient pas seule contre deux rendus simultanés :
    entre la lecture et l'écriture, l'autre est passé. La base porte la
    règle (`analysiscredit_un_seul_rendu_par_analyse`, revue du
    07/10/2026, F4) : le second bute sur l'unicité et ne rend rien.
  */
  // La version de l'analyse : le rendu solde sa réservation (RF-3, E5).
  const lue = await client.documentAnalysis.findUnique({
    where: { id: analysisId },
    select: { versionId: true },
  });
  try {
    await client.analysisCredit.create({
      data: {
        applicationId,
        delta: 1,
        reason: "ANALYSE_RENDUE",
        analysisId,
        grantId: debit?.grantId ?? null,
        versionId: lue?.versionId ?? null,
        note,
      },
    });
  } catch (erreur) {
    if ((erreur as { code?: unknown } | null)?.code === "P2002") return false;
    throw erreur;
  }
  return true;
}

/**
 * Rend l'analyse débitée pour une tentative qui n'a rien rendu et sera
 * rejouée — branchement de l'extraction, 22/09/2026.
 *
 * Distincte de `rendreUneAnalyse`, et la distinction porte l'idempotence.
 * Celle-là est idempotente **par analyse**, parce qu'une revue rejouée ne
 * doit pas recréditer deux fois. Ici il n'y a pas d'analyse : le job a
 * débité, le service de lecture n'a pas répondu, rien n'est écrit sur la
 * pièce et la file rejouera. Chaque tentative est donc son propre couple
 * débit/rendu, et les compter par analyse ne rendrait qu'une fois sur
 * trois — le candidat paierait les indisponibilités d'un tiers.
 *
 * `note` dit laquelle : sans elle, le grand livre montrerait des rendus
 * sans cause, et INV-6 demande que le quota se relise.
 */
export async function rendreUneTentative(
  applicationId: string,
  note: string,
  /** L'octroi que le débit avait entamé, tel que `debiterUneAnalyse` l'a rendu (S.92). */
  grantId: string | null = null,
  /** La version dont la réservation est soldée, pour la lecture d'une pièce (RF-3). */
  versionId: string | null = null,
): Promise<void> {
  await db.analysisCredit.create({
    data: { applicationId, delta: 1, reason: "ANALYSE_RENDUE", note, grantId, versionId },
  });
}

/**
 * Analyses ouvertes par un pack. La valeur vient de la grille tarifaire et
 * non d'une constante recopiée ici : deux chiffres pour la même chose
 * divergent au premier changement de grille.
 */
export { getPack as packDuCode } from "@/domain/payments/pricing";
