import { db } from "@/lib/db";
import { issueDeLAnnulation, type IssueAnnulation } from "@/domain/consultants/annulation";
import { libelleLimite } from "@/domain/consultants/rendez-vous";
import { echec } from "@/server/http/echecs";
import type { ConsultantHabilite } from "@/domain/consultants/annuaire";
import type { Creneau } from "@/domain/consultants/rendez-vous";
import {
  etatDuPartage,
  libelleEcheance,
  type EtatPartage,
} from "@/domain/consultants/access";
import { versFiche } from "@/server/acces/regles";
import { jourEnFrancais } from "@/domain/format/moment";

/**
 * Lecture des consultants — T-04 et T-05, WF-12.
 *
 * RG-12.1 : le filtre porte sur l'habilitation, destination par destination,
 * et non sur le consultant. Quelqu'un d'habilité au Canada n'apparaît pas
 * pour un dossier néerlandais, et une habilitation retirée reste en table
 * — datée — sans plus être servie.
 */

export async function annuaire(countryCode?: string): Promise<ConsultantHabilite[]> {
  const consultants = await db.consultant.findMany({
    where: {
      active: true,
      accreditations: {
        some: { revokedAt: null, ...(countryCode ? { countryCode } : {}) },
      },
    },
    include: { accreditations: { where: { revokedAt: null } } },
    orderBy: { responseHours: "asc" },
  });

  return consultants.map((c) => ({
    id: c.id,
    nom: c.name,
    cabinet: c.firm,
    habiliteLe: c.accreditations
      .map((a) => a.verifiedAt.toISOString().slice(0, 10))
      .sort()
      .at(0)!,
    destinations: c.accreditations.map((a) => a.countryCode),
    langues: Array.isArray(c.languages) ? (c.languages as string[]) : [],
    delaiReponseHeures: c.responseHours,
  }));
}

export const consultantParId = async (id: string): Promise<ConsultantHabilite | null> =>
  (await annuaire()).find((c) => c.id === id) ?? null;


/**
 * Créneaux proposés — T-05.
 *
 * Ils sont générés à partir d'aujourd'hui et non figés : des horaires écrits
 * en dur finissent tous dans le passé, et l'écran propose alors des
 * rendez-vous impossibles (écart H.2 du lot WF-12). La disponibilité vient
 * de la table : un créneau déjà réservé chez ce consultant sort indisponible
 * plutôt que d'échouer à la réservation.
 */
export const JOURS_PROPOSES = 3;
export const HEURES_PROPOSEES = [9, 11, 15, 17] as const;

export async function creneaux(consultantId: string, aujourdhui = new Date()): Promise<Creneau[]> {
  const consultant = await db.consultant.findFirst({
    where: { id: consultantId, active: true },
    select: { id: true },
  });
  if (!consultant) throw echec("introuvable");

  const debut = new Date(
    Date.UTC(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth(), aujourdhui.getUTCDate()),
  );
  const proposes: Date[] = [];
  for (let jour = 1; jour <= JOURS_PROPOSES; jour += 1) {
    for (const heure of HEURES_PROPOSEES) {
      const quand = new Date(debut);
      quand.setUTCDate(quand.getUTCDate() + jour);
      quand.setUTCHours(heure, 0, 0, 0);
      proposes.push(quand);
    }
  }

  /*
    Un créneau **tenu** est pris, tant que sa tenue court. L'afficher
    libre ferait choisir un horaire que l'unicité refusera ensuite : le
    candidat remplirait l'accord de partage pour buter sur « ce créneau
    vient d'être pris ». Une tenue échue, elle, ne tient plus rien.
  */
  const pris = await db.appointment.findMany({
    where: {
      consultantId,
      startsAt: { in: proposes },
      OR: [
        { status: { in: ["RESERVE", "REPORTE"] } },
        { status: "TENU", heldUntil: { gte: new Date() } },
      ],
    },
    select: { startsAt: true },
  });
  const occupes = new Set(pris.map((p) => p.startsAt.getTime()));

  return proposes.map((quand) => ({
    debut: quand.toISOString(),
    disponible: !occupes.has(quand.getTime()),
  }));
}

export interface Partage {
  id: string;
  consultant: string;
  cabinet: string;
  /** « Pays-Bas — Séjour pour études », ou le pays seul faute de règle figée. */
  dossier: string;
  dossierId: string;
  /** Jour de l'accord, en français. */
  donneLe: string;
  etat: EtatPartage;
  /** « Jusqu'au 5 octobre 2026 », « Retiré », « Échu le … ». */
  echeance: string;
}

