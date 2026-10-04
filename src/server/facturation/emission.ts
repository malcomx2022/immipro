import type { Prisma, Transaction } from "@prisma/client";
import { db } from "@/lib/db";
import {
  exerciceDe,
  numeroDeLaPiece,
  type GenrePiece,
  type Serie,
} from "@/domain/facturation/numerotation";
import {
  mentionDeTva,
  montantEnLettres,
  regimeDeTva,
  ventiler,
  versMineur,
  type Regime,
} from "@/domain/facturation/montants";
import {
  QUALITE_CLIENT_PARTICULIER,
  designation,
  emetteurDeLaFacture,
  identiteDeFacturation,
  modeDeReglement,
  obstaclesALaFacturation,
  type EtatDeLaFacturation,
  type ObstacleALaFacturation,
} from "@/domain/facturation/facture";
import { libelleDeLAchat } from "@/domain/paiement/recu";
import { espaceReel } from "@/server/paiement/secrets";
import { valeursDesVariables } from "@/server/juridique/lecture";
import { versFiche } from "@/server/acces/regles";
import { journaliser } from "@/server/acces/journal";
import { certificationBranchee, leCertificateur } from "@/server/facturation/certification";

/**
 * Émission des factures et des avoirs — avis comptable M.C du 04/10/2026.
 *
 * ── Quand une pièce s'émet ──────────────────────────────────────────
 *
 * Une facture, quand le fournisseur a confirmé le paiement par une
 * notification signée — jamais sur le retour du navigateur (INV-7). Un
 * avoir, quand il a confirmé le remboursement : l'avis demande que
 * **chaque** remboursement, même fait à la main au tableau de bord
 * FedaPay, soit adossé à un avoir, faute de quoi le chiffre d'affaires
 * reste gonflé et la TVA indûment collectée.
 *
 * Les deux s'appellent après la transition, hors de sa transaction : une
 * émission qui échoue ne défait pas un paiement confirmé. Le filet est la
 * réconciliation, qui reprend toute vente sans facture et tout
 * remboursement sans avoir.
 *
 * ── Une suite sans trou ─────────────────────────────────────────────
 *
 * La place dans la suite se prend dans la **même** transaction que la
 * pièce : l'incrément verrouille la ligne de la suite jusqu'au commit, les
 * émissions simultanées passent l'une après l'autre, et une émission qui
 * échoue rend sa place avec tout le reste. Une seule pièce de chaque genre
 * par transaction (index unique) : deux appelants simultanés n'en
 * produisent qu'une, le second relit celle du premier.
 */

const estUnDoublon = (erreur: unknown): boolean =>
  typeof erreur === "object" &&
  erreur !== null &&
  "code" in erreur &&
  (erreur as { code?: unknown }).code === "P2002";

/** Le régime déclaré par l'exploitant. */
export const regimeDeLExploitant = (
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): Regime => regimeDeTva(environnement.FACTURATION_TVA);

/** Ce que l'exploitant a mis en place, et donc ce qui ferme encore la série réelle. */
export async function etatDeLaFacturation(
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): Promise<EtatDeLaFacturation & { obstacles: ObstacleALaFacturation[] }> {
  const etat: EtatDeLaFacturation = {
    certificationBranchee: certificationBranchee(environnement),
    emetteurComplet: emetteurDeLaFacture(await valeursDesVariables()) !== null,
    regime: regimeDeLExploitant(environnement),
  };
  return { ...etat, obstacles: obstaclesALaFacturation(etat) };
}

/**
 * La série d'une transaction : réelle si son fournisseur encaisse pour de
 * vrai, d'essai sinon. Lue à l'émission, sur la configuration du moment —
 * celle que la notification signée vient d'éprouver.
 */
export const serieDe = (
  transaction: Pick<Transaction, "provider">,
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): Serie => (espaceReel(transaction.provider, environnement) ? "REELLE" : "ESSAI");

export type IssueDEmission =
  | { issue: "emise"; numero: string }
  | { issue: "deja_emise"; numero: string }
  /** Pas une vente à facturer : ni confirmée ni remboursée. */
  | { issue: "sans_objet" }
  /** Série réelle fermée : la pièce ne s'émet pas, et rien n'est inventé. */
  | { issue: "bloquee"; raisons: string[] };

async function prendreUnRang(
  tx: Prisma.TransactionClient,
  serie: Serie,
  genre: GenrePiece,
  exercice: number,
): Promise<number> {
  const suite = await tx.invoiceSequence.upsert({
    where: { series_kind_fiscalYear: { series: serie, kind: genre, fiscalYear: exercice } },
    create: { series: serie, kind: genre, fiscalYear: exercice, last: 1 },
    update: { last: { increment: 1 } },
  });
  return suite.last;
}

