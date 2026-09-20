import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { dossierAvecSaRegle } from "@/server/acces/dossiers";
import { referenceRendezVous, limiteAnnulation } from "@/domain/consultants/rendez-vous";
import { versFiche } from "@/server/acces/regles";
import { envoyerConfirmationEntretien } from "@/server/courrier";
import { jourEnFrancais } from "@/domain/format/moment";
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
 *
 * **La confirmation part par courriel (I.E).** Elle n'existait pas, et
 * l'écran l'annonçait. Un envoi manqué ne défait pas une réservation déjà
 * écrite : le rendez-vous est pris, l'accord est donné, et c'est l'écran
 * qui en porte la preuve. L'échec se journalise — la réclamation qui
 * arrivera saura quoi chercher.
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
    const dossier = await dossierAvecSaRegle(corps.dossierId, acteur!.id);
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

    // La version figée par le dossier, lue par le module d'accès : aucune
    // route n'interroge le référentiel elle-même (INV-4).
    const fiche = dossier.visaRule ? versFiche(dossier.visaRule) : null;
    const libelleDossier = fiche ? `${fiche.pays} — ${fiche.intitule}` : null;

    const existant = await db.appointment.findUnique({ where: { reference } });
    if (existant) {
      // Rejeu : le rendez-vous est le même, et le courrier est déjà parti.
      // En renvoyer un second ferait douter d'une double réservation.
      return {
        reference: existant.reference,
        debut: existant.startsAt.toISOString(),
        dureeMinutes: existant.durationMin,
        annulationSansFraisJusqua: existant.freeUntil.toISOString(),
        consultant: consultant.name,
        dossier: libelleDossier,
        deja: true,
      };
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

    await envoyerConfirmationEntretien({
      destinataire: acteur!.email,
      reference: rendezVous.reference,
      creneau,
      consultant: consultant.name,
      dossier: libelleDossier,
      partageExpireLe: jourEnFrancais(expire.toISOString()),
    }).catch((erreur: unknown) => {
      console.error(`[courrier] confirmation d'entretien ${reference} non partie`, erreur);
    });

    return {
      reference: rendezVous.reference,
      debut: rendezVous.startsAt.toISOString(),
      dureeMinutes: rendezVous.durationMin,
      annulationSansFraisJusqua: rendezVous.freeUntil.toISOString(),
      consultant: consultant.name,
      dossier: libelleDossier,
      partageExpireLe: expire.toISOString().slice(0, 10),
      deja: false,
    };
  },
});