/**
 * Les dossiers qu'un candidat a ouverts à un consultant — A-05, RG-12.2.
 *
 * Le filtre sur `application.userId` est dans la requête et non dans une
 * comparaison qui suit : un accord nomme un consultant, un dossier et une
 * date, et la liste des accords de quelqu'un d'autre dit avec qui il
 * prépare son départ.
 *
 * Les accords retirés restent : le retrait est un retrait, pas une
 * suppression, et la ligne prouve que l'accès a existé le jour d'une
 * consultation. C'est la même règle que pour les consentements d'A-05, dont
 * cette liste est le prolongement.
 */
export async function partagesDuCandidat(
  userId: string,
  maintenant = new Date(),
): Promise<Partage[]> {
  const accords = await db.consultantAccess.findMany({
    where: { application: { userId } },
    include: {
      consultant: true,
      application: { include: { visaRule: true } },
    },
    orderBy: { grantedAt: "desc" },
  });

  return accords.map((a) => {
    const fiche = a.application.visaRule ? versFiche(a.application.visaRule) : null;
    const etat = etatDuPartage(
      {
        dossierId: a.applicationId,
        consultantId: a.consultantId,
        donneLe: a.grantedAt,
        revoqueLe: a.revokedAt,
      },
      a.expiresAt,
      maintenant,
    );
    return {
      id: a.id,
      consultant: a.consultant.name,
      cabinet: a.consultant.firm,
      // Sans règle figée, le dossier n'a pas de nom : le dire vaut mieux
      // qu'afficher un identifiant.
      dossier: fiche ? `${fiche.pays} — ${fiche.intitule}` : "Dossier sans destination figée",
      dossierId: a.applicationId,
      donneLe: jourEnFrancais(a.grantedAt.toISOString()),
      etat,
      echeance: libelleEcheance(
        etat,
        jourEnFrancais((a.revokedAt ?? a.expiresAt).toISOString()),
      ),
    };
  });
}

/**
 * Retrait d'un accord — RG-12.2, « révocable à tout moment ».
 *
 * Idempotent : retirer deux fois ne réécrit pas la date du premier retrait.
 * Un accord déjà échu se retire quand même sans erreur — le candidat n'a
 * pas à savoir qu'il s'était fermé tout seul entre-temps.
 */
export async function retirerLePartage(
  id: string,
  userId: string,
  maintenant = new Date(),
): Promise<{ consultant: string; dossierId: string; dejaRetire: boolean }> {
  const accord = await db.consultantAccess.findFirst({
    where: { id, application: { userId } },
    include: { consultant: true },
  });
  if (!accord) throw echec("introuvable");

  if (accord.revokedAt) {
    return { consultant: accord.consultant.name, dossierId: accord.applicationId, dejaRetire: true };
  }

  await db.consultantAccess.update({
    where: { id: accord.id },
    data: { revokedAt: maintenant },
  });
  return { consultant: accord.consultant.name, dossierId: accord.applicationId, dejaRetire: false };
}

/**
 * Les rendez-vous qu'une suppression de compte annulerait — K.C.
 *
 * Lue par l'écran de suppression, avant le bouton. Ce qui est décidé ici
 * n'est pas une prévision : c'est exactement la règle qu'appliquera
 * `acheverLaSuppression`, sur la même limite stockée. Un écran qui
 * annoncerait un remboursement que le traitement ne ferait pas serait pire
 * que le silence.
 */
export interface RendezVousAAnnuler {
  quand: string;
  issue: IssueAnnulation;
}

export async function rendezVousQueLaSuppressionAnnule(
  userId: string,
  maintenant = new Date(),
): Promise<RendezVousAAnnuler[]> {
  const rendezVous = await db.appointment.findMany({
    where: {
      application: { userId },
      startsAt: { gt: maintenant },
      status: { in: ["RESERVE", "REPORTE"] },
    },
    orderBy: { startsAt: "asc" },
    select: { startsAt: true, freeUntil: true },
  });
  return rendezVous.map((r) => ({
    quand: libelleLimite(r.startsAt.toISOString()),
    issue: issueDeLAnnulation(r.freeUntil.toISOString(), maintenant),
  }));
}
