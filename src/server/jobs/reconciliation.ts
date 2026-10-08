import { db } from "@/lib/db";
import { BAIL_DE_CREDIT_MINUTES, aExpirer, aReconcilier } from "@/server/paiement/cycle";
import { journaliser } from "@/server/acces/journal";
import { acheverLeCredit, appliquerLaNotification } from "@/server/acces/paiements";
import { cleDEvenementDeReconciliation } from "@/domain/paiement/ouverture";
import { leConsultant, type Consultant } from "@/server/paiement/consultation";
import { libererLesTenuesEchues } from "@/server/acces/consultations";
import { emettreLesPiecesEnSouffrance } from "@/server/facturation/emission";
import { reprendreLesRecus } from "@/server/paiement/recu";

/**
 * Réconciliation des paiements — RG-05.4.
 *
 * « Un job de réconciliation interroge le fournisseur toutes les quinze
 * minutes sur les transactions `EN_ATTENTE` de plus de dix minutes — le
 * webhook peut se perdre. »
 *
 * C'est le filet du pire défaut possible de ce produit : un candidat débité
 * qui ne voit rien arriver. Il paie sur un forfait mobile, il n'a pas de
 * recours simple, et une réclamation lui coûte un déplacement.
 *
 * ── Ce que la consultation change, et ce qu'elle ne change pas ───────
 *
 * Le fournisseur est maintenant **interrogé** (voir `paiement/consultation.ts`),
 * et un état retrouvé est appliqué par **le même service que les webhooks**
 * — `appliquerLaNotification`. Une seule fonction écrit un état de paiement
 * et crédite un pack, et c'est elle : la réconciliation n'a pas son propre
 * chemin d'écriture, donc pas sa propre façon de se tromper. Elle hérite au
 * passage de l'idempotence par `PaymentEvent.providerEventId` et de la
 * protection contre les courses, qui exige que l'état lu n'ait pas bougé.
 *
 * Ce qui ne change pas :
 *
 * - **une absence de réponse n'est pas un refus.** Un fournisseur
 *   injoignable, ou dont l'adaptateur n'est pas branché, ne fait rien
 *   écrire du tout ;
 * - **l'expiration reste celle de la plateforme.** Ni Stripe ni FedaPay ne
 *   la prononcent : `aExpirer` seul décide, comme avant ;
 * - **l'écart s'ouvre au délai prévu**, que la consultation ait répondu ou
 *   non — c'est le filet du filet.
 *
 * Ce qu'elle ajoute : une consultation qui aboutit **date le
 * rapprochement** de la ligne, même quand l'état retrouvé ne change rien.
 * C'est la seule mesure que la plateforme ait de la santé de l'opérateur,
 * et B-04 la lit pour dire si le rapprochement automatique tourne encore.
 */
export const HEURES_AVANT_TICKET = 24;

export interface Bilan {
  examinees: number;
  /** Créneaux rendus disponibles faute de paiement dans le délai de tenue. */
  tenuesLiberees: number;
  /** États retrouvés chez le fournisseur et appliqués. */
  rattrapees: number;
  expirees: number;
  ecartsOuverts: number;
  /**
   * Paiements confirmés dont la contrepartie n'avait jamais été ouverte,
   * et qui viennent de l'être.
   */
  creditsAcheves: number;
  /**
   * Remboursements initiés dont la notification s'était perdue, soldés
   * (ou mis en écart) sur la parole du fournisseur consulté — E3, étape 5.
   */
  remboursementsRattrapes: number;
  /** Reçus restés en attente et partis à cette passe — F3. */
  recusRepris: number;
  /**
   * Factures et avoirs émis après coup : une vente confirmée sans facture,
   * un remboursement sans avoir (M.C, 04/10/2026).
   */
  piecesEmises: number;
  /**
   * Transactions examinées dont le fournisseur n'a pas répondu — adaptateur
   * non branché, appel en erreur. Rien n'a été écrit pour elles : une
   * absence de réponse n'est pas un refus. B-04 en fait le compte rendu de
   * la passe lancée à la main (S.122).
   */
  indisponibles: number;
}

/** Le consultant du fournisseur d'une transaction, mis en cache par passe. */
type Annuaire = (fournisseur: "FEDAPAY" | "STRIPE") => Consultant | null;

