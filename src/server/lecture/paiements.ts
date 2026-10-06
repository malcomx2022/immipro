import { db } from "@/lib/db";
import { deviseProposee, devisesOuvertes } from "@/domain/payments/rail";
import { fournisseursActifs } from "@/server/paiement/secrets";
import { echec } from "@/server/http/echecs";
import { versFiche } from "@/server/acces/regles";
import { emetteurDuRecu, etatDuRecu, libelleDeLAchat, moyenDe, type EtatRecu } from "@/domain/paiement/recu";
import { valeursDesVariables } from "@/server/juridique/lecture";
import { deviseParDefaut, estDevise, getPack, type Devise } from "@/domain/payments/pricing";
import { destinationsServies } from "@/server/acces/couverture";
import { masquerNumero, type CauseRefus } from "@/domain/paiement/echec";
import { CODES_HORS_PACK, achatDepuisLeCode } from "@/domain/payments/achat";
import { sommeARendre } from "@/domain/paiement/remboursement";
import { facteurMineur, versMineur } from "@/domain/facturation/montants";

/**
 * Lecture d'un reçu — $-04 et $-06.
 *
 * Une assemblée, deux entrées : la page serveur du reçu et la route qui le
 * renvoie par email lisent ici, et l'écran de confirmation aussi. Les trois
 * doivent dire le même montant à la même référence — un reçu imprimé qui
 * diffère du reçu envoyé est un litige.
 *
 * Rien n'est inventé quand la base ne sait pas. Le numéro du portefeuille
 * qui a payé n'est pas conservé (minimisation) : le reçu nomme donc le
 * moyen, pas le téléphone. La transaction de l'opérateur n'arrive qu'avec
 * la notification signée, et manque tant qu'elle n'est pas venue.
 */

export interface Recu {
  reference: string;
  etat: EtatRecu;
  /** Confirmation si elle a eu lieu, ouverture sinon. Jamais nul. */
  le: string;
  moyen: string;
  /** Référence chez l'opérateur, absente tant que le webhook n'est pas passé. */
  transactionOperateur: string | null;
  /** Quand la somme est repartie, nul tant qu'elle ne l'est pas (M.B). */
  rembourseLe: string | null;
  /**
   * La somme repartie, dans l'unité de `montant` — RG-15.2. Nulle tant
   * que rien n'est reparti ; inférieure à `montant` pour un pack entamé,
   * remboursé au prorata des analyses restantes.
   */
  montantRembourse: number | null;
  achat: string;
  /** Le code de l'achat, pour relancer le même sur $-05. */
  achatCode: string;
  montant: number;
  devise: string;
  dossier: { id: string; pays: string; intitule: string } | null;
  /** Adresse du compte, pour que « Renvoyer » dise où il renvoie. */
  adresse: string;
  /**
   * Les lignes d'identité de l'émetteur, tirées des variables des textes
   * juridiques ; `null` tant qu'elles ne sont pas toutes saisies.
   */
  emetteur: readonly string[] | null;
  /**
   * La facture de la vente et, s'il y a lieu, son avoir — M.C. Vide tant
   * que la notification signée n'a pas confirmé le paiement.
   */
  pieces: readonly { numero: string; genre: "FACTURE" | "AVOIR" }[];
}

/**
 * Le reçu d'une référence, pour son propriétaire et personne d'autre.
 *
 * Le filtre sur `userId` est dans la requête et non dans une comparaison
 * qui suit : une référence est courte et se devine, et un reçu porte un
 * montant, une date et un dossier.
 */
export async function recuDuPaiement(reference: string, userId: string): Promise<Recu> {
  const transaction = await db.transaction.findFirst({
    where: { reference, userId },
    include: {
      user: { select: { email: true } },
      application: { include: { visaRule: true } },
      invoices: { orderBy: { issuedAt: "asc" }, select: { number: true, kind: true } },
    },
  });
  if (!transaction) throw echec("paiement_introuvable");

  const fiche = transaction.application?.visaRule
    ? versFiche(transaction.application.visaRule)
    : null;

  return {
    reference: transaction.reference,
    etat: etatDuRecu(transaction.status),
    le: (transaction.confirmedAt ?? transaction.createdAt).toISOString(),
    moyen: moyenDe(transaction.provider),
    transactionOperateur: transaction.providerTxId,
    rembourseLe: transaction.refundedAt?.toISOString() ?? null,
    montantRembourse: transaction.refundedAt
      ? sommeARendre(
          transaction.refundAmount,
          versMineur(transaction.amount, transaction.currency),
        ) / facteurMineur(transaction.currency)
      : null,
    achat: libelleDeLAchat(transaction.packCode),
    achatCode: transaction.packCode,
    montant: transaction.amount,
    devise: transaction.currency,
    dossier:
      transaction.application && fiche
        ? { id: transaction.application.id, pays: fiche.pays, intitule: fiche.intitule }
        : null,
    adresse: transaction.user.email,
    emetteur: emetteurDuRecu(await valeursDesVariables()),
    pieces: transaction.invoices.map((f) => ({ numero: f.number, genre: f.kind })),
  };
}

