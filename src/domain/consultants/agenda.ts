/**
 * Entrée d'agenda d'un rendez-vous — T-05, I.E.
 *
 * « Ajouter à mon agenda » était un bouton sans action, comme les quatre
 * boutons morts du lot L.B. Le format iCalendar (RFC 5545) tient en une
 * trentaine de lignes de texte : aucune bibliothèque n'entre au dépôt pour
 * cela, même doctrine que le PDF du reçu, qui est celui du navigateur.
 *
 * Ce que le fichier porte est ce qui ne bougera plus — le créneau, la
 * durée, le consultant, la référence. L'état de la checklist n'y est pas :
 * un agenda se relit des semaines plus tard, et une phrase recopiée y
 * mentirait aussi sûrement que dans un courriel (RG-11.3).
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export interface EntreeAgenda {
  reference: string;
  /** Début, ISO avec fuseau. */
  debut: string;
  dureeMinutes: number;
  consultant: string;
  /** « Pays-Bas — Séjour pour études ». */
  dossier: string;
  /** Adresse de l'écran qui dit l'état du jour. */
  adresse: string;
  /** Horodatage de production, injecté pour rendre la sortie vérifiable. */
  produitLe?: string;
}

/**
 * Un horodatage iCalendar : `20260917T153000Z`. Toujours en UTC — la
 * spécification l'admet sans déclaration de fuseau, et l'agenda du lecteur
 * le rend dans le sien. C'est le seul endroit du parcours où l'heure ne
 * s'écrit pas dans le fuseau d'affichage, et c'est exactement pour que
 * chacun la lise chez lui.
 */
const horodatage = (iso: string): string =>
  new Date(iso).toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}/u, "");

/**
 * Les séparateurs du format sont des caractères ordinaires d'une phrase
 * française : « Pays-Bas — Séjour, étudiant » couperait la ligne en trois
 * champs sans cet échappement.
 */
const echapper = (texte: string): string =>
  texte
    .replace(/\\/gu, "\\\\")
    // « \\; » et non « \; » : en JavaScript, « \; » est un échappement
    // inutile qui vaut « ; ». Le point-virgule sortait tel quel, et le test
    // qui le gardait portait la même faute — il comparait « ; » à « ; ».
    .replace(/;/gu, "\\;")
    .replace(/,/gu, "\\,")
    .replace(/\n/gu, "\\n");

/**
 * Pliage à 75 octets, exigé par la spécification. Il se compte en octets et
 * non en caractères : « é » en pèse deux, et une ligne pliée au milieu d'un
 * caractère produit un fichier que l'agenda refuse.
 */
function plier(ligne: string): string {
  const octets = Buffer.from(ligne, "utf8");
  if (octets.length <= 75) return ligne;

  const morceaux: string[] = [];
  let courant = "";
  let poids = 0;
  // La limite est 75 pour la première ligne, 74 pour les suivantes : elles
  // commencent par l'espace qui marque la continuation.
  for (const caractere of ligne) {
    const taille = Buffer.byteLength(caractere, "utf8");
    const limite = morceaux.length === 0 ? 75 : 74;
    if (poids + taille > limite) {
      morceaux.push(courant);
      courant = "";
      poids = 0;
    }
    courant += caractere;
    poids += taille;
  }
  morceaux.push(courant);
  return morceaux.join("\r\n ");
}

/** Nom de fichier proposé au téléchargement. */
export const nomDuFichierAgenda = (reference: string): string => `${reference}.ics`;

export const TYPE_AGENDA = "text/calendar;charset=utf-8";

/**
 * Le fichier, en un seul texte. Les fins de ligne sont `CRLF` : la
 * spécification les impose, et plusieurs agendas refusent le fichier sans.
 */
export function fichierAgenda(entree: EntreeAgenda): string {
  const fin = new Date(
    new Date(entree.debut).getTime() + entree.dureeMinutes * 60_000,
  ).toISOString();

  const lignes = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ImmiPro//Rendez-vous//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    // L'identifiant est la référence : le même rendez-vous ajouté deux fois
    // met à jour l'entrée au lieu d'en créer une seconde.
    `UID:${entree.reference}@immipro.bj`,
    `DTSTAMP:${horodatage(entree.produitLe ?? entree.debut)}`,
    `DTSTART:${horodatage(entree.debut)}`,
    `DTEND:${horodatage(fin)}`,
    `SUMMARY:${echapper(`Entretien ImmiPro — ${entree.consultant}`)}`,
    `DESCRIPTION:${echapper(
      `Dossier ${entree.dossier}. Référence ${entree.reference}. L'état de ta checklist se lit dans ton dossier : ${entree.adresse}`,
    )}`,
    `URL:${entree.adresse}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `${lignes.map(plier).join("\r\n")}\r\n`;
}