export async function reconcilierLesPaiements(
  maintenant = new Date(),
  consultantDe: Annuaire = (fournisseur) => leConsultant(fournisseur),
): Promise<Bilan> {
  const enAttente = await db.transaction.findMany({
    where: { status: { in: ["INITIEE", "EN_ATTENTE"] } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  /*
    Les créneaux tenus dont le délai est passé, d'abord : un candidat qui
    ferme son onglet ne laisse aucune trace, et sans ce balayage son
    créneau resterait gelé. Le quart d'heure de ce job est la cadence
    qu'il faut pour une tenue de vingt minutes.
  */
  const bilan: Bilan = {
    examinees: 0,
    rattrapees: 0,
    expirees: 0,
    ecartsOuverts: 0,
    creditsAcheves: await acheverLesCreditsEnSouffrance(),
    remboursementsRattrapes: 0,
    recusRepris: 0,
    tenuesLiberees: await libererLesTenuesEchues(maintenant),
    piecesEmises: 0,
    indisponibles: 0,
  };

  for (const transaction of enAttente) {
    if (!aReconcilier(transaction.createdAt, maintenant)) continue;
    bilan.examinees += 1;

    const consultant = consultantDe(transaction.provider);
    const vu = consultant
      ? await consultant
          .consulter(transaction.providerTxId, transaction.reference)
          // Un adaptateur qui lève est un adaptateur indisponible : le job
          // ne s'arrête pas sur une transaction, il en a cent quatre-vingt
          // dix-neuf autres à examiner.
          .catch(() => ({ issue: "indisponible" as const, detail: "appel en erreur" }))
      : ({ issue: "indisponible", detail: "aucun consultant configuré" } as const);

    if (vu.issue === "indisponible") bilan.indisponibles += 1;

    /*
      Un écart de consultation n'est pas l'écart de délai : celui-ci dit
      que le fournisseur a répondu autre chose que ce qu'on attendait, et
      il se lit tout de suite, pas dans vingt-quatre heures.
    */
    if (vu.issue === "incoherent" && !transaction.discrepancy) {
      await db.transaction.update({
        where: { id: transaction.id },
        data: { discrepancy: `Consultation incohérente : ${vu.detail}.` },
      });
      bilan.ecartsOuverts += 1;
    }

    /*
      Le fournisseur ne connaît pas une transaction qu'on a pourtant
      ouverte chez lui : anomalie. Sans identifiant, il n'y a rien à
      connaître, et ce n'en est pas une.
    */
    if (vu.issue === "introuvable" && transaction.providerTxId && !transaction.discrepancy) {
      await db.transaction.update({
        where: { id: transaction.id },
        data: {
          discrepancy: `Le fournisseur ne connaît pas la session ${transaction.providerTxId}.`,
        },
      });
      bilan.ecartsOuverts += 1;
    }

    if (vu.issue === "connu") {
      /*
        La ligne vient d'être confrontée à ce que le fournisseur en dit, et
        les deux se lisent : c'est un rapprochement, que l'état retrouvé
        change quelque chose ou non. Un panier abandonné que le fournisseur
        annonce toujours en attente ne fait rien écrire d'autre — et c'est
        pourtant la preuve que l'opérateur répond.

        Sans cette ligne, B-04 n'avait qu'une seule mesure de la santé de
        l'opérateur, la confirmation d'un paiement, et déclarait donc l'API
        muette dès qu'une heure passait sans que personne n'achète. Ici,
        l'interrogation a bien eu lieu et la réponse est arrivée.
      */
      await db.transaction.update({
        where: { id: transaction.id },
        data: { reconciledAt: maintenant },
      });

      /*
        Le même service que les webhooks, avec un identifiant d'événement
        déterministe : deux passes qui lisent le même état écrivent la
        même clé, et la seconde est un rejeu. Si un webhook est passé
        entre-temps, la table des transitions refuse — c'est un rejeu
        aussi, et rien n'est crédité deux fois.
      */
      const issue = await appliquerLaNotification({
        providerEventId: cleDEvenementDeReconciliation(transaction.reference, vu.statut),
        providerTxId: vu.providerTxId,
        reference: transaction.reference,
        statut: vu.statut,
        ...(vu.cause ? { cause: vu.cause } : {}),
        // Comparé comme sur la notification signée (E2) : un webhook perdu
        // ne se rattrape pas sur un montant que personne n'a vérifié.
        montantMineur: vu.montantMineur,
        devise: vu.devise,
        rembourseMineur: null,
      });
      if (issue.issue === "creditee" || issue.issue === "appliquee") {
        bilan.rattrapees += 1;
        await journaliser({
          acteurId: "systeme:reconciliation",
          action: "paiement.reconciliation",
          cible: `transaction:${transaction.reference}`,
          motif: `État retrouvé chez le fournisseur : ${vu.statut} (RG-05.4)`,
        }).catch(() => undefined);
        // L'état vient de changer : les règles de délai ci-dessous
        // raisonneraient sur l'état d'avant.
        continue;
      }
    }

    const ageHeures = (maintenant.getTime() - transaction.createdAt.getTime()) / 3_600_000;

    if (ageHeures >= HEURES_AVANT_TICKET && !transaction.discrepancy) {
      // WF-05, cas limites : « au-delà de 24 h, ticket automatique en
      // back-office ». L'écart est porté par la transaction elle-même, où
      // B-04 le lit, plutôt que dans une table de tickets qu'il faudrait
      // tenir à jour en double.
      await db.transaction.update({
        where: { id: transaction.id },
        data: {
          discrepancy: `Sans confirmation depuis ${Math.floor(ageHeures)} heures. Vérifier auprès du fournisseur avant toute décision.`,
        },
      });
      await journaliser({
        acteurId: "systeme:reconciliation",
        action: "paiement.reconciliation",
        cible: `transaction:${transaction.reference}`,
        motif: "Sans confirmation au-delà du délai de rattrapage (RG-05.4)",
      }).catch(() => undefined);
      bilan.ecartsOuverts += 1;
    }

    if (aExpirer(transaction.createdAt, maintenant) && transaction.status !== "INITIEE") {
      // L'expiration ne ferme pas le dossier de la réclamation : l'écart
      // reste ouvert, et un paiement retrouvé plus tard se rattrape à la
      // main depuis B-04. Ce qui est fermé, c'est l'attente côté écran.
      await db.transaction.update({
        where: { id: transaction.id },
        // Le motif est celui que la plateforme peut honnêtement prononcer :
        // personne n'a refusé ce paiement, personne n'a répondu (N.B).
        // La date de l'échec est celle de ce passage, pas celle de
        // l'ouverture : c'est depuis elle que court la conservation du
        // motif (O.B), et entre les deux il y a le délai de rattrapage.
        data: { status: "EXPIREE", failureCause: "DELAI_DEPASSE", failureCauseAt: maintenant },
      });
      bilan.expirees += 1;
    }
  }

  // En dernier : les paiements rattrapés ci-dessus ont déjà leur pièce, et
  // celle-ci reprend ce que les notifications n'ont pas pu émettre.
  bilan.remboursementsRattrapes = await rattraperLesRemboursements(consultantDe).catch(() => 0);
  bilan.recusRepris = await reprendreLesRecus(maintenant).catch(() => 0);
  bilan.piecesEmises = await emettreLesPiecesEnSouffrance().catch(() => 0);
  return bilan;
}

/**
 * Le remboursement dont la notification s'est perdue — RG-05.4, INV-7,
 * revue du 07/10/2026, E3 (étape 5).
 *
 * Une dette initiée attendait sa notification signée pour se solder. Si
 * elle se perdait, rien ne la rattrapait : la passe ne lisait que les
 * paiements en attente, et une transaction confirmée dont le
 * remboursement était parti lui restait invisible. La dette restait due en
 * B-04, alors que l'argent était rendu.
 *
 * La passe consulte donc aussi les dettes **initiées** et non soldées, et
 * applique ce que le fournisseur dit par le même service que les
 * notifications : le verdict d'E3 (somme due, partiel, excédent) vaut ici
 * comme ailleurs. Une dette non initiée n'est pas consultée : elle attend
 * une décision, pas le fournisseur.
 */
async function rattraperLesRemboursements(consultantDe: Annuaire): Promise<number> {
  const dettes = await db.transaction.findMany({
    where: {
      status: "CONFIRMEE",
      refundDueAt: { not: null },
      refundedAt: null,
      OR: [{ refundAttemptedAt: { not: null } }, { refundRequestedAt: { not: null } }],
    },
    orderBy: { refundDueAt: "asc" },
    take: 100,
  });

  let rattrapes = 0;
  for (const dette of dettes) {
    const consultant = consultantDe(dette.provider);
    if (!consultant) continue;
    const vu = await consultant
      .consulter(dette.providerTxId, dette.reference)
      .catch(() => ({ issue: "indisponible" as const, detail: "appel en erreur" }));
    if (vu.issue !== "connu") continue;
    const rembourseMineur = vu.rembourseMineur ?? null;
    if (vu.statut !== "REMBOURSEE" && !(rembourseMineur !== null && rembourseMineur > 0)) continue;

    const issue = await appliquerLaNotification({
      // Le cumul fait partie de la clé : un partiel puis le complet sont
      // deux constats, une même lecture rejouée n'en fait qu'un.
      providerEventId: `${cleDEvenementDeReconciliation(dette.reference, "REMBOURSEE")}:${rembourseMineur ?? "total"}`,
      providerTxId: vu.providerTxId,
      reference: dette.reference,
      statut: "REMBOURSEE",
      montantMineur: null,
      devise: null,
      rembourseMineur,
    }).catch(() => null);
    if (issue?.issue !== "appliquee") continue;
    rattrapes += 1;
    await journaliser({
      acteurId: "systeme:reconciliation",
      action: "paiement.reconciliation",
      cible: `transaction:${dette.reference}`,
      motif: "Remboursement retrouvé chez le fournisseur : la notification s'était perdue (RG-05.4)",
    }).catch(() => undefined);
  }
  return rattrapes;
}

/**
 * Le crédit interrompu — la troisième façon de ne rien recevoir après
 * avoir payé, et celle qu'aucun filet ne couvrait.
 *
 * `crediterLAchat` court hors de la transaction qui pose `CONFIRMEE` :
 * l'état est commité, puis la contrepartie s'ouvre. Un arrêt entre les
 * deux laisse un paiement encaissé et rien d'ouvert. Le rejeu du webhook
 * ne le rattrape pas — `effetDeLaNotification(CONFIRMEE, CONFIRMEE)` rend
 * « rejeu », ce qui est juste pour l'état et faux pour la contrepartie —
 * et cette passe-ci ne lisait que `INITIEE | EN_ATTENTE`, où la
 * transaction n'est plus.
 *
 * `acheverLeCredit` est idempotent et ne se déclenche que sur une
 * contrepartie **entièrement** absente : une couverture partielle est un
 * état normal, qu'un Pro acheté avant le second dossier produit tous les
 * jours.
 *
 * La passe n'attend pas le délai de rattrapage. Ce délai existe parce
 * qu'un webhook peut arriver en retard ; ici rien n'est attendu de
 * personne — le paiement est confirmé, et ce qui manque ne viendra pas
 * tout seul.
 */
async function acheverLesCreditsEnSouffrance(): Promise<number> {
  /*
    Seulement les ventes dont la contrepartie n'est pas constatée (F6). La
    requête lisait les deux cents plus anciennes ventes confirmées, sans
    filtre : passé deux cents ventes, un crédit interrompu récent n'entrait
    jamais dans la fenêtre. Un bail en cours n'est pas repris : l'appelant
    qui le tient est encore là.
  */
  const perime = new Date(Date.now() - BAIL_DE_CREDIT_MINUTES * 60_000);
  const confirmees = await db.transaction.findMany({
    where: {
      status: "CONFIRMEE",
      creditedAt: null,
      OR: [{ creditingAt: null }, { creditingAt: { lt: perime } }],
    },
    orderBy: { confirmedAt: "asc" },
    take: 200,
  });

  let acheves = 0;
  for (const transaction of confirmees) {
    // Un achat ne doit pas en empêcher un autre : le job en a cent
    // quatre-vingt-dix-neuf à reprendre.
    const fait = await acheverLeCredit(transaction).catch(() => false);
    if (!fait) continue;
    acheves += 1;
    await journaliser({
      acteurId: "systeme:reconciliation",
      action: "paiement.reconciliation",
      cible: `transaction:${transaction.reference}`,
      motif: "Contrepartie ouverte après coup : le paiement était confirmé sans crédit (RG-05.4)",
    }).catch(() => undefined);
  }
  return acheves;
}

/**
 * Une passe, sans jamais en recouvrir une autre — S.122.
 *
 * Le worker passe tous les quarts d'heure, et B-04 peut maintenant en
 * lancer une à la main. Dans le worker, pg-boss n'exécute qu'une tâche à la
 * fois pour cette file ; mais le processus web et le worker sont deux
 * processus, et rien ne les empêchait de balayer les mêmes transactions en
 * même temps — deux consultations du fournisseur pour une seule ligne, deux
 * passes qui écrivent le même écart. L'état retrouvé reste protégé par
 * l'idempotence d'`appliquerLaNotification` (rien n'est crédité deux fois),
 * mais la double consultation coûte un appel au fournisseur et brouille
 * le compte rendu.
 *
 * Un verrou consultatif de transaction, pris en tête et tenu pendant toute
 * la passe, sérialise donc les deux appelants : **le worker et l'action de
 * B-04 passent tous les deux par ici**. Il se relâche à la fin de la
 * transaction, erreur ou arrêt du processus compris — aucun verrou orphelin
 * ne peut bloquer les passes suivantes.
 *
 * Rend `null` quand une autre passe tient le verrou : l'appelant le dit,
 * plutôt que d'attendre puis de refaire le travail qu'on vient de faire.
 */
export const CLE_DU_VERROU_DE_RECONCILIATION = "reconciliation-paiements";

/** Une passe de plus de dix minutes n'est plus une passe : la transaction cède. */
const DUREE_MAXIMALE_D_UNE_PASSE_MS = 10 * 60 * 1000;

export async function reconcilierSansRecouvrement(
  maintenant = new Date(),
  consultantDe?: Annuaire,
): Promise<Bilan | null> {
  return db.$transaction(
    async (tx) => {
      const verrou = await tx.$queryRaw<{ pris: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtextextended(${CLE_DU_VERROU_DE_RECONCILIATION}, 0)) AS pris`;
      if (!verrou[0]?.pris) return null;
      return reconcilierLesPaiements(maintenant, consultantDe);
    },
    { timeout: DUREE_MAXIMALE_D_UNE_PASSE_MS, maxWait: 5_000 },
  );
}
