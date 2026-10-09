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
  prixPayeMineur,
  type Regime,
} from "@/domain/facturation/montants";
import {
  QUALITE_CLIENT_PARTICULIER,
  dateDeLaPrestation,
  designation,
  emetteurDeLaFacture,
  identiteDeFacturation,
  modeDeReglement,
  obstaclesALaFacturation,
  type EtatDeLaFacturation,
  type ObstacleALaFacturation,
} from "@/domain/facturation/facture";
import { libelleDeLAchat } from "@/domain/paiement/recu";
import { sommeARendre } from "@/domain/paiement/remboursement";
import { espaceReel } from "@/server/paiement/secrets";
import { valeursDesVariables } from "@/server/juridique/lecture";
import { versFiche } from "@/server/acces/regles";
import { journaliser } from "@/server/acces/journal";
import {
  NON_BRANCHE,
  certificationBranchee,
  leCertificateur,
  type Certificateur,
} from "@/server/facturation/certification";

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

/**
 * Le régime qu'une pièce émise a appliqué, relu sur son taux : un taux,
 * c'est une TVA extraite ; aucun, c'est une TVA nulle. Sert à l'avoir,
 * qui reprend le régime de la facture qu'il corrige.
 */
const regimeDeLaPiece = (tauxBp: number | null): Regime =>
  tauxBp === null ? { declare: true, assujettie: false } : { declare: true, assujettie: true, tauxBp };

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
  /*
    Le certificateur est celui du point de branchement. Il n'est un
    paramètre que pour les essais, qui y passent le leur : aucune variable
    d'environnement ne peut en faire choisir un faux (S.158).
  */
  certificateur: Certificateur = leCertificateur(environnement),
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
      certificationBranchee: certificateur !== NON_BRANCHE,
      emetteurComplet: emetteur !== null,
      regime,
    });
    if (!client) raisons.push("identite_client_absente");
    if (raisons.length > 0) return { issue: "bloquee", raisons };
  }

  const fiche = transaction.application?.visaRule ? versFiche(transaction.application.visaRule) : null;
  const ttc = prixPayeMineur(transaction);
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
          // L'exercice est celui de l'émission ; la date de la vente reste
          // sur la pièce (revue F5, D-14).
          performedAt: dateDeLaPrestation("FACTURE", transaction, maintenant),
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

  const certifiee = await certifierSiReelle(piece, certificateur);
  await journaliser({
    acteurId: "systeme:facturation",
    action: "facture.emission",
    cible: `transaction:${transaction.reference}`,
    motif: `Facture ${piece.number} émise à la confirmation du paiement (M.C).${certifiee === "en_attente" ? " Certification en attente : la réconciliation la reprend." : ""}`,
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
  certificateur: Certificateur = leCertificateur(environnement),
): Promise<IssueDEmission> {
  const deja = await db.invoice.findUnique({
    where: { transactionId_kind: { transactionId, kind: "AVOIR" } },
  });
  if (deja) return { issue: "deja_emise", numero: deja.number };

  const transaction = await db.transaction.findUnique({ where: { id: transactionId } });
  if (!transaction || transaction.status !== "REMBOURSEE") return { issue: "sans_objet" };

  const facture = await etablirLaFacture(transactionId, environnement, maintenant, certificateur);
  if (facture.issue === "bloquee" || facture.issue === "sans_objet") return facture;

  const origine = await db.invoice.findUniqueOrThrow({
    where: { transactionId_kind: { transactionId, kind: "FACTURE" } },
  });
  // L'avoir suit la série de la facture qu'il annule, et l'exercice de sa
  // propre émission.
  const serie = origine.series;
  const exercice = exerciceDe(maintenant);

  /*
    L'avoir porte **ce qui a été rendu**, et non ce qui a été payé —
    RG-15.2. Un pack entamé se rembourse au prorata des analyses
    restantes : un avoir du prix entier annulerait une vente qui a eu lieu
    pour partie, et ferait baisser le chiffre d'affaires d'une somme que
    le candidat n'a pas récupérée.

    Ventilé sous **le régime de la facture d'origine** — son taux, ou son
    absence de taux —, et non celui du jour : un avoir corrige une pièce,
    il ne la refacture pas. La somme en lettres suit le montant rendu.
  */
  const rendu = Math.min(
    sommeARendre(transaction.refundAmountMinor, origine.amountIncl),
    origine.amountIncl,
  );
  const partiel = rendu < origine.amountIncl;
  const montants = partiel
    ? ventiler(rendu, regimeDeLaPiece(origine.vatRateBp))
    : {
        ttc: origine.amountIncl,
        ht: origine.amountExcl,
        tva: origine.vatAmount,
        tauxBp: origine.vatRateBp,
      };

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
          performedAt: dateDeLaPrestation("AVOIR", transaction, maintenant),
          emitter: origine.emitter ?? undefined,
          clientName: origine.clientName,
          clientAddress: origine.clientAddress,
          clientQuality: origine.clientQuality,
          designation: partiel
            ? `Remboursement partiel de la facture ${origine.number}, au prorata des analyses restantes — ${origine.designation}`
            : `Remboursement de la facture ${origine.number} — ${origine.designation}`,
          currency: origine.currency,
          amountIncl: montants.ttc,
          amountExcl: montants.ht,
          vatAmount: montants.tva,
          vatRateBp: montants.tauxBp,
          vatNote: origine.vatNote,
          amountInWords: partiel
            ? montantEnLettres(montants.ttc, origine.currency)
            : origine.amountInWords,
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

  const certifiee = await certifierSiReelle(piece, certificateur, origine.number);
  await journaliser({
    acteurId: "systeme:facturation",
    action: "facture.emission",
    cible: `transaction:${transaction.reference}`,
    motif: `Avoir ${piece.number} émis sur la facture ${origine.number} au remboursement (M.C).${certifiee === "en_attente" ? " Certification en attente : la réconciliation la reprend." : ""}`,
  }).catch(() => undefined);
  return { issue: "emise", numero: piece.number };
}

/**
 * Une pièce réelle se certifie dès son émission. Inatteignable tant
 * qu'aucun adaptateur n'existe — la série réelle est fermée en amont —,
 * et écrit pour que l'adaptateur, le jour venu, n'ait qu'à se brancher.
 *
 * S.158 (RF-6, préparation de M.C) — un échec ne perd rien. La pièce est
 * déjà enregistrée, avec sa place dans la suite : elle ne se défait pas,
 * et elle ne peut pas porter un code que personne n'a rendu. Elle reste
 * **en attente de certification** — l'écran le dit, `/api/health` la
 * compte — et la réconciliation la reprend (`certifierLesPiecesEnAttente`).
 * Avant, l'erreur remontait après le commit : la ligne du journal ne
 * s'écrivait pas, et rien ne reprenait la pièce, puisque le filet ne
 * cherche que les ventes **sans** pièce.
 */
type IssueDeCertification = "certifiee" | "en_attente" | "sans_objet" | "deja_certifiee" | "en_cours";

/**
 * Le temps qu'on laisse au dispositif pour rendre un code, verrou tenu.
 * Au-delà, la transaction tombe et la pièce reste en attente.
 */
const DUREE_MAXIMALE_D_UNE_CERTIFICATION_MS = 120_000;

/*
  Une pièce, un appel au dispositif à la fois — S.158. La fumée l'a
  montré : deux passes simultanées appelaient chacune le certificateur
  pour la même pièce ; la base ne gardait qu'un code, mais le dispositif
  fiscal en aurait rendu deux. L'émission (au webhook) et la reprise (à
  la réconciliation) prennent donc le même verrou par pièce, relisent le
  code sous ce verrou, et l'écrivent dans la même transaction.
*/
async function certifierSiReelle(
  piece: Prisma.InvoiceGetPayload<object>,
  certificateur: Certificateur,
  origine: string | null = null,
): Promise<IssueDeCertification> {
  if (piece.series !== "REELLE" || certificateur === NON_BRANCHE) return "sans_objet";
  return db.$transaction(
    async (tx) => {
      const verrou = await tx.$queryRaw<{ pris: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtextextended(${`certification:${piece.id}`}, 0)) AS pris`;
      if (!verrou[0]?.pris) return "en_cours";
      const actuelle = await tx.invoice.findUnique({
        where: { id: piece.id },
        select: { certificationCode: true },
      });
      if (actuelle?.certificationCode) return "deja_certifiee";
      let certification;
      try {
        certification = await certificateur({
          numero: piece.number,
          genre: piece.kind,
          emiseLe: piece.issuedAt,
          prestationLe: piece.performedAt,
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
      } catch (erreur) {
        console.warn(
          `[facturation] ${piece.number} : certification en attente (${erreur instanceof Error ? erreur.name : "erreur"})`,
        );
        return "en_attente";
      }
      await tx.invoice.update({
        where: { id: piece.id },
        data: { certificationCode: certification.code, certifiedAt: certification.le },
      });
      return "certifiee";
    },
    { timeout: DUREE_MAXIMALE_D_UNE_CERTIFICATION_MS, maxWait: 5_000 },
  );
}

/**
 * Les pièces réelles sans code de certification. Une pièce annulée (date et
 * motif tracés) n'est plus à certifier : la reprise ne la soumet pas.
 */
const EN_ATTENTE_DE_CERTIFICATION = {
  series: "REELLE",
  certificationCode: null,
  cancelledAt: null,
} satisfies Prisma.InvoiceWhereInput;

/**
 * Ce que `/api/health` et B-04 disent des pièces réelles en attente de
 * leur code — S.158. Une lecture : elle ne relance rien.
 */
export async function piecesEnAttenteDeCertification(): Promise<{
  nombre: number;
  plusAncienne: Date | null;
}> {
  const [nombre, premiere] = await Promise.all([
    db.invoice.count({ where: EN_ATTENTE_DE_CERTIFICATION }),
    db.invoice.findFirst({
      where: EN_ATTENTE_DE_CERTIFICATION,
      orderBy: { issuedAt: "asc" },
      select: { issuedAt: true },
    }),
  ]);
  return { nombre, plusAncienne: premiere?.issuedAt ?? null };
}

/**
 * La reprise des certifications en attente — S.158. Appelée par la
 * réconciliation, après le filet des pièces manquantes. Sans adaptateur,
 * elle ne tente rien : il n'y a d'ailleurs aucune pièce réelle à reprendre,
 * la série réelle étant fermée.
 */
export async function certifierLesPiecesEnAttente(
  environnement: Readonly<Record<string, string | undefined>> = process.env,
  certificateur: Certificateur = leCertificateur(environnement),
  limite = 100,
): Promise<{ certifiees: number; enAttente: number }> {
  if (certificateur === NON_BRANCHE) return { certifiees: 0, enAttente: 0 };
  const pieces = await db.invoice.findMany({
    where: EN_ATTENTE_DE_CERTIFICATION,
    include: { origin: { select: { number: true } } },
    orderBy: { issuedAt: "asc" },
    take: limite,
  });
  let certifiees = 0;
  for (const piece of pieces) {
    const issue = await certifierSiReelle(piece, certificateur, piece.origin?.number ?? null);
    if (issue !== "certifiee") continue;
    certifiees += 1;
    await journaliser({
      acteurId: "systeme:facturation",
      action: "facture.certification",
      cible: `facture:${piece.number}`,
      motif: `${piece.kind === "AVOIR" ? "Avoir" : "Facture"} ${piece.number} certifiée à la reprise (M.C).`,
    }).catch(() => undefined);
  }
  return { certifiees, enAttente: pieces.length - certifiees };
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
