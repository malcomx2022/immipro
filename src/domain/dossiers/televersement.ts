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
 * nombre de jetons : les jetons sont une mesure d'exploitation, le
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

/**
 * Sans pack, il n'y a pas d'analyses « utilisées » : il n'y en a jamais eu.
 * La phrase disait « Tes 0 analyses du pack sans pack sont utilisées »
 * (test du 03/10/2026).
 */
export const titreQuotaEpuise = (quota: Quota): string =>
  quota.total <= 0
    ? "Aucune analyse n'est incluse tant que le dossier n'a pas de pack"
    : `Tes ${quota.total} analyses du pack ${quota.pack} sont utilisées`;

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
 * Ce que l'écran dit du sort de la pièce pendant l'envoi.
 *
 * Il l'affirmait sans condition : « L'analyse démarre automatiquement à la
 * fin. » Or le serveur répond `analyseraLaPiece` à chacun des deux appels
 * du dépôt, précisément pour que l'écran sache si elle suivra — et
 * **personne ne lisait ce champ**. Avec un quota épuisé, le balayage promeut
 * le fichier et l'analyse ne part jamais : la phrase était fausse au moment
 * où la personne dépense ses données mobiles.
 *
 * RG-06.5 tient les deux formulations : le quota n'interdit pas le dépôt,
 * il n'interdit que l'analyse. La pièce est conservée dans les deux cas, et
 * c'est ce qu'il faut dire d'abord.
 *
 * Rien pour l'après : la confirmation recharge la page, et c'est l'état
 * réel de la pièce que le serveur rend alors. Une phrase de plus, gardée
 * dans l'état du navigateur, dirait ce que la page vient de dire — ou le
 * contredirait.
 */
export const mentionPendantEnvoi = (analysera: boolean): string =>
  analysera
    ? "Tu peux continuer à remplir ton dossier pendant l'envoi. L'analyse démarre automatiquement à la fin."
    : "Tu peux continuer à remplir ton dossier pendant l'envoi. Ta pièce sera conservée sans être analysée : tes analyses du pack sont utilisées.";

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
    // Le conseil qui suit vaut pour toutes les pièces. Celui qui ne vaut que
    // pour un relevé — « le PDF de ton application bancaire se lit mieux
    // qu'une photo » — vit dans `Piece.astuce`, où il ne s'affiche que sous
    // la pièce concernée. Le lire sous un passeport ferait douter du reste.
    return `Le format « .${ext} » n'est pas lu. Envoie un PDF, un JPG ou un PNG : un PDF d'origine se lit toujours mieux qu'une photo d'écran.`;
  }
  if (fichier.octets > TAILLE_MAXI_MO * OCTETS_PAR_MO) {
    return `Ton fichier fait ${enMo(fichier.octets)} Mo, la limite est de ${TAILLE_MAXI_MO} Mo. Enregistre le PDF en qualité moyenne, ou photographie les pages une par une.`;
  }
  if (fichier.octets === 0) {
    return "Le fichier est vide. Vérifie qu'il s'est bien enregistré sur ton téléphone, puis recommence.";
  }
  return null;
}

/* ── La clé d'un dépôt — revue du 07/10/2026, M1 ────────────────────── */

/**
 * Le préfixe de toutes les clés d'une pièce : le dossier, puis la pièce.
 *
 * La clé est fabriquée par le serveur à la préparation du dépôt, et le
 * navigateur la renvoie à la confirmation. La confirmation l'acceptait
 * telle quelle : avec la clé d'un autre candidat, le balayage promouvait
 * son fichier sous un autre dossier et le rendait lisible, ou la purge du
 * mauvais dossier l'effaçait. Le préfixe se vérifie donc au retour, et il
 * n'a qu'une définition, ici.
 */
export const prefixeDeDepot = (applicationId: string, codePiece: string): string =>
  `dossiers/${applicationId}/${codePiece}/`;

/** Ce qui suit le préfixe : l'horodatage du dépôt, puis seize caractères tirés au hasard. */
const SUFFIXE_DE_DEPOT = /^\d{13}-[A-Za-z0-9_-]{16}$/u;

/** La clé désigne-t-elle un dépôt préparé pour cette pièce de ce dossier ? */
export function cleDeDepotValide(cle: string, applicationId: string, codePiece: string): boolean {
  const prefixe = prefixeDeDepot(applicationId, codePiece);
  return cle.startsWith(prefixe) && SUFFIXE_DE_DEPOT.test(cle.slice(prefixe.length));
}

const enKo = (octets: number) => Math.max(1, Math.round(octets / 1024)).toLocaleString("fr-FR");

/** Ce que la confirmation dit quand elle refuse, et ce qu'il faut refaire. */
export const REFUS_DE_LA_CONFIRMATION = {
  cle: "Ce dépôt ne correspond pas au lien d'envoi préparé pour cette pièce. Relance l'envoi depuis ta checklist.",
  absent:
    "Le fichier n'est pas arrivé dans l'espace de dépôt. Le lien d'envoi est valable cinq minutes : relance l'envoi depuis ta checklist.",
  taille: (recus: number, annonces: number) =>
    `Le fichier reçu fait ${enKo(recus)} Ko, ta demande en annonçait ${enKo(annonces)} Ko : l'envoi a été interrompu. Relance-le depuis ta checklist.`,
} as const;

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
