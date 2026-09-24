import type { Dossier } from "@/domain/dossiers/dossier";
import type { Piece } from "@/domain/dossiers/piece";
import { completudeDesPieces } from "@/domain/dossiers/piece";
import type { ResultatAnalyse } from "@/domain/dossiers/analyse";
import type { Echeance } from "@/domain/dossiers/echeancier";
import { dateAuPlusTot } from "@/domain/dossiers/echeancier";
import type { Quota } from "@/domain/dossiers/televersement";
import { ALLEMAGNE, PAYS_BAS } from "./destinations";

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
 * Dossiers de démonstration — provisoires, comme les fiches destination.
 *
 * Ils viendront de la base une fois le schéma dérivé de DOC-11. Les écrans ne
 * connaissent que les types du domaine : seul ce fichier changera.
 *
 * La complétude n'est plus écrite à la main : elle se calcule depuis la
 * checklist, par le même code que le back-office. Le tableau de bord, la
 * checklist et l'écran de complétude comptent donc la même chose, et une
 * pièce ajoutée ici se voit partout sans qu'on ait à mettre trois compteurs
 * d'accord.
 */

const DEPOT_NL = "2027-01-15";

/**
 * La date **cible** — rentrée —, dépôt plus le délai d'instruction
 * néerlandais de 90 jours. Le jeu de démonstration portait la date de
 * dépôt sous le champ de la cible, si bien que les écrans montraient la
 * même date des deux côtés et que l'écart ne se voyait jamais.
 */
const DEPART_NL = "2027-04-15";

export const PIECES_NL: readonly Piece[] = [
  {
    id: "passeport",
    code: "ID",
    libelle: "Passeport",
    famille: "OBLIGATOIRE",
    etat: "A_CORRIGER",
    remede: "DEMARCHE",
    message:
      "Ton passeport expire 4 mois après la date de retour prévue, il en faut 6. Lance le renouvellement avant de déposer.",
    constat:
      "Validité restante après retour : 4 mois. Minimum exigé : 6 mois. Renouvellement à engager.",
  },
  {
    id: "diplome",
    code: "DIP",
    libelle: "Diplôme du baccalauréat",
    famille: "OBLIGATOIRE",
    etat: "CONFORME",
    remede: "DEMARCHE",
  },
  {
    id: "releves-de-notes",
    code: "REL",
    libelle: "Relevés de notes, trois dernières années",
    famille: "OBLIGATOIRE",
    etat: "CONFORME",
    remede: "TELEVERSER",
  },
  {
    id: "attestation-de-ressources",
    code: "FIN",
    libelle: "Attestation de ressources",
    famille: "OBLIGATOIRE",
    etat: "A_CORRIGER",
    remede: "REMPLACER",
    message:
      "Le relevé montre 10 000 € disponibles, l'IND en exige 13 569,24 € pour l'année. Téléverse un relevé plus récent, ou ajoute une attestation de prise en charge d'un garant.",
    constat:
      "Solde constaté : 10 000 €. Montant exigé : 13 569,24 € pour l'année. Nouveau relevé à fournir.",
    astuce:
      "Le PDF téléchargé depuis ton application bancaire évite la photo, et se lit toujours mieux.",
  },
  {
    id: "lettre-admission",
    code: "ADM",
    libelle: "Lettre d'admission de l'établissement",
    famille: "OBLIGATOIRE",
    etat: "CONFORME",
    remede: "TELEVERSER",
  },
  {
    id: "test-anglais",
    code: "LNG",
    libelle: "Test d'anglais IELTS",
    famille: "COMPLEMENTAIRE",
    etat: "CONFORME",
    remede: "TELEVERSER",
    perimeLe: "2027-03-03",
  },
  {
    id: "lettre-motivation",
    code: "MOT",
    libelle: "Lettre de motivation",
    famille: "COMPLEMENTAIRE",
    etat: "ATTENDUE",
    remede: "REDIGER",
    message:
      "Tu peux la rédiger avec l'entretien guidé, puis la relire ligne par ligne.",
    constat: "Rédaction possible via l'entretien guidé, avec relecture critique.",
  },
  {
    id: "photo-identite",
    code: "PHO",
    libelle: "Photo d'identité aux normes",
    famille: "COMPLEMENTAIRE",
    etat: "ILLISIBLE",
    remede: "TELEVERSER",
    message:
      "La photo est floue sur les bords. Reprends-la de face, sur un mur clair, sans flash.",
    constat:
      "Netteté insuffisante sur les bords. Nouvelle prise de vue requise : de face, fond clair, sans flash.",
  },
];

/**
 * Brouillon : la checklist existe, rien n'a encore été déposé. C'est le seul
 * cas où toutes les pièces sont attendues, et il ne doit pas se lire comme un
 * dossier en retard (C-05).
 */
