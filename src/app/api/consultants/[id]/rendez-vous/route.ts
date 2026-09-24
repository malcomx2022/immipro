import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { dossierAvecSaRegle } from "@/server/acces/dossiers";
import {
  estUnCreneauPropose,
  limiteAnnulation,
  referenceRendezVous,
} from "@/domain/consultants/rendez-vous";
import { versFiche } from "@/server/acces/regles";
import { CONSULTATION_DUREE_MINUTES } from "@/domain/payments/pricing";
import { rattacherLePaiement, tenirLeCreneau } from "@/server/acces/consultations";
import { ouvrirLeTunnel } from "@/server/acces/paiements";
import { deviseParDefaut } from "@/domain/payments/pricing";

/**
 * Prise de rendez-vous — T-05, WF-12, arbitrage du 21/09/2026.
 *
 * ── Ce que cette route faisait, et qu'elle ne fait plus ─────────────
 *
 * Elle créait le rendez-vous **et** l'accès au dossier, sans paiement :
 * `transactionId` restait nul, l'écran annonçait « Rendez-vous confirmé »,
 * et deux paragraphes plus bas que la consultation était due. Un
 * consultant lisait le dossier d'un candidat qui n'avait rien réglé.
 *
 * Elle **tient** désormais le créneau et ouvre le paiement. Rien d'autre.
 *
 * ── Ce qui se passe, dans l'ordre ───────────────────────────────────
 *
 * 1. L'accord de partage est daté — il se prépare avant le paiement, et
 *    n'ouvre aucun accès (RG-12.2) ;
 * 2. le créneau est tenu, avec une échéance ; la base arbitre la course
 *    par l'unicité `(consultant, créneau)` ;
 * 3. le tunnel de paiement s'ouvre, comme pour un pack, et la page
 *    hébergée du prestataire est rendue au navigateur ;
 * 4. la transaction est rattachée à la tenue.
 *
 * Le `RESERVE` et l'accès consultant naissent ailleurs : à la
 * confirmation signée, et à elle seule (RG-05.1, INV-7). La base le tient
 * — `appointment_reserve_exige_un_paiement` refuse un rendez-vous
 * confirmé qui ne cite pas de transaction.
 *
 * **La confirmation par courriel part à la confirmation**, plus ici : un
 * courrier qui annonce un rendez-vous avant qu'il soit payé est
 * exactement ce que cet arbitrage corrige.
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
    const maintenant = new Date();
    if (debut.getTime() <= maintenant.getTime()) {
      throw echec("etat_incompatible", {
        corps: "Ce créneau est passé. Choisis-en un autre dans la liste.",
      });
    }
    // Seul un horaire de l'offre se tient : l'unicité (consultant, créneau)
    // ne protège que des instants identiques, pas d'entretiens qui se
    // chevauchent à une minute près.
    if (!estUnCreneauPropose(debut, maintenant)) {
      throw echec("etat_incompatible", {
        corps:
          "Cet horaire ne fait pas partie des créneaux proposés par ce consultant. Choisis-en un dans la liste.",
      });
    }

    const creneau = { debut: debut.toISOString(), disponible: true };
    const reference = referenceRendezVous(creneau, consultant.id);

    // La version figée par le dossier, lue par le module d'accès : aucune
    // route n'interroge le référentiel elle-même (INV-4).
    const fiche = dossier.visaRule ? versFiche(dossier.visaRule) : null;
    const libelleDossier = fiche ? `${fiche.pays} — ${fiche.intitule}` : null;

    /*
      L'accord de partage est daté par la tenue. Il dit que le candidat
      consent, pas que le consultant peut lire : l'accès naît à la
      confirmation du paiement, et pas une seconde avant.
    */
    const tenue = await tenirLeCreneau({
      applicationId: dossier.id,
      consultantId: consultant.id,
      reference,
      debut,
      dureeMinutes: CONSULTATION_DUREE_MINUTES,
      limiteAnnulation: new Date(limiteAnnulation(creneau)),
    });

    /*
      Le tunnel ordinaire — même ouverture, même idempotence, même page
      hébergée. La devise suit le dossier, jamais le navigateur, et le
      montant est recalculé côté serveur.
    */
    // Déjà payé : on le lui montre, sans rouvrir de paiement.
    if (tenue.confirme) {
      return {
        reference: tenue.reference,
        debut: tenue.debut.toISOString(),
        dureeMinutes: CONSULTATION_DUREE_MINUTES,
        annulationSansFraisJusqua: new Date(limiteAnnulation(creneau)).toISOString(),
        consultant: consultant.name,
        dossier: libelleDossier,
        tenuJusqua: null,
        url: null,
        paiement: null,
        confirme: true,
        deja: true,
      };
    }

    const compte = await db.user.findUnique({
      where: { id: acteur!.id },
      select: { countryCode: true },
    });
    const paiement = await ouvrirLeTunnel(
      acteur!.id,
      { type: "consultation", applicationId: dossier.id },
      // La grille suit le pays du compte, comme pour un pack. Le
      // navigateur ne la choisit pas, et ne la transmet pas.
      deviseParDefaut(compte?.countryCode),
    );
    await rattacherLePaiement(tenue.reference, paiement.transactionId);

    return {
      reference: tenue.reference,
      debut: tenue.debut.toISOString(),
      dureeMinutes: CONSULTATION_DUREE_MINUTES,
      annulationSansFraisJusqua: new Date(limiteAnnulation(creneau)).toISOString(),
      consultant: consultant.name,
      dossier: libelleDossier,
      /** Jusqu'à quand le créneau est gardé. Il n'est pas réservé. */
      tenuJusqua: tenue.tenuJusqua?.toISOString() ?? null,
      /** La page hébergée du prestataire, vérifiée par le tunnel. */
      url: paiement.url,
      paiement: paiement.reference,
      confirme: false,
      deja: tenue.deja,
    };
  },
});
