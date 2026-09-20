import { db } from "@/lib/db";
import type { MotifProposition, Partenaire } from "@/domain/consultants/proposition";
import {
  LIBELLE_GENRE,
  tauxConformeALAnnonce,
  type GenrePartenaire,
} from "@/domain/partenaires/affiliation";
import { autorisationAccordee } from "@/server/acces/consentements";

/**
 * Lecture des propositions de partenaire — T-03, WF-13.
 *
 * Quatre conditions doivent tenir ensemble, et aucune n'est cosmétique :
 *
 * - **l'étape** : la proposition est contextuelle, jamais une réclame posée
 *   là où il reste de la place (RG-13.1) ;
 * - **la destination** : un partenaire n'est activé qu'après vérification,
 *   pays par pays (RG-13.4) ;
 * - **l'autorisation** : le candidat peut ne pas vouloir en recevoir, et
 *   c'est un interrupteur de son profil, pas une case oubliée ;
 * - **le refus définitif** : « ne plus me proposer » vaut pour toujours.
 *
 * Il n'y a **aucun défaut permissif**. Un partenaire sans activation
 * n'existe pour aucun dossier : tant que personne n'a vérifié la licéité de
 * la rétro-commission sur la destination, rien ne se propose — ce qui est
 * exactement l'état du produit tant que le premier partenaire n'est pas
 * signé.
 */

/**
 * Étape de checklist → genre de partenaire.
 *
 * Les quatre genres de WF-13 se retrouvent un à un dans les codes du
 * référentiel : c'est le référentiel qui dit à quel moment la question se
 * pose, pas une règle écrite à côté. Une destination qui n'exige pas
 * d'assurance n'a pas d'étape `assurance_maladie`, et la question ne se pose
 * donc jamais.
 */
export const GENRE_DE_LETAPE: Readonly<Record<string, GenrePartenaire>> = {
  assurance_maladie: "ASSURANCE_SANTE",
  logement: "LOGEMENT",
  diplome: "EQUIVALENCE_DIPLOME",
  preuve_fonds: "TRANSFERT_FONDS",
};

export interface Proposition {
  /** Identifiant de la ligne de suivi, que l'écran renvoie avec son issue. */
  id: string;
  partenaire: Partenaire;
  motif: MotifProposition;
  /** Étape de checklist qui la motive. */
  etape: string;
  /**
   * Ce qui est proposé. L'écran n'affiche pas la même chose pour un
   * consultant, qui se réserve sur un créneau chez nous au tarif de la
   * grille, et pour un courtier, qui se rejoint sur son site.
   */
  genre: GenrePartenaire;
  /** Adresse du partenaire, pour la redirection tracée (WF-13, étape 2). */
  url: string;
}

/**
 * Proposition en cours pour un dossier, s'il y en a une.
 *
 * **Cette lecture écrit une ligne**, et c'est délibéré. « Redirection
 * tracée » (WF-13, étape 2) ne se mesure que rapportée aux propositions
 * faites : sans ligne à l'affichage, on ne compte que ce qui a rapporté, et
 * une affiliation qu'on n'évalue que sur ses succès ne s'arrête jamais. La
 * clé d'unicité `(dossier, partenaire, étape)` rend l'écriture idempotente :
 * recharger l'écran n'ajoute rien.
 */
export async function propositionPourLeDossier(
  applicationId: string,
  userId: string,
): Promise<Proposition | null> {
  const dossier = await db.application.findFirst({
    where: { id: applicationId, userId },
    include: {
      visaRule: { select: { countryCode: true } },
      documents: { select: { code: true, label: true } },
    },
  });
  if (!dossier?.visaRule) return null;

  // Une proposition déjà tranchée ne revient pas — y compris « continuer
  // seul », qui vaut pour ce dossier et n'a pas à être redemandé à chaque
  // passage sur la checklist.
  const tranchee = await db.partnerReferral.findFirst({
    where: { applicationId, status: { not: "PROPOSEE" } },
    orderBy: { proposedAt: "desc" },
  });
  if (tranchee) return null;

  const enCours = await db.partnerReferral.findFirst({
    where: { applicationId, status: "PROPOSEE" },
    include: { partner: { include: { activations: { where: { revokedAt: null } } } } },
    orderBy: { proposedAt: "asc" },
  });
  if (enCours) {
    return {
      id: enCours.id,
      partenaire: versPartenaire(enCours.partner, enCours.partner.activations),
      motif: motifDeLEtape(enCours.step, enCours.motive),
      etape: enCours.step,
      genre: enCours.partner.kind,
      url: enCours.partner.url,
    };
  }

  if (!(await autorisationAccordee(userId, "partenaires"))) return null;

  const pays = dossier.visaRule.countryCode;
  for (const piece of dossier.documents) {
    const genre = GENRE_DE_LETAPE[piece.code];
    if (!genre) continue;

    const partenaire = await db.partner.findFirst({
      where: {
        active: true,
        kind: genre,
        activations: { some: { countryCode: pays, revokedAt: null } },
      },
      include: { activations: { where: { revokedAt: null } } },
      orderBy: { createdAt: "asc" },
    });
    // Le taux annoncé par l'écran est littéral (RG-13.3) : un partenaire à
    // un autre taux rendrait la phrase fausse, et on préfère ne rien
    // proposer plutôt que d'annoncer un nombre qui n'est pas celui facturé.
    if (!partenaire || !tauxConformeALAnnonce(partenaire.commissionBps)) continue;

    const motif = motifDeLEtape(piece.code, piece.label);
    const ligne = await db.partnerReferral.upsert({
      where: {
        applicationId_partnerId_step: {
          applicationId,
          partnerId: partenaire.id,
          step: piece.code,
        },
      },
      create: {
        applicationId,
        partnerId: partenaire.id,
        step: piece.code,
        motive: piece.label,
        commissionBps: partenaire.commissionBps,
      },
      update: {},
    });

    return {
      id: ligne.id,
      partenaire: versPartenaire(partenaire, partenaire.activations),
      motif,
      etape: piece.code,
      genre: partenaire.kind,
      url: partenaire.url,
    };
  }

  return null;
}

const versPartenaire = (
  p: { id: string; name: string; city: string | null; qualification: string | null; kind: string },
  activations: readonly { countryCode: string }[],
): Partenaire => ({
  id: p.id,
  nom: p.name,
  ville: p.city ?? "",
  qualification: p.qualification ?? LIBELLE_GENRE[p.kind as GenrePartenaire],
  destinations: activations.map((a) => a.countryCode),
});

/**
 * Le motif, écrit depuis l'étape.
 *
 * Il nomme ce que le candidat a sous les yeux — « ton dossier demande une
 * assurance maladie » — et non un profil deviné. C'est la différence entre
 * une proposition contextuelle et un encart : la première se rattache à
 * quelque chose que la personne reconnaît.
 */
export function motifDeLEtape(etape: string, libelle: string): MotifProposition {
  return {
    constat: `Ton dossier demande une pièce : ${libelle.toLowerCase()}.`,
    raison:
      GENRE_DE_LETAPE[etape] === "EQUIVALENCE_DIPLOME"
        ? "Un service d'équivalence la délivre plus vite que nous ne saurions t'y aider."
        : "Nous ne la fournissons pas nous-mêmes ; un partenaire le fait.",
  };
}
