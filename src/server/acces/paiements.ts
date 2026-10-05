import type { Prisma, Transaction, TransactionStatus } from "@prisma/client";
import { espaceReel } from "@/server/paiement/secrets";
import { pagesPubliees } from "@/server/juridique/lecture";
import { db } from "@/lib/db";
import { appliquerLaCouverture } from "@/server/acces/couverture";
import { miseEnEtat } from "@/domain/dossiers/etat";
import { echec } from "@/server/http/echecs";
import { ecartOuvert, type Resolution } from "@/domain/backoffice/ecart";
import {
  A_REMBOURSER_A_LA_MAIN,
  MOTIF_DE_REFUS_DE_DECLARATION,
  MOTIF_IDENTIFIANT,
  MOTIF_REVUE_PARTIELLE,
  cleDIdempotence,
  defautDeDeclaration,
  defautDIdentifiant,
  lireLaReferenceDeRemboursement,
  suiteDeLaTentative,
  suiteDuQuota,
  type IssueDeDemande,
} from "@/domain/paiement/remboursement";
import { leRembourseur } from "@/server/paiement/remboursement";
import type { Rembourseur } from "@/server/paiement/rembourseur";
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
import {
  BAIL_DE_CREDIT_MINUTES,
  ecartDeConfirmationTardive,
  effetDeLaNotification,
} from "@/server/paiement/cycle";
import { lignesDuGrandLivre, ouvrirDuQuota, sousVerrouDuGrandLivre } from "./quota";
import { confirmerLaConsultation, libererLaTenue } from "./consultations";
import { suiteDictable } from "@/server/securite/secret";
import { fournisseurDe } from "@/domain/payments/rail";
import {
  cheminDeRetour,
  cleDOuverture,
  motifDeDivergence,
  ouvertureConcorde,
  ouvertureReessayable,
  traceDeLOuverture,
  OUVERTURE_SANS_PAGE,
  type CauseDEchecDOuverture,
} from "@/domain/paiement/ouverture";
import { lOuvreur } from "@/server/paiement/ouvreurs";
import { sourceDeLaMontee, type SourceDeLaMontee } from "@/server/acces/montee";
import {
  ANALYSES_AJOUTEES,
  CODE_MONTEE_DOSSIER,
  LIBELLE_MONTEE,
  NOTE_REDACTION_ASSISTEE,
  PACK_DE_DEPART,
  REFUS_ESSENTIEL_APRES_MONTEE,
  suiteDuRemboursementDeLaMontee,
} from "@/domain/payments/montee";
import { repartir } from "@/domain/payments/grand-livre";
import type { Constat, Ouvreur } from "@/server/paiement/ouvreur";
import type { CauseRefus } from "@/domain/paiement/echec";
import { etablirLAvoir, etablirLaFacture, etatDeLaFacturation } from "@/server/facturation/emission";
import { identiteDeFacturation } from "@/domain/facturation/facture";
import { suspensionDuPaiement, type SuspensionDuPaiement } from "@/domain/paiement/ouverture";

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
type Rattache<A> = A extends { type: "montee" }
  ? A & { applicationId: string; source: SourceDeLaMontee }
  : A extends unknown
    ? A & { applicationId: string }
    : never;
export type Achat = Rattache<AchatDuDomaine>;

/** Rattache au dossier un achat reçu de la route, hors montée en gamme. */
export const rattacher = (
  achat: Exclude<AchatDuDomaine, { type: "montee" }>,
  applicationId: string,
): Achat => ({
  ...achat,
  applicationId,
});

/**
 * Rattache au dossier l'achat reçu de la route — montée comprise.
 *
 * La montée en gamme (S.88) ne porte que sa catégorie. Son achat Essentiel
 * d'origine et son prix se retrouvent ici, en base : le navigateur ne dit
 * ni lequel, ni combien. Un dossier qui ne s'y prête pas lève
 * `montee_indisponible`, avec la raison précise.
 */
export async function preparerLAchat(
  achat: AchatDuDomaine,
  applicationId: string,
  userId: string,
): Promise<Achat> {
  if (achat.type !== "montee") return rattacher(achat, applicationId);
  return { ...achat, applicationId, source: await sourceDeLaMontee(applicationId, userId) };
}

/**
 * La devise d'un achat. Celle que le candidat a choisie, sauf pour la
 * montée : elle garde la devise de l'achat Essentiel, sans conversion.
 */
export const deviseDeLAchat = (achat: Achat, choisie: Devise): Devise =>
  achat.type === "montee" ? achat.source.devise : choisie;

/**
 * Le montant et le libellé d'un achat, pris sur la grille du domaine.
 *
 * La règle des catégories vit dans `domain/payments/achat` : elle était
 * écrite ici en ternaires, et le récapitulatif en avait sa propre version.
 * Deux lectures d'une même grille finissent par diverger — celle de
 * l'écran l'avait déjà fait.
 */
