import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { journaliser } from "@/server/acces/journal";
import { initierLeRemboursement, ouvrirUnRemboursement } from "@/server/acces/paiements";
import {
  ETATS_ANNULABLES,
  MOTIF_REMBOURSEMENT_ANNULATION,
  issueDeLAnnulation,
  refusDeLAnnulation,
  suiteDeLAnnulation,
  type IssueAnnulation,
  type RefusDAnnulation,
} from "@/domain/consultants/annulation";

/**
 * L'annulation d'un rendez-vous par le candidat — T-05, WF-12, RG-12.5.
 *
 * ── Le geste que trois surfaces promettaient ────────────────────────
 *
 * `conditions()` sous les créneaux, avant le paiement ; l'écran de
 * confirmation ; le courrier de confirmation. Tous les trois disaient
 * « **annulation ou report sans frais** jusqu'au […]. Passé ce délai, la
 * consultation est due. »
 *
 * `issueDeLAnnulation` n'avait que deux appelants : une lecture d'écran,
 * et `acheverLaSuppression`. Le seul moyen d'annuler une consultation
 * était donc de **supprimer son compte** — un candidat qui voulait
 * décaler une heure devait effacer son dossier.
 *
 * ── Le même traitement, à un rendez-vous près ───────────────────────
 *
 * Il n'y avait pas de règle à inventer : RG-12.5 la fixe, et
 * `acheverLaSuppression` l'applique déjà. Trois choses en découlent, dans
 * cet ordre :
 *
 * 1. **le créneau se libère d'abord**, indépendamment du traitement
 *    financier — un consultant qui attend quelqu'un qui ne viendra pas
 *    perd son heure, et rien ne justifie de retarder cela pour une
 *    question d'argent qui se règle ailleurs, et plus tard ;
 * 2. **l'accès du consultant se retire**, mais seulement s'il ne reste
 *    aucun autre rendez-vous avec lui : deux consultations chez la même
 *    personne ne se coupent pas l'une l'autre (RG-12.2) ;
 * 3. **le remboursement suit la limite stockée** — celle acceptée le jour
 *    de la réservation, jamais la grille d'aujourd'hui — et il est hors de
 *    la transaction de base : un fournisseur injoignable ne doit pas faire
 *    échouer une annulation que le candidat a demandée.
 *
 * ── Pourquoi la décision vit ici ────────────────────────────────────
 *
 * Deux raisons, et la première est mécanique : `acces/paiements` importe
 * déjà `acces/consultations` — c'est la confirmation signée qui fait
 * naître le `RESERVE`. Y faire remonter l'ouverture d'un remboursement
 * fermerait le cercle, et un cercle d'imports rend une fonction
 * `undefined` au chargement le jour où l'ordre change.
 *
 * La seconde est celle de `server/regles/edition`, `server/revue/decision`
 * et `server/regles/publication` : une décision enfermée dans sa route est
 * derrière `next/headers`, donc hors de portée de toute fumée. Celle-ci
 * libère un créneau et ouvre un remboursement — deux effets qu'on ne
 * vérifie qu'en les exécutant.
 *
 * ── Ce qui ne se journalise pas, et ce qui se journalise ────────────
 *
 * L'annulation, non : le journal d'audit porte les accès d'un opérateur
 * aux pièces d'un candidat et les décisions prises **sur** un compte, et
 * un candidat qui annule son propre rendez-vous n'est ni l'un ni l'autre.
 * Le remboursement, oui : c'est un mouvement d'argent, et il porte déjà
 * sa ligne quand la suppression de compte l'ouvre.
 */

export interface Annulation {
  reference: string;
  issue: IssueAnnulation;
  /** Le remboursement a été ouvert. Faux quand les frais restent dus. */
  remboursementOuvert: boolean;
  /** Ce que le candidat lit, une fois l'annulation faite. */
  mention: string;
}

