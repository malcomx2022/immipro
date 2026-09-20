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

import type { Rail } from "../payments/rail";

export type MotifEchec =
  | "delai_depasse"
  | "solde_insuffisant"
  | "refus_operateur"
  | "notification_absente"
  | "annule_par_le_payeur"
  | "moyen_invalide"
  | "incident_technique";

/**
 * Le motif que la base conserve — N.B, `Transaction.failureCause`.
 *
 * Distinct de `MotifEchec` à dessein : l'un décrit ce que l'émetteur a
 * répondu, l'autre ce que l'écran affiche. `notification_absente` n'est pas
 * une cause de refus, c'est l'état d'un paiement dont personne n'a rien dit
 * — il n'a donc pas de valeur en base, et ne peut pas en avoir.
 */
export type CauseRefus =
  | "SOLDE_INSUFFISANT"
  | "REFUS_EMETTEUR"
  | "ANNULE_PAR_LE_PAYEUR"
  | "MOYEN_INVALIDE"
  | "INCIDENT_TECHNIQUE"
  | "DELAI_DEPASSE";

const ECRAN_POUR_CAUSE: Record<CauseRefus, MotifEchec> = {
  SOLDE_INSUFFISANT: "solde_insuffisant",
  REFUS_EMETTEUR: "refus_operateur",
  ANNULE_PAR_LE_PAYEUR: "annule_par_le_payeur",
  MOYEN_INVALIDE: "moyen_invalide",
  INCIDENT_TECHNIQUE: "incident_technique",
  DELAI_DEPASSE: "delai_depasse",
};

export const motifPourLaCause = (cause: CauseRefus): MotifEchec => ECRAN_POUR_CAUSE[cause];

/**
 * Ce que le back-office lit dans la même colonne — B-04.
 *
 * Le tableau des paiements classait tout échec en « échec solde », panne
 * technique et renoncement du payeur compris. Un opérateur qui rappelle un
 * candidat en lui parlant de son solde alors qu'il a simplement fermé la
 * page se trompe de conversation.
 */
export const LIBELLE_CAUSE: Record<CauseRefus, string> = {
  SOLDE_INSUFFISANT: "Solde insuffisant",
  REFUS_EMETTEUR: "Refus de l'émetteur",
  ANNULE_PAR_LE_PAYEUR: "Annulé par le payeur",
  MOYEN_INVALIDE: "Moyen de paiement invalide",
  INCIDENT_TECHNIQUE: "Incident technique",
  DELAI_DEPASSE: "Délai dépassé",
};

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

/**
 * Le motif de l'écran, la cause conservée l'emportant sur la déduction.
 *
 * L'ordre compte. Ce que l'émetteur a répondu vaut mieux que ce que l'état
 * laisse supposer : sans lui, un refus pour solde et une panne du
 * prestataire s'affichaient de la même façon.
 */
export const motifDeLEchec = (cause: CauseRefus | null, statut: string): MotifEchec =>
  cause ? motifPourLaCause(cause) : motifParDefaut(statut);

export interface Echec {
  titre: string;
  corps: string;
  /** Ce que le candidat peut vérifier lui-même, dans l'ordre d'utilité. */
  verifications: readonly string[];
}

/**
 * Où le candidat va voir ses dernières opérations.
 *
 * Le `*880#` était donné à tout le monde, y compris à qui paie par carte
 * en euros : un code USSD d'opérateur béninois n'a rien à faire sur l'écran
 * d'un paiement par carte. C'est la même faute que celle qu'O.A corrige —
 * affirmer au candidat quelque chose qui n'est pas vrai de sa situation —
 * mais du côté du rail plutôt que de la cause.
 */
const consulterSesOperations = (rail: Rail): string =>
  rail === "MOBILE_MONEY"
    ? "Compose le *880# pour consulter ton solde et tes dernières opérations."
    : "Le relevé de ta carte indique si une opération a été tentée.";

/**
 * L'instrument, nommé comme le candidat le nomme — phrase entière et non
 * simple nom : « portefeuille » est masculin, « carte » féminine, et une
 * phrase à trous produisait « ton portefeuille Mobile Money est active ».
 */
const INSTRUMENT_AUTORISE: Record<Rail, string> = {
  MOBILE_MONEY:
    "Vérifie que ton portefeuille Mobile Money est actif et autorisé au paiement marchand.",
  CARTE: "Vérifie que ta carte est active et autorisée au paiement marchand.",
};

/**
 * Le numéro est facultatif : ImmiPro ne conserve pas le portefeuille qui
 * paie, et un compte sans téléphone renseigné n'en a aucun à nommer. La
 * vérification qui le cite disparaît alors, plutôt que de citer un vide.
 */
