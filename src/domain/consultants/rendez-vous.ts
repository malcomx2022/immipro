import {
  CONSULTATION_ANNULATION_HEURES,
  CONSULTATION_DUREE_MINUTES,
} from "@/domain/payments/pricing";

/**
 * Prise de rendez-vous — T-05, WF-12.
 *
 * Quatre décisions du 13/09/2026 se posent ici, et toutes viennent d'ailleurs
 * plutôt que d'être réécrites : le tarif unique et la durée sortent de la
 * grille, le délai d'annulation aussi, et ce que le consultant verra sort du
 * modèle de droits (`access.ts`). Un écran de réservation qui redéclare ses
 * propres montants finit par facturer autre chose que ce qu'il annonce.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export interface Creneau {
  /** Début du rendez-vous, ISO avec fuseau. */
  debut: string;
  /** Faux quand il vient d'être pris par quelqu'un d'autre. */
  disponible: boolean;
}

/** Durée pendant laquelle un créneau reste tenu après sélection, en minutes. */
export const TENUE_MINUTES = 10;

export const MENTION_TENUE = `Le créneau est tenu ${TENUE_MINUTES} minutes.`;

export interface JourDeCreneaux {
  /** `AAAA-MM-JJ`, clé de rendu. */
  cle: string;
  /** « jeu. ». */
  jourCourt: string;
  /** « 17 sept. ». */
  dateCourte: string;
  creneaux: Creneau[];
}

const FORMAT_JOUR = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  timeZone: "UTC",
});
const FORMAT_DATE = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const FORMAT_HEURE = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

/** « 15 h 30 ». */
export const libelleHeure = (creneau: Creneau): string =>
  FORMAT_HEURE.format(new Date(creneau.debut)).replace(":", " h ");

/** Groupement par jour, dans l'ordre chronologique. */
export function grouperParJour(creneaux: readonly Creneau[]): JourDeCreneaux[] {
  const jours = new Map<string, JourDeCreneaux>();
  for (const creneau of [...creneaux].sort((a, b) => a.debut.localeCompare(b.debut))) {
    const cle = creneau.debut.slice(0, 10);
    if (!jours.has(cle)) {
      const date = new Date(creneau.debut);
      jours.set(cle, {
        cle,
        jourCourt: FORMAT_JOUR.format(date),
        dateCourte: FORMAT_DATE.format(date),
        creneaux: [],
      });
    }
    jours.get(cle)!.creneaux.push(creneau);
  }
  return [...jours.values()];
}

export const creneauxDisponibles = (creneaux: readonly Creneau[]): Creneau[] =>
  creneaux.filter((c) => c.disponible);

/**
 * Date limite d'annulation sans frais : le délai de la grille avant le
 * créneau. Passé ce délai, la consultation est due — et c'est écrit avant la
 * confirmation, pas seulement après.
 */
export const limiteAnnulation = (creneau: Creneau): string =>
  new Date(
    new Date(creneau.debut).getTime() - CONSULTATION_ANNULATION_HEURES * 3_600_000,
  ).toISOString();

/**
 * Conditions affichées sous les créneaux. Le montant arrive mis en forme :
 * le domaine ne met pas une devise en forme.
 */
export const conditions = (prixFormate: string): string =>
  `${prixFormate}, réglés à ImmiPro. Annulation ou report sans frais jusqu'à ${CONSULTATION_ANNULATION_HEURES} h avant le créneau ; passé ce délai, la consultation est due.`;

export const libelleFormat = (): string =>
  `${CONSULTATION_DUREE_MINUTES} minutes en visioconférence`;

const FORMAT_LIMITE = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/**
 * « vendredi 19 septembre à 15 h 30 ».
 *
 * L'heure est indispensable : la limite tombe à l'heure du créneau moins le
 * délai, pas en fin de journée. Écrite au jour près, elle ferait annuler
 * trop tard quelqu'un qui s'y fie — et la consultation serait due.
 */
export function libelleLimiteAnnulation(creneau: Creneau): string {
  const limite = new Date(limiteAnnulation(creneau));
  return `${FORMAT_LIMITE.format(limite)} à ${FORMAT_HEURE.format(limite).replace(":", " h ")}`;
}

/**
 * Le décalage entre le fuseau du candidat et celui du consultant, énoncé
 * plutôt que masqué. Convertir en silence fait manquer le rendez-vous à qui
 * vérifie l'heure sur un autre support.
 */
export const mentionFuseau = (villeCandidat: string, villeConsultant: string): string =>
  `Les horaires sont donnés dans ton fuseau, ${villeCandidat}. Le consultant est à ${villeConsultant}.`;

export interface Confirmation {
  reference: string;
  creneau: Creneau;
  consultant: string;
  dossier: string;
}

const FORMAT_LONG = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** « Jeudi 17 septembre, 15 h 30 ». */
export function libelleRendezVous(creneau: Creneau): string {
  const date = new Date(creneau.debut);
  const jour = FORMAT_LONG.format(date);
  return `${jour.charAt(0).toUpperCase()}${jour.slice(1)}, ${libelleHeure(creneau)}`;
}

/**
 * Rien ne se confirme sans accord d'accès ni créneau disponible. La règle est
 * ici pour que le bouton et le serveur appliquent la même condition.
 */
export const peutConfirmer = (accordDonne: boolean, creneau: Creneau | null): boolean =>
  accordDonne && creneau !== null && creneau.disponible;

/**
 * Hors ligne, aucune disponibilité n'est montrée. Un horaire affiché depuis
 * un cache est peut-être déjà pris : le candidat le choisirait, et la
 * confirmation échouerait au pire moment.
 */
export const MESSAGE_HORS_LIGNE =
  "Tu es hors ligne. Aucune disponibilité n'est montrée plutôt qu'un horaire déjà pris par quelqu'un d'autre.";

export const RESTE_ACCESSIBLE_HORS_LIGNE =
  "Le reste de ton dossier fonctionne hors ligne : ta checklist, tes pièces déjà déposées et ton échéancier restent consultables.";

/**
 * Référence de rendez-vous, dérivée du créneau et du consultant.
 *
 * Déterministe : la même réservation rejouée porte la même référence, ce qui
 * rend la confirmation idempotente comme le paiement qui la précède (INV-7).
 * Une référence tirée au hasard produirait deux rendez-vous pour un double
 * envoi.
 */
export function referenceRendezVous(creneau: Creneau, consultantId: string): string {
  const date = new Date(creneau.debut);
  const jour = String(date.getUTCDate()).padStart(2, "0");
  const mois = String(date.getUTCMonth() + 1).padStart(2, "0");
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  const empreinte = [...consultantId].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 997, 7);
  return `RDV-${jour}${mois}-${String(minutes).padStart(4, "0")}${String(empreinte).padStart(3, "0")}`;
}
