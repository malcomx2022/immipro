import { db } from "@/lib/db";
import { suiteDeLEnvoi, type Envoi } from "@/domain/courrier/transport";
import {
  BAIL_DE_TENTATIVE_MS,
  type EtatDuCourrier,
} from "@/domain/dossiers/preferences-rappels";

/**
 * Le courrier d'une notification déjà réservée — S.87, partagé depuis S.89.
 *
 * Les rappels d'échéance l'ont introduit : la notification est écrite
 * d'abord, avec sa clé unique et un courrier `EN_ATTENTE`, puis le
 * courrier part. Les relances après dépôt (S.89) suivent le même ordre,
 * et le même geste : il vit donc ici plutôt qu'écrit deux fois.
 *
 * La tentative se **prend** avant l'envoi : `emailAttempts` ne s'incrémente
 * que s'il vaut encore ce qu'on a lu, et qu'aucune tentative n'est en vol
 * (`BAIL_DE_TENTATIVE_MS`). Deux passes qui reprennent le même courrier ne
 * l'envoient pas deux fois. Rend `null` quand une autre passe l'a pris.
 *
 * Ce que devient un courrier qui n'est pas parti — repris, ou abandonné —
 * est la décision de l'appelant (`decider`) : un rappel d'échéance ne se
 * reprend que le jour même, une relance après dépôt quelques fois.
 */
export async function tenterUnCourrierReserve(
  notification: { id: string; emailAttempts: number },
  envoyer: () => Promise<Envoi>,
  decider: (suite: { parti: boolean; renvoyable: boolean }, tentative: number) => EtatDuCourrier,
  maintenant: Date,
): Promise<EtatDuCourrier | null> {
  const tentative = notification.emailAttempts + 1;
  const prise = await db.notification.updateMany({
    where: {
      id: notification.id,
      emailStatus: "EN_ATTENTE",
      emailAttempts: notification.emailAttempts,
      // Une tentative en vol n'est pas une tentative à reprendre.
      OR: [
        { emailAttemptAt: null },
        { emailAttemptAt: { lt: new Date(maintenant.getTime() - BAIL_DE_TENTATIVE_MS) } },
      ],
    },
    data: { emailAttempts: tentative, emailAttemptAt: maintenant },
  });
  if (prise.count === 0) return null;

  const envoi = await envoyer().catch(() => null);
  /*
    La suite se lit dans le domaine, qui arbitre les cinq issues d'un
    envoi. Une exception — réseau coupé en plein appel — vaut coupure :
    on ne sait pas, on reprendra.
  */
  const suite = envoi ? suiteDeLEnvoi(envoi.issue) : { parti: false, renvoyable: true };
  const etat = decider(suite, tentative);

  await db.notification.update({
    where: { id: notification.id },
    data: {
      emailStatus: etat,
      ...(etat === "ENVOYE" ? { emailSentAt: maintenant } : {}),
    },
  });
  return etat;
}
