import type { Prisma } from "@prisma/client";
import { etatDeLaReservation } from "@/domain/redaction/relecture-reservation";
import { echeanceDeLaReservation, NOTE_RESERVATION_RENDUE } from "@/domain/redaction/reservation";
import { NOTE_REDACTION_ASSISTEE } from "@/domain/payments/montee";
import type { RemarqueProduite } from "@/domain/redaction/commande";
import {
  debiterUneAnalyseSousVerrou,
  rendreLaReservationDeRedactionSousVerrou,
  solderLaReservationDeRedaction,
  sousVerrouDuGrandLivre,
} from "@/server/acces/quota";

/** Une revendication et son débit atomiques, sous le verrou existant du dossier.
 * L'index partiel tient aussi l'exclusivité en base. Aucun réseau dans ces
 * transactions : le jeton durable survit à la fin de la transaction. */
export async function reserverLaRelecture(applicationId: string, versionId: string, type: string) {
  return sousVerrouDuGrandLivre(applicationId, async (tx) => {
    const maintenant = new Date();
    const version = await tx.documentVersion.findUniqueOrThrow({ where: { id: versionId } });
    if (!(await estLaDerniere(tx, version))) return { etat: "OBSOLETE" } as const;
    const ouverte = await tx.relectureReservation.findFirst({
      where: { versionId, state: "EN_COURS" },
    });
    const etat = etatDeLaReservation(version.critiquedAt, ouverte?.expiresAt ?? null, maintenant);
    if (etat === "RELUE") return { etat: "RELUE" } as const;
    if (etat === "EN_COURS") return { etat: "EN_COURS" } as const;
    if (ouverte) {
      await rendreLaReservationDeRedactionSousVerrou(
        tx,
        applicationId,
        ouverte.creditId,
        NOTE_RESERVATION_RENDUE,
        "EXPIREE",
      );
    }
    const echeance = echeanceDeLaReservation(maintenant);
    const debit = await debiterUneAnalyseSousVerrou(tx, applicationId, undefined, {
      note: `${NOTE_REDACTION_ASSISTEE} — Relecture (${type})`,
      versionId,
      reserveJusquA: echeance,
    });
    const reservation = await tx.relectureReservation.create({
      data: { versionId, creditId: debit.ligne, createdAt: maintenant, expiresAt: echeance },
    });
    return { etat: "RESERVEE", reservation: reservation.id, debit: debit.ligne } as const;
  });
}

const estLaDerniere = async (
  tx: Prisma.TransactionClient,
  version: { id: string; documentId: string; rank: number },
) =>
  (await tx.documentVersion.count({
    where: { documentId: version.documentId, rank: { gt: version.rank } },
  })) === 0;

/** Dernière garde juste avant l'appel : une requête suspendue ne repart pas
 * avec une réservation rendue/remplacée, et un jeton n'appelle qu'une fois. */
export async function commencerLaRelecture(applicationId: string, id: string): Promise<boolean> {
  return sousVerrouDuGrandLivre(applicationId, async (tx) => {
    const r = await tx.relectureReservation.findUniqueOrThrow({
      where: { id },
      include: { version: true, credit: true },
    });
    if (r.credit.applicationId !== applicationId || r.state !== "EN_COURS" || r.callStartedAt)
      return false;
    if (r.expiresAt <= new Date() || !r.credit.reservedUntil) {
      await rendreLaReservationDeRedactionSousVerrou(
        tx,
        applicationId,
        r.creditId,
        NOTE_RESERVATION_RENDUE,
        "EXPIREE",
      );
      return false;
    }
    if (!(await estLaDerniere(tx, r.version))) {
      await rendreLaReservationDeRedactionSousVerrou(
        tx,
        applicationId,
        r.creditId,
        "Relecture : version remplacée avant appel",
        "OBSOLETE",
      );
      return false;
    }
    await tx.relectureReservation.update({ where: { id }, data: { callStartedAt: new Date() } });
    return true;
  });
}

/** Date, remarques, débit soldé et fin du jeton tiennent ensemble. Une
 * réponse ayant perdu sa réservation ne peut ni publier ni solder celle
 * d'une autre tentative. L'usage L2 a déjà été conservé par la route. */
export async function publierLaRelecture(
  applicationId: string,
  id: string,
  remarques: readonly RemarqueProduite[],
) {
  return sousVerrouDuGrandLivre(applicationId, async (tx) => {
    const r = await tx.relectureReservation.findUniqueOrThrow({
      where: { id },
      include: { version: true, credit: true },
    });
    const maintenant = new Date();
    if (r.credit.applicationId !== applicationId || r.state !== "EN_COURS" || !r.callStartedAt)
      return "INTERROMPUE" as const;
    if (r.expiresAt <= maintenant || !r.credit.reservedUntil) {
      await rendreLaReservationDeRedactionSousVerrou(
        tx,
        applicationId,
        r.creditId,
        NOTE_RESERVATION_RENDUE,
        "EXPIREE",
      );
      return "INTERROMPUE" as const;
    }
    // Garde dans l'écriture, pas seulement dans une lecture en tête.
    const { count } = await tx.documentVersion.updateMany({
      where: {
        id: r.versionId,
        critiquedAt: null,
        document: { versions: { none: { rank: { gt: r.version.rank } } } },
      },
      data: { critiquedAt: maintenant },
    });
    if (count !== 1) {
      await rendreLaReservationDeRedactionSousVerrou(
        tx,
        applicationId,
        r.creditId,
        "Relecture : version remplacée, aucun avis publié",
        "OBSOLETE",
      );
      return "OBSOLETE" as const;
    }
    if (remarques.length)
      await tx.critiqueFinding.createMany({
        data: remarques.map((remarque) => ({
          versionId: r.versionId,
          kind: remarque.genre,
          title: remarque.titre,
          body: remarque.corps,
          gaps: remarque.ecarts ? (remarque.ecarts as never) : undefined,
        })),
      });
    await solderLaReservationDeRedaction(tx, r.creditId, r.versionId);
    await tx.relectureReservation.update({
      where: { id },
      data: { state: "RELUE", finishedAt: maintenant },
    });
    return "RELUE" as const;
  });
}

export async function refuserLaRelecture(
  applicationId: string,
  id: string,
  note: string,
  etat: "SANS_AVIS" | "INTERROMPUE" = "SANS_AVIS",
) {
  return sousVerrouDuGrandLivre(applicationId, async (tx) => {
    const r = await tx.relectureReservation.findUniqueOrThrow({ where: { id } });
    if (r.state !== "EN_COURS") return false;
    return rendreLaReservationDeRedactionSousVerrou(tx, applicationId, r.creditId, note, etat);
  });
}