export const PIECES_DE: readonly Piece[] = [
  { id: "passeport", code: "ID", libelle: "Passeport", famille: "OBLIGATOIRE", etat: "ATTENDUE", remede: "TELEVERSER" },
  { id: "diplome", code: "DIP", libelle: "Diplôme", famille: "OBLIGATOIRE", etat: "ATTENDUE", remede: "TELEVERSER" },
  { id: "compte-bloque", code: "FIN", libelle: "Attestation de compte bloqué", famille: "OBLIGATOIRE", etat: "ATTENDUE", remede: "TELEVERSER" },
  { id: "admission", code: "ADM", libelle: "Lettre d'admission", famille: "OBLIGATOIRE", etat: "ATTENDUE", remede: "TELEVERSER" },
  { id: "assurance", code: "ASS", libelle: "Assurance maladie", famille: "OBLIGATOIRE", etat: "ATTENDUE", remede: "TELEVERSER" },
  { id: "lettre-motivation", code: "MOT", libelle: "Lettre de motivation", famille: "COMPLEMENTAIRE", etat: "ATTENDUE", remede: "REDIGER" },
];

export const PIECES_PAR_DOSSIER: Record<string, readonly Piece[]> = {
  "nl-4471": PIECES_NL,
  "de-8820": PIECES_DE,
};

export const DOSSIERS: readonly Dossier[] = [
  {
    id: "nl-4471",
    destination: PAYS_BAS,
    statut: "ACTIF",
    departVise: DEPART_NL,
    depot: DEPOT_NL,
    completude: completudeDesPieces(PIECES_NL),
    prochaineAction:
      "Remplacer ton passeport, sa validité est trop courte de deux mois.",
    limiteDeclaree: {
      constat: "Tu as déclaré un refus de visa Schengen en 2024.",
      raison:
        "Une demande après refus se justifie pièce par pièce, et c'est le genre de dossier où un consultant change réellement quelque chose.",
    },
  },
  {
    id: "de-8820",
    destination: ALLEMAGNE,
    statut: "BROUILLON",
    completude: completudeDesPieces(PIECES_DE),
    prochaineAction: "Fixer ta date de dépôt pour générer l'échéancier.",
  },
];

export const dossierParId = (id: string) => DOSSIERS.find((d) => d.id === id);

export const piecesDuDossier = (id: string): readonly Piece[] =>
  PIECES_PAR_DOSSIER[id] ?? [];

/** Quota d'analyses du pack acheté pour le dossier néerlandais (C-07, C-08). */
export const QUOTA: Quota = { restantes: 12, total: 30, pack: "Dossier" };

/**
 * Analyse de la dernière version de l'attestation de ressources (C-08).
 *
 * L'écart annoncé dans le titre est celui des deux montants affichés en
 * dessous. Le prototype en annonçait un troisième, ce qui fait douter le
 * candidat de la lecture entière au moment précis où on lui demande de s'y
 * fier assez pour signaler une erreur.
 */
export const ANALYSE_RESSOURCES: ResultatAnalyse = {
  verdict: "A_CORRIGER",
  fichier: "releve-bancaire.pdf",
  analyseeLe: "2026-09-11T09:38:00Z",
  pages: 3,
  titre: "Il manque 3 569,24 € sur le relevé",
  corps:
    "Le relevé montre 10 000 € disponibles, et l'IND en exige 13 569,24 € pour l'année. Téléverse un relevé plus récent, ou ajoute une attestation de prise en charge d'un garant.",
  champs: [
    { intitule: "Titulaire", valeur: "DOSSOU Aline" },
    { intitule: "Solde disponible", valeur: "10 000 €" },
    { intitule: "Date du relevé", valeur: "2 septembre 2026" },
  ],
  exigences: [
    {
      auChoix: false,
      exigences: [
        { intitule: "preuve fonds annuelle", valeur: "13 569,24 € · 8 901 000 F", bloquante: true },
      ],
    },
  ],
  mention: { source: "ind.nl", verifieeLe: "2026-09-01" },
};

/**
 * Échéancier du dossier néerlandais (C-10).
 *
 * La date du relevé bancaire n'est pas saisie : elle se calcule à rebours du
 * dépôt visé et de la validité de trois mois. Une date écrite à la main aurait
 * fait demander la pièce trop tôt, donc deux fois.
 */
export const ECHEANCES_NL: readonly Echeance[] = [
  {
    id: "renouvellement-passeport",
    date: "2026-09-18",
    titre: "Déposer la demande de renouvellement du passeport",
    detail: "Compte six à huit semaines de délai à la Direction de l'émigration.",
  },
  {
    id: "photo-identite",
    date: "2026-09-30",
    titre: "Reprendre la photo d'identité",
    detail: "La version actuelle est floue sur les bords.",
  },
  {
    id: "releve-bancaire",
    date: dateAuPlusTot(DEPOT_NL, 3),
    titre: "Demander le relevé bancaire",
    detail:
      "Au plus tôt à cette date : il doit avoir moins de trois mois le jour du dépôt.",
    perissable: true,
  },
  {
    id: "ielts",
    date: "2026-11-15",
    titre: "Refaire le test d'anglais si le dépôt glisse",
    detail:
      "Ton résultat IELTS arrive à échéance le 3 mars 2027, soit sept semaines après le dépôt visé.",
  },
  {
    id: "depot",
    date: DEPOT_NL,
    titre: "Dépôt du dossier",
    detail: "Toutes les pièces obligatoires doivent être conformes à cette date.",
    imposee: true,
  },
];

/** Alerte de changement de règle affichée sur C-01 (INV-8, WF-14). */
export const ALERTE_REGLE = {
  titre: "Une règle a changé pour l'Allemagne",
  texte:
    "Le montant du compte bloqué passe à 11 904 € au 1er janvier 2027. Ton dossier n'est pas encore concerné.",
  action: "Voir ce qui change",
} as const;