export function echecPourMotif(
  motif: MotifEchec,
  montant: string,
  numero: string | null,
  rail: Rail,
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
        consulterSesOperations(rail),
      ],
    };
  }
  /**
   * Le refus sans raison — O.A, tranché pour la V1 le 20/09/2026.
   *
   * C'est la case où tombe tout ce que le rail ne détaille pas : les trois
   * états d'échec de FedaPay n'ont pas de code de refus normalisé, et un
   * code Stripe inconnu retombe ici aussi. Le motif reste **générique et
   * non accusatoire** : la parité avec l'autre rail n'est pas plus
   * importante que l'exactitude.
   *
   * **Ce qui a été retiré.** La première vérification disait « le solde
   * disponible doit couvrir 5 000 F au moment de la confirmation ». Le
   * titre et le corps disaient honnêtement que la raison ne nous est pas
   * communiquée, puis la ligne la plus lue de l'encadré nommait le solde
   * comme si on le savait. Une cause fausse n'est pas moins fausse d'être
   * écrite à l'impératif : le candidat recharge un portefeuille qui
   * n'était pas en cause, réessaie, et échoue une seconde fois.
   *
   * Ce qui reste est vérifiable sans connaître la cause : l'instrument
   * est-il actif et autorisé, et que montre le relevé. Réessayer et passer
   * à l'autre grille sont les deux autres actions utiles, et l'écran les
   * porte déjà en boutons — les redire ici ferait de l'encadré « ce que tu
   * peux vérifier » un doublon des commandes situées dessous.
   */
  if (motif === "refus_operateur") {
    return {
      titre:
        rail === "MOBILE_MONEY"
          ? "Ton opérateur n'a pas confirmé le paiement"
          : "Ta banque n'a pas confirmé le paiement",
      corps:
        "L'opération a été refusée, et la raison ne nous est pas communiquée. Aucun montant n'a été débité, et ton dossier est conservé en l'état.",
      verifications: [
        numero && rail === "MOBILE_MONEY"
          ? `Vérifie que le ${numero} est bien actif et autorisé au paiement marchand.`
          : INSTRUMENT_AUTORISE[rail],
        consulterSesOperations(rail),
      ],
    };
  }

  if (motif === "annule_par_le_payeur") {
    return {
      titre: "Le paiement a été annulé",
      corps:
        "L'opération a été interrompue avant d'être confirmée — sur ton téléphone, ou en quittant la page de paiement. Aucun montant n'a été débité, et ton dossier est conservé en l'état.",
      verifications: [
        "Relancer le paiement en ouvre un nouveau : rien n'est débité deux fois.",
        "Si tu n'as rien annulé, la notification a pu expirer avant ta saisie.",
        consulterSesOperations(rail),
      ],
    };
  }

  if (motif === "moyen_invalide") {
    return {
      titre: "Ce moyen de paiement n'a pas été accepté",
      corps:
        "L'émetteur l'a refusé pour une raison qui tient au moyen lui-même, pas à ton solde. Aucun montant n'a été débité, et ton dossier est conservé en l'état.",
      verifications: [
        numero
          ? `Vérifie que le ${numero} est bien actif et autorisé au paiement marchand.`
          : "Vérifie que ton moyen de paiement est actif et autorisé au paiement marchand.",
        "Une carte a une date d'expiration ; un portefeuille, un plafond à activer.",
        "L'autre grille se règle par un autre moyen, et il fonctionne peut-être.",
      ],
    };
  }

  if (motif === "incident_technique") {
    return {
      titre: "Une panne a interrompu le paiement",
      corps:
        "Elle est du côté de l'émetteur ou de notre prestataire, pas du tien. Aucun montant n'a été débité, et ton dossier est conservé en l'état.",
      verifications: [
        "Il n'y a rien à corriger sur ton compte : réessaie dans quelques minutes.",
        "Si cela se répète, l'autre grille passe par un autre prestataire.",
        consulterSesOperations(rail),
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

  /**
   * Solde insuffisant. Le titre nomme le fait (DOC-12 §16 règle 1), et se
   * distingue au premier coup d'œil de la panne : « le paiement n'a pas
   * abouti » et « le paiement n'a pas pu aboutir » se ressemblaient assez
   * pour qu'on ne sache pas lequel on lit.
   */
  return {
    titre: "Ton solde n'a pas couvert le paiement",
    corps:
      "Ton opérateur a refusé l'opération pour solde insuffisant. Aucun montant n'a été débité, et ton dossier est conservé en l'état.",
    verifications: [
      `Le solde disponible doit couvrir ${montant} au moment de la confirmation.`,
      "Un rechargement met parfois quelques minutes à être pris en compte.",
      consulterSesOperations(rail),
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
