import type { Alerte } from "@/domain/notifications/alerte";
import { libelleProgression } from "@/domain/notifications/alerte";
import type { VersionRegle } from "@/domain/notifications/divergence";
import type { Partenaire, MotifProposition } from "@/domain/consultants/proposition";

/**
 * ⚠ Statut de ce fichier depuis le branchement des écrans.
 *
 * Les écrans ne le lisent plus : ils reçoivent leurs données de
 * `src/server/lecture/`, qui les tire de la base. Ce qui reste ici a deux
 * usages, et un seul est durable :
 *
 * - **Jeux d'essai.** Les valeurs servent de fixtures aux tests d'écran, qui
 *   vérifient un rendu sans base de données. Elles restent, et c'est leur
 *   place.
 * - **Contenu éditorial.** Ce qui ne se vérifie sur le site d'aucune
 *   autorité — un nom de pays en français, un slug, une phrase de résumé —
 *   reste ici et le serveur le joint au référentiel. Le ranger sous
 *   `verifiedAt` affaiblirait ce que cet horodatage veut dire.
 */
/**
 * Alertes de démonstration — provisoires.
 *
 * Elles viendront de la veille réglementaire (WF-14) et des événements du
 * dossier. Les écrans ne connaissent que les types du domaine.
 */

/**
 * Le prototype annonçait ici « Complétude passée de 58 à 68 sur 100 ».
 * La progression se dit maintenant en pièces, calculée depuis les deux
 * états de la complétude — le seul endroit où la note sur cent avait
 * survécu à l'arbitrage C-09.
 */
const DIPLOME_CONFORME = libelleProgression(
  { obligatoiresManquantes: 3, exigencesNonTenues: 0, facultativesManquantes: 2, conformes: 3 },
  { obligatoiresManquantes: 2, exigencesNonTenues: 0, facultativesManquantes: 2, conformes: 4 },
);

export const ALERTES: readonly Alerte[] = [
  {
    id: "de-compte-bloque",
    genre: "REGLEMENTATION",
    titre: "Le compte bloqué allemand passe à 11 904 €",
    corps:
      "Applicable aux demandes déposées à partir du 1er janvier 2027. Ton dossier Allemagne est concerné : à toi de dire s'il suit la nouvelle règle.",
    emiseLe: "2026-09-18T11:05:00Z",
    source: "make-it-in-germany.com",
    lue: false,
    arbitrage: "de-8820",
  },
  {
    id: "passeport-echeance",
    genre: "ECHEANCE",
    titre: "Renouvellement du passeport",
    corps:
      "Compte six à huit semaines de délai à la Direction de l'émigration : la demande se dépose maintenant pour un dossier visé au 15 janvier.",
    emiseLe: "2026-09-17T08:00:00Z",
    echeanceLe: "2026-09-18",
    dossier: "Pays-Bas",
    lue: false,
  },
  {
    id: "diplome-conforme",
    genre: "ANALYSE",
    titre: "Ton diplôme est conforme",
    corps: DIPLOME_CONFORME,
    emiseLe: "2026-09-09T14:22:00Z",
    dossier: "Pays-Bas",
    lue: true,
  },
  {
    id: "recu-paiement",
    genre: "PAIEMENT",
    titre: "Reçu de paiement disponible",
    corps: "Pack Dossier, 15 000 F, référence IMP-2609-4471.",
    emiseLe: "2026-09-09T09:41:00Z",
    lue: true,
  },
  {
    id: "fiche-relue",
    genre: "VEILLE",
    titre: "Fiche Pays-Bas relue",
    corps: "Aucun changement d'exigence depuis la dernière vérification.",
    emiseLe: "2026-09-04T07:30:00Z",
    source: "ind.nl",
    lue: true,
  },
];

/**
 * Divergence réglementaire allemande — T-02.
 *
 * Les deux versions coexistent dans le référentiel : le dossier reste sur
 * celle qu'il a figée (INV-3), et c'est le candidat qui décide d'en changer.
 */
export const REGLE_ANCIENNE: VersionRegle = {
  numero: 4,
  montant: 11208,
  devise: "EUR",
  intitule: "sur compte bloqué",
  publieeLe: "2026-01-12",
  applicableJusquau: "2026-12-31",
};

export const REGLE_NOUVELLE: VersionRegle = {
  numero: 5,
  montant: 11904,
  devise: "EUR",
  intitule: "sur compte bloqué",
  publieeLe: "2026-09-09",
  applicableDepuis: "2027-01-01",
};

export const DIVERGENCE = {
  pays: "Allemagne",
  detecteeLe: "2026-09-09",
  verifieeLe: "2026-09-11",
  source: "make-it-in-germany.com",
} as const;

/** Partenaire proposé par T-03 — provisoire, viendra de la table des consultants. */
export const PARTENAIRE: Partenaire = {
  id: "adjovi",
  nom: "Cabinet Adjovi & Associés",
  ville: "Cotonou",
  qualification: "agréé, 9 ans d'exercice",
  destinations: ["NL", "DE", "FR"],
};

export const MOTIF_PARTENAIRE: MotifProposition = {
  constat: "Tu as déclaré un refus de visa Schengen en 2024.",
  raison:
    "Une demande après refus se justifie pièce par pièce, et c'est le genre de dossier où un consultant change réellement quelque chose.",
};
