import { db } from "@/lib/db";
import { ecartOuvert } from "@/domain/backoffice/ecart";
import {
  constatsDuDiagnostic,
  origineDeLEvenement,
  type LectureFournisseur,
  type OrigineEvenement,
} from "@/domain/paiement/diagnostic";
import { CLES, environnementNormalise } from "./secrets";
import { lireLaTransactionFedaPay, type ApercuFedaPay } from "./fedapay";
import { ETATS_FEDAPAY } from "./notifications";

/**
 * Le diagnostic d'un paiement, rassemblé — S.116.
 *
 * Quatre lectures, aucune écriture : la transaction, ses événements de
 * paiement, les lignes du journal qui la citent, et la transaction chez
 * le fournisseur. Le croisement, lui, est dans le domaine.
 *
 * La lecture chez le fournisseur est injectable : la fumée la remplace,
 * et aucun appel ne part d'un test.
 */
export type LecteurFedaPay = (
  providerTxId: string,
) => ReturnType<typeof lireLaTransactionFedaPay>;

export interface Diagnostic {
  transaction: {
    reference: string;
    statut: string;
    cause: string | null;
    fournisseur: string;
    providerTxId: string | null;
    montant: number;
    devise: string;
    creeeLe: string;
    confirmeeLe: string | null;
    rapprocheeLe: string | null;
    ecart: string | null;
    ecartRefermeLe: string | null;
    pieces: string[];
  };
  evenements: { id: string; origine: OrigineEvenement; annonce: string; recuLe: string }[];
  journal: { action: string; auteur: string; motif: string; le: string }[];
  apercu: ApercuFedaPay | null;
  constats: string[];
}

export async function diagnostiquerLePaiement(
  reference: string,
  options: { lire?: LecteurFedaPay; env?: Record<string, string | undefined> } = {},
): Promise<Diagnostic | null> {
  const env = options.env ?? environnementNormalise();
  const t = await db.transaction.findUnique({
    where: { reference },
    include: {
      events: { orderBy: { receivedAt: "asc" } },
      invoices: { select: { number: true }, orderBy: { issuedAt: "asc" } },
    },
  });
  if (!t) return null;

  const journal = await db.auditLog.findMany({
    where: { target: `transaction:${reference}` },
    orderBy: { createdAt: "asc" },
    select: { action: true, actorId: true, reason: true, createdAt: true },
  });

  const espace = (env[CLES.FEDAPAY.environnement] ?? "sandbox").toLowerCase();
  const cle = (env[CLES.FEDAPAY.apiKey] ?? "").trim();
  let lecture: LectureFournisseur;
  let apercu: ApercuFedaPay | null = null;
  if (t.provider !== "FEDAPAY") {
    lecture = { issue: "non_lue", raison: "la lecture chez le fournisseur n'est écrite que pour FedaPay." };
  } else if (!t.providerTxId) {
    lecture = { issue: "non_lue", raison: "aucun identifiant de transaction enregistré." };
  } else if (!options.lire && !cle) {
    lecture = { issue: "non_lue", raison: `${CLES.FEDAPAY.apiKey} absente de l'environnement du conteneur.` };
  } else {
    const lire: LecteurFedaPay = options.lire ?? ((id) => lireLaTransactionFedaPay(cle, espace, id));
    const lu = await lire(t.providerTxId);
    if (lu.issue === "lue") {
      apercu = lu.apercu;
      const brut = (lu.apercu.etat ?? "").toLowerCase();
      lecture = {
        issue: "lue",
        id: lu.apercu.id,
        etat: lu.apercu.etat,
        statut: ETATS_FEDAPAY[brut] ?? null,
        referenceMarchande: lu.apercu.referenceMarchande,
      };
    } else {
      lecture = lu;
    }
  }

  const evenements = t.events.map((e) => ({
    id: e.providerEventId,
    origine: origineDeLEvenement(e.providerEventId),
    annonce: e.announced,
    recuLe: e.receivedAt.toISOString(),
  }));

  const constats = constatsDuDiagnostic({
    reference,
    statut: t.status,
    fournisseur: t.provider,
    providerTxId: t.providerTxId,
    webhooks: evenements.filter((e) => e.origine === "webhook").length,
    reconciliations: evenements.filter((e) => e.origine === "reconciliation").length,
    notificationsRefusees: journal.filter(
      (l) => l.actorId.startsWith("webhook:") && l.reason.startsWith("Notification refusée"),
    ).length,
    ecartOuvert: ecartOuvert(t),
    lecture,
    racine: (env.APP_URL ?? "").trim() || "https://immipro.app",
    espace,
  });

  return {
    transaction: {
      reference: t.reference,
      statut: t.status,
      cause: t.failureCause,
      fournisseur: t.provider,
      providerTxId: t.providerTxId,
      montant: t.amountMajor,
      devise: t.currency,
      creeeLe: t.createdAt.toISOString(),
      confirmeeLe: t.confirmedAt?.toISOString() ?? null,
      rapprocheeLe: t.reconciledAt?.toISOString() ?? null,
      ecart: t.discrepancy,
      ecartRefermeLe: t.discrepancyResolvedAt?.toISOString() ?? null,
      pieces: t.invoices.map((i) => i.number),
    },
    evenements,
    journal: journal.map((l) => ({
      action: l.action,
      auteur: l.actorId,
      motif: l.reason,
      le: l.createdAt.toISOString(),
    })),
    apercu,
    constats,
  };
}
