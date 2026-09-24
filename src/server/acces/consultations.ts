import type { Transaction } from "@prisma/client";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { echeanceDeTenue, tenueEchue } from "@/domain/consultants/tenue";
import { ACCORD_DUREE_JOURS } from "@/domain/consultants/access";
import { ETATS_VIVANTS } from "@/domain/consultants/annulation";

/**
 * La tenue d'un créneau, et sa confirmation — T-05, WF-12, RG-12.2.
 *
 * ── Trois écritures, trois moments ──────────────────────────────────
 *
 * Elles se faisaient toutes les trois d'un coup, avant tout paiement :
 * le rendez-vous, l'accord de partage et l'accès au dossier. Un
 * consultant lisait donc le dossier d'un candidat qui n'avait rien
 * réglé, et l'écran annonçait « Rendez-vous confirmé » deux paragraphes
 * avant d'annoncer que la consultation était due.
 *
 * Elles sont maintenant échelonnées :
 *
 * 1. **la tenue** — le créneau est gardé, avec une échéance, et l'accord
 *    de partage est daté. Rien n'est promis, aucun accès n'est ouvert ;
 * 2. **le paiement** — par le tunnel ordinaire, page hébergée comprise ;
 * 3. **la confirmation** — et elle seule fait naître le `RESERVE` et
 *    l'accès consultant. Sa source unique est la notification signée
 *    (RG-05.1, INV-7) : ni le retour du navigateur, ni une relève de
 *    statut, ni un geste d'opérateur.
 *
 * La base porte la règle plutôt que la bonne volonté des appelants :
 * `appointment_reserve_exige_un_paiement` refuse un rendez-vous confirmé
 * qui ne cite pas la transaction qui l'a payé.
 */

export interface Tenue {
  reference: string;
  debut: Date;
  /** Nulle quand le rendez-vous est déjà confirmé : plus rien n'est tenu. */
  tenuJusqua: Date | null;
  /** Vrai quand la tenue existait déjà : un second clic ne double rien. */
  deja: boolean;
  /**
   * Le rendez-vous est déjà payé et confirmé.
   *
   * Un candidat qui revient sur son propre rendez-vous confirmé doit le
   * **voir**, pas lire « ce créneau vient d'être pris ». Rien n'est
   * retenu et aucun second paiement n'est ouvert.
   */
  confirme: boolean;
}

/**
 * Tient le créneau, ou reprend celui qu'on tenait déjà.
 *
 * **La concurrence est arbitrée par la base.** `@@unique([consultantId,
 * startsAt])` fait qu'une seule insertion passe : la seconde bute, et son
 * candidat lit que le créneau vient d'être pris. Ce n'est pas une lecture
 * préalable suivie d'une écriture — entre les deux, l'autre serait passé.
 *
 * **Une tenue échue se reprend**, par une mise à jour conditionnée à son
 * échéance : là encore, deux candidats qui la reprennent en même temps ne
 * peuvent pas gagner tous les deux.
 */
export async function tenirLeCreneau(options: {
  applicationId: string;
  consultantId: string;
  reference: string;
  debut: Date;
  dureeMinutes: number;
  limiteAnnulation: Date;
  maintenant?: Date;
}): Promise<Tenue> {
  const maintenant = options.maintenant ?? new Date();
  const jusqua = echeanceDeTenue(maintenant);

  /*
    Le rendez-vous **vivant** de ce créneau, s'il y en a un. Pas « la ligne
    de ce créneau » : une annulation garde sa ligne — c'est elle que la
    ligne de remboursement cite — et elle n'occupe plus rien. L'unicité le
    dit maintenant aussi (`appointment_creneau_vivant`), et les deux
    lectures ne peuvent plus se contredire.
  */
  const existant = await db.appointment.findFirst({
    where: {
      consultantId: options.consultantId,
      startsAt: options.debut,
      status: { in: [...ETATS_VIVANTS] },
    },
  });

  if (existant) {
    // Son propre rendez-vous, déjà payé : il le revoit, sans rien rouvrir.
    if (existant.applicationId === options.applicationId && existant.status === "RESERVE") {
      return {
        reference: existant.reference,
        debut: existant.startsAt,
        tenuJusqua: null,
        deja: true,
        confirme: true,
      };
    }

    // Le même candidat revient sur sa propre tenue : on la prolonge.
    if (existant.applicationId === options.applicationId && existant.status === "TENU") {
      const { count } = await db.appointment.updateMany({
        where: { id: existant.id, status: "TENU" },
        data: { heldUntil: jusqua, consentAt: existant.consentAt ?? maintenant },
      });
      if (count === 1) {
        return {
          reference: existant.reference,
          debut: existant.startsAt,
          tenuJusqua: jusqua,
          deja: true,
          confirme: false,
        };
      }
    }

    /*
      Le créneau appartient à quelqu'un d'autre, ou il est déjà confirmé.
      Une tenue échue, en revanche, ne tient plus rien : on la reprend,
      et la condition sur l'échéance fait que deux repreneurs simultanés
      ne peuvent pas gagner tous les deux.
    */
    const reprenable = existant.status === "TENU" && tenueEchue(existant.heldUntil, maintenant);
    if (!reprenable) throw echec("creneau_indisponible");

    const { count } = await db.appointment.updateMany({
      where: { id: existant.id, status: "TENU", heldUntil: { lt: maintenant } },
      data: {
        applicationId: options.applicationId,
        reference: options.reference,
        heldUntil: jusqua,
        consentAt: maintenant,
        freeUntil: options.limiteAnnulation,
        durationMin: options.dureeMinutes,
        // La tenue reprise repart sans paiement : celui de l'ancien
        // occupant, s'il en avait un, ne paie pas celui-ci.
        transactionId: null,
      },
    });
    if (count !== 1) throw echec("creneau_indisponible");
    return {
      reference: options.reference,
      debut: options.debut,
      tenuJusqua: jusqua,
      deja: false,
      confirme: false,
    };
  }

  try {
    const cree = await db.appointment.create({
      data: {
        reference: options.reference,
        applicationId: options.applicationId,
        consultantId: options.consultantId,
        startsAt: options.debut,
        durationMin: options.dureeMinutes,
        freeUntil: options.limiteAnnulation,
        status: "TENU",
        heldUntil: jusqua,
        // L'accord se prépare avant le paiement, et n'ouvre rien.
        consentAt: maintenant,
      },
    });
    return {
      reference: cree.reference,
      debut: cree.startsAt,
      tenuJusqua: jusqua,
      deja: false,
      confirme: false,
    };
  } catch {
    // L'unicité a parlé : quelqu'un a pris ce créneau entre notre lecture
    // et notre écriture. C'est exactement la course qu'elle existe pour
    // arbitrer, et le perdant l'apprend au lieu de croire avoir réservé.
    throw echec("creneau_indisponible");
  }
}

