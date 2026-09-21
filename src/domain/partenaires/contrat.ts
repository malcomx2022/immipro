/**
 * Ce qu'un contrat de partenariat doit fixer — K.D, tranché le 20/09/2026.
 *
 * Aucun partenaire, aucun taux de commission et aucun parcours partenaire
 * n'est activé en production avant la signature d'un contrat réel. Tant
 * qu'il n'y en a pas, le taux, la devise due et le mode de rapprochement
 * sont des hypothèses — et une hypothèse écrite dans une colonne se lit
 * comme un fait au bout de six mois.
 *
 * **Ce module ne rédige aucun contrat et n'en modélise pas un.** Il
 * énumère ce que le premier devra fixer, pour que la personne qui le
 * négocie ait la liste sous les yeux et que celle qui branchera le
 * rapprochement sache ce qu'elle doit y trouver. Inventer un modèle
 * `PartnerContract` maintenant reviendrait à deviner la forme d'un accord
 * qui n'existe pas — et ses colonnes prendraient des valeurs par défaut,
 * qui sont exactement ce que K.D interdit.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/**
 * Les huit points, dans l'ordre où ils se posent en négociation : ce qu'on
 * vend, où, à quel prix, dans quelle monnaie, à quel moment c'est dû, ce
 * qu'il advient si ça se défait, comment on se compte, et quand ça court.
 */
export const TERMES_DU_CONTRAT: readonly string[] = [
  "Le genre de prestation concerné — l'un des cinq du modèle, et lui seul.",
  "Les destinations couvertes, pays par pays : c'est la maille de l'activation.",
  "Le taux ou le montant de la commission.",
  "La devise dans laquelle la commission est due.",
  "Le fait générateur de la commission : ce qui la rend due, et à quelle seconde.",
  "Le traitement des annulations et des remboursements.",
  "La méthode et la périodicité du rapprochement.",
  "La date d'entrée en vigueur et, le cas échéant, la date de fin.",
];

/**
 * Ce qui reste vrai tant qu'aucun contrat n'est signé, et qui est déjà
 * l'état du produit — ce module ne l'instaure pas, il le nomme.
 *
 * Les trois tiennent par des mécanismes différents, et c'est voulu : une
 * requête, un refus au démarrage, une absence d'appelant. Aucun des trois
 * ne dépend de la vigilance de qui relit.
 */
export const TANT_QU_AUCUN_CONTRAT: readonly string[] = [
  "Un partenaire sans activation vérifiée pour le pays du dossier n'existe pour aucun dossier. Le filtre est dans la requête, jamais dans l'affichage.",
  "Le jeu de démonstration refuse de s'écrire en production, et son partenaire n'est pas un partenaire réel.",
  "L'enregistrement d'un aboutissement n'a aucun appelant. La règle de calcul est écrite, le branchement ne l'est pas.",
];
