import type { Compte } from "@/domain/backoffice/comptes";
import type { EcritureAudit } from "@/domain/backoffice/audit";
import type { EtatOperateur, Paiement } from "@/domain/backoffice/reconciliation";
import type { PieceEnEchec } from "@/domain/backoffice/revue";
import type { Regle } from "@/domain/backoffice/regle";
import type { Collecte, FicheSuivie } from "@/domain/backoffice/veille";

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
 * Jeu de démonstration du back-office — provisoire.
 *
 * Il viendra des tables `visa_rules`, `users`, `payments`, `audit_log` et
 * `AiUsage` une fois le schéma dérivé de DOC-11. Les écrans ne connaissent
 * que les types du domaine.
 *
 * B-07 n'a pas de jeu de données : il est livré en état vide, et le rester
 * est la décision (WF-16).
 */

export const FICHES_SUIVIES: readonly FicheSuivie[] = [
  {
    id: "de-etudes",
    code: "DE",
    pays: "Allemagne",
    procedure: "Séjour études",
    niveauSource: "OFFICIEL",
    source: "make-it-in-germany.com",
    verifieeLe: "2026-09-09",
    relectureLe: "2026-09-15",
    version: 4,
    statut: "PUBLIE",
    ecart: "Compte bloqué porté à 11 904 €",
  },
  {
    id: "nl-etudes",
    code: "NL",
    pays: "Pays-Bas",
    procedure: "Séjour études",
    niveauSource: "OFFICIEL",
    source: "ind.nl",
    verifieeLe: "2026-09-11",
    relectureLe: "2026-12-11",
    version: 7,
    statut: "PUBLIE",
  },
  {
    id: "ca-etudes",
    code: "CA",
    pays: "Canada",
    procedure: "Permis d'études",
    niveauSource: "OFFICIEL",
    source: "canada.ca",
    verifieeLe: "2026-09-02",
    relectureLe: "2026-09-17",
    version: 11,
    statut: "PUBLIE",
  },
  {
    id: "fr-etudiant",
    code: "FR",
    pays: "France",
    procedure: "Étudiant — Campus France",
    niveauSource: "INSTITUTIONNEL",
    source: "campusfrance.org",
    verifieeLe: "2026-08-28",
    relectureLe: "2026-09-12",
    version: 9,
    statut: "PUBLIE",
  },
  {
    id: "be-etudes",
    code: "BE",
    pays: "Belgique",
    procedure: "Séjour études",
    niveauSource: "OFFICIEL",
    source: "dofi.ibz.be",
    verifieeLe: "2026-09-01",
    relectureLe: "2026-09-30",
    version: 5,
    statut: "BROUILLON",
  },
  {
    id: "de-emploi",
    code: "DE",
    pays: "Allemagne",
    procedure: "Recherche d'emploi",
    niveauSource: "OFFICIEL",
    source: "make-it-in-germany.com",
    verifieeLe: "2026-08-15",
    relectureLe: "2026-09-06",
    version: 3,
    statut: "PUBLIE",
  },
  {
    id: "pt-etudes",
    code: "PT",
    pays: "Portugal",
    procedure: "Séjour études",
    niveauSource: "SECONDAIRE",
    source: "blog-expat-lisbonne.pt",
    verifieeLe: "2026-07-22",
    relectureLe: "2026-08-25",
    version: 2,
    statut: "ARCHIVE",
  },
  {
    id: "ma-etudes",
    code: "MA",
    pays: "Maroc",
    procedure: "Séjour études",
    niveauSource: "INSTITUTIONNEL",
    source: "amci.ma",
    verifieeLe: "2026-09-04",
    relectureLe: "2026-10-12",
    version: 4,
    statut: "PUBLIE",
  },
];

export const COLLECTE: Collecte = {
  sources: 14,
  relevees: 14,
  faiteLe: "2026-09-18T06:00:00Z",
  prochaineLe: "2026-09-18T18:00:00Z",
};