/**
 * La consultation qu'un paiement paie — $-03 et $-04, arbitrage du
 * 22/09/2026.
 *
 * Lecture **séparée**, et non un champ de plus sur `Recu`. Le reçu est un
 * document comptable : il nomme le moyen de paiement et jamais le
 * portefeuille, par minimisation. Y ajouter le nom d'un consultant et un
 * horaire ferait entrer dans une pièce conservée à des fins comptables
 * des données qui n'ont rien à y faire — et les deux écrans du tunnel qui
 * en ont besoin peuvent les demander eux-mêmes.
 *
 * Rend `null` quand le paiement n'est pas une consultation, et aussi
 * quand il en est une sans rendez-vous : ce second cas ne devrait plus se
 * produire depuis que $-02 refuse d'ouvrir une consultation, mais le
 * supposer ferait planter l'écran d'attente d'un paiement déjà encaissé.
 */
export interface ConsultationPayee {
  /** La référence du rendez-vous, distincte de celle du paiement. */
  reference: string;
  debut: string;
  dureeMinutes: number;
  consultant: string;
  /**
   * Jusqu'à quand le créneau est tenu. Nul quand le rendez-vous est déjà
   * confirmé : plus rien n'est tenu, tout est réservé.
   */
  tenuJusqua: string | null;
  confirme: boolean;
}

export async function consultationDuPaiement(
  reference: string,
  userId: string,
): Promise<ConsultationPayee | null> {
  /*
    Le filtre sur `userId` est dans la requête, comme partout ici : une
    référence de paiement est courte et se devine, et ce qu'on rendrait
    nomme un consultant et un horaire.
  */
  const transaction = await db.transaction.findFirst({
    where: { reference, userId },
    select: { id: true, packCode: true },
  });
  if (!transaction) return null;
  const achat = achatDepuisLeCode(transaction.packCode);
  if (achat?.type !== "consultation") return null;

  const rendezVous = await db.appointment.findFirst({
    where: { transactionId: transaction.id },
    include: { consultant: { select: { name: true } } },
  });
  if (!rendezVous) return null;

  return {
    reference: rendezVous.reference,
    debut: rendezVous.startsAt.toISOString(),
    dureeMinutes: rendezVous.durationMin,
    consultant: rendezVous.consultant.name,
    tenuJusqua: rendezVous.heldUntil?.toISOString() ?? null,
    confirme: rendezVous.status === "RESERVE",
  };
}

export interface Tunnel {
  dossier: { id: string; pays: string; intitule: string };
  /**
   * Suggérée par le pays du compte, et basculable à la main — parmi les
   * devises dont le rail est ouvert (`PAIEMENT_FOURNISSEURS`).
   */
  devise: Devise;
  /** Les devises qu'on peut régler ici. Une seule pendant le pilote FedaPay. */
  devisesOuvertes: Devise[];
  /** `false` quand le compte n'a pas de pays : la suggestion se dit alors autrement. */
  paysConnu: boolean;
  /** Numéro masqué du compte, ou `null` s'il n'en a pas renseigné. */
  telephone: string | null;
  /** Un pack a déjà été payé pour ce dossier : $-01 n'en revend pas un second. */
  dejaOuvert: boolean;
}

/**
 * Ce que le tunnel de paiement doit savoir avant de débiter — $-01 et $-02.
 *
 * Le dossier est lu d'abord : c'est lui qui donne le droit d'être ici, et
 * son intitulé est ce que le récapitulatif doit montrer avant le montant.
 * Sans dossier, il n'y a rien à ouvrir — l'écran du pack affichait « Pays-Bas
 * — séjour études » pour tout le monde.
 *
 * `dejaOuvert` est lu depuis le paiement, pas depuis le statut du dossier :
 * un dossier peut être `ACTIF` sans transaction (une ouverture de quota par
 * le back-office), et c'est bien la transaction confirmée qui dit que le
 * pack est payé.
 */
