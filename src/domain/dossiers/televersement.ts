/**
 * Téléversement d'une pièce — C-07, WF-06 avec RG-06.5 pour le quota.
 *
 * Quatre états commutables, dont deux que l'utilisateur ne provoque pas :
 * le quota épuisé et la perte de réseau. Ils se codent avec l'écran, pas
 * après : ce sont ceux qui décident si la personne abandonne ou non.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type EtatTeleversement = "PRET" | "ENVOI" | "QUOTA_EPUISE" | "RESEAU_COUPE";

/** Formats lus par l'analyse. Tout le reste est refusé avant l'envoi. */
export const FORMATS_ACCEPTES = ["pdf", "jpg", "jpeg", "png"] as const;
export const TAILLE_MAXI_MO = 10;
const OCTETS_PAR_MO = 1024 * 1024;

export interface Quota {
  /** Analyses restantes sur le quota du pack. */
  restantes: number;
  total: number;
  /** Libellé du pack qui porte le quota : « Dossier ». */
  pack: string;
}

export const quotaEpuise = (quota: Quota): boolean => quota.restantes <= 0;

/**
 * « Analyses restantes : 12 sur 30 ». Un compteur d'analyses, jamais un
 * nombre de jetons : le quota de tokens est une donnée d'exploitation, le
 * candidat compte des pièces (INV-6, lu côté écran).
 */
export const libelleQuota = (quota: Quota): string =>
  `Analyses restantes : ${quota.restantes} sur ${quota.total}`;

/**
 * Le quota épuisé ne ferme pas le dossier. Téléverser et conserver reste
 * possible : c'est l'analyse automatique qui s'arrête, pas le dépôt.
 *
 * Le prix de la recharge arrive formaté par l'appelant : la grille tarifaire
 * est une donnée de `domain/payments`, et le domaine ne met pas en forme une
 * devise.
 */
export const messageQuotaEpuise = (volume: number, prixRecharge: string): string =>
  `Tu peux toujours téléverser et conserver tes pièces, sans vérification automatique. Une recharge de ${volume} analyses coûte ${prixRecharge}.`;

export const titreQuotaEpuise = (quota: Quota): string =>
  `Tes ${quota.total} analyses du pack ${quota.pack} sont utilisées`;

/** Libellé du bouton principal, par état. */
export function libelleCta(etat: EtatTeleversement): string {
  switch (etat) {
    case "ENVOI":
      return "Envoi en cours…";
    case "RESEAU_COUPE":
      return "Réessayer l'envoi";
    default:
      return "Ajouter la pièce";
  }
}

/** Mention de pied, par état. Elle dit ce qui reste possible. */
export function mentionPied(etat: EtatTeleversement): string {
  switch (etat) {
    case "QUOTA_EPUISE":
      return "Téléversement toujours possible sans analyse";
    case "RESEAU_COUPE":
      return "Envoi automatique dès le retour du réseau";
    default:
      return `Formats acceptés : PDF, JPG, PNG · ${TAILLE_MAXI_MO} Mo maximum`;
  }
}

/**
 * Pendant l'envoi, le bouton passe en chargement — pas en désactivé. Le
 * libellé reste écrit et `aria-busy` porte l'état : un bouton gris sans
 * explication est un défaut (règle de désactivation 3).
 */
export const envoiEnCours = (etat: EtatTeleversement): boolean => etat === "ENVOI";

export interface Fichier {
  nom: string;
  octets: number;
}

const enMo = (octets: number) =>
  (octets / OCTETS_PAR_MO).toLocaleString("fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

const extension = (nom: string) => nom.split(".").pop()?.toLowerCase() ?? "";

/**
 * Refus avant l'envoi. Le message dit la mesure constatée, l'exigence, puis
 * ce qu'il y a à faire — jamais « fichier non conforme » (§3.5).
 *
 * `null` quand le fichier passe.
 */
export function refusDuFichier(fichier: Fichier): string | null {
  const ext = extension(fichier.nom);
  if (!FORMATS_ACCEPTES.includes(ext as (typeof FORMATS_ACCEPTES)[number])) {
    return `Le format « .${ext} » n'est pas lu. Envoie un PDF, un JPG ou un PNG : le PDF téléchargé depuis ton application bancaire se lit toujours mieux qu'une photo.`;
  }
  if (fichier.octets > TAILLE_MAXI_MO * OCTETS_PAR_MO) {
    return `Ton fichier fait ${enMo(fichier.octets)} Mo, la limite est de ${TAILLE_MAXI_MO} Mo. Enregistre le PDF en qualité moyenne, ou photographie les pages une par une.`;
  }
  if (fichier.octets === 0) {
    return "Le fichier est vide. Vérifie qu'il s'est bien enregistré sur ton téléphone, puis recommence.";
  }
  return null;
}

/** « releve-bancaire.pdf · 1,8 Mo » — la ligne d'identification de l'envoi. */
export const libelleFichier = (fichier: Fichier): string =>
  `${fichier.nom} · ${enMo(fichier.octets)} Mo`;

/**
 * Avancement de l'envoi, en volume et non en part.
 *
 * Le prototype écrivait « 62 % envoyés ». Un pourcentage sur un écran de
 * dossier est précisément ce que l'arbitrage C-09 retire : il se relit comme
 * une note. Le volume dit la même chose, se compare à la taille annoncée
 * juste au-dessus, et ne se confond avec rien.
 */
export function libelleAvancement(envoyes: number, total: number, secondes: number): string {
  return `${enMo(envoyes)} Mo envoyés sur ${enMo(total)} Mo · environ ${secondes} secondes restantes sur ta connexion`;
}

/** Trois conseils de prise de vue — C-07, section « Pour une photo lisible ». */
export const CONSEILS_PHOTO: readonly string[] = [
  "Pose le document à plat sur une surface claire, près d'une fenêtre.",
  "Cadre les quatre coins, sans rogner les bords ni le cachet.",
  "Coupe le flash : il crée un reflet qui masque les montants.",
];

export const CADRAGES: readonly { illustration: string; legende: string }[] = [
  { illustration: "/illustrations/cadrage-bon.svg", legende: "À plat — attendu" },
  { illustration: "/illustrations/cadrage-incline.svg", legende: "Incliné — à éviter" },
  { illustration: "/illustrations/cadrage-reflet.svg", legende: "Reflet — à éviter" },
];
