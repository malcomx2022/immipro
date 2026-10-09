import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { couverturesDuDossier } from "@/server/acces/droits";
import { PACKS_REDACTION_ASSISTEE } from "@/domain/payments/droits";
import {
  PACK_DE_DEPART,
  detailDuPrix,
  verdictDeLaMontee,
  type AchatSource,
  type DetailDuPrix,
  type VerdictDeLaMontee,
} from "@/domain/payments/montee";
import type { Devise } from "@/domain/payments/pricing";

/**
 * Le passage d'Essentiel à Dossier, lu en base — arbitrage S.88.
 *
 * Ce module retrouve les achats Essentiel qui couvrent un dossier et les
 * montées déjà parties d'eux. La décision — ouvert ou non, depuis quel
 * achat, à quel prix — est celle du domaine (`verdictDeLaMontee`), sans
 * base ni réseau.
 *
 * « Couvrir ce dossier » se lit dans le grand livre, comme la rédaction
 * assistée : un octroi `ACHAT_PACK` de cet achat sur ce dossier. Un
 * Essentiel payé pour un autre dossier ne sert pas de base ici.
 */

const STATUTS_OUVERTS = ["INITIEE", "EN_ATTENTE", "CONFIRMEE"] as const;

export async function verdictDuDossier(
  applicationId: string,
  userId: string,
): Promise<VerdictDeLaMontee> {
  const [essentiels, couvertures] = await Promise.all([
    db.transaction.findMany({
      where: {
        userId,
        packCode: PACK_DE_DEPART,
        credits: { some: { applicationId, reason: "ACHAT_PACK", delta: { gt: 0 } } },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        reference: true,
        packCode: true,
        status: true,
        amountMajor: true,
        currency: true,
        refundDueAt: true,
        montees: {
          where: { applicationId, status: { in: [...STATUTS_OUVERTS] } },
          select: { status: true, refundDueAt: true },
        },
      },
    }),
    couverturesDuDossier(applicationId),
  ]);

  const sources: AchatSource[] = essentiels.map((t) => {
    const montee = t.montees[0];
    return {
      transactionId: t.id,
      reference: t.reference,
      packCode: t.packCode,
      statut: t.status,
      montant: t.amountMajor,
      devise: t.currency as Devise,
      couvreLeDossier: true,
      remboursementOuvert: t.refundDueAt !== null || t.status === "REMBOURSEE",
      montee: !montee
        ? "AUCUNE"
        : montee.status !== "CONFIRMEE"
          ? "EN_COURS"
          : montee.refundDueAt !== null
            ? "EN_REMBOURSEMENT"
            : "CONFIRMEE",
    };
  });

  // Un pack qui ouvre déjà la rédaction assistée — Dossier ou Pro, acheté
  // au prix plein. La montée confirmée, elle, se lit sur sa source.
  const dejaCouvertParDossier = couvertures.some(
    (c) => !c.retiree && PACKS_REDACTION_ASSISTEE.includes(c.packCode),
  );
  return verdictDeLaMontee(sources, dejaCouvertParDossier);
}

/** L'offre telle que les écrans l'affichent : le verdict, et le calcul du prix. */
export type OffreDeMontee =
  | { ouverte: true; detail: DetailDuPrix; reprise: boolean }
  | { ouverte: false; message: string };

export async function offreDeMontee(
  applicationId: string,
  userId: string,
): Promise<OffreDeMontee> {
  const verdict = await verdictDuDossier(applicationId, userId);
  if (!verdict.ouverte) return { ouverte: false, message: verdict.message };
  return {
    ouverte: true,
    detail: detailDuPrix({ montant: verdict.source.montant, devise: verdict.source.devise }),
    reprise: verdict.reprise,
  };
}

/** Ce que la création d'une montée doit savoir de son achat d'origine. */
export interface SourceDeLaMontee {
  transactionId: string;
  montant: number;
  devise: Devise;
  /** Le prix dû, calculé ici et jamais reçu du navigateur. */
  du: number;
}

/**
 * L'achat d'origine d'une montée qu'on s'apprête à ouvrir, ou un refus
 * qui dit pourquoi.
 */
export async function sourceDeLaMontee(
  applicationId: string,
  userId: string,
): Promise<SourceDeLaMontee> {
  const verdict = await verdictDuDossier(applicationId, userId);
  if (!verdict.ouverte) throw echec("montee_indisponible", { corps: verdict.message });
  return {
    transactionId: verdict.source.transactionId,
    montant: verdict.source.montant,
    devise: verdict.devise,
    du: verdict.montant,
  };
}


/**
 * Le lien des écrans où la rédaction assistée est réservée : la page des
 * packs quand le passage à Dossier est ouvert — elle le propose, à côté de
 * la recharge —, sinon la page Tarifs, qui dit ce que chaque pack ouvre.
 */
export async function lienDesPacks(applicationId: string, userId: string): Promise<string> {
  const verdict = await verdictDuDossier(applicationId, userId);
  return verdict.ouverte ? `/paiement/pack?dossier=${applicationId}` : "/tarifs";
}
