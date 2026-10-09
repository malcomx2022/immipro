import { NOTE_REDACTION_ASSISTEE } from "@/domain/payments/montee";
import { DELAI_REDACTION_MS } from "@/domain/redaction/commande";

/**
 * La réservation d'une rédaction assistée — RF-4, S.153 (reliquat de S.148).
 *
 * La mise en forme et la relecture débitent avant l'appel au modèle
 * (INV-6), dans une requête synchrone : pas de file, donc pas de rejeu. Un
 * arrêt du processus entre le débit et le résultat laissait un débit sans
 * texte ni avis, et rien ne le rendait — le candidat qui relançait payait
 * de nouveau. L'échec d'un appel, lui, était déjà rendu ; c'est
 * l'interruption qui ne l'était pas.
 *
 * Le débit porte donc une échéance : la réservation est ouverte jusqu'à
 * elle. Une issue la solde — le texte devenu version, l'avis daté, ou le
 * rendu d'un échec —, et la reprise horaire rend celles qui ont passé
 * l'échéance sans issue. Le choix de rendre suit A-2 (S.147) : une lecture
 * qui n'a rien produit pour le candidat ne lui est pas comptée.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/**
 * Au-delà, une rédaction sans issue a été interrompue. Très au-dessus d'un
 * appel (trois minutes au plus, `DELAI_REDACTION_MS`) : la reprise ne doit
 * jamais rendre une analyse dont la requête tourne encore.
 */
export const RESERVATION_DE_REDACTION_MINUTES = 30;

export const echeanceDeLaReservation = (maintenant: Date): Date =>
  new Date(maintenant.getTime() + RESERVATION_DE_REDACTION_MINUTES * 60_000);

/** Le délai couvre plusieurs appels entiers, et pas seulement un. */
export const MARGE_SUR_L_APPEL = (RESERVATION_DE_REDACTION_MINUTES * 60_000) / DELAI_REDACTION_MS;

/**
 * La note du rendu par la reprise. Elle commence par la trace de la
 * rédaction assistée : le diagnostic des lectures (S.149, constat E5) les
 * écarte ainsi de son compte, comme les débits qu'elles soldent.
 */
export const NOTE_RESERVATION_RENDUE = `${NOTE_REDACTION_ASSISTEE} — réservation rendue : aucune issue après ${RESERVATION_DE_REDACTION_MINUTES} minutes`;