/** Rattache le paiement à la tenue, sans jamais écraser un autre. */
export async function rattacherLePaiement(
  reference: string,
  transactionId: string,
): Promise<void> {
  const { count } = await db.appointment.updateMany({
    where: { reference, status: "TENU", transactionId: null },
    data: { transactionId },
  });
  if (count === 0) {
    // Soit la tenue a disparu, soit elle porte déjà un paiement. Dans les
    // deux cas, on n'en rattache pas un second : un rendez-vous ne se
    // paie qu'une fois.
    const deja = await db.appointment.findUnique({ where: { reference } });
    if (!deja || deja.transactionId !== transactionId) throw echec("creneau_indisponible");
  }
}

/**
 * La confirmation — appelée par le crédit d'achat, donc par la
 * notification signée, et par personne d'autre.
 *
 * Idempotente : la transition est conditionnée à l'état `TENU`, si bien
 * qu'une seconde notification ne recrée ni le rendez-vous ni l'accès.
 * L'accès consultant est cherché avant d'être créé, pour la même raison.
 */
export async function confirmerLaConsultation(
  transaction: Transaction,
  maintenant = new Date(),
): Promise<{ confirme: boolean; reference?: string }> {
  const rendezVous = await db.appointment.findFirst({
    where: { transactionId: transaction.id },
  });
  if (!rendezVous) return { confirme: false };
  if (rendezVous.status === "RESERVE") {
    // Déjà confirmé : rejeu de la notification, rien à refaire.
    return { confirme: false, reference: rendezVous.reference };
  }
  if (rendezVous.status !== "TENU") return { confirme: false, reference: rendezVous.reference };

  const expire = new Date(
    rendezVous.startsAt.getTime() + ACCORD_DUREE_JOURS * 24 * 60 * 60 * 1000,
  );

  const confirme = await db.$transaction(async (tx) => {
    const { count } = await tx.appointment.updateMany({
      // L'état lu est la condition : deux notifications concurrentes ne
      // peuvent pas confirmer deux fois.
      where: { id: rendezVous.id, status: "TENU" },
      data: { status: "RESERVE", heldUntil: null },
    });
    if (count !== 1) return false;

    /*
      L'accès au dossier naît ici, et nulle part avant. L'accord de
      partage était daté dès la tenue — il dit que le candidat consent,
      pas que le consultant peut lire.
    */
    const ouvert = await tx.consultantAccess.findFirst({
      where: {
        applicationId: rendezVous.applicationId,
        consultantId: rendezVous.consultantId,
        revokedAt: null,
      },
    });
    if (!ouvert) {
      await tx.consultantAccess.create({
        data: {
          applicationId: rendezVous.applicationId,
          consultantId: rendezVous.consultantId,
          grantedAt: maintenant,
          expiresAt: expire,
        },
      });
    }
    return true;
  });

  return { confirme, reference: rendezVous.reference };
}

/**
 * Libère la tenue quand le paiement n'aboutit pas.
 *
 * Le rendez-vous est **supprimé**, et non passé à `ANNULE` : personne n'a
 * annulé quoi que ce soit, et une ligne annulée occuperait le créneau au
 * regard de l'unicité, qui ne connaît pas les états. Ce qui reste de la
 * tentative est la transaction, avec son échec et son motif.
 *
 * Un rendez-vous confirmé n'est jamais touché ici : une annulation après
 * paiement passe par K.C, qui décide d'un remboursement.
 */
export async function libererLaTenue(transactionId: string): Promise<boolean> {
  const { count } = await db.appointment.deleteMany({
    where: { transactionId, status: "TENU" },
  });
  return count > 0;
}

/**
 * Le balayage des tenues abandonnées.
 *
 * Un candidat qui ferme son onglet ne laisse aucune trace : sans ce
 * passage, son créneau resterait tenu jusqu'à la fin des temps. La
 * condition porte sur l'échéance, jamais sur l'âge : c'est la tenue qui
 * dit jusqu'à quand elle vaut.
 */
export async function libererLesTenuesEchues(maintenant = new Date()): Promise<number> {
  const { count } = await db.appointment.deleteMany({
    where: { status: "TENU", heldUntil: { lt: maintenant } },
  });
  return count;
}