/** Une tentative de plus quand deux premières émissions de l'exercice se croisent. */
async function avecReprise<T>(faire: () => Promise<T>): Promise<T> {
  try {
    return await faire();
  } catch (erreur) {
    if (!estUnDoublon(erreur)) throw erreur;
    return faire();
  }
}

/**
 * Établit la facture d'une vente confirmée. Idempotente : la rappeler rend
 * la pièce déjà émise.
 */
export async function etablirLaFacture(
  transactionId: string,
  environnement: Readonly<Record<string, string | undefined>> = process.env,
  maintenant = new Date(),
): Promise<IssueDEmission> {
  const deja = await db.invoice.findUnique({
    where: { transactionId_kind: { transactionId, kind: "FACTURE" } },
  });
  if (deja) return { issue: "deja_emise", numero: deja.number };

  const transaction = await db.transaction.findUnique({
    where: { id: transactionId },
    include: {
      user: { select: { billingName: true, billingAddress: true } },
      application: { include: { visaRule: true } },
    },
  });
  if (!transaction || (transaction.status !== "CONFIRMEE" && transaction.status !== "REMBOURSEE")) {
    return { issue: "sans_objet" };
  }

  const serie = serieDe(transaction, environnement);
  const emetteur = emetteurDeLaFacture(await valeursDesVariables());
  const client = identiteDeFacturation(transaction.user.billingName, transaction.user.billingAddress);
  const regime = regimeDeLExploitant(environnement);

  if (serie === "REELLE") {
    const raisons: string[] = obstaclesALaFacturation({
      certificationBranchee: certificationBranchee(environnement),
      emetteurComplet: emetteur !== null,
      regime,
    });
    if (!client) raisons.push("identite_client_absente");
    if (raisons.length > 0) return { issue: "bloquee", raisons };
  }

  const fiche = transaction.application?.visaRule ? versFiche(transaction.application.visaRule) : null;
  const ttc = versMineur(transaction.amount, transaction.currency);
  const montants = ventiler(ttc, regime);
  const exercice = exerciceDe(maintenant);

  const emettre = () =>
    db.$transaction(async (tx) => {
      const rang = await prendreUnRang(tx, serie, "FACTURE", exercice);
      return tx.invoice.create({
        data: {
          number: numeroDeLaPiece("FACTURE", serie, exercice, rang),
          kind: "FACTURE",
          series: serie,
          fiscalYear: exercice,
          rank: rang,
          transactionId: transaction.id,
          issuedAt: maintenant,
          emitter: emetteur ? [...emetteur] : undefined,
          clientName: client?.nom ?? null,
          clientAddress: client?.adresse ?? null,
          clientQuality: QUALITE_CLIENT_PARTICULIER,
          designation: designation(
            libelleDeLAchat(transaction.packCode),
            fiche ? `${fiche.pays}, ${fiche.intitule}` : null,
          ),
          currency: transaction.currency,
          amountIncl: montants.ttc,
          amountExcl: montants.ht,
          vatAmount: montants.tva,
          vatRateBp: montants.tauxBp,
          vatNote: mentionDeTva(regime),
          amountInWords: montantEnLettres(montants.ttc, transaction.currency),
          paymentMethod: modeDeReglement(transaction.provider, null),
        },
      });
    });

  let piece;
  try {
    piece = await avecReprise(emettre);
  } catch (erreur) {
    // Un autre appelant a émis la facture de cette vente entre-temps.
    if (!estUnDoublon(erreur)) throw erreur;
    const gagnante = await db.invoice.findUniqueOrThrow({
      where: { transactionId_kind: { transactionId, kind: "FACTURE" } },
    });
    return { issue: "deja_emise", numero: gagnante.number };
  }

  await certifierSiReelle(piece, environnement);
  await journaliser({
    acteurId: "systeme:facturation",
    action: "facture.emission",
    cible: `transaction:${transaction.reference}`,
    motif: `Facture ${piece.number} émise à la confirmation du paiement (M.C).`,
  }).catch(() => undefined);
  return { issue: "emise", numero: piece.number };
}

/**
 * Établit l'avoir d'une vente remboursée, en citant sa facture. Si la
 * facture manque — une vente confirmée et remboursée avant que la passe
 * de rattrapage ne l'émette —, elle est émise d'abord : un avoir sans
 * facture d'origine n'annulerait rien.
 */
