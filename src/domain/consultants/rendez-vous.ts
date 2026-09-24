import { TENUE_MINUTES } from "./tenue";

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

/**
 * Le fuseau dans lequel les horaires sont écrits — I.E.
 *
 * Tous les formateurs de ce module écrivaient en UTC pendant que l'écran
 * annonçait « les horaires sont donnés dans ton fuseau, Cotonou ». Un
 * créneau de 16 h 30 s'affichait donc « 15 h 30 » sous une phrase qui
 * promettait l'heure locale : une heure d'écart sur un rendez-vous payé de
 * quarante-cinq minutes. Le défaut ne se voyait pas à la lecture du code —
 * chaque `timeZone: "UTC"` était correct en soi — mais seulement en
 * rapprochant les formateurs de la phrase.
 *
 * Une seule constante, parce qu'il faut qu'un seul endroit change le jour
 * où le fuseau suivra le candidat. Elle vaut pour le Bénin ; la plateforme
 * s'adresse à plus large, et c'est le point laissé ouvert.
 */
export const FUSEAU_AFFICHAGE = "Africa/Porto-Novo";

/**
 * Les horaires proposés, en heures **du fuseau d'affichage**.
 *
 * Ils étaient posés par `setUTCHours` dans la lecture serveur, pendant que
 * l'écran les rendait dans le fuseau d'affichage : la constante disait
 * 9, 11, 15 et 17 h, le candidat lisait 10, 12, 16 et 18 h. Le lot I.E avait
 * corrigé les formateurs sans corriger la source, et l'écart s'était
 * simplement déplacé : l'heure affichée était enfin vraie, mais ce n'était
 * plus celle que quelqu'un avait choisie.
 *
 * Ils vivent ici, et non plus dans la lecture, parce que la route de
 * réservation doit les relire : un horaire que l'écran ne propose pas ne se
 * réserve pas.
 */
export const JOURS_PROPOSES = 3;
export const HEURES_PROPOSEES = [9, 11, 15, 17] as const;

const FORMAT_PARTIES = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSEAU_AFFICHAGE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Avance du fuseau d'affichage sur UTC à cet instant, en millisecondes. */
function avanceDuFuseau(instant: number): number {
  const seconde = Math.floor(instant / 1000) * 1000;
  const parties = Object.fromEntries(
    FORMAT_PARTIES.formatToParts(new Date(seconde)).map((p) => [p.type, p.value]),
  );
  const lu = Date.UTC(
    Number(parties.year),
    Number(parties.month) - 1,
    Number(parties.day),
    Number(parties.hour),
    Number(parties.minute),
    Number(parties.second),
  );
  return lu - seconde;
}

/**
 * L'instant où il est `heure` h le jour `jour` (`AAAA-MM-JJ`) dans le fuseau
 * d'affichage. Le décalage est lu au fuseau plutôt que supposé à + 1 h : la
 * constante changera le jour où le fuseau suivra le candidat, et un fuseau à
 * heure d'été donne deux avances dans l'année. La seconde passe rattrape le
 * cas où l'heure visée et l'heure naïve tombent de part et d'autre d'un
 * changement d'heure.
 */
export function instantDuFuseau(jour: string, heure: number, minute = 0): Date {
  const [annee, mois, quantieme] = jour.split("-").map(Number);
  const naif = Date.UTC(annee!, mois! - 1, quantieme!, heure, minute);
  const premier = naif - avanceDuFuseau(naif);
  return new Date(naif - avanceDuFuseau(premier));
}

/** `AAAA-MM-JJ` décalé de `n` jours, au calendrier et non en heures. */
const jourPlus = (jour: string, n: number): string => {
  const [annee, mois, quantieme] = jour.split("-").map(Number);
  return new Date(Date.UTC(annee!, mois! - 1, quantieme! + n)).toISOString().slice(0, 10);
};

/**
 * Les créneaux offerts de `depuis` à `jusqua` jours après aujourd'hui.
 * « Aujourd'hui » est le jour du fuseau d'affichage : entre minuit à
 * Cotonou et une heure du matin, le jour UTC est encore la veille, et
 * « demain » aurait désigné le jour même.
 */
function creneauxEntre(maintenant: Date, depuis: number, jusqua: number): Date[] {
  const aujourdhui = jourAffiche(maintenant.toISOString());
  const proposes: Date[] = [];
  for (let n = depuis; n <= jusqua; n += 1) {
    const jour = jourPlus(aujourdhui, n);
    for (const heure of HEURES_PROPOSEES) proposes.push(instantDuFuseau(jour, heure));
  }
  return proposes;
}

/** Ce que l'écran de prise de rendez-vous propose, à partir de demain. */
export const creneauxProposes = (maintenant: Date): Date[] =>
  creneauxEntre(maintenant, 1, JOURS_PROPOSES);

