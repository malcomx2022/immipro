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
