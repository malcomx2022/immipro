/**
 * Les préférences de rappel d'échéance — S.87, WF-09 étape 3, RG-09.2 et
 * RG-09.4.
 *
 * ── Ce qui manquait ─────────────────────────────────────────────────
 *
 * Les rappels partaient à tout candidat, à sept heures UTC, sans qu'il
 * puisse les couper. L'échéancier avait perdu son lien « les modifier »
 * parce qu'aucun réglage n'existait : un lien vers rien est une promesse
 * fausse. Ce module est le réglage, et il ne décide que quatre choses —
 * les plus petites qui rendent le rappel supportable :
 *
 * 1. **l'activation** — un seul interrupteur, coupé il coupe tout ;
 * 2. **le canal email** — la notification dans l'application est
 *    toujours écrite quand les rappels sont actifs, l'email s'y ajoute
 *    ou non. Et l'écran ne l'annonce que si le transport est
 *    **opérationnel** (un constat réel et frais, pas une variable posée) ;
 * 3. **le fuseau** — le rappel part à huit heures **chez le candidat** ;
 * 4. **le délai d'alerte** — trois, sept ou quatorze jours avant une
 *    échéance. Sept est la valeur de RG-09.2.
 *
 * Aucun SMS : DOC-11 le prévoit pour les échéances critiques, aucun
 * fournisseur n'est branché, et un réglage qui le proposerait mentirait.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */
import { FUSEAU_AFFICHAGE, fuseauReconnu } from "@/domain/format/fuseau";
import { JOURS_URGENCE } from "@/domain/dossiers/rappels";

/** L'heure locale à partir de laquelle le rappel du jour peut partir. */
export const HEURE_DES_RAPPELS = 8;

/** Les délais d'alerte proposés. Sept est la valeur de RG-09.2. */
export const DELAIS_D_ALERTE = [3, 7, 14] as const;
export type DelaiDAlerte = (typeof DELAIS_D_ALERTE)[number];

/**
 * Les fuseaux proposés.
 *
 * Une liste courte plutôt que les quatre cents identifiants IANA : ceux
 * d'où partent les candidats, et ceux où ils partent. Les libellés citent
 * des villes, pas des décalages — « UTC+1 » est faux six mois par an à
 * Paris, une ville ne l'est jamais.
 */
export const FUSEAUX_PROPOSES: readonly { id: string; libelle: string }[] = [
  { id: "Africa/Porto-Novo", libelle: "Cotonou, Porto-Novo" },
  { id: "Africa/Lome", libelle: "Lomé" },
  { id: "Africa/Abidjan", libelle: "Abidjan" },
  { id: "Africa/Dakar", libelle: "Dakar" },
  { id: "Africa/Ouagadougou", libelle: "Ouagadougou" },
  { id: "Africa/Douala", libelle: "Douala, Yaoundé" },
  { id: "Africa/Kinshasa", libelle: "Kinshasa" },
  { id: "Europe/Paris", libelle: "Paris" },
  { id: "Europe/Brussels", libelle: "Bruxelles" },
  { id: "Europe/Amsterdam", libelle: "Amsterdam" },
  { id: "America/Toronto", libelle: "Montréal, Toronto" },
];

export const fuseauPropose = (id: string): boolean =>
  FUSEAUX_PROPOSES.some((f) => f.id === id);

/** « Cotonou, Porto-Novo », ou l'identifiant lui-même s'il n'est pas dans la liste. */
export const libelleDuFuseau = (id: string): string =>
  FUSEAUX_PROPOSES.find((f) => f.id === id)?.libelle ?? id;

export interface PreferencesDeRappel {
  actifs: boolean;
  email: boolean;
  fuseau: string;
  joursAvant: DelaiDAlerte;
}

export const PREFERENCES_PAR_DEFAUT: PreferencesDeRappel = {
  actifs: true,
  email: true,
  fuseau: FUSEAU_AFFICHAGE,
  joursAvant: JOURS_URGENCE as DelaiDAlerte,
};

const delaiValide = (n: number): n is DelaiDAlerte =>
  (DELAIS_D_ALERTE as readonly number[]).includes(n);

