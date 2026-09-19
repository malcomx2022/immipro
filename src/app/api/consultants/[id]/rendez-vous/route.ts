import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { dossierDuCandidat } from "@/server/acces/dossiers";
import { referenceRendezVous, limiteAnnulation } from "@/domain/consultants/rendez-vous";
import { CONSULTATION_DUREE_MINUTES } from "@/domain/payments/pricing";
import { ACCORD_DUREE_JOURS } from "@/domain/consultants/access";

/**
 * Prise de rendez-vous — T-05, WF-12.
 *
 * Trois choses se produisent ensemble, et aucune ne va sans les autres :
 * l'accord de partage, la réservation du créneau, et la limite d'annulation
 * opposable.
 *
 * **L'accord est obligatoire et borné (RG-12.2).** Il est révocable et
 * expire de lui-même : `expiresAt` n'est pas optionnel, et la base refuse
 * une échéance antérieure à l'accord. Sa durée couvre le rendez-vous et le
 * temps d'un compte rendu, pas davantage.
 *
 * **La référence est déterministe (INV-7).** Une réservation rejouée — deux
 * appuis, un retour arrière — retombe sur la même référence et se heurte à
 * l'unicité plutôt que de créer un second rendez-vous payant.
 *
 * **La limite d'annulation est stockée.** La grille peut changer après la
 * réservation ; la condition acceptée ce jour-là, non.
 */
export const POST = route({
  nom: "consultants.rendezvous",
  acces: "candidat_verifie",
  limite: "sensible",
  corps: z.object({
    dossierId: z.string().uuid(),
    creneau: z.string().datetime(),
    /** Case non pré-cochée de T-04. Sans elle, rien ne se réserve. */
    accordDePartage: z.literal(true, {
      errorMap: () => ({ message: "Le partage du dossier demande ton accord explicite." }),
    }),
  }),
  async traiter({ corps, params, acteur }) {
    const dossier = await dossierDuCandidat(corps.dossierId, acteur!.id);
    const consultant = await db.consultant.findFirst({
      where: { id: params.id, active: true },
      include: { accreditations: { where: { revokedAt: null } } },
    });
    if (!consultant || consultant.accreditations.length === 0) throw echec("introuvable");

    const debut = new Date(corps.creneau);
    if (debut.getTime() <= Date.now()) {
      throw echec("etat_incompatible", {
        corps: "Ce créneau est passé. Choisis-en un autre dans la liste.",
      });
    }

    const creneau = { debut: debut.toISOString(), disponible: true };
    const reference = referenceRendezVous(creneau, consultant.id);

    const existant = await db.appointment.findUnique({ where: { reference } });
    if (existant) {
      return { reference: existant.reference, deja: true };
    }

    const expire = new Date(debut.getTime() + ACCORD_DUREE_JOURS * 24 * 60 * 60 * 1000);

    const [rendezVous] = await db.$transaction([
      db.appointment.create({
        data: {
          reference,
          applicationId: dossier.id,
          consultantId: consultant.id,
          startsAt: debut,
          durationMin: CONSULTATION_DUREE_MINUTES,
          freeUntil: new Date(limiteAnnulation(creneau)),
        },
      }),
      db.consultantAccess.create({
        data: {
          applicationId: dossier.id,
          consultantId: consultant.id,
          expiresAt: expire,
        },
      }),
    ]);

    return {
      reference: rendezVous.reference,
      debut: rendezVous.startsAt.toISOString(),
      dureeMinutes: rendezVous.durationMin,
      annulationSansFraisJusqua: rendezVous.freeUntil.toISOString(),
      partageExpireLe: expire.toISOString().slice(0, 10),
      deja: false,
    };
  },
});
