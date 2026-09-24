/**
 * Le fuseau dans lequel toute heure s'écrit — I.E.
 *
 * Tous les formateurs de rendez-vous écrivaient en UTC pendant que l'écran
 * annonçait « les horaires sont donnés dans ton fuseau, Cotonou ». Un
 * créneau de 16 h 30 s'affichait donc « 15 h 30 » sous une phrase qui
 * promettait l'heure locale. Le défaut ne se voyait pas à la lecture du
 * code — chaque `timeZone: "UTC"` était correct en soi — mais seulement en
 * rapprochant les formateurs de la phrase.
 *
 * La constante vivait dans le module des rendez-vous, et les autres
 * formateurs d'heure — reçu, alertes, versions, back-office — ne la
 * voyaient pas : ils écrivaient toujours en UTC. Elle vit ici pour que
 * toute heure affichée la lise.
 *
 * Une seule constante, parce qu'il faut qu'un seul endroit change le jour
 * où le fuseau suivra le candidat. Elle vaut pour le Bénin ; la plateforme
 * s'adresse à plus large, et c'est le point laissé ouvert.
 *
 * Ce qui reste en UTC, et doit y rester : les **dates calendaires** — une
 * échéance, une date de délivrance, une date de vérification. Elles sont
 * stockées à minuit UTC et ne désignent pas un instant ; les lire dans un
 * fuseau à l'ouest de Greenwich les ferait reculer d'un jour.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */
export const FUSEAU_AFFICHAGE = "Africa/Porto-Novo";

const FORMAT_JOUR_CIVIL = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSEAU_AFFICHAGE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Le jour civil d'un instant dans le fuseau d'affichage, `AAAA-MM-JJ`.
 *
 * Un paiement fait à 0 h 30 à Cotonou est encore la veille en UTC : son
 * reçu portait la date d'un jour où il n'avait pas eu lieu.
 */
export const jourCivil = (instant: Date): string => FORMAT_JOUR_CIVIL.format(instant);

/**
 * Le décalage du fuseau d'affichage à un instant donné, en minutes.
 *
 * Lu à l'instant visé et non posé en dur : un `+1` écrit ici serait juste
 * pour le Bénin et faux le jour où le fuseau suit le candidat — ce que la
 * note ci-dessus laisse explicitement ouvert.
 */
const FORMAT_DECALAGE = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSEAU_AFFICHAGE,
  timeZoneName: "longOffset",
});

const decalageMinutes = (instant: Date): number => {
  const nomme = FORMAT_DECALAGE.formatToParts(instant).find(
    (p) => p.type === "timeZoneName",
  )?.value;
  const lu = /GMT([+-])(\d{2}):(\d{2})/u.exec(nomme ?? "");
  if (!lu) return 0;
  return (lu[1] === "-" ? -1 : 1) * (Number(lu[2]) * 60 + Number(lu[3]));
};

/** Le quantième du jour dans le fuseau d'affichage, et non en UTC. */
const FORMAT_PARTIES = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSEAU_AFFICHAGE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const jourDuFuseau = (
  instant: Date,
): { annee: number; mois: number; jour: number } => {
  const [annee, mois, jour] = FORMAT_PARTIES.format(instant).split("-").map(Number);
  return { annee: annee!, mois: mois!, jour: jour! };
};

/**
 * L'instant d'une heure **locale** — I.E., seconde moitié.
 *
 * Les créneaux étaient posés par `setUTCHours(9 | 11 | 15 | 17)`, c'est-à-dire
 * en UTC, pendant que les formateurs de ce module les rendent dans le fuseau
 * d'affichage. Le tableau se lit comme des heures de bureau ; le candidat
 * se voyait proposer autre chose. Constaté en exécution :
 *
 *     écrit 09:00 UTC → affiché « 10 h 00 »
 *     écrit 11:00 UTC → affiché « 12 h 00 »
 *     écrit 15:00 UTC → affiché « 16 h 00 »
 *     écrit 17:00 UTC → affiché « 18 h 00 »
 *
 * Jamais de créneau à neuf heures, un créneau en plein midi, et un à
 * dix-huit heures — après la journée d'un consultant du même fuseau. C'est
 * la même faute que celle que la note ci-dessus raconte, prise par l'autre
 * bout : les formateurs ont été corrigés, la génération est restée en UTC.
 *
 * Deux passes, parce que le décalage se lit à l'instant visé et non à
 * l'instant approché : sous un fuseau à heure d'été, la première passe peut
 * tomber du mauvais côté de la bascule.
 */
export function instantDeLHeureLocale(
  annee: number,
  mois: number,
  jour: number,
  heure: number,
): Date {
  const vise = Date.UTC(annee, mois - 1, jour, heure, 0, 0, 0);
  const premier = vise - decalageMinutes(new Date(vise)) * 60_000;
  return new Date(vise - decalageMinutes(new Date(premier)) * 60_000);
}

/** `AAAA-MM-JJ` décalé de `n` jours, au calendrier et non en heures. */
export const jourCivilPlus = (jour: string, n: number): string => {
  const [annee, mois, quantieme] = jour.split("-").map(Number);
  return new Date(Date.UTC(annee!, mois! - 1, quantieme! + n)).toISOString().slice(0, 10);
};

/**
 * L'instant où commence le jour civil `jour` à Cotonou.
 *
 * Une journée de paiements ou une période de journal se borne par des
 * instants. Posées à minuit UTC, les bornes laissaient hors de la requête
 * l'heure qui ouvre la journée à Cotonou, et y faisaient entrer celle qui
 * ouvre la suivante — pendant que l'écran rangeait chaque ligne au jour
 * qu'on lit à côté de son heure (S.82). Une écriture de 0 h 30 le 1er
 * manquait à l'export du mois, sans rien qui le dise.
 */
export const debutDuJourCivil = (jour: string): Date => {
  const [annee, mois, quantieme] = jour.split("-").map(Number);
  return instantDeLHeureLocale(annee!, mois!, quantieme!, 0);
};

/** Les bornes `[début, fin[` d'une suite de jours civils, bornes incluses. */
export const bornesDesJoursCivils = (du: string, au: string): { gte: Date; lt: Date } => ({
  gte: debutDuJourCivil(du),
  lt: debutDuJourCivil(jourCivilPlus(au, 1)),
});
