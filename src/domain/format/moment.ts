/**
 * Datation relative — R-03 (versions) et T-01 (alertes).
 *
 * Le seuil est le jour civil, pas un nombre d'heures écoulées. « Il y a
 * 12 heures » pour un enregistrement d'hier soir oblige à calculer l'heure
 * qu'il était ; « hier à 21 h 04 » la donne. Au-delà d'hier, le relatif perd
 * toute précision et la date absolue reprend la main.
 *
 * Un horodatage est un **instant** : son heure et son jour se lisent dans le
 * fuseau d'affichage, comme les rendez-vous depuis le lot I.E. Ils se
 * lisaient en UTC, avec une note qui le justifiait par l'échéancier — mais
 * l'échéancier porte des dates calendaires, stockées à minuit UTC, et un
 * horodatage n'en est pas une. Un paiement fait à 10 h 43 à Cotonou
 * s'écrivait « 9 h 43 » sur son reçu ; fait à 0 h 30, il portait la date de
 * la veille.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

import { FUSEAU_AFFICHAGE, jourCivil } from "./fuseau";

const FORMAT_HEURE = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: FUSEAU_AFFICHAGE,
});

/** Le jour civil d'un instant, comparable par soustraction. */
const jourLocal = (d: Date) => Date.parse(`${jourCivil(d)}T00:00:00Z`);

export interface OptionsMoment {
  /** Format de la date absolue, au-delà d'hier. */
  formatAbsolu: Intl.DateTimeFormat;
  /** `true` en tête de ligne d'alerte : « Il y a 2 heures ». */
  capitale?: boolean;
}

export function momentRelatif(
  iso: string,
  maintenant: Date,
  { formatAbsolu, capitale = false }: OptionsMoment,
): string {
  const quand = new Date(iso);
  const jours = Math.round((jourLocal(maintenant) - jourLocal(quand)) / 86_400_000);
  const maj = (texte: string) =>
    capitale ? texte.charAt(0).toUpperCase() + texte.slice(1) : texte;

  if (jours === 0) {
    const minutes = Math.max(
      0,
      Math.floor((maintenant.getTime() - quand.getTime()) / 60_000),
    );
    if (minutes < 1) return maj("à l'instant");
    if (minutes < 60) return maj(`il y a ${minutes} ${minutes > 1 ? "minutes" : "minute"}`);
    const heures = Math.floor(minutes / 60);
    return maj(`il y a ${heures} ${heures > 1 ? "heures" : "heure"}`);
  }

  if (jours === 1) {
    return maj(`hier à ${FORMAT_HEURE.format(quand).replace(":", " h ")}`);
  }

  return formatAbsolu.format(quand);
}

const FORMAT_JOUR_LONG = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * « 15 janvier 2027 », « 1er janvier 2027 ».
 *
 * `Intl` écrit « 1 janvier » : le français met l'ordinal au premier du mois,
 * et nulle part ailleurs. La règle tient en une ligne et s'applique à toutes
 * les dates affichées, d'où sa place ici plutôt que dans chaque écran.
 */
export function jourEnFrancais(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  const texte = FORMAT_JOUR_LONG.format(date);
  return date.getUTCDate() === 1 ? texte.replace(/^1\s/u, "1er ") : texte;
}

/**
 * « 11 septembre 2026, 9 h 43 ».
 *
 * Un reçu porte l'heure autant que le jour : deux paiements du même jour se
 * distinguent par elle, et c'est ce qu'on lit à voix haute en réclamation.
 * `Intl` écrit « 09:43 » ; le français écrit « 9 h 43 », sans zéro de tête.
 */
export function momentEnFrancais(iso: string): string {
  const quand = new Date(iso);
  const heure = FORMAT_HEURE.format(quand).replace(":", " h ").replace(/^0/u, "");
  // Le jour de l'instant à Cotonou, et non les dix premiers caractères de
  // l'ISO, qui sont le jour UTC.
  return `${jourEnFrancais(jourCivil(quand))}, ${heure}`;
}