export async function tunnelDuPaiement(dossierId: string, userId: string): Promise<Tunnel> {
  const dossier = await db.application.findFirst({
    where: { id: dossierId, userId },
    include: { visaRule: true },
  });
  if (!dossier) throw echec("introuvable");

  const [compte, packPaye] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { countryCode: true, phone: true } }),
    /*
      Un pack, et la question se pose au domaine plutôt qu'en écrivant la
      liste complémentaire à la main. `notIn: ["recharge", "consultation"]`
      disait « tout le reste est un pack » : une quatrième catégorie
      d'achat y serait tombée sans que rien ne s'en aperçoive, alors que
      `domain/payments/achat` existe précisément pour qu'elle ne se
      compile pas tant qu'on n'a pas dit ce qu'elle est.
    */
    db.transaction.findFirst({
      where: {
        applicationId: dossier.id,
        status: "CONFIRMEE",
        packCode: { notIn: [...CODES_HORS_PACK] },
      },
      select: { id: true },
    }),
  ]);

  const fiche = dossier.visaRule ? versFiche(dossier.visaRule) : null;
  const ouvertes = devisesOuvertes(fournisseursActifs());

  return {
    dossier: {
      id: dossier.id,
      pays: fiche?.pays ?? dossier.visaRule?.countryCode ?? "—",
      intitule: fiche?.intitule ?? "—",
    },
    devise: deviseProposee(deviseParDefaut(compte?.countryCode), ouvertes),
    devisesOuvertes: ouvertes,
    paysConnu: Boolean(compte?.countryCode),
    telephone: compte?.phone ? masquerNumero(compte.phone) : null,
    dejaOuvert: packPaye !== null,
  };
}

export interface PaiementEnCours {
  reference: string;
  etat: EtatRecu;
  /** Le statut tel qu'il est en base : il nomme le motif à défaut de cause. */
  statut: string;
  /** Pourquoi l'émetteur a refusé, quand il l'a dit (N.B). */
  cause: CauseRefus | null;
  montant: number;
  devise: Devise;
  moyen: string;
  achat: string;
  /** Pour relancer le même achat après un échec. */
  achatCode: string;
  dossierId: string | null;
  /** Numéro masqué du compte, ou `null` : les deux écrans s'en passent. */
  telephone: string | null;
}

/**
 * Le paiement tel que le tunnel le montre — $-03 et $-05.
 *
 * Volontairement distinct de `recuDuPaiement`, qui sert un document
 * comptable. Le reçu nomme le moyen et jamais le téléphone ; le tunnel, lui,
 * dit « notification envoyée au 97 •• •• 42 » et « vérifie que c'est bien
 * ton numéro actif », parce que c'est l'appareil qu'il faut aller regarder.
 * Une seule lecture pour les deux aurait fait apparaître le numéro sur le
 * reçu — ce qu'aucun des deux écrans n'aurait signalé.
 */
export async function paiementDuTunnel(
  reference: string,
  userId: string,
): Promise<PaiementEnCours> {
  const transaction = await db.transaction.findFirst({
    where: { reference, userId },
    include: { user: { select: { phone: true, countryCode: true } } },
  });
  if (!transaction) throw echec("paiement_introuvable");

  return {
    reference: transaction.reference,
    etat: etatDuRecu(transaction.status),
    statut: transaction.status,
    cause: transaction.failureCause,
    montant: transaction.amount,
    // La colonne est un `Char(3)` ; le seul écrivain est `creerLaTransaction`,
    // qui y met une devise du domaine. Le repli ne devrait donc jamais
    // servir — mais il vaut mieux qu'un `as` : l'écran propose de changer
    // de grille, et se tromper de grille sur un échec de paiement est
    // précisément ce que N.A ferme.
    devise: estDevise(transaction.currency)
      ? transaction.currency
      : deviseParDefaut(transaction.user.countryCode),
    moyen: moyenDe(transaction.provider),
    achat: libelleDeLAchat(transaction.packCode),
    achatCode: transaction.packCode,
    dossierId: transaction.applicationId,
    telephone: transaction.user.phone ? masquerNumero(transaction.user.phone) : null,
  };
}

/**
 * La couverture qu'un pack a payée et que le candidat n'a pas prise —
 * $-04.
 *
 * Lecture **séparée**, comme celle de la consultation et pour la même
 * raison : le reçu est une pièce comptable, et le nombre de destinations
 * restant à ouvrir n'a rien à y faire. Un écran qui en a besoin le
 * demande.
 *
 * Les destinations servies viennent de `destinationsServies`, la
 * dérivation qui décide aussi de ce qui s'ouvre. Les recalculer ici
 * ferait deux mesures de la même chose, dont l'une annonce et l'autre
 * sert : elles se contrediraient un jour, et le candidat verrait la
 * contradiction avant nous.
 *
 * Rend `null` quand l'achat n'est pas un pack de la grille, quand la
 * transaction n'est pas confirmée — il n'y a rien de payé à annoncer —,
 * ou quand elle n'est pas celle de ce candidat.
 */
export async function couvertureDuPaiement(
  reference: string,
  userId: string,
): Promise<{ destinations: number; servies: number } | null> {
  const transaction = await db.transaction.findFirst({
    where: { reference, userId, status: "CONFIRMEE" },
    select: { id: true, packCode: true },
  });
  if (!transaction) return null;

  const pack = getPack(transaction.packCode);
  if (!pack) return null;

  const servies = await destinationsServies(transaction.id);
  return { destinations: pack.destinations, servies: servies.length };
}