export async function etablirLAvoir(
  transactionId: string,
  environnement: Readonly<Record<string, string | undefined>> = process.env,
  maintenant = new Date(),
): Promise<IssueDEmission> {
  const deja = await db.invoice.findUnique({
    where: { transactionId_kind: { transactionId, kind: "AVOIR" } },
  });
  if (deja) return { issue: "deja_emise", numero: deja.number };

  const transaction = await db.transaction.findUnique({ where: { id: transactionId } });
  if (!transaction || transaction.status !== "REMBOURSEE") return { issue: "sans_objet" };

  const facture = await etablirLaFacture(transactionId, environnement, maintenant);
  if (facture.issue === "bloquee" || facture.issue === "sans_objet") return facture;

  const origine = await db.invoice.findUniqueOrThrow({
    where: { transactionId_kind: { transactionId, kind: "FACTURE" } },
  });
  // L'avoir suit la série de la facture qu'il annule, et l'exercice de sa
  // propre émission.
  const serie = origine.series;
  const exercice = exerciceDe(maintenant);

  const emettre = () =>
    db.$transaction(async (tx) => {
      const rang = await prendreUnRang(tx, serie, "AVOIR", exercice);
      return tx.invoice.create({
        data: {
          number: numeroDeLaPiece("AVOIR", serie, exercice, rang),
          kind: "AVOIR",
          series: serie,
          fiscalYear: exercice,
          rank: rang,
          transactionId,
          originId: origine.id,
          issuedAt: maintenant,
          emitter: origine.emitter ?? undefined,
          clientName: origine.clientName,
          clientAddress: origine.clientAddress,
          clientQuality: origine.clientQuality,
          designation: `Remboursement de la facture ${origine.number} — ${origine.designation}`,
          currency: origine.currency,
          amountIncl: origine.amountIncl,
          amountExcl: origine.amountExcl,
          vatAmount: origine.vatAmount,
          vatRateBp: origine.vatRateBp,
          vatNote: origine.vatNote,
          amountInWords: origine.amountInWords,
          paymentMethod: origine.paymentMethod,
        },
      });
    });

  let piece;
  try {
    piece = await avecReprise(emettre);
  } catch (erreur) {
    if (!estUnDoublon(erreur)) throw erreur;
    const gagnante = await db.invoice.findUniqueOrThrow({
      where: { transactionId_kind: { transactionId, kind: "AVOIR" } },
    });
    return { issue: "deja_emise", numero: gagnante.number };
  }

  await certifierSiReelle(piece, environnement, origine.number);
  await journaliser({
    acteurId: "systeme:facturation",
    action: "facture.emission",
    cible: `transaction:${transaction.reference}`,
    motif: `Avoir ${piece.number} émis sur la facture ${origine.number} au remboursement (M.C).`,
  }).catch(() => undefined);
  return { issue: "emise", numero: piece.number };
}

/**
 * Une pièce réelle se certifie dès son émission. Inatteignable tant
 * qu'aucun adaptateur n'existe — la série réelle est fermée en amont —,
 * et écrit pour que l'adaptateur, le jour venu, n'ait qu'à se brancher.
 */
async function certifierSiReelle(
  piece: Prisma.InvoiceGetPayload<object>,
  environnement: Readonly<Record<string, string | undefined>>,
  origine: string | null = null,
): Promise<void> {
  if (piece.series !== "REELLE" || !certificationBranchee(environnement)) return;
  const certification = await leCertificateur(environnement)({
    numero: piece.number,
    genre: piece.kind,
    emiseLe: piece.issuedAt,
    devise: piece.currency,
    ttc: piece.amountIncl,
    ht: piece.amountExcl,
    tva: piece.vatAmount,
    tauxBp: piece.vatRateBp,
    client: {
      nom: piece.clientName ?? "",
      adresse: piece.clientAddress ?? "",
      qualite: piece.clientQuality,
    },
    origine,
  });
  await db.invoice.update({
    where: { id: piece.id },
    data: { certificationCode: certification.code, certifiedAt: certification.le },
  });
}

/**
 * Le filet : toute vente confirmée sans facture, tout remboursement sans
 * avoir. Appelé par la réconciliation ; rend le nombre de pièces émises.
 */
export async function emettreLesPiecesEnSouffrance(
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): Promise<number> {
  const sansFacture = await db.transaction.findMany({
    where: {
      status: { in: ["CONFIRMEE", "REMBOURSEE"] },
      invoices: { none: { kind: "FACTURE" } },
    },
    select: { id: true },
    orderBy: { confirmedAt: "asc" },
    take: 200,
  });
  const sansAvoir = await db.transaction.findMany({
    where: { status: "REMBOURSEE", invoices: { none: { kind: "AVOIR" } } },
    select: { id: true },
    orderBy: { refundedAt: "asc" },
    take: 200,
  });

  let emises = 0;
  for (const { id } of sansFacture) {
    const issue = await etablirLaFacture(id, environnement).catch(() => null);
    if (issue?.issue === "emise") emises += 1;
  }
  for (const { id } of sansAvoir) {
    const issue = await etablirLAvoir(id, environnement).catch(() => null);
    if (issue?.issue === "emise") emises += 1;
  }
  return emises;
}
