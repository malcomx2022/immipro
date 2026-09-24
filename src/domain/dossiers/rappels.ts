/**
 * Les rappels d'échéance — WF-09 étape 3, RG-09.2, branchés le 22/09/2026.
 *
 * ── Ce qui attendait, et ce qui n'attend plus ───────────────────────
 *
 * La file `echeancier.rappel` était déclarée avec ce motif : « personne
 * n'y poste encore, **l'envoi attend la messagerie** ». Le transport SMTP
 * est branché depuis le 22/09 au matin, et la phrase est devenue fausse
 * sans que rien ne bouge. Exécuté :
 *
 *     échéances en base       : 3
 *       dont dépassée         : test_langue, il y a 3 jours
 *       dont à moins de 7 j   : rdv_consulaire, dans 4 jours
 *     transport de courrier   : SMTP (branché)
 *     un ouvrier la traite ?  : non
 *     quelqu'un y poste ?     : personne
 *     notifications d'échéance: 0
 *
 * Un candidat dont une échéance est passée depuis trois jours ne reçoit
 * rien, et l'écran lui dit de revenir regarder — ce qui est honnête, et
 * ce qui est exactement ce qu'un échéancier existe pour éviter.
 *
 * ── La cadence, et pourquoi elle est une règle et non un réglage ────
 *
 * RG-09.2 : « les rappels sont regroupés — un email hebdomadaire, sauf
 * urgence à moins de 7 jours ». Un rappel par échéance et par jour ferait
 * de la boîte du candidat un bruit qu'il coupe, et il couperait avec elle
 * celui qui comptait. Le groupement n'est donc pas une économie d'envois,
 * c'est ce qui garde le canal lisible.
 *
 * L'urgence échappe à la cadence, pas au groupement : deux échéances
 * urgentes le même jour partent dans le même courrier.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */
import { joursEntre } from "@/domain/dossiers/echeancier";

/** En deçà, une échéance n'attend plus la passe hebdomadaire. */
export const JOURS_URGENCE = 7;

/** La cadence ordinaire, en jours. Une semaine, comme le dit RG-09.2. */
export const CADENCE_JOURS = 7;

/**
 * Au-delà, une échéance dépassée ne se rappelle plus.
 *
 * Elle reste à l'écran — c'est l'échéancier qui en tient la trace —, mais
 * rappeler chaque semaine pendant six mois une date passée depuis
 * longtemps ne fait plus avancer personne : ce n'est plus un rappel,
 * c'est un reproche. Trente jours laissent le temps de réagir ou de
 * replanifier.
 */
export const JOURS_APRES_ECHEANCE = 30;

export interface EcheanceARappeler {
  code: string;
  libelle: string;
  /** Date de l'échéance, ISO `AAAA-MM-JJ`. */
  date: string;
  /** Faite : elle ne se rappelle plus, jamais. */
  faite: boolean;
  /** Dernier rappel qui la portait, ISO `AAAA-MM-JJ`, ou `null`. */
  rappeleeLe: string | null;
}

export interface DossierARappeler {
  /** Ce que le candidat verra dans l'objet : « Canada — permis d'études ». */
  intitule: string;
  echeances: readonly EcheanceARappeler[];
  /** Dernier envoi groupé pour ce dossier, ISO, ou `null`. */
  dernierRappelLe: string | null;
}

export type Motif = "urgence" | "hebdomadaire";

export interface Rappel {
  motif: Motif;
  /** Les échéances portées par ce courrier, dans l'ordre des dates. */
  echeances: readonly EcheanceARappeler[];
  objet: string;
  corps: string;
}

/**
 * Une échéance mérite-t-elle d'entrer dans un rappel aujourd'hui ?
 *
 * Trois refus, et chacun ferme une façon d'être inutile ou pénible :
 * une échéance faite n'a plus rien à dire ; une échéance dépassée depuis
 * longtemps n'est plus une alerte ; une échéance lointaine n'a pas à
 * occuper la place.
 */
export function echeanceVivante(
  echeance: EcheanceARappeler,
  aujourdhui: string,
  horizonJours: number,
): boolean {
  if (echeance.faite) return false;
  const jours = joursEntre(aujourdhui, echeance.date);
  if (jours < -JOURS_APRES_ECHEANCE) return false;
  return jours <= horizonJours;
}

/**
 * Urgente : à moins de `joursUrgence` jours, ou déjà dépassée.
 *
 * Sept par défaut, comme le dit RG-09.2 ; le candidat peut choisir trois
 * ou quatorze depuis ses préférences (S.87, `DELAIS_D_ALERTE`).
 */
