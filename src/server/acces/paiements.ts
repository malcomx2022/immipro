import type { Transaction, TransactionStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { ecartOuvert, type Resolution } from "@/domain/backoffice/ecart";
import {
  MOTIF_REVUE_PARTIELLE,
  cleDIdempotence,
  suiteDuQuota,
} from "@/domain/paiement/remboursement";
import { leRembourseur, type Rembourseur } from "@/server/paiement/remboursement";
import {
  getPack,
  MONTANT_MINIMUM_XOF,
  RECHARGE_ANALYSES,
  type Devise,
} from "@/domain/payments/pricing";
import {
  achatDepuisLeCode,
  codeEnregistre,
  tarifDe,
  type Achat as AchatDuDomaine,
} from "@/domain/payments/achat";
import { effetDeLaNotification } from "@/server/paiement/cycle";
import { ouvrirDuQuota } from "./quota";
import { confirmerLaConsultation, libererLaTenue } from "./consultations";
import { suiteDictable } from "@/server/securite/secret";
import { fournisseurDe } from "@/domain/payments/rail";
import {
  cheminDeRetour,
  cleDOuverture,
  motifDeDivergence,
  ouvertureConcorde,
} from "@/domain/paiement/ouverture";
import { lOuvreur } from "@/server/paiement/ouvreurs";
import type { Ouvreur } from "@/server/paiement/ouvreur";
import type { CauseRefus } from "@/domain/paiement/echec";

/**
 * Paiements — WF-05, INV-7.
 *
 * L'idempotence se joue à deux endroits, et il faut les deux.
 *
 * **À la création (RG-05, « double soumission »).** Un candidat qui tape
 * deux fois sur « Payer » ne crée pas deux transactions : celle qui est déjà
 * en attente est reprise. Sans cela, la seconde reste orpheline et fausse la
 * réconciliation.
 *
 * **À la notification (RG-05.2).** La clé est `PaymentEvent.providerEventId`,
 * unique en base — la notification, et non la transaction qu'elle décrit
 * (M.B). Un webhook rejoué ne crédite pas deux fois, et la table d'états
 * refuse en plus de faire progresser une transaction déjà aboutie — un
 * rejeu n'est pas une transition.
 */

/**
 * L'achat du domaine, rattaché au dossier qu'il ouvre.
 *
 * La distribution sur l'union est volontaire : `A & { applicationId }`
 * appliqué au bloc rendrait `achat.code` plus difficile à réduire, et
 * surtout n'échouerait plus si l'union du domaine changeait de forme. Ici,
 * une catégorie ajoutée là-bas apparaît ici sans rien écrire — et les
 * `switch` exhaustifs du domaine, eux, refusent de compiler tant qu'elle
 * n'a pas de prix ni de code.
 */
type Rattache<A> = A extends unknown ? A & { applicationId: string } : never;
export type Achat = Rattache<AchatDuDomaine>;

/** Rattache au dossier l'achat reçu de la route, sans conversion forcée. */
export const rattacher = (achat: AchatDuDomaine, applicationId: string): Achat => ({
  ...achat,
  applicationId,
});

/**
 * Le montant et le libellé d'un achat, pris sur la grille du domaine.
 *
 * La règle des catégories vit dans `domain/payments/achat` : elle était
 * écrite ici en ternaires, et le récapitulatif en avait sa propre version.
 * Deux lectures d'une même grille finissent par diverger — celle de
 * l'écran l'avait déjà fait.
 */
export function montantDe(achat: Achat, devise: Devise): { montant: number; libelle: string } {
  const tarif = tarifDe(achat);
  if (!tarif) throw echec("champs_invalides", { champs: { pack: "Ce pack n'existe pas." } });
  return { montant: tarif.prix[devise], libelle: tarif.libelle };
}

/**
 * Création, ou reprise de la transaction en cours.
 *
 * La devise ne change plus une fois la transaction créée (WF-05, cas
 * limites) : un montant affiché dans une monnaie et encaissé dans une autre
 * est un litige, pas une commodité.
 */
export async function creerOuReprendre(
  userId: string,
  achat: Achat,
  devise: Devise,
): Promise<{ transaction: Transaction; reprise: boolean }> {
  const enCours = await db.transaction.findFirst({
    where: {
      userId,
      applicationId: achat.applicationId,
      status: { in: ["INITIEE", "EN_ATTENTE"] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (enCours) {
    if (enCours.currency !== devise) throw echec("devise_figee");
    return { transaction: enCours, reprise: true };
  }

  const { montant } = montantDe(achat, devise);
  if (devise === "XOF" && montant < MONTANT_MINIMUM_XOF) {
    // RG-05.5 — sous ce seuil, frais de collecte et coût d'analyse dépassent
    // la somme encaissée.
    throw echec("montant_sous_le_minimum");
  }

  const transaction = await db.transaction.create({
    data: {
      reference: referenceInterne(),
      userId,
      applicationId: achat.applicationId,
      // La colonne porte le code du pack, ou la catégorie du complément.
      // La conversion est celle du domaine, exhaustive, et son inverse
      // (`achatDepuisLeCode`) vit à côté d'elle.
      packCode: codeEnregistre(achat),
      amount: montant,
      currency: devise,
      // N.A — le rail suit la devise, et la règle vit dans le domaine :
      // elle était écrite ici, en ligne, et quatre écrans la redisaient
      // chacun à leur façon.
      provider: fournisseurDe(devise),
      status: "INITIEE",
    },
  });
  return { transaction, reprise: false };
}

/**
 * Ouvre le paiement : transaction locale, puis session chez le fournisseur.
 *
 * ── L'ordre, et pourquoi il est celui-là ─────────────────────────────
 *
 * **L'ouvreur est réclamé en premier, avant toute écriture.** Sans clé,
 * on refuse tout de suite : une transaction locale créée devant un
 * fournisseur absent ouvre une attente que rien ne viendra clore, et le
 * candidat regarde tourner un écran pour un paiement qui n'existe nulle
 * part.
 *
 * **La transaction locale vient ensuite, et elle est reprise.** Sa
 * référence est la clé d'idempotence : elle doit donc être stable d'une
 * tentative à l'autre. Un second clic, ou une reprise après une réponse
 * réseau perdue, retrouve la même transaction, donc la même clé, donc la
 * même session chez le fournisseur — jamais un second débit.
 *
 * **L'identifiant fournisseur est enregistré dès qu'il existe**, y compris
 * quand l'URL manque encore. C'est ce qui permet à la tentative suivante
 * de *retrouver* au lieu de recréer. Il ne s'écrase jamais : l'écriture
 * est conditionnée à la colonne nulle, ce qui la rend sûre même si deux
 * requêtes arrivent ensemble.
 *
 * ── Ce que cette fonction ne fait pas ────────────────────────────────
 *
 * Elle ne confirme rien et ne crédite rien. Une session ouverte est une
 * page où le candidat *pourra* payer. `CONFIRMEE` et le quota n'ont
 * qu'une source, la notification signée (RG-05.1, INV-7), et l'adresse de
 * retour du navigateur ne passe même pas par ici.
 */
export async function ouvrirLeTunnel(
  userId: string,
  achat: Achat,
  devise: Devise,
  ouvreur: Ouvreur | null = lOuvreur(devise),
): Promise<{ transactionId: string; reference: string; url: string; reprise: boolean }> {
  // Avant la moindre écriture. Un échec honnête vaut mieux qu'une attente
  // impossible, et il ne laisse aucune transaction derrière lui.
  if (!ouvreur) throw echec("paiement_indisponible");

  const { transaction, reprise } = await creerOuReprendre(userId, achat, devise);

  const ouverture = transaction.providerTxId
    ? await ouvreur.retrouver(transaction.providerTxId, transaction.reference)
    : await ouvreur.creer({
        reference: transaction.reference,
        // Recalculé par `creerOuReprendre`, jamais reçu du navigateur.
        montant: transaction.amount,
        devise,
        cle: cleDOuverture(transaction.reference),
        retour: cheminDeRetour(transaction.reference),
        // Ce que le candidat lit sur la page hébergée : le produit, et
        // rien qui le nomme. La page appartient au fournisseur.
        intitule: `ImmiPro — ${montantDe(achat, devise).libelle}`,
      });

  if (ouverture.issue === "creee_sans_url") {
    // La session existe chez eux : on garde son identifiant, sinon la
    // prochaine tentative en ouvrirait une seconde.
    await noterLIdentifiantFournisseur(transaction.id, ouverture.providerTxId);
    throw echec("paiement_indisponible");
  }
  if (ouverture.issue !== "ouverte") throw echec("paiement_indisponible");

  await noterLIdentifiantFournisseur(transaction.id, ouverture.session.providerTxId);

  /*
    Le montant et la devise que le fournisseur a enregistrés sont comparés
    à ceux que la plateforme a décidés. Ils ne devraient jamais diverger ;
    s'ils divergent, on n'envoie personne payer une somme qu'on n'a pas
    décidée. L'écart s'ouvre en back-office, le candidat lit un refus.
  */
  const attendu = { montant: transaction.amount, devise: transaction.currency };
  if (!ouvertureConcorde(attendu, ouverture.session)) {
    await db.transaction.update({
      where: { id: transaction.id },
      data: {
        discrepancy: transaction.discrepancy ?? motifDeDivergence(attendu, ouverture.session),
      },
    });
    throw echec("ouverture_refusee");
  }

  return {
    transactionId: transaction.id,
    reference: transaction.reference,
    url: ouverture.session.url,
    reprise,
  };
}

/**
 * Écrit l'identifiant du fournisseur, et seulement s'il n'y en a pas.
 *
 * `updateMany` avec la colonne nulle en condition, et non un `update`
 * après lecture : entre la lecture et l'écriture, une notification signée
 * peut être passée et avoir posé le sien. Celui-là fait foi — M.B dit
 * qu'il ne se réécrit jamais, parce qu'un reçu déjà imprimé le cite.
 */
async function noterLIdentifiantFournisseur(id: string, providerTxId: string): Promise<void> {
  try {
    await db.transaction.updateMany({
      where: { id, providerTxId: null },
      data: { providerTxId },
    });
  } catch {
    /*
      La colonne est unique : un conflit signifie que cette session
      appartient déjà à une **autre** transaction locale.
      
      Vu en exécutant, et d'abord avalé : on continuait, et la
      comparaison du montant ne rattrapait rien puisque les deux
      transactions portent la même somme. Le candidat serait parti payer
      une session dont la notification signée créditerait le dossier du
      voisin. On refuse, et l'écart s'ouvre là où il se lit.
    */
    await db.transaction.update({
      where: { id },
      data: {
        discrepancy: `Ouverture refusée : la session ${providerTxId} est déjà rattachée à une autre transaction.`,
      },
    });
    throw echec("ouverture_refusee");
  }
}

/**
 * Référence interne, lisible et non devinable.
 *
 * Lisible parce qu'elle est dictée au téléphone à un opérateur pendant une
 * réclamation ; non séquentielle parce qu'une suite d'entiers dit le nombre
 * de paiements du mois à qui en voit deux.
 *
 * Le suffixe vient d'un alphabet fait pour la voix, et non de `base64url`,
 * qui produisait des `-` et des `_` au milieu d'une référence déjà
 * ponctuée de tirets.
 */
const referenceInterne = (): string =>
  `IMP-${new Date().toISOString().slice(2, 10).replace(/-/gu, "")}-${suiteDictable(6)}`;

export interface Notification {
  /** La notification, qui est ce qui se rejoue (M.B). */
  providerEventId: string;
  /** La transaction chez le fournisseur, posée une fois (M.B). */
  providerTxId: string;
  reference: string;
  statut: TransactionStatus;
  /** Pourquoi, quand le rail le dit (N.B). */
  cause?: CauseRefus;
}

export type IssueNotification =
  | { issue: "creditee"; transaction: Transaction }
  | { issue: "appliquee"; transaction: Transaction }
  | { issue: "rejeu" }
  | { issue: "inconnue" }
  | { issue: "refusee"; raison: string };

/** Deux notifications concurrentes : la seconde n'a plus l'état qu'elle a lu. */
class EtatDejaChange extends Error {}

/**
 * Application d'une notification de paiement — RG-05.1, RG-05.2, INV-7.
 *
 * Le webhook est la seule source de vérité : aucune autre fonction de ce
 * module ne crédite un pack, et le retour de redirection du fournisseur ne
 * passe pas par ici.
 *
 * **L'idempotence porte sur la notification, pas sur la transaction** —
 * M.B. Elle tenait auparavant sur `providerTxId` : une notification dont
 * l'identifiant de transaction était déjà connu était tenue pour un rejeu.
 * Chez FedaPay, le remboursement porte le même identifiant d'entité que la
 * confirmation, et disparaissait donc sans laisser de trace ; chez Stripe,
 * il en porte un autre, et écrasait la référence opérateur du reçu.
 *
 * Deux garde-fous, parce qu'il y a deux courses différentes :
 *
 * - **la même notification deux fois** — `PaymentEvent.providerEventId` est
 *   unique, et la ligne est écrite dans la même transaction de base que le
 *   changement d'état : la seconde bute et annule tout avec elle ;
 * - **deux notifications différentes en même temps** — la mise à jour exige
 *   l'état qui vient d'être lu. La perdante n'écrit rien plutôt que
 *   d'appliquer une transition calculée sur un état périmé. C'est la course
 *   que l'ancienne clé ne couvrait pas : `succeeded` et
 *   `checkout.completed` portent deux identifiants et créditaient deux fois
 *   s'ils arrivaient ensemble.
 */
export async function appliquerLaNotification(
  notification: Notification,
): Promise<IssueNotification> {
  const transaction = await db.transaction.findUnique({
    where: { reference: notification.reference },
  });
  if (!transaction) return { issue: "inconnue" };

  const effet = effetDeLaNotification(transaction.status, notification.statut);
  if (effet.type === "rejeu") return { issue: "rejeu" };
  if (effet.type === "refus") return { issue: "refusee", raison: effet.raison };

  let maj: Transaction;
  try {
    maj = await db.$transaction(async (tx) => {
      await tx.paymentEvent.create({
        data: {
          providerEventId: notification.providerEventId,
          transactionId: transaction.id,
          announced: notification.statut,
        },
      });

      const { count } = await tx.transaction.updateMany({
        // L'état lu est la condition : s'il a changé entre-temps, une autre
        // notification est passée et celle-ci raisonne sur le passé.
        where: { id: transaction.id, status: transaction.status },
        data: {
          status: effet.vers,
          // Posé une fois. Le remboursement de Stripe cite la charge et non
          // la session : le réécrire changerait la référence qu'un reçu déjà
          // imprimé porte.
          ...(transaction.providerTxId ? {} : { providerTxId: notification.providerTxId }),
          ...(effet.crediteLePack ? { confirmedAt: new Date() } : {}),
          // Un reçu est une pièce comptable : l'état ne va pas sans la date,
          // et la base refuse l'un sans l'autre.
          ...(effet.vers === "REMBOURSEE" ? { refundedAt: new Date() } : {}),
          /**
           * Le motif n'est écrit que sur un échec, et jamais deviné — N.B.
           *
           * La base le refuse ailleurs (`transaction_motif_seulement_sur_un_echec`),
           * et un échec annoncé par l'émetteur ne peut pas porter
           * `DELAI_DEPASSE` : il a répondu, dans le délai. Un rail qui ne dit
           * rien laisse la colonne nulle, et $-05 déduit alors de l'état —
           * mieux vaut ne rien savoir que d'inventer un solde.
           */
          ...(effet.vers === "ECHOUEE" && notification.cause && notification.cause !== "DELAI_DEPASSE"
            // La date accompagne le motif — O.B. C'est depuis elle que court
            // la conservation, et la base refuse l'un sans l'autre.
            ? { failureCause: notification.cause, failureCauseAt: new Date() }
            : {}),
        },
      });
      if (count !== 1) throw new EtatDejaChange();

      return tx.transaction.findUniqueOrThrow({ where: { id: transaction.id } });
    });
  } catch (erreur) {
    // Les deux courses se soldent de la même façon : rien n'a été écrit, et
    // la notification qui a gagné a fait le travail.
    if (erreur instanceof EtatDejaChange || estUnDoublon(erreur)) return { issue: "rejeu" };
    throw erreur;
  }

  /*
    Un paiement de consultation qui n'aboutit pas libère le créneau tenu :
    le garder gèlerait un horaire que personne ne paiera. Le rendez-vous
    confirmé, lui, n'est jamais touché ici — une annulation après paiement
    passe par K.C, qui décide d'un remboursement.
  */
  if (maj.packCode === "consultation" && (maj.status === "ECHOUEE" || maj.status === "EXPIREE")) {
    await libererLaTenue(maj.id).catch(() => undefined);
  }

  if (!effet.crediteLePack) return { issue: "appliquee", transaction: maj };

  await crediterLAchat(maj);
  return { issue: "creditee", transaction: maj };
}

/**
 * Initier un remboursement : la demande part, l'argent non — arbitrage
 * du 21/09/2026.
 *
 * Le deuxième des trois faits. La décision est déjà prise (K.C, ou un
 * geste d'administrateur) ; ici on retire les droits non consommés, on
 * tente l'envoi, et on compte la tentative. Ce que la fonction **n'**écrit
 * **pas** : `status`, `refundedAt`. Seule la notification signée du
 * fournisseur les écrit (INV-7, M.B).
 *
 * **Les droits partent à l'initiation, pas à la confirmation.** Entre les
 * deux il peut s'écouler des jours, et laisser un pack utilisable pendant
 * qu'on en rend le prix revient à l'offrir.
 *
 * **Un échec d'envoi conserve la dette.** `refundRequestedAt` reste nul,
 * la tentative est datée et comptée, et l'appel suivant portera la même
 * clé d'idempotence — le fournisseur y reconnaîtra un rejeu plutôt que
 * d'envoyer l'argent deux fois.
 */
export async function initierLeRemboursement(
  reference: string,
  envoyer: Rembourseur = leRembourseur(),
  maintenant = new Date(),
): Promise<
  | { issue: "envoyee" }
  | { issue: "en_attente_d_envoi" }
  | { issue: "revue_manuelle"; consommees: number }
  | { issue: "sans_objet" }
> {
  const transaction = await db.transaction.findUnique({ where: { reference } });
  if (!transaction) throw echec("introuvable");
  // Rien à envoyer : pas d'obligation, ou somme déjà rendue.
  if (!transaction.refundDueAt || transaction.refundedAt) return { issue: "sans_objet" };

  if (transaction.applicationId) {
    const suite = await suiteDuQuotaDuPack(transaction.applicationId, transaction.id);
    if (suite.suite === "REVUE_MANUELLE") {
      // On ne tranche pas ce que vaut une analyse déjà rendue : c'est une
      // question commerciale. L'écart porte la question à un humain, et
      // aucune demande ne part.
      await db.transaction.update({
        where: { id: transaction.id },
        data: {
          discrepancy:
            transaction.discrepancy ??
            `${MOTIF_REVUE_PARTIELLE} ${suite.consommees} analyse(s) consommée(s) sur ${suite.ouvertes}.`,
        },
      });
      return { issue: "revue_manuelle", consommees: suite.consommees };
    }
    /**
     * Le retrait n'a lieu qu'une fois, et la garde n'est pas du luxe.
     *
     * Vu en exécutant : deux tentatives d'envoi retiraient deux fois les
     * mêmes droits, et le solde du dossier passait de trente à moins
     * trente. La clé d'idempotence protège l'appel au fournisseur — elle
     * ne protégeait pas le grand livre, qui est pourtant là où une
     * seconde écriture fait le plus de dégâts. Or un échec d'envoi est le
     * cas ordinaire tant que le rail n'est pas branché : la deuxième
     * tentative n'est pas une hypothèse, c'est la suite normale.
     */
    const dejaRetire = await db.analysisCredit.findFirst({
      where: { transactionId: transaction.id, reason: "REMBOURSEMENT" },
      select: { id: true },
    });
    if (suite.retire > 0 && !dejaRetire) {
      await db.analysisCredit.create({
        data: {
          applicationId: transaction.applicationId,
          delta: -suite.retire,
          reason: "REMBOURSEMENT",
          transactionId: transaction.id,
          note: `Droits retirés à l'initiation du remboursement de ${reference}.`,
        },
      });
    }
  }

  const accuse = await envoyer({
    reference: transaction.reference,
    providerTxId: transaction.providerTxId,
    montant: transaction.amount,
    devise: transaction.currency,
    cle: cleDIdempotence(transaction.reference),
  });

  await db.transaction.update({
    where: { id: transaction.id },
    data: {
      refundAttemptedAt: maintenant,
      refundAttempts: { increment: 1 },
      // Posé une seule fois : une demande déjà acceptée le reste, et un
      // second accusé ne doit pas réécrire la date du premier.
      ...(accuse && !transaction.refundRequestedAt
        ? { refundRequestedAt: accuse.accepteLe }
        : {}),
    },
  });

  return accuse ? { issue: "envoyee" } : { issue: "en_attente_d_envoi" };
}

/**
 * Ce qu'il advient des droits du pack, lu dans le grand livre.
 *
 * Les octrois de **cette** transaction d'un côté, les analyses consommées
 * sur le dossier de l'autre. On ne compte pas les consommations par
 * transaction parce qu'elles n'en portent pas : une analyse se débite du
 * solde du dossier, sans savoir quel pack l'a ouverte — et c'est bien
 * ainsi, un solde n'a pas de couleur.
 */
async function suiteDuQuotaDuPack(applicationId: string, transactionId: string) {
  const [octrois, consommations] = await Promise.all([
    db.analysisCredit.aggregate({
      where: { applicationId, transactionId, delta: { gt: 0 } },
      _sum: { delta: true },
    }),
    db.analysisCredit.aggregate({
      where: { applicationId, reason: "ANALYSE" },
      _sum: { delta: true },
    }),
  ]);
  const ouvertes = octrois._sum.delta ?? 0;
  const consommees = Math.abs(consommations._sum.delta ?? 0);
  return suiteDuQuota(ouvertes, consommees);
}

/**
 * Refermer un écart de réconciliation — arbitrage du 21/09/2026.
 *
 * **Ce qu'elle écrit, et rien d'autre.** Les quatre colonnes de la
 * résolution. Pas `status`, pas `confirmedAt`, pas `refundedAt`, pas
 * `refundDueAt` : une action de guichet ne déclare pas un paiement
 * encaissé ni remboursé, et « remboursement à initier » est une issue,
 * pas un virement. Seule la notification signée du fournisseur fait
 * bouger l'argent (INV-7).
 *
 * **Et elle n'efface pas `discrepancy`.** Le texte du désaccord reste à
 * côté de sa réponse : un historique qui ne garde que la conclusion a
 * perdu la question.
 *
 * La date écrite ici est le déclencheur que le sursis d'O.B attendait.
 */
export async function resoudreLEcart(
  reference: string,
  resolution: Resolution,
  acteurId: string,
  maintenant = new Date(),
): Promise<{ resolu: boolean }> {
  const transaction = await db.transaction.findUnique({ where: { reference } });
  if (!transaction) throw echec("introuvable");
  if (!ecartOuvert(transaction)) return { resolu: false };

  await db.transaction.update({
    where: { id: transaction.id },
    data: {
      discrepancyOutcome: resolution.issue,
      discrepancyNote: resolution.note.trim(),
      discrepancyResolvedAt: maintenant,
      discrepancyResolvedBy: acteurId,
    },
  });
  return { resolu: true };
}

/**
 * Violation de contrainte d'unicité, reconnue sans importer le client
 * Prisma : `P2002` est le code, et c'est tout ce dont on a besoin ici.
 */
function estUnDoublon(erreur: unknown): boolean {
  return (
    typeof erreur === "object" &&
    erreur !== null &&
    "code" in erreur &&
    (erreur as { code?: unknown }).code === "P2002"
  );
}

/**
 * Crédit de l'achat — WF-05, étape 7.
 *
 * Trois contreparties, une par catégorie, et le `switch` est exhaustif :
 * une catégorie ajoutée sans contrepartie ne compile pas. C'est l'endroit
 * où il importe le plus, parce que c'est le seul appelé par la
 * notification signée — l'argent est déjà encaissé quand on y arrive, et
 * une branche oubliée se lit « payé, rien reçu ».
 *
 * Le code enregistré est relu par le domaine plutôt que comparé à des
 * chaînes en ligne : la conversion qui l'écrit (`codeEnregistre`) et
 * celle qui le relit vivent côte à côte, et un code inconnu ne devient
 * pas un pack par défaut.
 */
async function crediterLAchat(transaction: Transaction): Promise<void> {
  if (!transaction.applicationId) return;

  const achat = achatDepuisLeCode(transaction.packCode);
  // Un code que le domaine ne reconnaît plus — un pack retiré de la
  // grille, par exemple. Rien n'est crédité au hasard ; la transaction
  // reste confirmée et lisible en back-office.
  if (!achat) return;

  switch (achat.type) {
    case "recharge":
      await ouvrirDuQuota({
        applicationId: transaction.applicationId,
        analyses: RECHARGE_ANALYSES.volume,
        motif: "RECHARGE",
        transactionId: transaction.id,
        note: RECHARGE_ANALYSES.libelle,
      });
      return;

    /*
      Une consultation ne crédite pas un quota : elle confirme un
      rendez-vous et ouvre l'accès du consultant au dossier. C'est le seul
      endroit d'où cela peut arriver, puisque c'est le seul appelé par la
      notification signée — ni le retour du navigateur, ni une relève de
      statut, ni un geste d'opérateur n'y mènent.

      Elle suppose un créneau tenu, qui cite cette transaction. C'est
      pourquoi le récapitulatif n'ouvre pas de consultation
      (`ouvrableDepuisLeRecapitulatif`) : ouverte hors de T-05, elle
      n'aurait ici aucun rendez-vous à confirmer.
    */
    case "consultation":
      await confirmerLaConsultation(transaction);
      return;

    case "pack": {
      const pack = getPack(achat.code);
      if (!pack) return;
      await db.$transaction([
        db.application.update({
          where: { id: transaction.applicationId },
          data: { status: "ACTIF" },
        }),
        db.analysisCredit.create({
          data: {
            applicationId: transaction.applicationId,
            delta: pack.analyses,
            reason: "ACHAT_PACK",
            transactionId: transaction.id,
            note: `Pack ${pack.libelle}`,
          },
        }),
      ]);
      return;
    }

    default: {
      const jamais: never = achat;
      throw new Error(`Achat sans contrepartie : ${JSON.stringify(jamais)}`);
    }
  }
}

/**
 * Ouverture d'un remboursement — K.C.
 *
 * Elle **décide**, elle ne verse pas. La distinction est la même qu'entre
 * un engagement et un décaissement, et elle est rendue visible par deux
 * colonnes : `refundDueAt` dit qu'on doit, `refundedAt` dit qu'on a rendu.
 * La seconde n'est écrite que par la notification signée du fournisseur
 * (INV-7) — la plateforme n'appelle aucune API de remboursement, et se
 * déclarer quitte sans avoir rien versé serait exactement le genre de
 * simulation qu'I.C interdit.
 *
 * Idempotente : une obligation déjà ouverte n'est pas réécrite. Le premier
 * motif est celui qui a été décidé, et une reprise de job ne doit pas le
 * remplacer par le sien.
 */
export async function ouvrirUnRemboursement(
  transactionId: string,
  motif: string,
  maintenant = new Date(),
): Promise<{ ouvert: true; reference: string } | { ouvert: false; raison: string }> {
  const transaction = await db.transaction.findUnique({
    where: { id: transactionId },
    // La référence sort avec : l'appelant enchaîne sur l'envoi de la
    // demande, qui s'adresse par référence et non par identifiant — la
    // relire serait une seconde requête pour une donnée déjà lue.
    select: { reference: true, status: true, refundDueAt: true, refundedAt: true },
  });
  if (!transaction) return { ouvert: false, raison: "transaction inconnue" };
  if (transaction.refundedAt) return { ouvert: false, raison: "déjà remboursée" };
  if (transaction.refundDueAt) return { ouvert: false, raison: "déjà ouverte" };
  // On ne doit que ce qu'on a encaissé. La base le refuserait ; le dire ici
  // évite de faire échouer une suppression de compte sur une contrainte.
  if (transaction.status !== "CONFIRMEE") {
    return { ouvert: false, raison: "aucun encaissement à rendre" };
  }

  await db.transaction.update({
    where: { id: transactionId },
    data: { refundDueAt: maintenant, refundBasis: motif },
  });
  return { ouvert: true, reference: transaction.reference };
}
