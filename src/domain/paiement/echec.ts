/**
 * Échec de paiement — WF-05, écran $-05.
 *
 * Deux motifs, deux écrans distincts : un délai dépassé n'est pas un refus,
 * et les confondre fait croire à un problème d'argent là où il n'y en a pas.
 *
 * Chaque motif dit ce qui est conservé — le dossier — et ce qu'il y a à
 * vérifier. Aucun code technique n'apparaît côté candidat : le back-office y
 * a droit, parce que son lecteur agit dessus.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type MotifEchec = "delai_depasse" | "solde_insuffisant";

export interface Echec {
  titre: string;
  corps: string;
  /** Ce que le candidat peut vérifier lui-même, dans l'ordre d'utilité. */
  verifications: readonly string[];
}

/** Code USSD de consultation du solde, commun aux deux motifs. */
const CONSULTER_SOLDE =
  "Compose le *880# pour consulter ton solde et tes dernières opérations.";

export function echecPourMotif(motif: MotifEchec, montant: string, numero: string): Echec {
  if (motif === "delai_depasse") {
    return {
      titre: "Le délai de confirmation est dépassé",
      corps:
        "Les cinq minutes se sont écoulées sans confirmation. Ton dossier est conservé, tu peux relancer le paiement maintenant.",
      verifications: [
        "La notification Mobile Money peut arriver avec du retard sur un réseau lent.",
        `Si elle n'est jamais arrivée, vérifie que le ${numero} est bien ton numéro actif.`,
        CONSULTER_SOLDE,
      ],
    };
  }
  return {
    titre: "Le paiement n'a pas abouti",
    corps:
      "Ton opérateur a refusé l'opération pour solde insuffisant. Ton dossier est conservé en l'état.",
    verifications: [
      `Le solde disponible doit couvrir ${montant} au moment de la confirmation.`,
      "Un rechargement met parfois quelques minutes à être pris en compte.",
      CONSULTER_SOLDE,
    ],
  };
}

/** Numéro masqué : « 97 •• •• 42 ». Jamais le numéro entier à l'écran. */
export function masquerNumero(numero: string): string {
  const chiffres = numero.replace(/\D/gu, "");
  if (chiffres.length < 4) return "•• •• •• ••";
  return `${chiffres.slice(0, 2)} •• •• ${chiffres.slice(-2)}`;
}
