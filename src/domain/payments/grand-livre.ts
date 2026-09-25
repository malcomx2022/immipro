/**
 * La consommation du quota, imputée à ses octrois — arbitrage S.92.
 *
 * ── Ce qui manquait ─────────────────────────────────────────────────
 *
 * Le grand livre disait combien il restait, jamais **de quoi**. Une
 * consommation ne portait pas l'achat qu'elle entamait : « un solde n'a
 * pas de couleur ». S.88 en avait tiré une convention — les vingt
 * analyses d'une montée sont tenues pour consommées en dernier —, et
 * l'arbitrage définitif la remplace par une règle qui se relit ligne à
 * ligne : **premier octroi entré, premier consommé**, et chaque débit
 * nomme l'octroi qu'il entame.
 *
 * ── Ce que ce module décide ─────────────────────────────────────────
 *
 * Il rejoue le grand livre d'un dossier dans l'ordre où il s'est écrit
 * et rend, pour chaque octroi, ce qui en a été consommé et ce qui en
 * reste. La même fonction sert à deux choses, et c'est ce qui les tient
 * d'accord :
 *
 * - choisir l'octroi du **prochain** débit (`octroiAEntamer`) ;
 * - lire, au remboursement, si un octroi est **intact**.
 *
 * Les lignes écrites avant S.92 n'ont pas d'imputation. Elles ne sont ni
 * réécrites ni migrées : le rejeu les impute par la même règle, et une
 * ligne récente, qui porte la sienne, est prise telle qu'elle est écrite.
 * L'historique reste ce qu'il était ; seule sa lecture est définie.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type RaisonDeLigne =
  | "ACHAT_PACK"
  | "RECHARGE"
  | "ANALYSE"
  | "ANALYSE_RENDUE"
  | "GESTE_COMMERCIAL"
  | "REMBOURSEMENT";

export interface LigneDuGrandLivre {
  id: string;
  delta: number;
  reason: RaisonDeLigne;
  transactionId: string | null;
  analysisId: string | null;
  /** L'octroi imputé, quand la ligne le porte (écrite depuis S.92). */
  grantId: string | null;
  createdAt: Date;
}

/** Ce qui ouvre des droits : un achat, une recharge, un geste. */
const OCTROIS: ReadonlySet<RaisonDeLigne> = new Set(["ACHAT_PACK", "RECHARGE", "GESTE_COMMERCIAL"]);

export const estUnOctroi = (l: Pick<LigneDuGrandLivre, "delta" | "reason">): boolean =>
  l.delta > 0 && OCTROIS.has(l.reason);

export interface EtatDeLOctroi {
  id: string;
  transactionId: string | null;
  reason: RaisonDeLigne;
  accordees: number;
  /** Analyses consommées nettes : débits moins les analyses rendues. */
  consommees: number;
  /** Retirées par un remboursement. */
  retirees: number;
  restantes: number;
}

export interface Repartition {
  /** Dans l'ordre d'entrée : c'est l'ordre FIFO. */
  octrois: readonly EtatDeLOctroi[];
  /** L'octroi imputé à chaque ligne négative ou rendue, `null` si aucun. */
  imputations: ReadonlyMap<string, string | null>;
}

/** L'ordre d'écriture : la date, puis l'identifiant pour départager. */
const chronologique = (a: LigneDuGrandLivre, b: LigneDuGrandLivre): number =>
  a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function repartir(lignes: readonly LigneDuGrandLivre[]): Repartition {
  const ordre = [...lignes].sort(chronologique);
  const octrois = new Map<string, EtatDeLOctroi>();
  const imputations = new Map<string, string | null>();
  /** Débits dans l'ordre, avec ce qu'il en reste à rendre : pour les retours sans lien. */
  const debits: { id: string; analysisId: string | null; octroi: string | null; aRendre: number }[] =
    [];

  const premierDisponible = (): EtatDeLOctroi | undefined =>
    [...octrois.values()].find((o) => o.restantes > 0);
  const recalculer = (o: EtatDeLOctroi) => {
    o.restantes = o.accordees - o.consommees - o.retirees;
  };

  for (const l of ordre) {
    if (estUnOctroi(l)) {
      octrois.set(l.id, {
        id: l.id,
        transactionId: l.transactionId,
        reason: l.reason,
        accordees: l.delta,
        consommees: 0,
        retirees: 0,
        restantes: l.delta,
      });
      continue;
    }

    if (l.reason === "ANALYSE" && l.delta < 0) {
      // Imputation écrite, sinon le plus ancien octroi qui a encore de quoi.
      const octroi = (l.grantId ? octrois.get(l.grantId) : undefined) ?? premierDisponible();
      const n = -l.delta;
      if (octroi) {
        octroi.consommees += n;
        recalculer(octroi);
      }
      imputations.set(l.id, octroi?.id ?? null);
      debits.push({ id: l.id, analysisId: l.analysisId, octroi: octroi?.id ?? null, aRendre: n });
      continue;
    }

    if (l.reason === "ANALYSE_RENDUE" && l.delta > 0) {
      /*
        Une analyse rendue revient à l'octroi qu'elle avait entamé : celui
        qu'elle nomme, sinon celui du débit de la même analyse, sinon celui
        du dernier débit encore à rendre — une tentative rejouée se rend
        juste après avoir été débitée.
      */
      const debit =
        (l.analysisId
          ? [...debits].reverse().find((d) => d.analysisId === l.analysisId && d.aRendre > 0)
          : undefined) ?? [...debits].reverse().find((d) => d.aRendre > 0);
      const cible = l.grantId ?? debit?.octroi ?? null;
      const octroi = cible ? octrois.get(cible) : undefined;
      if (debit) debit.aRendre = Math.max(0, debit.aRendre - l.delta);
      if (octroi) {
        octroi.consommees = Math.max(0, octroi.consommees - l.delta);
        recalculer(octroi);
      }
      imputations.set(l.id, octroi?.id ?? null);
      continue;
    }

    if (l.reason === "REMBOURSEMENT" && l.delta < 0) {
      /*
        Un retrait porte sur l'achat remboursé : l'octroi qu'il nomme,
        sinon ceux de sa transaction. Il ne prend jamais sur un autre
        achat — rembourser un pack ne retire pas une recharge.
      */
      let aRetirer = -l.delta;
      const cibles = l.grantId
        ? [octrois.get(l.grantId)].filter((o): o is EtatDeLOctroi => o !== undefined)
        : [...octrois.values()].filter(
            (o) => l.transactionId !== null && o.transactionId === l.transactionId,
          );
      for (const o of cibles) {
        const pris = Math.min(aRetirer, Math.max(0, o.restantes));
        o.retirees += pris;
        recalculer(o);
        aRetirer -= pris;
        if (aRetirer === 0) break;
      }
      imputations.set(l.id, cibles[0]?.id ?? null);
    }
  }

  return { octrois: [...octrois.values()], imputations };
}

/** L'octroi que le prochain débit entamera : le plus ancien qui a encore de quoi. */
export const octroiAEntamer = (lignes: readonly LigneDuGrandLivre[]): string | null =>
  repartir(lignes).octrois.find((o) => o.restantes > 0)?.id ?? null;

/** L'état des octrois d'une transaction sur ce dossier. */
export const octroisDeLaTransaction = (
  lignes: readonly LigneDuGrandLivre[],
  transactionId: string,
): readonly EtatDeLOctroi[] =>
  repartir(lignes).octrois.filter((o) => o.transactionId === transactionId);