export const echeanceUrgente = (
  echeance: EcheanceARappeler,
  aujourdhui: string,
  joursUrgence: number = JOURS_URGENCE,
): boolean => joursEntre(aujourdhui, echeance.date) <= joursUrgence;

/**
 * L'horizon d'un rappel hebdomadaire.
 *
 * Trente jours : de quoi voir venir ce qui demande des semaines — une
 * équivalence de diplôme, un test de langue — sans noyer la liste sous
 * des dates dont il n'y a rien à faire cette semaine.
 */
export const HORIZON_HEBDOMADAIRE_JOURS = 30;

/**
 * L'urgence de cette échéance a-t-elle déjà été annoncée ?
 *
 * ── Le défaut que cette fonction ferme ──────────────────────────────
 *
 * La condition était `rappeleeLe === null` : une échéance qu'un courrier
 * avait touchée une fois n'entrait plus jamais dans une urgence. Or la
 * passe hebdomadaire marque `remindedAt` sur **toutes** les échéances
 * qu'elle porte, et son horizon est de trente jours quand l'urgence
 * commence à sept : toute échéance est donc portée par une passe
 * hebdomadaire des semaines avant de devenir urgente. Le chemin
 * d'urgence n'était atteignable que par une échéance née à moins de sept
 * jours de sa date. Constaté en exécution, échéance au 20 octobre :
 *
 *     25/09  passe hebdomadaire   -> hebdomadaire, remindedAt = 25/09
 *     13/10  (J-7, urgente)       -> hebdomadaire
 *     15/10  (J-5, urgente)       -> hebdomadaire
 *     19/10  (J-1, urgente)       -> hebdomadaire
 *     21/10  (dépassée)           -> hebdomadaire
 *
 * Et quand la cadence n'était pas écoulée, plus rien du tout :
 *
 *     12/10  passe hebdomadaire
 *     13/10 (J-3) .. 17/10 (J+1)  -> AUCUN COURRIER
 *
 * « L'urgence échappe à la cadence » était écrit en tête du module et ne
 * se produisait pas. Un rendez-vous consulaire à trois jours pouvait
 * n'être annoncé que par la passe du lundi suivant, c'est-à-dire après.
 *
 * ── Ce que la date du dernier rappel dit réellement ─────────────────
 *
 * `rappeleeLe` ne dit pas « l'urgence a été annoncée », il dit « un
 * courrier portait cette échéance ce jour-là ». La question se répond en
 * regardant **à quelle distance** de la date ce courrier est parti : un
 * rappel envoyé alors qu'il restait vingt-cinq jours n'a pas annoncé une
 * urgence, il a listé une échéance à venir. Aucune donnée nouvelle n'est
 * nécessaire — la distance se lit entre les deux dates déjà en base.
 *
 * L'envoi unique que le module promet est conservé : une fois l'urgence
 * annoncée, `rappeleeLe` tombe dans la fenêtre et l'échéance ne repart
 * pas le lendemain. Elle continue de figurer dans la passe hebdomadaire,
 * qui porte tout ce qui vient dans le mois.
 */
export function urgenceJamaisAnnoncee(
  echeance: EcheanceARappeler,
  joursUrgence: number = JOURS_URGENCE,
): boolean {
  if (echeance.rappeleeLe === null) return true;
  return joursEntre(echeance.rappeleeLe, echeance.date) > joursUrgence;
}

/**
 * Ce qu'il faut envoyer à ce dossier aujourd'hui, ou rien.
 *
 * L'urgence passe en premier et **ignore la cadence** : une échéance à
 * quatre jours ne peut pas attendre la passe de lundi prochain. Elle est
 * envoyée une fois — `rappeleeLe` l'empêche de repartir chaque jour
 * jusqu'à la date, ce qui est la façon la plus sûre de se faire filtrer.
 *
 * À défaut d'urgence, la passe hebdomadaire, si la précédente a une
 * semaine. Elle porte tout ce qui vient dans le mois, urgences comprises
 * — un candidat qui reçoit un courrier veut y voir l'ensemble, pas une
 * ligne.
 */
