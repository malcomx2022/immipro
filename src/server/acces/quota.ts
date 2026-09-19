import type { CreditReason } from "@prisma/client";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";

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
 * Débite une analyse. Rend l'identifiant de la ligne écrite, ou lève
 * `quota_epuise` — jamais un solde négatif.
 *
 * L'écriture conditionnelle est en SQL parce qu'aucune API de Prisma ne sait
 * exprimer « insère si l'agrégat vérifie une condition ». La remplacer par
 * une transaction sérialisable serait possible, au prix d'un réessai à
 * gérer dans chaque appelant.
 */
export async function debiterUneAnalyse(
  applicationId: string,
  analysisId?: string,
): Promise<void> {
  const ecrites = await db.$executeRaw`
    INSERT INTO "AnalysisCredit" ("id", "applicationId", "delta", "reason", "analysisId", "createdAt")
    SELECT gen_random_uuid(), ${applicationId}, -1, 'ANALYSE'::"CreditReason", ${analysisId ?? null}, NOW()
    WHERE (
      SELECT COALESCE(SUM("delta"), 0) FROM "AnalysisCredit" WHERE "applicationId" = ${applicationId}
    ) > 0
  `;
  if (ecrites === 0) throw echec("quota_epuise");
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
): Promise<boolean> {
  const dejaRendue = await db.analysisCredit.findFirst({
    where: { applicationId, analysisId, reason: "ANALYSE_RENDUE" },
    select: { id: true },
  });
  if (dejaRendue) return false;
  await db.analysisCredit.create({
    data: { applicationId, delta: 1, reason: "ANALYSE_RENDUE", analysisId, note },
  });
  return true;
}

/**
 * Analyses ouvertes par un pack. La valeur vient de la grille tarifaire et
 * non d'une constante recopiée ici : deux chiffres pour la même chose
 * divergent au premier changement de grille.
 */
export { getPack as packDuCode } from "@/domain/payments/pricing";
