import { db } from "@/lib/db";
import type { MotifProposition, Partenaire } from "@/domain/consultants/proposition";
import {
  LIBELLE_GENRE,
  tauxConformeALAnnonce,
  type GenrePartenaire,
} from "@/domain/partenaires/affiliation";
import type { EtatAutorisation } from "@/domain/comptes/consentements";
import { estEncoreDemandee } from "@/domain/dossiers/piece";
import { etatDeLAutorisation } from "@/server/acces/consentements";

/**
 * Lecture des offres de partenaire — WF-13, écran T-06.
 *
 * **K.A, tranché le 20/09/2026.** Cette lecture alimentait la checklist :
 * elle y posait une proposition commerciale au moment où une pièce
 * manquait. La décision l'en retire, et l'offre vit désormais sur une
 * surface dédiée, où le candidat va la chercher. Ce qui reste dans l'espace
 * dossier est une aide fonctionnelle, qui ne nomme ni prestataire ni prix
 * (`domain/dossiers/aide-de-letape`).
 *
 * Le déplacement n'affaiblit aucune des garanties. Elles portaient sur la
 * nature de l'offre, pas sur l'écran qui la montre :
 *
 * - **l'étape** : chaque offre se rattache à une pièce que le dossier
 *   demande, et le dit. Une liste sans motif serait un annuaire publicitaire ;
 * - **la destination** : un partenaire n'est activé qu'après vérification,
 *   pays par pays (RG-13.4) ;
 * - **l'autorisation** : le candidat peut ne pas vouloir d'offres, et c'est
 *   un interrupteur de son profil ;
 * - **le taux** : celui qui est annoncé et celui qui est facturé sont le
 *   même nombre (RG-13.3).
 *
 * Il n'y a **aucun défaut permissif**. Un partenaire sans activation
 * n'existe pour aucun dossier — ce qui est exactement l'état du produit
 * tant que le premier partenaire n'est pas signé (K.D).
 */

/**
 * Étape de checklist → genre de partenaire.
 *
 * Les quatre genres de service de WF-13 se retrouvent un à un dans les
 * codes du référentiel : c'est lui qui dit à quel moment la question se
 * pose, pas une règle écrite à côté. `CONSULTANT` n'y figure pas — un
 * accompagnement humain ne se rattache pas à une pièce, et il a sa propre
 * surface depuis WF-12 : l'annuaire.
 */
export const GENRE_DE_LETAPE: Readonly<Record<string, GenrePartenaire>> = {
  assurance_maladie: "ASSURANCE_SANTE",
  logement: "LOGEMENT",
  diplome: "EQUIVALENCE_DIPLOME",
  preuve_fonds: "TRANSFERT_FONDS",
};

export interface Offre {
  /** Identifiant de la ligne de suivi, que l'écran renvoie avec son issue. */
  id: string;
  partenaire: Partenaire;
  /** Ce que le dossier demande, et pourquoi la plateforme ne le fournit pas. */
  motif: MotifProposition;
  /** Étape de checklist qui la motive. */
  etape: string;
  genre: GenrePartenaire;
  /** Adresse du partenaire, pour la redirection tracée (WF-13, étape 2). */
  url: string;
}

export interface OffresDuDossier {
  /**
   * L'état de l'autorisation, et non le seul fait qu'elle manque.
   *
   * Le champ valait `false` dans deux situations que l'écran ne pouvait plus
   * séparer — jamais donnée, retirée — et il en annonçait une seule : la
   * retirée. Comme aucune autorisation n'est active au premier passage
   * (RG-02.1), c'était la mauvaise pour presque tout le monde.
   */
  autorisation: EtatAutorisation;
  offres: readonly Offre[];
}

/**
 * Offres disponibles pour un dossier.
 *
 * **Cette lecture écrit une ligne par offre affichée**, et c'est délibéré.
 * « Redirection tracée » (WF-13, étape 2) ne se mesure que rapportée aux
 * offres montrées : sans ligne à l'affichage, on ne compte que ce qui a
 * rapporté, et une affiliation qu'on n'évalue que sur ses succès ne
 * s'arrête jamais. La clé d'unicité `(dossier, partenaire, étape)` rend
 * l'écriture idempotente — revenir sur l'écran n'ajoute rien, et ne
 * réécrit pas l'issue d'une offre déjà suivie.
 */
export async function offresDuDossier(
  applicationId: string,
  userId: string,
): Promise<OffresDuDossier> {
  const dossier = await db.application.findFirst({
    where: { id: applicationId, userId },
    include: {
      visaRule: { select: { countryCode: true } },
      documents: { select: { code: true, label: true, status: true } },
    },
  });
  const autorisation = await etatDeLAutorisation(userId, "partenaires");
  // Le dossier introuvable rend l'état réel, et non « accordée » : l'écran
  // n'a alors rien à dire de l'autorisation, et lui en faire dire une fausse
  // par commodité serait le défaut qu'on corrige.
  if (!dossier?.visaRule) return { autorisation, offres: [] };
  if (autorisation !== "accordee") return { autorisation, offres: [] };

  const pays = dossier.visaRule.countryCode;
  const offres: Offre[] = [];

  for (const piece of dossier.documents) {
    const genre = GENRE_DE_LETAPE[piece.code];
    if (!genre) continue;
    /*
      Et la pièce doit être encore demandée. La lecture ne lisait pas
      l'état : un dossier dont l'assurance maladie était déjà déposée, lue
      et acceptée s'en voyait proposer une, sous « ton dossier demande une
      pièce ». Une ligne de suivi était écrite avec, si bien que
      l'affiliation se mesurait sur une offre qui n'avait pas lieu d'être.
    */
    if (!estEncoreDemandee(piece.status)) continue;

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
    // montrer plutôt que d'annoncer un nombre qui n'est pas celui facturé.
    if (!partenaire || !tauxConformeALAnnonce(partenaire.commissionBps)) continue;

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

    offres.push({
      id: ligne.id,
      partenaire: versPartenaire(partenaire, partenaire.activations),
      motif: motifDeLEtape(piece.code, piece.label),
      etape: piece.code,
      genre: partenaire.kind,
      url: partenaire.url,
    });
  }

  return { autorisation, offres };
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
 * une offre rattachée à un besoin réel et un encart : la première se
 * rapporte à quelque chose que la personne reconnaît.
 */
export function motifDeLEtape(etape: string, libelle: string): MotifProposition {
  return {
    constat: `Ton dossier demande une pièce : ${libelle.toLowerCase()}.`,
    raison:
      GENRE_DE_LETAPE[etape] === "EQUIVALENCE_DIPLOME"
        ? "Un service d'équivalence la délivre plus vite que nous ne saurions t'y aider."
        : "Nous ne la fournissons pas nous-mêmes\u202f; un partenaire le fait.",
  };
}