/**
 * Les préférences telles qu'elles sont en base, relues avec prudence.
 *
 * La base garde déjà le délai par une contrainte ; le fuseau, lui, est une
 * chaîne. Un identifiant que le moteur ne sait plus lire retombe sur le
 * fuseau d'affichage plutôt que de faire tomber la passe entière.
 */
export function lirePreferences(ligne: {
  remindersEnabled: boolean;
  reminderEmail: boolean;
  reminderTimeZone: string;
  reminderLeadDays: number;
}): PreferencesDeRappel {
  return {
    actifs: ligne.remindersEnabled,
    email: ligne.reminderEmail,
    fuseau: fuseauReconnu(ligne.reminderTimeZone) ? ligne.reminderTimeZone : FUSEAU_AFFICHAGE,
    joursAvant: delaiValide(ligne.reminderLeadDays)
      ? ligne.reminderLeadDays
      : PREFERENCES_PAR_DEFAUT.joursAvant,
  };
}

// ── Le canal email ──────────────────────────────────────────────────────

/**
 * Le transport de courrier, tel que l'écran a le droit de l'annoncer.
 *
 * Deux états seulement. « Opérationnel » exige un constat **concluant et
 * frais** — le worker parle au serveur toutes les heures. Une variable
 * posée, un constat périmé ou un échec : « indisponible ». Mieux vaut
 * annoncer l'alerte dans l'application et recevoir en plus un email que
 * l'inverse.
 */
export type CanalEmail = "OPERATIONNEL" | "INDISPONIBLE";

export const canalDepuisLaSonde = (
  sonde: "CONCLUANTE" | "ECHOUEE" | "ABSENTE" | "IMPOSSIBLE",
): CanalEmail => (sonde === "CONCLUANTE" ? "OPERATIONNEL" : "INDISPONIBLE");

// ── L'heure et la clé ───────────────────────────────────────────────────

/**
 * Le rappel du jour peut-il partir à cette heure locale ?
 *
 * La passe tourne toutes les heures ; elle n'envoie qu'à partir de huit
 * heures chez le candidat. Une passe manquée à huit heures — worker
 * arrêté, déploiement — est rattrapée à neuf : le rappel du jour n'est
 * pas perdu, il est en retard, et c'est la seule façon honnête de rater
 * une heure.
 */
export const heureDuRappelAtteinte = (heureLocale: number): boolean =>
  heureLocale >= HEURE_DES_RAPPELS;

/**
 * La clé d'un rappel : un dossier, un jour civil **du candidat**.
 *
 * Unique en base. Deux passes concurrentes, une passe rejouée par la file
 * après un plantage, un worker redémarré à 8 h 59 : la seconde écriture
 * bute sur la clé et n'envoie rien. C'est la base qui tient la promesse
 * « un rappel par jour au plus », pas l'ordonnanceur.
 */
export const cleDuRappel = (applicationId: string, jourLocal: string): string =>
  `echeance:${applicationId}:${jourLocal}`;

// ── Le courrier, et ce qu'on en dit ─────────────────────────────────────

/**
 * L'état du courrier d'un rappel.
 *
 * - `EN_ATTENTE` : pas encore parti ; une passe suivante réessaie.
 * - `ENVOYE` : le serveur l'a accepté.
 * - `NON_ENVOYE` : il ne partira pas — adresse refusée, transport absent,
 *   ou reprises épuisées. La notification reste à l'écran, et rien ne
 *   prétend le contraire.
 *
 * Un rappel sans courrier demandé (canal coupé) n'a pas d'état : `null`.
 */
export type EtatDuCourrier = "EN_ATTENTE" | "ENVOYE" | "NON_ENVOYE";

/**
 * Au-delà, un courrier en attente n'est plus repris.
 *
 * Six passes horaires. Et jamais au-delà du jour du rappel : son texte dit
 * « dans 4 jours », et parti le lendemain il dirait faux.
 */
export const TENTATIVES_MAX = 6;

