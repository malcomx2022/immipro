import { db } from "@/lib/db";
import {
  ETATS_ANNULABLES,
  ETATS_VIVANTS,
  avertissementAnnulation,
  issueDeLAnnulation,
  type IssueAnnulation,
} from "@/domain/consultants/annulation";
import {
  creneauxProposes,
  libelleLimite,
  libelleRendezVous,
} from "@/domain/consultants/rendez-vous";
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


// La grille vit dans le domaine ; la fumée la relit ici.
export { HEURES_PROPOSEES, JOURS_PROPOSES } from "@/domain/consultants/rendez-vous";

/**
 * Créneaux proposés — T-05.
 *
 * Ils sont générés à partir d'aujourd'hui et non figés : des horaires écrits
 * en dur finissent tous dans le passé, et l'écran propose alors des
 * rendez-vous impossibles (écart H.2 du lot WF-12). La disponibilité vient
 * de la table : un créneau déjà réservé chez ce consultant sort indisponible
 * plutôt que d'échouer à la réservation.
 */
export async function creneaux(consultantId: string, aujourdhui = new Date()): Promise<Creneau[]> {
  const consultant = await db.consultant.findFirst({
    where: { id: consultantId, active: true },
    select: { id: true },
  });
  if (!consultant) throw echec("introuvable");

  /*
    Les heures proposées sont **locales** — I.E., et le jour est celui du
    fuseau. La grille vient du domaine, que la route de réservation relit :
    l'offre et l'acceptation ne peuvent plus diverger.
  */
  const proposes = creneauxProposes(aujourdhui);

  /*
    Un créneau **tenu** est pris, tant que sa tenue court. L'afficher
    libre ferait choisir un horaire que l'unicité refusera ensuite : le
    candidat remplirait l'accord de partage pour buter sur « ce créneau
    vient d'être pris ». Une tenue échue, elle, ne tient plus rien —
    `tenirLeCreneau` la reprend par une mise à jour.

    La liste des états occupants vient du domaine, qui la tient avec
    l'unicité partielle de la base. Elle était recopiée ici, dans la
    fonction même que `ETATS_VIVANTS` cite comme ayant divergé : « une
    seule règle, à deux endroits qui ne peuvent plus diverger » ne valait
    pas encore pour celle-ci.

    L'échéance se compare à l'horloge de l'appelant, et non à `new Date()` :
    cette fonction en reçoit une, et en lire deux ferait juger les tenues
    à un instant que le reste du calcul ignore.
  */
  const pris = await db.appointment.findMany({
    where: {
      consultantId,
      startsAt: { in: proposes },
      status: { in: [...ETATS_VIVANTS] },
      NOT: { AND: [{ status: "TENU" }, { heldUntil: { lt: aujourdhui } }] },
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
      // La même liste que l'annulation applique : l'en-tête ci-dessus dit
      // que ce n'est pas une prévision mais la règle elle-même.
      status: { in: [...ETATS_ANNULABLES] },
    },
    orderBy: { startsAt: "asc" },
    select: { startsAt: true, freeUntil: true },
  });
  return rendezVous.map((r) => ({
    quand: libelleLimite(r.startsAt.toISOString()),
    issue: issueDeLAnnulation(r.freeUntil.toISOString(), maintenant),
  }));
}

/* ------------------------------------------------------------------ *
 * Les rendez-vous d'un candidat — la surface qui manquait.
 * ------------------------------------------------------------------ */

export interface RendezVousDuCandidat {
  reference: string;
  consultant: string;
  cabinet: string;
  /** « Pays-Bas — Séjour pour études », ou le pays seul faute de règle figée. */
  dossier: string;
  /** « vendredi 19 septembre à 15 h 30 ». */
  quand: string;
  /** « vendredi 18 septembre à 15 h 30 » — la limite stockée, pas recalculée. */
  limite: string;
  issue: IssueAnnulation;
  /** L'avertissement à lire avant de confirmer. Une phrase, celle du cas. */
  avertissement: string;
}

/**
 * Les rendez-vous à venir d'un candidat — T-05, WF-12, RG-12.5.
 *
 * ── Aucune surface ne les montrait ──────────────────────────────────
 *
 * L'écran de confirmation de paiement les affiche une fois, puis on le
 * quitte. `/consultants/[id]/rendez-vous` ne lit aucun rendez-vous
 * existant : un candidat qui y revient repart de l'accord de partage, et
 * n'apprend qu'il en a déjà un qu'en rechoisissant exactement le même
 * créneau. Le courrier de confirmation portait la référence, et c'était
 * le seul endroit où le rendez-vous survivait.
 *
 * Trois surfaces lui promettaient pourtant « annulation ou report sans
 * frais jusqu'au […] ». Une promesse sans écran où l'exercer n'en est pas
 * une.
 *
 * ── Ce que la liste ne montre pas ───────────────────────────────────
 *
 * Les créneaux seulement **tenus** : rien n'est payé, rien n'est promis,
 * et la tenue expire d'elle-même. Les afficher parmi les rendez-vous
 * ferait lire comme acquis un créneau que le paiement n'a pas confirmé —
 * c'est exactement la confusion que l'échelonnement de T-05 a corrigée.
 *
 * Les rendez-vous passés non plus : ils ne s'annulent pas, et la liste
 * sert à agir. L'historique se lit dans les reçus.
 */
export async function rendezVousDuCandidat(
  userId: string,
  maintenant = new Date(),
): Promise<RendezVousDuCandidat[]> {
  const rendezVous = await db.appointment.findMany({
    where: {
      application: { userId },
      startsAt: { gt: maintenant },
      status: { in: [...ETATS_ANNULABLES] },
    },
    orderBy: { startsAt: "asc" },
    include: {
      consultant: true,
      application: { include: { visaRule: true } },
    },
  });

  return rendezVous.map((r) => {
    const fiche = r.application.visaRule ? versFiche(r.application.visaRule) : null;
    const quand = libelleRendezVous({ debut: r.startsAt.toISOString(), disponible: false });
    const issue = issueDeLAnnulation(r.freeUntil.toISOString(), maintenant);
    return {
      reference: r.reference,
      consultant: r.consultant.name,
      cabinet: r.consultant.firm,
      dossier: fiche ? `${fiche.pays} — ${fiche.intitule}` : "Dossier sans destination figée",
      quand,
      limite: libelleLimite(r.freeUntil.toISOString()),
      issue,
      avertissement: avertissementAnnulation({ quand, issue }),
    };
  });
}
