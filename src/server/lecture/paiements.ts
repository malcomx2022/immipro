import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { versFiche } from "@/server/acces/regles";
import { etatDuRecu, libelleDeLAchat, moyenDe, type EtatRecu } from "@/domain/paiement/recu";
import { deviseParDefaut, type Devise } from "@/domain/payments/pricing";
import { masquerNumero } from "@/domain/paiement/echec";

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
  achat: string;
  /** Le code de l'achat, pour relancer le même sur $-05. */
  achatCode: string;
  montant: number;
  devise: string;
  dossier: { id: string; pays: string; intitule: string } | null;
  /** Adresse du compte, pour que « Renvoyer » dise où il renvoie. */
  adresse: string;
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
    achat: libelleDeLAchat(transaction.packCode),
    achatCode: transaction.packCode,
    montant: transaction.amount,
    devise: transaction.currency,
    dossier:
      transaction.application && fiche
        ? { id: transaction.application.id, pays: fiche.pays, intitule: fiche.intitule }
        : null,
    adresse: transaction.user.email,
  };
}

export interface Tunnel {
  dossier: { id: string; pays: string; intitule: string };
  /** Suggérée par le pays du compte, et basculable à la main. */
  devise: Devise;
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
    db.transaction.findFirst({
      where: {
        applicationId: dossier.id,
        status: "CONFIRMEE",
        packCode: { notIn: ["recharge", "consultation"] },
      },
      select: { id: true },
    }),
  ]);

  const fiche = dossier.visaRule ? versFiche(dossier.visaRule) : null;

  return {
    dossier: {
      id: dossier.id,
      pays: fiche?.pays ?? dossier.visaRule?.countryCode ?? "—",
      intitule: fiche?.intitule ?? "—",
    },
    devise: deviseParDefaut(compte?.countryCode),
    paysConnu: Boolean(compte?.countryCode),
    telephone: compte?.phone ? masquerNumero(compte.phone) : null,
    dejaOuvert: packPaye !== null,
  };
}

export interface PaiementEnCours {
  reference: string;
  etat: EtatRecu;
  /** Le statut tel qu'il est en base : c'est lui qui nomme le motif d'échec. */
  statut: string;
  montant: number;
  devise: string;
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
    include: { user: { select: { phone: true } } },
  });
  if (!transaction) throw echec("paiement_introuvable");

  return {
    reference: transaction.reference,
    etat: etatDuRecu(transaction.status),
    statut: transaction.status,
    montant: transaction.amount,
    devise: transaction.currency,
    moyen: moyenDe(transaction.provider),
    achat: libelleDeLAchat(transaction.packCode),
    achatCode: transaction.packCode,
    dossierId: transaction.applicationId,
    telephone: transaction.user.phone ? masquerNumero(transaction.user.phone) : null,
  };
}