export function rappelDuJour(
  dossier: DossierARappeler,
  aujourdhui: string,
  /** Le délai d'alerte choisi par le candidat — RG-09.2 par défaut. */
  joursUrgence: number = JOURS_URGENCE,
): Rappel | null {
  const vivantes = (horizon: number) =>
    dossier.echeances
      .filter((e) => echeanceVivante(e, aujourdhui, horizon))
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));

  const urgentes = vivantes(joursUrgence).filter((e) =>
    echeanceUrgente(e, aujourdhui, joursUrgence),
  );

  /*
    Une urgence déjà annoncée ne repart pas. La comparaison porte sur la
    date du dernier rappel **de cette échéance-là** : sans elle, la
    passe quotidienne renverrait le même courrier tous les jours jusqu'à
    l'échéance, et le candidat apprendrait à ne plus l'ouvrir. Et elle
    porte sur la distance à la date, non sur la seule présence d'un
    rappel — un courrier parti un mois avant n'a annoncé aucune urgence.
  */
  const nouvelles = urgentes.filter((e) => urgenceJamaisAnnoncee(e, joursUrgence));
  if (nouvelles.length > 0) {
    const portees = vivantes(joursUrgence);
    return {
      motif: "urgence",
      echeances: portees,
      objet: objetUrgence(dossier, portees, aujourdhui),
      corps: corps(dossier, portees, aujourdhui, "urgence"),
    };
  }

  const ecoule =
    dossier.dernierRappelLe === null
      ? Infinity
      : joursEntre(dossier.dernierRappelLe, aujourdhui);
  if (ecoule < CADENCE_JOURS) return null;

  const portees = vivantes(HORIZON_HEBDOMADAIRE_JOURS);
  if (portees.length === 0) return null;

  return {
    motif: "hebdomadaire",
    echeances: portees,
    objet: `${dossier.intitule} — ${portees.length} ${portees.length > 1 ? "échéances à venir" : "échéance à venir"}`,
    corps: corps(dossier, portees, aujourdhui, "hebdomadaire"),
  };
}

const objetUrgence = (
  dossier: DossierARappeler,
  portees: readonly EcheanceARappeler[],
  aujourdhui: string,
): string => {
  const depassees = portees.filter((e) => joursEntre(aujourdhui, e.date) < 0);
  return depassees.length > 0
    ? `${dossier.intitule} — ${depassees.length > 1 ? "des échéances sont dépassées" : "une échéance est dépassée"}`
    : `${dossier.intitule} — ${portees.length > 1 ? "des échéances arrivent" : "une échéance arrive"}`;
};

/**
 * Le corps du courrier.
 *
 * Chaque ligne porte **le délai et la date**, pas l'un ou l'autre : « dans
 * 4 jours » seul oblige à compter, « le 26 septembre » seul oblige à
 * regarder un calendrier. Et aucune ligne ne dit ce qui arrivera si la
 * date passe : la plateforme informe et prépare, elle ne se prononce pas
 * sur l'issue d'une démarche (INV-1).
 */
function corps(
  dossier: DossierARappeler,
  portees: readonly EcheanceARappeler[],
  aujourdhui: string,
  motif: Motif,
): string {
  const lignes = portees.map((e) => `- ${e.libelle} — ${delai(aujourdhui, e.date)}, le ${enClair(e.date)}`);
  const entree =
    motif === "urgence"
      ? "Une échéance de ton dossier demande une action rapide."
      : "Voici où en sont les échéances de ton dossier.";
  return [
    entree,
    "",
    ...lignes,
    "",
    "Ouvre ton échéancier pour voir le détail de chaque date et ce qu'elle demande.",
    /*
      Le courrier dit d'où il vient et comment l'arrêter. Un rappel qu'on
      ne sait pas couper se fait classer en indésirable, et le filtre
      emporte ensuite les courriers qui comptaient.
    */
    MENTION_REGLAGE,
  ].join("\n");
}

/** La dernière ligne de chaque rappel : d'où il vient, et où il se règle. */
export const MENTION_REGLAGE =
  "Tu reçois ce rappel parce que tes rappels d'échéance sont activés. Tu peux les régler ou les couper depuis ton compte, rubrique « Rappels ».";

/** « dans 4 jours », « aujourd'hui », « dépassée de 3 jours ». */
export function delai(aujourdhui: string, date: string): string {
  const jours = joursEntre(aujourdhui, date);
  if (jours === 0) return "aujourd'hui";
  if (jours < 0) return `dépassée de ${-jours} ${-jours > 1 ? "jours" : "jour"}`;
  return `dans ${jours} ${jours > 1 ? "jours" : "jour"}`;
}

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** « 26 septembre 2026 ». Écrit, jamais `26/09` : le format se lit de deux façons. */
export function enClair(date: string): string {
  const [annee, mois, jour] = date.slice(0, 10).split("-");
  return `${Number(jour)} ${MOIS[Number(mois) - 1]} ${annee}`;
}
