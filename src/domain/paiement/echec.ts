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

export type MotifEchec =
  | "delai_depasse"
  | "solde_insuffisant"
  | "refus_operateur"
  | "notification_absente";

/**
 * Le motif que l'état de la transaction impose, quand l'adresse n'en porte
 * pas — et il l'impose souvent, parce que le fournisseur nous dit *que* le
 * paiement est refusé sans nous dire *pourquoi*.
 *
 * Retomber sur « délai dépassé » par défaut paraissait prudent et ne
 * l'était pas : un paiement refusé par l'opérateur en deux secondes
 * s'annonçait « les cinq minutes se sont écoulées sans confirmation », ce
 * qui est faux et envoie vérifier ce qui n'est pas en cause. Chacun de ces
 * motifs dit ce qui est su, et rien de plus.
 */
export function motifParDefaut(statut: string): MotifEchec {
  if (statut === "EXPIREE") return "delai_depasse";
  if (statut === "ECHOUEE" || statut === "REMBOURSEE") return "refus_operateur";
  // La transaction est encore ouverte : c'est « je n'ai rien reçu ».
  return "notification_absente";
}

export interface Echec {
  titre: string;
  corps: string;
  /** Ce que le candidat peut vérifier lui-même, dans l'ordre d'utilité. */
  verifications: readonly string[];
}

/** Code USSD de consultation du solde, commun aux deux motifs. */
const CONSULTER_SOLDE =
  "Compose le *880# pour consulter ton solde et tes dernières opérations.";

/**
 * Le numéro est facultatif : ImmiPro ne conserve pas le portefeuille qui
 * paie, et un compte sans téléphone renseigné n'en a aucun à nommer. La
 * vérification qui le cite disparaît alors, plutôt que de citer un vide.
 */
export function echecPourMotif(
  motif: MotifEchec,
  montant: string,
  numero: string | null,
): Echec {
  if (motif === "delai_depasse") {
    return {
      titre: "Le délai de confirmation est dépassé",
      corps:
        "Les cinq minutes se sont écoulées sans confirmation. Ton dossier est conservé, tu peux relancer le paiement maintenant.",
      verifications: [
        "La notification Mobile Money peut arriver avec du retard sur un réseau lent.",
        numero
          ? `Si elle n'est jamais arrivée, vérifie que le ${numero} est bien ton numéro actif.`
          : "Si elle n'est jamais arrivée, vérifie le numéro enregistré sur ton profil.",
        CONSULTER_SOLDE,
      ],
    };
  }
  if (motif === "refus_operateur") {
    return {
      titre: "Ton opérateur n'a pas confirmé le paiement",
      corps:
        "L'opération a été refusée, et la raison ne nous est pas communiquée. Aucun montant n'a été débité, et ton dossier est conservé en l'état.",
      verifications: [
        `Le solde disponible doit couvrir ${montant} au moment de la confirmation.`,
        numero
          ? `Vérifie que le ${numero} est bien actif et autorisé au paiement marchand.`
          : "Vérifie que ton numéro est bien actif et autorisé au paiement marchand.",
        CONSULTER_SOLDE,
      ],
    };
  }

  if (motif === "notification_absente") {
    return {
      titre: "La notification n'est pas arrivée",
      corps:
        "Ton opérateur ne l'a pas encore envoyée, ou elle s'est perdue en route. Aucun montant n'a été débité, et ton dossier est conservé en l'état.",
      verifications: [
        "Sur un réseau lent, elle met parfois plus d'une minute à arriver.",
        numero
          ? `Vérifie que le ${numero} est bien ton numéro actif.`
          : "Vérifie le numéro enregistré sur ton profil.",
        "Relancer le paiement en envoie une nouvelle : rien n'est débité deux fois.",
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

/**
 * Numéro masqué : « 97 •• •• 42 ». Jamais le numéro entier à l'écran.
 *
 * Les deux chiffres de tête sont ceux du numéro **national**, parce que
 * c'est le préfixe de l'opérateur et que c'est à lui qu'on reconnaît lequel
 * de ses numéros on regarde. Un numéro enregistré au format international
 * — `+22997000042`, celui que produit un formulaire sérieux — donnait
 * « 22 •• •• 42 » : l'indicatif du pays, qui ne distingue rien puisque tous
 * les numéros du compte le partagent.
 *
 * L'indicatif n'est retiré que s'il est écrit comme tel, avec son `+` ou
 * son `00`. Un numéro composé sans indicatif garde ses deux premiers
 * chiffres, qui sont déjà ceux de l'opérateur.
 */
const INDICATIFS = ["229", "225", "221", "228", "226", "223", "227", "245", "33", "32", "41", "49", "31", "1"];

export function masquerNumero(numero: string): string {
  const brut = numero.trim();
  const international = brut.startsWith("+") || brut.startsWith("00");
  let chiffres = brut.replace(/\D/gu, "");
  if (international) {
    if (chiffres.startsWith("00")) chiffres = chiffres.slice(2);
    const indicatif = INDICATIFS.find((i) => chiffres.startsWith(i));
    if (indicatif) chiffres = chiffres.slice(indicatif.length);
  }
  if (chiffres.length < 4) return "•• •• •• ••";
  return `${chiffres.slice(0, 2)} •• •• ${chiffres.slice(-2)}`;
}