/**
 * Un horaire se réserve s'il est à venir et fait partie de l'offre.
 *
 * La route acceptait toute date future : 9 h 01 échappait à l'unicité
 * `(consultant, créneau)` posée sur 9 h 00, et le même consultant se
 * retrouvait réservé deux fois sur des entretiens qui se chevauchent.
 *
 * Le jour même est admis : une page ouverte avant minuit et validée après
 * propose des horaires qui, entre-temps, sont devenus ceux d'aujourd'hui.
 * Les refuser ferait échouer une réservation que l'écran venait d'offrir ;
 * la condition « à venir » suffit à écarter ceux qui sont passés.
 */
export function estUnCreneauPropose(debut: Date, maintenant: Date): boolean {
  if (debut.getTime() <= maintenant.getTime()) return false;
  return creneauxEntre(maintenant, 0, JOURS_PROPOSES).some(
    (propose) => propose.getTime() === debut.getTime(),
  );
}

export interface Creneau {
  /** Début du rendez-vous, ISO avec fuseau. */
  debut: string;
  /** Faux quand il vient d'être pris par quelqu'un d'autre. */
  disponible: boolean;
}

/**
 * La durée de tenue vit dans `tenue.ts`, qui la fait tenir.
 *
 * Elle était déclarée ici, et cette phrase l'annonçait au candidat —
 * pendant que rien ne tenait quoi que ce soit : le rendez-vous naissait
 * confirmé, sans paiement, et aucune échéance n'existait en base. Une
 * durée affichée que personne n'applique est pire qu'un silence.
 */
export const MENTION_TENUE = `Le créneau est tenu ${TENUE_MINUTES} minutes, le temps du paiement.`;

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
  timeZone: FUSEAU_AFFICHAGE,
});
const FORMAT_DATE = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  timeZone: FUSEAU_AFFICHAGE,
});
const FORMAT_HEURE = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: FUSEAU_AFFICHAGE,
});

/**
 * La clé de groupement est le jour **tel qu'il s'affiche**, pas le jour
 * UTC. Les deux divergent d'un créneau de fin de soirée, qui se serait
 * rangé sous la veille tout en portant la date du lendemain.
 */
const FORMAT_CLE = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: FUSEAU_AFFICHAGE,
});

export const jourAffiche = (iso: string): string => FORMAT_CLE.format(new Date(iso));

/** « 15 h 30 ». */
export const libelleHeure = (creneau: Creneau): string =>
  FORMAT_HEURE.format(new Date(creneau.debut)).replace(":", " h ");

/** Groupement par jour, dans l'ordre chronologique. */
export function grouperParJour(creneaux: readonly Creneau[]): JourDeCreneaux[] {
  const jours = new Map<string, JourDeCreneaux>();
  for (const creneau of [...creneaux].sort((a, b) => a.debut.localeCompare(b.debut))) {
    const cle = jourAffiche(creneau.debut);
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
/**
 * « Report » a disparu de cette phrase, et c'est une correction.
 *
 * Elle l'annonçait — comme l'écran de confirmation et le courrier — sans
 * qu'aucun mécanisme ne déplace un rendez-vous, et sans qu'aucun
 * n'annule : `issueDeLAnnulation` n'avait que deux appelants, une lecture
 * d'écran et la suppression de compte. Le seul moyen d'annuler une
 * consultation était donc d'effacer son dossier.
 *
 * L'annulation existe désormais, et le décalage se fait en deux gestes
 * nommés — annuler avant la limite, reprendre un créneau — qui sont dits
 * là où on les exerce. La phrase promet ce qu'on tient : une annulation
 * sans frais, et l'endroit où elle se prend.
 */
export const conditions = (prixFormate: string): string =>
  `${prixFormate}, réglés à ImmiPro. Annulation sans frais jusqu'à ${CONSULTATION_ANNULATION_HEURES} h avant le créneau, depuis tes autorisations ; passé ce délai, la consultation est due.`;

export const libelleFormat = (): string =>
  `${CONSULTATION_DUREE_MINUTES} minutes en visioconférence`;

const FORMAT_LIMITE = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: FUSEAU_AFFICHAGE,
});

/**
 * « vendredi 19 septembre à 15 h 30 ».
 *
 * L'heure est indispensable : la limite tombe à l'heure du créneau moins le
 * délai, pas en fin de journée. Écrite au jour près, elle ferait annuler
 * trop tard quelqu'un qui s'y fie — et la consultation serait due.
 */
export function libelleLimite(iso: string): string {
  const limite = new Date(iso);
  return `${FORMAT_LIMITE.format(limite)} à ${FORMAT_HEURE.format(limite).replace(":", " h ")}`;
}

/**
 * La même limite, calculée depuis le créneau. Avant la réservation, c'est
 * la seule source ; après, le serveur renvoie la valeur qu'il a stockée, et
 * c'est elle qui s'affiche — la grille peut avoir changé entre-temps, la
 * condition acceptée ce jour-là, non.
 */
export const libelleLimiteAnnulation = (creneau: Creneau): string =>
  libelleLimite(limiteAnnulation(creneau));

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
  timeZone: FUSEAU_AFFICHAGE,
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