/** Variante d'incident, pour l'état « source injoignable » de B-01. */
export const COLLECTE_PARTIELLE: Collecte = {
  sources: 14,
  relevees: 13,
  faiteLe: "2026-09-18T06:00:00Z",
  prochaineLe: "2026-09-18T18:00:00Z",
  injoignable: {
    source: "ind.nl",
    derniereReussite: "2026-09-17T18:00:00Z",
    tentatives: 3,
  },
};

export const REGLE_EN_VIGUEUR: Regle = {
  version: 4,
  pays: "Allemagne",
  procedure: "Séjour études",
  niveauSource: "OFFICIEL",
  source: "make-it-in-germany.com",
  montant: 11208,
  devise: "EUR",
  intituleMontant: "Montant du compte bloqué",
  applicableDepuis: "2026-01-12",
  delaiInstruction: "6 à 12 semaines",
  prochaineRelecture: "2026-09-15",
  libelleCandidat:
    "Il te faut 11 208 € sur un compte bloqué allemand pour l'année, si tu déposes avant le 31 décembre 2026.",
  reserveCandidat:
    "Le montant est réévalué chaque année. Une demande déposée après publication d'un nouveau barème est instruite sur le montant à jour.",
};

export const REGLE_BROUILLON: Regle = {
  ...REGLE_EN_VIGUEUR,
  version: 5,
  montant: 11904,
  applicableDepuis: "2027-01-01",
  prochaineRelecture: "2026-12-09",
  libelleCandidat:
    "Il te faut 11 904 € sur un compte bloqué allemand pour l'année, si tu déposes à partir du 1er janvier 2027.",
};

/** Dossiers figés sur la version 4, et ceux dont le dépôt tombe en 2027. */
export const DOSSIERS_EN_VERSION_4 = 37;
export const DOSSIERS_SOUS_LA_VERSION_5 = 29;

export const HISTORIQUE_REGLE = [
  { version: 4, le: "2026-01-12", par: "M. Agossou" },
  { version: 3, le: "2025-07-04", par: "K. Houngbo" },
  { version: 2, le: "2025-01-11", par: "K. Houngbo" },
  { version: 1, le: "2024-03-02", par: "import initial" },
] as const;

/**
 * Pièces en attente de revue.
 *
 * Les dépôts sont posés en minutes écoulées et non en horodatages fixes :
 * figés, ils franchissaient le délai cible de quatre heures au fil de la
 * journée, et la file entière finissait affichée en retard. La donnée réelle
 * portera de vrais horodatages ; l'écran, lui, calcule déjà l'âge.
 */
const ECHECS = [
  {
    id: "nl-4471-photo",
    piece: "Photo d'identité",
    dossier: "Dossier NL-4471 · A. Dossou",
    ilYAMinutes: 272,
    motif: "NETTETE_INSUFFISANTE" as const,
    journal:
      "confidence 0.41 · bords flous détectés sur 3 des 4 côtés · aucun visage cadré selon la norme ISO/IEC 19794-5",
  },
  {
    id: "de-3920-releve",
    piece: "Relevé bancaire",
    dossier: "Dossier DE-3920 · S. Kpadé",
    ilYAMinutes: 132,
    motif: "SIGNALE_PAR_LE_CANDIDAT" as const,
    journal:
      "solde lu 1 020 000 F · candidat déclare 10 200 000 F · écart d'un facteur 10, séparateur de milliers ambigu",
  },
  {
    id: "nl-4388-diplome",
    piece: "Diplôme du baccalauréat",
    dossier: "Dossier NL-4388 · R. Tossou",
    ilYAMinutes: 90,
    motif: "ECHEC_TECHNIQUE" as const,
    journal: "fichier PDF chiffré · extraction impossible · 3 tentatives",
  },
  {
    id: "ca-2210-passeport",
    piece: "Passeport",
    dossier: "Dossier CA-2210 · F. Zinsou",
    ilYAMinutes: 58,
    motif: "SIGNALE_PAR_LE_CANDIDAT" as const,
    journal: "date d'expiration lue 12/03/2027 · candidat déclare 12/03/2029",
  },
  {
    id: "de-3901-ressources",
    piece: "Attestation de ressources",
    dossier: "Dossier DE-3901 · M. Ahouandjinou",
    ilYAMinutes: 42,
    motif: "DOCUMENT_NON_RECONNU" as const,
    journal:
      "type de document non identifié · en-tête absent · document possiblement partiel",
  },
  {
    id: "nl-4402-releves",
    piece: "Relevés de notes",
    dossier: "Dossier NL-4402 · L. Gbaguidi",
    ilYAMinutes: 26,
    motif: "ECHEC_TECHNIQUE" as const,
    journal: "image 340×480 px · résolution insuffisante pour l'extraction de texte",
  },
];

