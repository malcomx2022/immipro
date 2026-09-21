/**
 * La tenue temporaire d'un créneau — arbitrage du 21/09/2026.
 *
 * ── Ce qui manquait ─────────────────────────────────────────────────
 *
 * Un rendez-vous naissait `RESERVE` — confirmé — avant qu'un centime ait
 * été encaissé, et l'accès au dossier s'ouvrait dans la foulée. L'écran
 * annonçait « Rendez-vous confirmé », puis, deux paragraphes plus bas,
 * que la consultation était due. Le consultant pouvait lire le dossier
 * d'un candidat qui n'avait rien payé, et personne ne le savait.
 *
 * Entre « je veux ce créneau » et « c'est payé », il y a un état, et il
 * n'était pas modélisé. Le voici : le créneau est **tenu**, avec une
 * échéance. Rien n'est promis, rien n'est ouvert.
 *
 * ── Pourquoi une échéance, et celle-là ──────────────────────────────
 *
 * Une tenue sans fin gèle un horaire que personne ne paiera. Trop courte,
 * elle expire pendant que le candidat cherche son téléphone.
 *
 * Vingt minutes : le temps d'une notification Mobile Money, d'un code PIN
 * saisi sur un autre appareil, ou d'une authentification bancaire à trois
 * volets — et de recommencer une fois. C'est aussi ce que la page
 * d'attente couvre largement, elle qui abandonne son décompte à cinq
 * minutes sans rien conclure.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export const TENUE_MINUTES = 20;

export const echeanceDeTenue = (maintenant: Date): Date =>
  new Date(maintenant.getTime() + TENUE_MINUTES * 60_000);

/**
 * Une tenue échue ne tient plus rien : le créneau se reprend.
 *
 * Strictement après : à la seconde de l'échéance, elle vaut encore. La
 * frontière penche du côté du candidat qui vient de payer.
 */
export const tenueEchue = (echeance: Date | null, maintenant: Date): boolean =>
  echeance === null || echeance.getTime() < maintenant.getTime();

/** Ce que l'écran dit à chaque étape. Quatre états, quatre phrases. */
export type EtatDuRendezVous = "TENU" | "EN_ATTENTE" | "CONFIRME" | "ECHOUE" | "LIBERE";

export const TITRE_ETAT: Record<EtatDuRendezVous, string> = {
  TENU: "Créneau tenu",
  EN_ATTENTE: "Paiement en cours",
  CONFIRME: "Rendez-vous confirmé",
  ECHOUE: "Le paiement n'a pas abouti",
  LIBERE: "Le créneau a été libéré",
};

/**
 * Le corps de chaque état.
 *
 * Aucun ne dit « confirmé » avant que la notification signée l'ait écrit,
 * et aucun ne promet un résultat. Celui de l'attente est le plus délicat :
 * le candidat vient peut-être de valider son paiement, et il ne faut ni
 * lui annoncer un rendez-vous qu'il n'a pas encore, ni lui laisser croire
 * que son argent est parti dans le vide.
 */
export function corpsDeLEtat(etat: EtatDuRendezVous, minutes = TENUE_MINUTES): string {
  switch (etat) {
    case "TENU":
      return `Ce créneau t'est gardé ${minutes} minutes, le temps du paiement. Il n'est pas encore réservé : personne d'autre ne peut le prendre d'ici là, et il redevient libre si le paiement n'aboutit pas.`;
    case "EN_ATTENTE":
      return "Ton paiement est en cours de vérification auprès de notre prestataire. Le créneau reste tenu. Cet écran se met à jour tout seul — le retour de la page de paiement ne suffit pas à confirmer, c'est la confirmation du prestataire qui fait foi.";
    case "CONFIRME":
      return "Le paiement est confirmé, le créneau est réservé à ton nom, et ton consultant a désormais accès à ton dossier.";
    case "ECHOUE":
      return "Aucune somme n'a été prélevée. Le créneau reste tenu quelques minutes : tu peux réessayer maintenant, ou en choisir un autre.";
    case "LIBERE":
      return "Le paiement n'a pas abouti dans le délai, et le créneau est redevenu disponible. Rien n'a été prélevé, et ton accord de partage est conservé : tu n'auras pas à le redonner.";
  }
}

/**
 * Ce que l'accès du consultant vaut tant que rien n'est payé : rien.
 *
 * Écrit ici pour qu'un test puisse le vérifier sur la phrase même, et
 * pour qu'un seul endroit la compose.
 */
export const MENTION_ACCES_APRES_PAIEMENT =
  "Ton dossier ne sera partagé qu'une fois le paiement confirmé. Ton accord est enregistré dès maintenant, il ne t'ouvre aucun accès avant.";
