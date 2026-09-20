/**
 * Suppression de compte — A-05, WF-10, RG-10.4.
 *
 * « Une demande de suppression de compte purge immédiatement les pièces et
 * anonymise les métadonnées, sans attendre l'échéance. »
 *
 * Anonymise, et non efface : le mot est choisi. Un reçu de paiement pointe
 * sur le compte et doit lui survivre — C-11 l'annonce au candidat avant
 * qu'il clôture, et l'obligation comptable l'impose. Supprimer la ligne
 * emporterait le reçu ; la garder telle quelle ne supprimerait rien. Ce qui
 * part est donc tout ce qui nomme quelqu'un, et ce qui reste est un compte
 * sans personne : des montants, des dates, des compteurs.
 *
 * La frontière se lit en une phrase : **ce qui décrit une personne s'en va,
 * ce qui décrit une transaction reste.**
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/**
 * Domaine des adresses d'un compte anonymisé.
 *
 * `.invalid` est réservé par la RFC 2606 et ne peut être délégué à
 * personne : aucun courrier ne partira jamais vers une de ces adresses,
 * même le jour d'une erreur de requête dans un envoi de masse.
 */
export const DOMAINE_COMPTE_SUPPRIME = "comptes.invalid";

/**
 * Adresse de remplacement, construite sur un jeton **aléatoire**.
 *
 * Surtout pas sur une empreinte de l'adresse d'origine. Un condensat
 * d'email se retrouve par dictionnaire — l'espace des adresses est
 * énumérable — et ce serait une pseudonymisation déguisée en anonymisation :
 * le compte resterait rattachable à une personne par quiconque tient la
 * liste. Le jeton ne dit rien de qui était là.
 *
 * Elle reste unique, comme l'exige la colonne, et libère l'adresse réelle :
 * quelqu'un qui supprime son compte peut se réinscrire avec la même adresse.
 */
export const adresseAnonymisee = (jeton: string): string =>
  `supprime-${jeton}@${DOMAINE_COMPTE_SUPPRIME}`;

/** Reconnaît un compte déjà anonymisé, sans relire la date. */
export const estAnonymisee = (email: string): boolean =>
  email.endsWith(`@${DOMAINE_COMPTE_SUPPRIME}`);

/**
 * Ce qui disparaît, dans l'ordre où cela concerne le candidat. Le premier
 * point est celui pour lequel il est venu.
 */
export const CE_QUI_PART: readonly string[] = [
  "Tes pièces sont supprimées de nos serveurs tout de suite : passeport, relevés, diplômes, tout.",
  "Ton nom, ton adresse email et ton téléphone sont effacés de nos bases.",
  "Ton profil, tes réponses d'entretien et tes alertes sont supprimés.",
  "Tes sessions sont fermées sur tous tes appareils.",
];

/**
 * Ce qui reste, et pourquoi. Écrit avant le bouton, jamais après : quelqu'un
 * qui découvre après coup qu'une trace subsiste a été trompé, même si la
 * trace est légitime.
 */
export const CE_QUI_RESTE: readonly string[] = [
  "Tes reçus de paiement, sans ton nom, pour l'obligation comptable.",
  "Le décompte des analyses consommées, sans ton nom, pour nos comptes.",
  "L'historique de tes consentements, conservé cinq ans comme l'exige la réglementation.",
];

export const AVERTISSEMENT_IRREVERSIBLE =
  "La suppression est définitive. Personne, chez nous, ne peut retrouver ce compte ensuite.";

/**
 * Ce que la suppression emporte sans retour possible.
 *
 * La première rédaction disait « télécharge tes dossiers avant » — et
 * l'export n'existe pas : le bouton de C-11 mène à une adresse qui répond
 * 404. Conseiller un geste impossible juste avant un geste irréversible est
 * la pire des deux fautes. La phrase dit donc ce qui est vrai aujourd'hui :
 * les fichiers téléversés sont encore sur l'appareil qui les a envoyés, ce
 * que la plateforme en a écrit ne l'est nulle part ailleurs.
 */
export const A_FAIRE_AVANT =
  "Recopie ce que tu veux garder : tes pièces sont encore sur l'appareil qui les a envoyées, mais les lettres rédigées ici n'existent qu'ici.";

/** Libellé du champ de confirmation. Le mot de passe, parce qu'il est déjà connu. */
export const LIBELLE_CONFIRMATION = "Ton mot de passe, pour confirmer";

export const AIDE_CONFIRMATION =
  "Nous le demandons pour qu'un appareil laissé ouvert ne suffise pas à supprimer ton compte.";