/** Une seule pièce dépasse le délai cible : c'est celle qui doit se voir. */
export function piecesEnEchec(maintenant: Date): readonly PieceEnEchec[] {
  return ECHECS.map(({ ilYAMinutes, ...piece }) => ({
    ...piece,
    deposeeLe: new Date(maintenant.getTime() - ilYAMinutes * 60_000).toISOString(),
  }));
}

export const COMPTES: readonly Compte[] = [
  {
    id: "u-4471",
    nom: "Aline Dossou",
    email: "aline.dossou@email.com",
    inscritLe: "2026-08-14",
    dossiers: 2,
    pack: "Dossier",
    consentements: ["analyse-pieces", "alertes-email"],
    analysesUtilisees: 18,
    analysesTotal: 30,
    statut: "ACTIF",
  },
  {
    id: "u-3920",
    nom: "Sègla Kpadé",
    email: "s.kpade@email.com",
    inscritLe: "2026-09-02",
    dossiers: 1,
    pack: "Essentiel",
    consentements: ["analyse-pieces"],
    analysesUtilisees: 4,
    analysesTotal: 10,
    statut: "EMAIL_NON_VERIFIE",
  },
  {
    id: "u-2210",
    nom: "Fabrice Zinsou",
    email: "f.zinsou@email.com",
    inscritLe: "2026-05-30",
    dossiers: 1,
    pack: "Dossier Pro",
    consentements: ["analyse-pieces", "alertes-email", "partage-consultant"],
    analysesUtilisees: 61,
    analysesTotal: 90,
    statut: "ACTIF",
  },
  {
    id: "u-4402",
    nom: "Léa Gbaguidi",
    email: "l.gbaguidi@email.com",
    inscritLe: "2026-07-19",
    dossiers: 0,
    pack: "Essentiel",
    consentements: ["analyse-pieces"],
    analysesUtilisees: 10,
    analysesTotal: 10,
    statut: "SUPPRESSION_DEMANDEE",
  },
];

export const OPERATEUR: EtatOperateur = {
  disponible: true,
  dernierRapprochement: "2026-09-18T13:04:00Z",
  operateur: "MTN MoMo",
};

export const OPERATEUR_MUET: EtatOperateur = {
  disponible: false,
  dernierRapprochement: "2026-09-18T09:12:00Z",
  operateur: "MTN MoMo",
};