export function montantDe(achat: Achat, devise: Devise): { montant: number; libelle: string } {
  if (achat.type === "montee") {
    // La différence, calculée en base depuis l'achat d'origine, dans sa
    // devise et aucune autre : il n'y a pas de grille à convertir.
    if (devise !== achat.source.devise) throw echec("devise_figee");
    return { montant: achat.source.du, libelle: LIBELLE_MONTEE };
  }
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
  /*
    La reprise porte sur **le même achat** : même code, et pour une montée,
    même achat d'origine. Elle reprenait n'importe quelle transaction en
    attente sur le dossier — une recharge en suspens aurait été reprise à
    la place du passage à Dossier, et le candidat aurait payé l'une en
    croyant payer l'autre.
  */
  const memeAchat = {
    userId,
    applicationId: achat.applicationId,
    packCode: codeEnregistre(achat),
    ...(achat.type === "montee" ? { sourceTransactionId: achat.source.transactionId } : {}),
    status: { in: ["INITIEE", "EN_ATTENTE"] as TransactionStatus[] },
  };
  const enCours = await db.transaction.findFirst({
    where: memeAchat,
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

  const creation = db.transaction.create({
    data: {
      reference: referenceInterne(),
      userId,
      applicationId: achat.applicationId,
      // S.88 — la montée cite son achat d'origine ; la base l'exige, et
      // refuse une seconde montée ouverte depuis le même achat.
      ...(achat.type === "montee" ? { sourceTransactionId: achat.source.transactionId } : {}),
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
  try {
    return { transaction: await creation, reprise: false };
  } catch (erreur) {
    /*
      Deux clics simultanés sur « Payer » une montée : le second bute sur
      l'index unique partiel. Il reprend la transaction que le premier
      vient d'ouvrir — c'est le même achat — au lieu de répondre par une
      erreur à un geste légitime.
    */
    if (achat.type === "montee" && estUnDoublon(erreur)) {
      const ouverte = await db.transaction.findFirst({ where: memeAchat });
      if (ouverte) return { transaction: ouverte, reprise: true };
      throw echec("montee_indisponible", {
        corps: "Un passage à Dossier est déjà confirmé ou en cours sur ce dossier.",
      });
    }
    throw erreur;
  }
}

/**
 * L'échec d'une ouverture, avec ce qui l'a causé.
 *
 * ── Cinq causes, une seule réponse ──────────────────────────────────
 *
 * Le contrat d'ouverture annonce que « les trois issues ne se traitent
 * pas pareil — réessayer, refuser, alerter ». Cette fonction-ci les
 * traitait toutes pareil :
 *
 *     if (ouverture.issue !== "ouverte") throw echec("paiement_indisponible");
 *
 * Aucun adaptateur branché, un fournisseur muet, une demande refusée,
 * une réponse hors contrat, une session créée sans adresse : cinq
 * causes, une réponse identique au caractère près, sans diagnostic. Et
 * sans trace non plus — `route.ts` ne journalise que ce qui **n'est
 * pas** un échec du catalogue, si bien qu'une clé expirée ne laissait
 * aucune ligne nulle part. Le `detail` que chaque adaptateur compose
 * pour être lu — « api_key_expired », « montant ou devise absents de la
 * session » — n'atteignait personne.
 *
 * ── Ce que chacune rend maintenant ──────────────────────────────────
 *
 * Le domaine décide de la nature — passagère ou installée — et elle
 * décide du code : `paiement_indisponible` propose de réessayer,
 * `ouverture_impossible` dit que réessayer ne servira à rien. Le
 * diagnostic nomme le service, porte le statut rendu par le fournisseur
 * quand il y en a un, et range la cause et le constat dans la trace.
 *
 * Le diagnostic ne quitte jamais le serveur vers un écran candidat :
 * `pourCandidat` ne le sérialise pas. C'est précisément ce qui permet
 * d'y écrire ce qui est utile plutôt que ce qui est présentable.
 */
function echecDOuverture(
  fournisseur: string,
  cause: CauseDEchecDOuverture,
  reference: string | null,
  constat: Constat,
) {
  return echec(ouvertureReessayable(cause) ? "paiement_indisponible" : "ouverture_impossible", {
    // La seule cause dont la phrase du catalogue serait fausse : le
    // fournisseur a répondu, et la transaction existe chez lui.
    ...(cause === "creee_sans_url" ? { corps: OUVERTURE_SANS_PAGE } : {}),
    diagnostic: {
      service: fournisseur.toLowerCase(),
      ...(constat.statut === undefined ? {} : { statutAmont: constat.statut }),
      survenuA: new Date().toISOString(),
      trace: traceDeLOuverture(reference, cause, constat.detail),
    },
  });
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
/**
 * Ce qui suspend un paiement réel pour ce candidat, chez ce fournisseur —
 * lu par le refus serveur et par le récapitulatif, qui le dit avant le
 * clic. Nul en bac à sable : rien ne le suspend.
 */
export async function suspensionDeLEncaissement(
  userId: string,
  fournisseur: "FEDAPAY" | "STRIPE",
): Promise<SuspensionDuPaiement | null> {
  if (!espaceReel(fournisseur)) return null;
  const [pages, facturation, compte] = await Promise.all([
    pagesPubliees(),
    etatDeLaFacturation(),
    db.user.findUnique({ where: { id: userId }, select: { billingName: true, billingAddress: true } }),
  ]);
  return suspensionDuPaiement({
    espaceReel: true,
    conditionsPubliees: pages.conditions !== undefined,
    facturationEnPlace: facturation.obstacles.length === 0,
    identiteComplete: identiteDeFacturation(compte?.billingName, compte?.billingAddress) !== null,
  });
}

export async function ouvrirLeTunnel(
  userId: string,
  achat: Achat,
  devise: Devise,
  ouvreur: Ouvreur | null = lOuvreur(devise),
): Promise<{ transactionId: string; reference: string; url: string; reprise: boolean }> {
  // Avant la moindre écriture. Un échec honnête vaut mieux qu'une attente
  // impossible, et il ne laisse aucune transaction derrière lui.
  if (!ouvreur) {
    // Ni clé, ni racine d'application : personne n'a été appelé. Le
    // service est nommé quand même — il se déduit de la devise, et c'est
    // celui dont la configuration manque.
    throw echecDOuverture(fournisseurDe(devise), "aucun_adaptateur", null, {
      detail: "aucun adaptateur branché (clé ou racine d'application absente)",
    });
  }

  /*
    Pas d'encaissement réel sans conditions de vente publiées — décision
    du 03/10/2026. Le candidat coche qu'il les accepte : en espace réel,
    lui faire payer un texte « pas encore publié » n'est pas tenable. Le
    bac à sable reste ouvert, pour que les essais continuent. Avant toute
    écriture : rien ne doit rester en attente d'un paiement impossible.
  */
  /*
    Et pas d'encaissement réel sans facture — avis comptable M.C du
    04/10/2026. Chaque vente doit donner lieu à une facture certifiée, au
    nom et à l'adresse du client : tant que l'une manque, le paiement
    réel ne s'ouvre pas. Toujours avant la moindre écriture.
  */
  const suspension = await suspensionDeLEncaissement(userId, ouvreur.fournisseur);
  if (suspension === "conditions") throw echec("paiement_sans_conditions");
  if (suspension === "facturation") throw echec("paiement_sans_facturation");
  if (suspension === "identite") throw echec("facturation_identite_manquante");

  const { transaction, reprise } = await creerOuReprendre(userId, achat, devise);

  let ouverture = transaction.providerTxId
    ? await ouvreur.retrouver(transaction.providerTxId, transaction.reference, devise)
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
  }
  if (ouverture.issue !== "ouverte") {
    throw echecDOuverture(
      ouvreur.fournisseur,
      ouverture.issue,
      transaction.reference,
      ouverture,
    );
  }

  /*
    Deux demandes simultanées sur le même achat — 03/10/2026.

    Elles reprennent la même transaction locale, toutes deux sans
    identifiant fournisseur, et appellent toutes deux `creer`. FedaPay ne
    documente pas `Idempotency-Key` (l'essai de bac à sable l'a confirmé :
    même clé, deux transactions) : il y a alors deux sessions chez lui.
    Une seule est enregistrée ; l'autre renvoyait quand même son adresse,
    et un candidat qui payait les deux voyait le second paiement tenu pour
    un rejeu — encaissé, sans trace.

    La demande qui perd l'écriture rend désormais **la session
    enregistrée**, jamais la sienne : l'orpheline n'est montrée à personne
    et ne peut pas être réglée.
  */
  const enregistree = await noterLIdentifiantFournisseur(
    transaction.id,
    ouverture.session.providerTxId,
  );
  if (enregistree !== ouverture.session.providerTxId) {
    ouverture = await ouvreur.retrouver(enregistree, transaction.reference, devise);
    if (ouverture.issue !== "ouverte") {
      throw echecDOuverture(ouvreur.fournisseur, ouverture.issue, transaction.reference, ouverture);
    }
  }

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
/**
 * Rend l'identifiant **finalement enregistré** : le nôtre, ou celui qu'une
 * demande concurrente a posé avant nous (03/10/2026).
 */
async function noterLIdentifiantFournisseur(id: string, providerTxId: string): Promise<string> {
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
  const lue = await db.transaction.findUniqueOrThrow({
    where: { id },
    select: { providerTxId: true },
  });
  return lue.providerTxId ?? providerTxId;
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
  /**
   * Notre référence, quand le fournisseur la renvoie. FedaPay ne la rend
   * que dans `custom_metadata` : `null` si elle manque, et le paiement se
   * retrouve par `providerTxId`, posé à l'ouverture (03/10/2026).
   */
  reference: string | null;
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
  const transaction = notification.reference
    ? await db.transaction.findUnique({ where: { reference: notification.reference } })
    : await db.transaction.findUnique({ where: { providerTxId: notification.providerTxId } });
  if (!transaction) return { issue: "inconnue" };

  const effet = effetDeLaNotification(transaction.status, notification.statut);
  /*
    Un second paiement, et non un rejeu — 03/10/2026.

    Chez FedaPay, une transaction garde le même identifiant toute sa vie :
    une confirmation qui en porte un autre, sur une référence déjà réglée,
    est un **autre** paiement — une session orpheline réglée elle aussi.
    Le tenir pour un rejeu encaissait l'argent sans trace. L'écart s'ouvre,
    avec ce qu'il faut rembourser. (Stripe confirme sur un identifiant
    différent de la session : la règle ne vaut que pour FedaPay.)
  */
  if (
    effet.type === "rejeu" &&
    notification.statut === "CONFIRMEE" &&
    transaction.providerTxId?.startsWith("fedapay:") &&
    notification.providerTxId !== transaction.providerTxId
  ) {
    const raison = `Second paiement confirmé (${notification.providerTxId}) pour la référence ${transaction.reference}, déjà réglée par ${transaction.providerTxId} : à rembourser au tableau de bord FedaPay.`;
    await db.transaction.updateMany({
      where: { id: transaction.id, discrepancy: null },
      data: { discrepancy: raison },
    });
    return { issue: "refusee", raison };
  }
  if (effet.type === "rejeu") return { issue: "rejeu" };
  /*
    Payé après avoir été tenu pour échoué ou expiré — 05/10/2026. La
    transition reste refusée, mais l'écart s'ouvre : sans lui, le seul
    signe d'un candidat débité sans rien recevoir était une ligne de
    journal que personne ne lit.
  */
  if (effet.type === "refus") {
    const tardive = ecartDeConfirmationTardive(
      transaction.status,
      notification.statut,
      notification.providerTxId,
    );
    if (tardive) {
      await db.transaction.updateMany({
        where: { id: transaction.id, discrepancy: null },
        data: { discrepancy: tardive },
      });
      return { issue: "refusee", raison: tardive };
    }
    return { issue: "refusee", raison: effet.raison };
  }

  let maj: Transaction;
  try {
    maj = await db.$transaction(async (tx) => {
      /*
        Un seul instant pour toutes les dates que cette notification pose :
        deux appels séparés de quelques millisecondes donneraient deux
        horodatages différents pour un seul événement, et un reçu qui ne
        porte pas la même seconde que le rapprochement de sa ligne se
        discute en réclamation.
      */
      const quand = new Date();

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
          /**
           * La confirmation et le rapprochement s'écrivent ensemble — INV-7.
           *
           * `reconciledAt` n'était posé par aucun code de production. Trois
           * lectures l'attendaient pourtant : B-04 affichait « En attente de
           * rapprochement » sur chaque paiement confirmé, pour toujours ;
           * `etatOperateur()` rendait `null` quoi qu'il arrive, si bien que
           * le total du jour n'était jamais publiable ; et `encaisse`, qui
           * ne compte que les lignes rapprochées, restait vide un jour où la
           * caisse avait tourné. Trois états qu'aucune exécution ne pouvait
           * produire — constaté en menant un paiement jusqu'au bout sur une
           * base réelle.
           *
           * INV-7 nomme le mécanisme : « Tout paiement est idempotent et
           * **réconcilié par webhook signé**. » La parole du fournisseur
           * arrive par une notification dont la signature est vérifiée, et
           * la consultation du job de réconciliation repasse par cette même
           * fonction. Les deux sont le fournisseur ; il n'y a pas de
           * troisième source à confronter.
           *
           * Ce que la note du schéma protège reste vrai : un silence de
           * l'opérateur n'écrit rien du tout. Il laisse `reconciledAt` nul
           * sans faire basculer `status`, et aucun paiement n'est accusé sur
           * l'absence de réponse d'un tiers.
           */
          ...(effet.crediteLePack ? { confirmedAt: quand, reconciledAt: quand } : {}),
          // Un reçu est une pièce comptable : l'état ne va pas sans la date,
          // et la base refuse l'un sans l'autre.
          ...(effet.vers === "REMBOURSEE" ? { refundedAt: quand } : {}),
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
            ? { failureCause: notification.cause, failureCauseAt: quand }
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

  /*
    Un remboursement confirmé s'adosse à un avoir — avis M.C du
    04/10/2026, « sans avoir, le chiffre d'affaires reste artificiellement
    gonflé ». Hors de la transition : un avoir qui échoue ne défait pas un
    remboursement que le fournisseur a confirmé, et la réconciliation le
    reprend.
  */
  if (maj.status === "REMBOURSEE") {
    await etablirLAvoir(maj.id).catch(() => undefined);
  }

  if (!effet.crediteLePack) return { issue: "appliquee", transaction: maj };

  await acheverLeCredit(maj);
  // Chaque vente donne lieu à une facture (M.C). Même filet que l'avoir.
  await etablirLaFacture(maj.id).catch(() => undefined);
  return { issue: "creditee", transaction: maj };
}

/**
 * La contrepartie d'un paiement a-t-elle été ouverte ?
 *
 * **Aucune**, et non « toute » : c'est la distinction qui rend la reprise
 * sûre. Un Pro couvre trois destinations et n'en sert qu'une le jour de
 * l'achat, faute de second dossier — c'est un état normal, que la
 * couverture complète plus tard. Une transaction qui n'a *rien* ouvert,
 * elle, n'a pas été créditée du tout.
 */
async function contrepartieOuverte(transaction: Transaction): Promise<boolean> {
  // Rien à ouvrir : ni dossier visé, ni achat que le domaine reconnaisse.
  if (!transaction.applicationId) return true;
  const achat = achatDepuisLeCode(transaction.packCode);
  if (!achat) return true;

  if (achat.type === "consultation") {
    /*
      La contrepartie d'une consultation est un créneau qui cesse d'être
      seulement tenu. Un créneau absent n'est pas une contrepartie en
      attente : il n'y a rien à confirmer, et le signaler à chaque passe
      ferait du bruit sans fin.
    */
    const tenus = await db.appointment.count({
      where: { transactionId: transaction.id, status: "TENU" },
    });
    return tenus === 0;
  }

  const ouverts = await db.analysisCredit.count({ where: { transactionId: transaction.id } });
  return ouverts > 0;
}

/**
 * Ouvre la contrepartie d'un paiement confirmé, une fois — RG-05.4, INV-7.
 *
 * ── Un crédit qui n'aboutit pas n'était rattrapé par rien ───────────
 *
 * `crediterLAchat` court **hors** de la transaction qui pose `CONFIRMEE` :
 * l'état est commité, puis le quota s'ouvre. Entre les deux, un arrêt du
 * processus laisse un paiement encaissé et rien d'ouvert — et les trois
 * filets passaient à côté. Exécuté sur PostgreSQL :
 *
 *     transaction        CONFIRMEE, confirmedAt posé
 *     quota ouvert       0 analyses · dossier BROUILLON
 *     webhook rejoué  →  { issue: "rejeu" }         quota : 0
 *     réconciliation  →  { examinees: 0 }           quota : 0
 *
 * Le rejeu s'arrête à `effetDeLaNotification(CONFIRMEE, CONFIRMEE)`, qui
 * rend « rejeu » avant d'atteindre le crédit — et c'est juste pour l'état,
 * faux pour la contrepartie. La réconciliation, elle, ne lit que
 * `INITIEE | EN_ATTENTE` : une transaction aboutie lui est invisible.
 *
 * Son en-tête annonce pourtant « le filet du pire défaut possible de ce
 * produit : un candidat débité qui ne voit rien arriver ». Le filet
 * couvrait le webhook perdu, pas le crédit interrompu.
 *
 * ── Ce que cette fonction garantit ──────────────────────────────────
 *
 * Elle est idempotente, et c'est ce qui permet de la rappeler : le
 * chemin des packs l'était déjà par `destinationsServies`, celui des
 * consultations par l'état du créneau ; la recharge ne l'était pas, et un
 * second appel aurait crédité deux fois. La garde est commune aux trois.
 *
 * Rend `true` quand elle a ouvert quelque chose.
 */
export async function acheverLeCredit(transaction: Transaction): Promise<boolean> {
  if (await contrepartieOuverte(transaction)) return false;

  /*
    Et la base arbitre entre deux appelants — INV-7.

    La lecture ci-dessus rend l'appel rejouable ; elle ne le rend pas sûr à
    deux. La notification signée qui vient de confirmer appelle cette
    fonction juste après avoir commité `CONFIRMEE` ; la passe de
    réconciliation, elle, balaie les paiements confirmés et appelle la
    même. Entre le commit et le crédit il y a quelques dizaines de
    millisecondes, et les deux y lisaient « rien d'ouvert ».

    Constaté en exécution sur PostgreSQL, deux achèvements simultanés du
    même paiement :

        recharge  retours [true, false]  →  1 ligne de crédit, solde 10
        pack      retours [true, true]   →  2 lignes de crédit, solde 20

    Un pack payé une fois, deux fois crédité : le quota double, INV-6
    compte un plafond qui n'a pas été acheté, et la ligne de coût de B-07
    hérite du même écart.

    Le bail se prend par une mise à jour conditionnée à ce qu'on vient de
    lire — la mécanique de la tenue d'un créneau et de la transition d'une
    transaction. Le second appelant attend le verrou de ligne, relit, et
    repart sans rien ouvrir.
  */
  const perime = new Date(Date.now() - BAIL_DE_CREDIT_MINUTES * 60_000);
  const { count } = await db.transaction.updateMany({
    where: {
      id: transaction.id,
      // Libre, ou tenu par un appelant qui n'est jamais revenu.
      OR: [{ creditingAt: null }, { creditingAt: { lt: perime } }],
    },
    data: { creditingAt: new Date() },
  });
  if (count !== 1) return false;

  try {
    await crediterLAchat(transaction);
  } catch (erreur) {
    /*
      Le bail se rend tout de suite. L'attendre ferait patienter le filet
      cinq minutes pour une erreur déjà connue — et ce filet existe pour
      qu'un candidat débité ne reste pas devant un dossier vide.
    */
    await db.transaction
      .updateMany({ where: { id: transaction.id }, data: { creditingAt: null } })
      .catch(() => undefined);
    throw erreur;
  }
  return true;
}

/**
 * Initier un remboursement : la demande part, l'argent non — arbitrages
 * du 21/09/2026 et du 22/09/2026.
 *
 * Le deuxième des trois faits. La décision est déjà prise (K.C, ou un
 * geste d'administrateur) ; ici on retire les droits non consommés, on
 * envoie la demande au fournisseur, et on compte la tentative. Ce que la
 * fonction **n'**écrit **pas** : `status`, `refundedAt`. Seule la
 * notification signée du fournisseur les écrit (INV-7, M.B).
 *
 * **Une demande acceptée n'est pas un versement.** C'est la tentation du
 * module maintenant que le rail existe : une réponse 200 ressemble à de
 * l'argent rendu. `refundRequestedAt` dit « il a pris la demande », et
 * rien de plus ; la dette reste due, visible en B-04, jusqu'à la
 * notification.
 *
 * ── La réservation de la tentative, avant tout appel ─────────────────
 *
 * Deux reprises concurrentes — un opérateur qui clique deux fois, une
 * suppression de compte pendant qu'un job relance — appelaient toutes
 * les deux le fournisseur. La clé d'idempotence l'en protège **chez
 * lui** ; elle ne protège ni le grand livre, ni le compteur de
 * tentatives, et elle suppose que le fournisseur l'honore.
 *
 * La tentative est donc **réservée** d'abord, par une mise à jour
 * conditionnée à ce qu'on vient de lire : deux appelants simultanés
 * lisent le même `refundAttemptedAt`, un seul voit sa condition tenir,
 * l'autre repart sans rien envoyer. C'est l'arbitrage de la base, la
 * même mécanique que pour la tenue d'un créneau et la transition d'une
 * transaction.
 *
 * La condition porte aussi sur `refundRequestedAt` et `refundedAt` :
 * une demande déjà acceptée ne se renvoie pas, et une somme déjà rendue
 * encore moins.
 *
 * ── Ce qui n'envoie rien du tout ─────────────────────────────────────
 *
 * Un pack partiellement consommé (revue manuelle), un `providerTxId`
 * absent ou portant le préfixe de l'autre rail. Dans les trois cas
 * l'écart s'ouvre et aucune tentative n'est comptée : compter une
 * tentative qui n'a pas eu lieu ferait croire à une relance en cours.
 */
export type IssueDInitiation =
  | IssueDeDemande
  /** Une autre reprise tient la tentative, ou la demande est déjà acceptée. */
  | "deja_en_cours"
  /** Pack entamé : ce que vaut une analyse rendue n'est pas arithmétique. */
  | "revue_manuelle"
  /** Identifiant fournisseur absent ou étranger : rien n'est envoyé. */
  | "identifiant_inutilisable"
  /** Pas d'obligation, ou somme déjà rendue. */
  | "sans_objet";

export async function initierLeRemboursement(
  reference: string,
  rembourseur?: Rembourseur | null,
  maintenant = new Date(),
): Promise<{ issue: IssueDInitiation; detail?: string; consommees?: number }> {
  const transaction = await db.transaction.findUnique({ where: { reference } });
  if (!transaction) throw echec("introuvable");
  // Rien à envoyer : pas d'obligation, ou somme déjà rendue.
  if (!transaction.refundDueAt || transaction.refundedAt) return { issue: "sans_objet" };

  /*
    Des droits déjà retirés ne se réévaluent pas : un rejeu — relance
    après une panne, second clic — relirait une montée dont les vingt
    analyses viennent d'être retirées et la prendrait pour entamée. La
    question a été tranchée au premier passage ; on reprend l'envoi.
  */
  const dejaRetire = await db.analysisCredit.findFirst({
    where: { transactionId: transaction.id, reason: "REMBOURSEMENT" },
    select: { id: true },
  });

  if (transaction.applicationId && !dejaRetire) {
    const suite = await suiteDuQuotaDuPack(
      transaction.applicationId,
      transaction.id,
      transaction.packCode,
    );
    if (suite.suite === "REVUE_MANUELLE") {
      // On ne tranche pas ce que vaut une analyse déjà rendue : c'est une
      // question commerciale. L'écart porte la question à un humain, et
      // aucune demande ne part.
      await noterLEcart(transaction.id, suite.motif);
      return { issue: "revue_manuelle", consommees: suite.consommees };
    }
  }

  /*
    L'identifiant est vérifié avant tout appel. Absent, il n'y a rien à
    rembourser chez le fournisseur — aucune session n'a jamais été
    ouverte. Portant l'autre préfixe, la demande viserait un paiement
    étranger. Les deux appellent un humain, pas une relance.
  */
  const defaut = defautDIdentifiant(transaction.providerTxId, transaction.provider);
  if (defaut) {
    await noterLEcart(transaction.id, MOTIF_IDENTIFIANT[defaut]);
    return { issue: "identifiant_inutilisable", detail: defaut };
  }

  /*
    La réservation. `refundAttemptedAt` sert de jeton : la condition
    porte sur la valeur qu'on vient de lire, si bien qu'un second
    appelant concurrent ne peut pas l'obtenir. Le compteur s'incrémente
    dans la même écriture — une tentative réservée est une tentative
    comptée, même si l'appel qui suit échoue. C'est sa fonction.
  */
  const { count } = await db.transaction.updateMany({
    where: {
      id: transaction.id,
      refundedAt: null,
      refundRequestedAt: null,
      refundAttemptedAt: transaction.refundAttemptedAt,
    },
    data: { refundAttemptedAt: maintenant, refundAttempts: { increment: 1 } },
  });
  if (count !== 1) return { issue: "deja_en_cours" };

  /*
    Les droits partent une fois la tentative réservée, et une seule fois.

    Vu en exécutant au lot précédent : deux tentatives retiraient deux
    fois les mêmes droits, et le solde du dossier passait de trente à
    moins trente. La réservation ferme la course ; la garde ci-dessous
    ferme la répétition séquentielle, et l'index unique partiel de la
    migration ferme le reste — celui qui viendrait d'un appelant qu'on
    n'a pas écrit.
  */
  if (transaction.applicationId && !dejaRetire) {
    const applicationId = transaction.applicationId;
    /*
      Réévalué **sous le verrou du grand livre** (S.92), et le retrait
      écrit dans la même transaction. Entre la première lecture et
      celle-ci, une analyse a pu entamer l'octroi : sans le verrou, les
      vingt analyses d'une montée se retiraient alors qu'une avait servi.
      Si c'est le cas, la dette part en revue au lieu de partir chez le
      fournisseur.

      L'index unique partiel reste la garantie contre un second retrait —
      celui d'un appelant qu'on n'a pas écrit. `skipDuplicates` le laisse
      parler sans interrompre la transaction.
    */
    const suite = await sousVerrouDuGrandLivre(applicationId, async (tx) => {
      const retrait = await tx.analysisCredit.findFirst({
        where: { transactionId: transaction.id, reason: "REMBOURSEMENT" },
        select: { id: true },
      });
      if (retrait) return null;
      const lue = await suiteDuQuotaDuPack(
        applicationId,
        transaction.id,
        transaction.packCode,
        tx,
      );
      if (lue.suite === "RETRAIT_INTEGRAL" && lue.retire > 0) {
        await tx.analysisCredit.createMany({
          data: [
            {
              applicationId,
              delta: -lue.retire,
              reason: "REMBOURSEMENT",
              transactionId: transaction.id,
              grantId: lue.octroi,
              note: `Droits retirés à l'initiation du remboursement de ${reference}.`,
            },
          ],
          skipDuplicates: true,
        });
      }
      return lue;
    });
    if (suite?.suite === "REVUE_MANUELLE") {
      await noterLEcart(transaction.id, suite.motif);
      return { issue: "revue_manuelle", consommees: suite.consommees };
    }
  }

  const adaptateur =
    rembourseur === undefined ? leRembourseur(transaction.provider) : rembourseur;
  if (!adaptateur) {
    // Aucune clé pour ce rail : rien ne part, la tentative est comptée,
    // la dette reste. L'écart n'est pas ouvert — il n'y a rien à
    // trancher, il y a une variable à renseigner.
    return { issue: "non_configure", detail: "aucune clé pour ce fournisseur" };
  }

  const reponse = await adaptateur.demander({
    reference: transaction.reference,
    providerTxId: transaction.providerTxId!,
    montant: transaction.amount,
    devise: transaction.currency,
    cle: cleDIdempotence(transaction.reference),
  });

  const suite = suiteDeLaTentative(reponse.issue);

  if (reponse.issue === "acceptee") {
    /*
      Posé une seule fois, et conditionné : une demande déjà acceptée le
      reste, et un second accusé ne réécrit pas la date du premier. Rien
      d'autre n'est touché — surtout pas `status` ni `refundedAt`.
    */
    await db.transaction.updateMany({
      where: { id: transaction.id, refundRequestedAt: null },
      data: { refundRequestedAt: reponse.accepteLe },
    });
    return { issue: "acceptee", detail: reponse.providerRefundId };
  }

  // Le domaine et l'adaptateur doivent dire la même chose : seule
  // `acceptee` est acceptée, et on vient d'en sortir.
  if (suite.acceptee) throw new Error("issue acceptée hors de la branche d'acceptation");

  /*
    Ce qui appelle un humain s'écrit en back-office, avec le message du
    domaine et la forme de la réponse — jamais son corps, jamais un
    secret. Ce qui se reprend tout seul ne l'ouvre pas : un écart par
    coupure réseau noierait la file sous des lignes qui se résolvent en
    relançant.
  */
  if (suite.exigeUnHumain) {
    await noterLEcart(transaction.id, `${suite.message} (${reponse.detail})`);
  }
  return { issue: reponse.issue, detail: reponse.detail };
}

/**
 * Déclarer un remboursement FedaPay fait au tableau de bord — arbitrage S.91.
 *
 * FedaPay n'a pas d'API de remboursement : l'initiation sur ce rail rend
 * `procedure_manuelle` et ouvre un écart qui dit le geste à faire. Ce qui
 * suit enregistre le geste une fois fait.
 *
 * ── Ce que la déclaration écrit, et ce qu'elle n'écrit pas ───────────
 *
 * Elle pose `refundRequestedAt` et la référence du fournisseur : la dette
 * passe de « décidée » à « demandée ». Elle **n'écrit ni `status` ni
 * `refundedAt`** : un opérateur qui dit avoir cliqué « Rembourser » ne
 * prouve pas que l'argent est parti — FedaPay peut encore échouer à
 * verser. Seule sa notification signée `refunded` solde la dette (INV-7),
 * et d'ici là elle reste visible en B-04.
 *
 * ── Pas de double déclaration ────────────────────────────────────────
 *
 * - l'écriture est **conditionnée** à `refundRequestedAt: null` : deux
 *   clics simultanés, un seul passe ;
 * - la même référence redite sur la même transaction est un **rejeu** :
 *   rien ne change, la réponse le dit ;
 * - une autre référence sur une transaction déjà déclarée est un
 *   **conflit** : on ne réécrit pas le premier geste, qui est celui que
 *   FedaPay confirmera ;
 * - une référence déjà portée par une autre transaction est refusée par
 *   l'index unique : un remboursement du fournisseur ne solde pas deux
 *   dettes.
 *
 * L'écart ouvert par la procédure se referme avec la déclaration, sur
 * l'issue « en attente d'une nouvelle confirmation du fournisseur » —
 * l'écart se referme, la vigilance non. Un autre écart, rédigé par
 * quelqu'un d'autre, n'est pas touché.
 */
export type IssueDeDeclaration = "declaree" | "deja_declaree";

export async function declarerLeRemboursementManuel(
  reference: string,
  saisie: string,
  acteurId: string,
  maintenant = new Date(),
): Promise<{ issue: IssueDeDeclaration; referenceFournisseur: string }> {
  const lue = lireLaReferenceDeRemboursement(saisie);
  if (!lue.valide) {
    throw echec("champs_invalides", { champs: { referenceFournisseur: lue.message } });
  }

  const transaction = await db.transaction.findUnique({
    where: { reference },
    select: {
      id: true,
      provider: true,
      refundDueAt: true,
      refundedAt: true,
      refundAttemptedAt: true,
      refundRequestedAt: true,
      refundProviderRef: true,
    },
  });
  if (!transaction) throw echec("paiement_introuvable");

  const defaut = defautDeDeclaration(transaction);
  if (defaut) {
    throw echec("etat_incompatible", {
      corps: `Aucune déclaration possible : ${MOTIF_DE_REFUS_DE_DECLARATION[defaut]}.`,
    });
  }

  // Déjà déclarée : la même référence est un rejeu, une autre un conflit.
  if (transaction.refundRequestedAt !== null) {
    if (transaction.refundProviderRef === lue.reference) {
      return { issue: "deja_declaree", referenceFournisseur: lue.reference };
    }
    throw echec("etat_incompatible", {
      corps: transaction.refundProviderRef
        ? `Un remboursement est déjà déclaré sur ce paiement, sous la référence ${transaction.refundProviderRef}. Vérifie au tableau de bord FedaPay lequel est le bon : si c'est un second remboursement, il faut le faire annuler chez FedaPay, pas le déclarer.`
        : "Une demande de remboursement est déjà partie pour ce paiement. Attends la notification de FedaPay avant de déclarer quoi que ce soit.",
    });
  }

  let ecrites: number;
  try {
    ({ count: ecrites } = await db.transaction.updateMany({
      where: {
        id: transaction.id,
        refundedAt: null,
        refundRequestedAt: null,
        refundProviderRef: null,
      },
      data: { refundRequestedAt: maintenant, refundProviderRef: lue.reference },
    }));
  } catch (erreur) {
    if (!estUnDoublon(erreur)) throw erreur;
    throw echec("etat_incompatible", {
      corps: `La référence ${lue.reference} est déjà déclarée sur un autre paiement. Vérifie au tableau de bord FedaPay la transaction que ce remboursement concerne.`,
    });
  }

  if (ecrites !== 1) {
    // Un autre clic est passé entre la lecture et l'écriture : on relit
    // ce qu'il a écrit pour dire rejeu ou conflit, sans rien réécrire.
    const relue = await db.transaction.findUnique({
      where: { id: transaction.id },
      select: { refundProviderRef: true },
    });
    if (relue?.refundProviderRef === lue.reference) {
      return { issue: "deja_declaree", referenceFournisseur: lue.reference };
    }
    throw echec("etat_incompatible", {
      corps: "Ce paiement vient de changer d'état pendant ta saisie. Recharge la page et vérifie ce qui a été déclaré.",
    });
  }

  await db.transaction.updateMany({
    where: {
      id: transaction.id,
      discrepancyResolvedAt: null,
      discrepancy: { startsWith: A_REMBOURSER_A_LA_MAIN },
    },
    data: {
      discrepancyResolvedAt: maintenant,
      discrepancyOutcome: "ATTENTE_CONFIRMATION",
      discrepancyNote: `Remboursé au tableau de bord FedaPay, référence ${lue.reference}. La dette reste due jusqu'à la notification signée de FedaPay.`,
      discrepancyResolvedBy: acteurId,
    },
  });

  return { issue: "declaree", referenceFournisseur: lue.reference };
}

/**
 * Le premier écart est celui qui reste.
 *
 * Une transaction qui en porte déjà un a déjà posé une question à un
 * humain : l'écraser avec la suivante ferait perdre la première, qui est
 * en général la plus proche de la cause.
 */
async function noterLEcart(transactionId: string, motif: string): Promise<void> {
  await db.transaction.updateMany({
    where: { id: transactionId, discrepancy: null },
    data: { discrepancy: motif },
  });
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
type SuiteDuRetrait =
  | { suite: "RETRAIT_INTEGRAL"; retire: number; octroi: string | null }
  | { suite: "REVUE_MANUELLE"; motif: string; consommees?: number };

async function suiteDuQuotaDuPack(
  applicationId: string,
  transactionId: string,
  packCode: string,
  client: Prisma.TransactionClient | typeof db = db,
): Promise<SuiteDuRetrait> {
  /*
    Le remboursement d'un passage à Dossier — décision définitive S.92.

    Automatique seulement si les vingt analyses de la montée sont
    intactes, lues sur **leur octroi** par le rejeu FIFO du grand livre,
    et si la rédaction assistée n'a pas servi depuis la confirmation.
    Sinon, revue manuelle. La convention de S.88 — « consommées en
    dernier », lue sur le solde — est remplacée : elle faisait passer
    pour intactes des analyses que le candidat avait utilisées.
  */
  if (packCode === CODE_MONTEE_DOSSIER) {
    const [lignes, montee] = await Promise.all([
      lignesDuGrandLivre(applicationId, client),
      client.transaction.findUnique({
        where: { id: transactionId },
        select: { confirmedAt: true },
      }),
    ]);
    const octroi =
      repartir(lignes).octrois.find(
        (o) => o.transactionId === transactionId && o.reason === "ACHAT_PACK",
      ) ?? null;
    const depuis = montee?.confirmedAt ?? new Date(0);
    const [debitsDeRedaction, appels] = await Promise.all([
      client.analysisCredit.count({
        where: {
          applicationId,
          reason: "ANALYSE",
          note: { startsWith: NOTE_REDACTION_ASSISTEE },
          createdAt: { gte: depuis },
        },
      }),
      client.aiUsage.count({
        where: {
          applicationId,
          createdAt: { gte: depuis },
          OR: [
            { operation: { startsWith: "redaction:" } },
            { operation: { startsWith: "relecture:" } },
          ],
        },
      }),
    ]);
    const suite = suiteDuRemboursementDeLaMontee({
      octroi,
      redactionUtilisee: debitsDeRedaction + appels > 0,
    });
    return suite.suite === "RETRAIT_INTEGRAL"
      ? { ...suite, octroi: octroi?.id ?? null }
      : { suite: "REVUE_MANUELLE", motif: suite.motif, consommees: octroi?.consommees ?? 0 };
  }
  const [octrois, consommations, octroiDuPack] = await Promise.all([
    client.analysisCredit.aggregate({
      where: { applicationId, transactionId, delta: { gt: 0 } },
      _sum: { delta: true },
    }),
    client.analysisCredit.aggregate({
      where: { applicationId, reason: "ANALYSE" },
      _sum: { delta: true },
    }),
    client.analysisCredit.findFirst({
      where: { applicationId, transactionId, delta: { gt: 0 } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
  ]);
  const ouvertes = octrois._sum.delta ?? 0;
  const consommees = Math.abs(consommations._sum.delta ?? 0);
  const suite = suiteDuQuota(ouvertes, consommees);
  return suite.suite === "RETRAIT_INTEGRAL"
    ? { ...suite, octroi: octroiDuPack?.id ?? null }
    : {
        suite: "REVUE_MANUELLE",
        motif: `${MOTIF_REVUE_PARTIELLE} ${suite.consommees} analyse(s) consommée(s) sur ${suite.ouvertes}.`,
        consommees: suite.consommees,
      };
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

    /*
      Le passage à Dossier (S.88) ajoute **vingt** analyses, pas trente :
      les dix d'Essentiel restent au dossier, et le quota issu du pack
      passe ainsi à trente. L'octroi est un `ACHAT_PACK` rattaché à cette
      transaction, ce qui ouvre la rédaction assistée par la même lecture
      que pour un pack (`CODES_REDACTION_ASSISTEE`), et la retire de même
      au remboursement.

      Il ne passe pas par `appliquerLaCouverture` : la montée ne couvre pas
      de nouvelle destination, elle change la couverture d'un dossier déjà
      servi. Un rejeu ne crédite pas deux fois — `acheverLeCredit` vérifie
      d'abord qu'aucun octroi de cette transaction n'existe.
    */
    case "montee":
      await ouvrirDuQuota({
        applicationId: transaction.applicationId,
        analyses: ANALYSES_AJOUTEES,
        motif: "ACHAT_PACK",
        transactionId: transaction.id,
        note: `${LIBELLE_MONTEE} — ${ANALYSES_AJOUTEES} analyses ajoutées`,
      });
      return;

    case "pack": {
      const pack = getPack(achat.code);
      if (!pack) return;
      /*
        Le dossier peut déjà être prêt : rien n'interdit d'acheter un
        second pack une fois la checklist complète, et c'est même le cas
        le plus banal — le quota d'analyses s'épuise avant le dossier.
        `miseEnEtat` garde alors l'état et sa date ; écrire `ACTIF` seul
        faisait refuser la transaction entière par la base, donc perdre
        le crédit d'un pack payé.
      */
      const dossier = await db.application.findUnique({
        where: { id: transaction.applicationId },
        select: { status: true, readyAt: true, suspendedAt: true },
      });
      await db.application.update({
        where: { id: transaction.applicationId },
        data: miseEnEtat(
          dossier?.status === "BROUILLON" || dossier === null ? "ACTIF" : dossier.status,
          dossier ?? { readyAt: null, suspendedAt: null },
        ),
      });
      /*
        Les analyses s'ouvrent par **destination couverte**, et non en bloc
        sur le dossier visé : `Pack.destinations` était déclaré sur les trois
        packs et lu par personne, si bien qu'un Pro à 45 000 XOF — « Trois
        destinations comparées en parallèle » — servait un seul dossier.
        `appliquerLaCouverture` sert d'abord celui-là, puis les dossiers
        déjà ouverts que rien ne sert.
      */
      await appliquerLaCouverture(transaction.userId, {
        applicationId: transaction.applicationId,
        transactionId: transaction.id,
      });
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
    select: {
      reference: true,
      status: true,
      refundDueAt: true,
      refundedAt: true,
      packCode: true,
      // Une montée confirmée et non remboursée qui part de cet achat (S.92).
      montees: {
        where: { status: "CONFIRMEE", refundedAt: null },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!transaction) return { ouvert: false, raison: "transaction inconnue" };
  /*
    Un Essentiel qui a servi de base à une montée confirmée ne se
    rembourse pas seul (S.92) : il porte la moitié du prix de Dossier
    que le candidat a en main. Tant que la montée n'est pas remboursée,
    l'obligation ne s'ouvre pas, et la raison dit quoi faire.
  */
  if (transaction.packCode === PACK_DE_DEPART && transaction.montees.length > 0) {
    return { ouvert: false, raison: REFUS_ESSENTIEL_APRES_MONTEE };
  }
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