/**
 * Le bail d'une tentative. Une passe qui a pris un courrier l'envoie dans
 * les secondes qui suivent ; tant que dix minutes ne sont pas écoulées,
 * une autre passe le tient pour « en vol » et ne le reprend pas. Sans ce
 * bail, une passe concurrente voyait un courrier en cours d'envoi comme un
 * courrier en attente, et l'envoyait une seconde fois — constaté en fumée.
 * Un worker tombé pendant l'envoi ne bloque le courrier que dix minutes.
 */
export const BAIL_DE_TENTATIVE_MS = 10 * 60 * 1000;

export function etatApresLEnvoi(
  suite: { parti: boolean; renvoyable: boolean },
  tentatives: number,
  jourDuRappel: string,
  jourCourant: string,
): EtatDuCourrier {
  if (suite.parti) return "ENVOYE";
  if (!suite.renvoyable) return "NON_ENVOYE";
  return repriseEncorePossible(tentatives, jourDuRappel, jourCourant)
    ? "EN_ATTENTE"
    : "NON_ENVOYE";
}

export const repriseEncorePossible = (
  tentatives: number,
  jourDuRappel: string,
  jourCourant: string,
): boolean => tentatives < TENTATIVES_MAX && jourDuRappel === jourCourant;

// ── Ce que l'écran en dit ───────────────────────────────────────────────

const EN_LETTRES: Record<DelaiDAlerte, string> = { 3: "trois", 7: "sept", 14: "quatorze" };

export const delaiEnLettres = (jours: DelaiDAlerte): string => EN_LETTRES[jours];

/**
 * La phrase de l'échéancier — ce qui part, par où, quand, et ce qui ne
 * part pas.
 *
 * Elle ne dit « par email » que si le candidat le veut **et** que le
 * transport l'a prouvé. Sinon elle dit où le rappel l'attend.
 */
export function phraseDesRappels(prefs: PreferencesDeRappel, canal: CanalEmail): string {
  const sms = "Rien n'est envoyé par SMS.";
  if (!prefs.actifs) {
    return `Tes rappels d'échéance sont coupés : rien ne t'est envoyé, ni par email ni dans tes alertes. ${sms}`;
  }
  const cadence = `chaque semaine, et tout de suite si l'une arrive à moins de ${delaiEnLettres(prefs.joursAvant)} jours`;
  const heure = `Il part à partir de ${HEURE_DES_RAPPELS} h, heure de ${libelleDuFuseau(prefs.fuseau)}.`;
  if (prefs.email && canal === "OPERATIONNEL") {
    return `Un rappel par email, doublé dans tes alertes, te résume ces échéances ${cadence}. ${heure} ${sms}`;
  }
  const raison = prefs.email
    ? "L'envoi par email est indisponible en ce moment : ton choix est gardé, et chaque rappel qui ne part pas reste dans tes alertes."
    : "Tu as choisi de ne pas les recevoir par email.";
  return `Un rappel dans tes alertes te résume ces échéances ${cadence}. ${heure} ${raison} ${sms}`;
}

/**
 * Ce que l'écran dit du dernier rappel — et d'abord de son courrier.
 *
 * Un courrier en attente ou refusé ne s'écrit jamais « envoyé ». La
 * notification, elle, est toujours dans les alertes : c'est ce que la
 * phrase dit en premier, parce que c'est là que le candidat peut le lire.
 */
export function suiteDuDernierRappel(courrier: EtatDuCourrier | null): string {
  switch (courrier) {
    case "ENVOYE":
      return "Parti par email, et gardé dans tes alertes.";
    case "EN_ATTENTE":
      return "Dans tes alertes. L'email n'est pas encore parti : il est retenté dans la journée.";
    case "NON_ENVOYE":
      return "Dans tes alertes. L'email n'a pas pu partir, et ce rappel ne repartira pas par email.";
    case null:
      return "Dans tes alertes seulement : l'email était coupé.";
    default: {
      const jamais: never = courrier;
      throw new Error(`État de courrier non arbitré : ${String(jamais)}`);
    }
  }
}

/** La phrase du canal email sur l'écran de préférences. */
export const MENTION_CANAL_INDISPONIBLE =
  "L'envoi par email est indisponible en ce moment. Ton choix est gardé ; tant que l'envoi ne reprend pas, tes rappels t'attendent dans tes alertes.";
