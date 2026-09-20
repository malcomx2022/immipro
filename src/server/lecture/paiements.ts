import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { versFiche } from "@/server/acces/regles";
import { etatDuRecu, libelleDeLAchat, moyenDe, type EtatRecu } from "@/domain/paiement/recu";

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
    montant: transaction.amount,
    devise: transaction.currency,
    dossier:
      transaction.application && fiche
        ? { id: transaction.application.id, pays: fiche.pays, intitule: fiche.intitule }
        : null,
    adresse: transaction.user.email,
  };
}
