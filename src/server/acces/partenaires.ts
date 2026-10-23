import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { ETAT_APRES, commissionDue } from "@/domain/partenaires/affiliation";
import { enregistrerLAutorisation } from "@/server/acces/consentements";

/**
 * Suites données à une proposition de partenaire — T-03, WF-13.
 *
 * Les trois issues de l'écran ne se valent pas, et les confondre trahirait
 * la troisième :
 *
 * - **voir les créneaux** trace la redirection, et c'est elle qui ouvre
 *   droit à commission — au résultat, jamais à la proposition ;
 * - **continuer seul** clôt la proposition pour ce dossier ;
 * - **ne plus me proposer** est un refus définitif, et il ne vaut que s'il
 *   survit au rechargement de la page. Il retire donc l'autorisation dans
 *   le profil — l'interrupteur que l'écran lui-même désigne comme l'endroit
 *   où revenir sur ce choix. Une seule vérité, deux entrées.
 */

export type Suite = "CRENEAUX" | "CONTINUER_SEUL" | "NE_PLUS_PROPOSER";

export async function enregistrerLaSuite(
  referralId: string,
  userId: string,
  suite: Suite,
  /** Le dossier de l'adresse appelée : la proposition doit lui appartenir. */
  applicationId: string,
  maintenant = new Date(),
): Promise<{ etat: string; url?: string }> {
  // La propriété se vérifie dans la requête, pas après lecture : un
  // identifiant deviné ne doit pas rendre la ligne de quelqu'un d'autre,
  // ni celle d'un autre dossier sous l'adresse de celui-ci.
  const ligne = await db.partnerReferral.findFirst({
    where: { id: referralId, applicationId, application: { userId } },
    include: { partner: { select: { url: true } } },
  });
  if (!ligne) throw echec("introuvable");

  const etat = ETAT_APRES[suite];
  /*
    S.189 — l'écriture est conditionnelle. Elle lisait `PROPOSEE` puis
    écrivait sans condition : deux suites simultanées passaient toutes deux
    la lecture, la dernière écrasait la première, et chaque réponse
    annonçait sa propre issue — « redirigée » à l'un, « sans suite » en
    base. Reproduit sur base jetable : dix-huit réponses contredites sur dix
    courses. Seule la base sait qui est arrivé le premier.
  */
  const prise =
    ligne.status === "PROPOSEE"
      ? await db.partnerReferral.updateMany({
          where: { id: referralId, status: "PROPOSEE" },
          data: {
            status: etat,
            ...(etat === "REDIRIGEE" ? { redirectedAt: maintenant } : {}),
          },
        })
      : { count: 0 };

  if (prise.count === 0) {
    // Rejouée — double clic, reprise réseau — ou devancée : la première
    // décision est celle qui a été prise, et la réponse la dit.
    const retenue = await db.partnerReferral.findUniqueOrThrow({
      where: { id: referralId },
      select: { status: true },
    });
    return retenue.status === "REDIRIGEE"
      ? { etat: retenue.status, url: ligne.partner.url }
      : { etat: retenue.status };
  }

  if (suite === "NE_PLUS_PROPOSER") {
    await enregistrerLAutorisation(userId, "partenaires", false);
  }

  return etat === "REDIRIGEE" ? { etat, url: ligne.partner.url } : { etat };
}

/**
 * Aboutissement déclaré par le partenaire — WF-13, « commission au
 * résultat ».
 *
 * Le montant est celui que le partenaire a facturé ; la commission s'en
 * déduit au taux recopié sur la proposition, et non au taux courant. Le taux
 * annoncé au candidat le jour de la proposition est celui qui s'applique,
 * même si la grille a changé depuis.
 *
 * Rien dans le produit n'appelle encore cette fonction : aucun partenaire
 * n'est signé, et le rapprochement se fera par un webhook ou un relevé.
 * Elle est écrite ici parce que c'est la règle qui est difficile, pas le
 * branchement — et qu'une commission calculée au dernier moment, dans le
 * code d'un connecteur, ne se relit pas.
 */
export async function enregistrerLAboutissement(
  referralId: string,
  montant: number,
  devise: string,
  maintenant = new Date(),
): Promise<{ commission: number }> {
  const ligne = await db.partnerReferral.findUnique({ where: { id: referralId } });
  if (!ligne) throw echec("introuvable");
  if (ligne.status !== "REDIRIGEE") throw echec("etat_incompatible");

  const commission = commissionDue(montant, ligne.commissionBps);
  // Conditionnelle, comme la suite : deux déclarations simultanées
  // n'écrivent qu'une commission, la seconde est refusée.
  const prise = await db.partnerReferral.updateMany({
    where: { id: referralId, status: "REDIRIGEE" },
    data: {
      status: "ABOUTIE",
      settledAt: maintenant,
      commissionAmount: commission,
      commissionCurrency: devise,
    },
  });
  if (prise.count === 0) throw echec("etat_incompatible");
  return { commission };
}