export const PAIEMENTS: readonly Paiement[] = [
  {
    reference: "IMP-2609-4471",
    compte: "aline.dossou@email.com",
    montant: 15000,
    devise: "XOF",
    moyen: "MTN MoMo",
    transaction: "MP260918.0943",
    recuLe: "2026-09-18T09:43:00Z",
    etat: "RAPPROCHE",
  },
  {
    reference: "IMP-2609-4472",
    compte: "s.kpade@email.com",
    montant: 3000,
    devise: "XOF",
    moyen: "Moov Money",
    recuLe: "2026-09-18T10:02:00Z",
    etat: "EN_ATTENTE",
  },
  {
    reference: "IMP-2609-4473",
    compte: "l.gbaguidi@email.com",
    montant: 5000,
    devise: "XOF",
    moyen: "MTN MoMo",
    recuLe: "2026-09-18T10:18:00Z",
    etat: "EN_ATTENTE",
  },
  {
    reference: "IMP-2609-4468",
    compte: "f.zinsou@email.com",
    montant: 45000,
    devise: "XOF",
    moyen: "MTN MoMo",
    transaction: "MP260918.0712",
    recuLe: "2026-09-18T07:12:00Z",
    etat: "RAPPROCHE",
  },
  {
    reference: "IMP-2609-4465",
    compte: "r.tossou@email.com",
    montant: 5000,
    devise: "XOF",
    moyen: "MTN MoMo",
    recuLe: "2026-09-18T06:48:00Z",
    etat: "ECHEC_DELAI",
  },
  {
    reference: "IMP-2609-4462",
    compte: "inconnu",
    montant: 5000,
    devise: "XOF",
    moyen: "MTN MoMo",
    transaction: "MP260918.0611",
    recuLe: "2026-09-18T06:11:00Z",
    etat: "ECART",
  },
];

export const ECRITURES_AUDIT: readonly EcritureAudit[] = [
  {
    id: "a-1",
    horodatage: "2026-09-18T09:41:00Z",
    acteur: {
      genre: "PERSONNE",
      libelle: "M. Agossou",
      identifiant: "8f21c4d0-1a7e-4c33-9b05-2ee1f0a77c31",
    },
    categorie: "ACCES_PIECE",
    action: "Ouverture d'une pièce",
    objet: "Dossier NL-4471 · Photo d'identité",
    detail: "Motif déclaré : revue manuelle après échec d'analyse",
    origine: "Back-office",
  },
  {
    id: "a-2",
    horodatage: "2026-09-18T09:12:00Z",
    acteur: {
      genre: "PROCESSUS",
      libelle: "webhook:MOBILE_MONEY",
      identifiant: "webhook:MOBILE_MONEY",
    },
    categorie: "PAIEMENT",
    action: "Rapprochement automatique",
    objet: "IMP-2609-4471",
    detail: "Transaction MP260918.0943 · 15 000 F",
    origine: "Webhook MTN MoMo",
  },
  {
    id: "a-3",
    horodatage: "2026-09-17T16:22:00Z",
    acteur: {
      genre: "PERSONNE",
      libelle: "K. Houngbo",
      identifiant: "3c0b9a5e-7d42-48f1-83aa-14b6c9d2e507",
    },
    categorie: "REGLE",
    action: "Enregistrement d'un brouillon",
    objet: "Allemagne / Séjour études · version 5",
    detail: "Montant du compte bloqué : 11 208 € → 11 904 €",
    origine: "Back-office",
  },
  {
    id: "a-4",
    horodatage: "2026-09-16T11:04:00Z",
    acteur: {
      genre: "PERSONNE",
      libelle: "M. Agossou",
      identifiant: "8f21c4d0-1a7e-4c33-9b05-2ee1f0a77c31",
    },
    categorie: "COMPTE",
    action: "Recréditement d'analyses",
    objet: "l.gbaguidi@email.com",
    detail: "2 analyses rendues après pièces illisibles",
    origine: "Back-office",
  },
  {
    id: "a-5",
    horodatage: "2026-09-08T07:03:00Z",
    acteur: {
      genre: "PROCESSUS",
      libelle: "webhook:MOBILE_MONEY",
      identifiant: "webhook:MOBILE_MONEY",
    },
    categorie: "PAIEMENT",
    action: "Rapprochement automatique",
    objet: "IMP-2608-4390",
    detail: "Transaction MP260908.0702 · 5 000 F",
    origine: "Webhook MTN MoMo",
  },
];