export async function annulerLeRendezVous(
  reference: string,
  userId: string,
  maintenant = new Date(),
): Promise<Annulation> {
  // Le filtre de propriétaire est dans la requête : annuler le rendez-vous
  // de quelqu'un d'autre ne doit pas dépendre d'une comparaison qui suit.
  const rendezVous = await db.appointment.findFirst({
    where: { reference, application: { userId } },
  });
  if (!rendezVous) throw echec("introuvable");

  const refus = refusDeLAnnulation(
    { etat: rendezVous.status, debut: rendezVous.startsAt },
    maintenant,
  );
  if (refus !== null) throw echec("etat_incompatible", { corps: MOTIF_DU_REFUS[refus] });

  const issue = issueDeLAnnulation(rendezVous.freeUntil.toISOString(), maintenant);

  /*
    La condition sur l'état est dans la mise à jour : deux annulations
    concurrentes — un second clic, un onglet resté ouvert — ne peuvent pas
    ouvrir deux remboursements pour un seul encaissement.
  */
  const { count } = await db.appointment.updateMany({
    where: { id: rendezVous.id, status: { in: [...ETATS_ANNULABLES] } },
    data: { status: "ANNULE" },
  });
  if (count !== 1) throw echec("etat_incompatible", { corps: MOTIF_DU_REFUS.sans_objet });

  /*
    L'accès du consultant ne survit pas au dernier rendez-vous qui le
    justifiait (RG-12.2). Compté **après** l'annulation : celle-ci est déjà
    sortie de la liste, et compter avant l'aurait fait figurer parmi les
    raisons de garder l'accès ouvert.
  */
  const restants = await db.appointment.count({
    where: {
      applicationId: rendezVous.applicationId,
      consultantId: rendezVous.consultantId,
      startsAt: { gt: maintenant },
      status: { in: [...ETATS_ANNULABLES] },
    },
  });
  if (restants === 0) {
    // Révoqué, pas supprimé : la ligne prouve que l'accès a existé le jour
    // d'une consultation.
    await db.consultantAccess.updateMany({
      where: {
        applicationId: rendezVous.applicationId,
        consultantId: rendezVous.consultantId,
        revokedAt: null,
      },
      data: { revokedAt: maintenant },
    });
  }

  let remboursementOuvert = false;
  if (issue === "REMBOURSABLE" && rendezVous.transactionId) {
    const ouverture = await ouvrirUnRemboursement(
      rendezVous.transactionId,
      MOTIF_REMBOURSEMENT_ANNULATION,
      maintenant,
    );
    if (ouverture.ouvert) {
      remboursementOuvert = true;
      /*
        La demande part, elle ne verse rien : la dette reste visible en
        B-04 jusqu'à la notification signée du fournisseur (RG-05.1). Le
        rembourseur n'est pas passé — l'initiation le résout d'après le
        fournisseur de la transaction, et une consultation payée en euros
        ne se rembourse pas chez celui des francs CFA.
      */
      const envoi = await initierLeRemboursement(
        ouverture.reference,
        undefined,
        maintenant,
      ).catch(() => null);

      await journaliser({
        acteurId: `candidat:${userId}`,
        action: "paiement.remboursement",
        cible: `transaction:${rendezVous.transactionId}`,
        motif: MOTIF_REMBOURSEMENT_ANNULATION,
        details: {
          rendezVous: rendezVous.id,
          creneau: rendezVous.startsAt.toISOString(),
          envoi: envoi?.issue ?? "indisponible",
        },
      }).catch(() => undefined);
    }
  }

  return {
    reference: rendezVous.reference,
    issue,
    remboursementOuvert,
    mention: suiteDeLAnnulation(issue),
  };
}

/**
 * Les deux refus, et ils disent le geste qui reste — doctrine d'erreur.
 * « Annulation impossible » laisserait chercher ce qu'on a mal fait.
 */
const MOTIF_DU_REFUS: Record<RefusDAnnulation, string> = {
  sans_objet:
    "Ce rendez-vous n'est plus à annuler : il l'est déjà, ou son paiement n'a jamais été confirmé. Tes rendez-vous à venir sont dans tes autorisations.",
  passe:
    "Ce créneau est passé, il ne s'annule plus. Si la consultation n'a pas eu lieu, écris-nous depuis tes reçus : la somme s'y retrouve.",
};
