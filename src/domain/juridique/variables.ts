/**
 * Les variables des textes juridiques — S.101.
 *
 * ── Ce qu'elles sont ────────────────────────────────────────────────
 *
 * Les brouillons de S.97 marquaient d'un `[À COMPLÉTER]` ce que le produit
 * ignore — un siège, un numéro RCCM, un hébergeur — et d'un `[À TRANCHER]`
 * ce qui demande un avis — le droit applicable, le régime de rétractation.
 * Chacune de ces marques est devenue une variable : elle se saisit dans le
 * back-office, par qui sait, et non dans le code par qui devinerait.
 *
 * Le texte qui les entoure, lui, vit dans le dépôt (`modeles.ts`) : il
 * décrit le produit tel qu'il est codé, il se relit en revue de code, et
 * son changement se voit (son empreinte change, la version publiée passe
 * « à revalider »).
 *
 * ── Ce qu'elles ne sont pas ─────────────────────────────────────────
 *
 * Aucune n'a de valeur par défaut. Une variable vide empêche la
 * publication de tout texte qui l'emploie, et le back-office nomme
 * laquelle : c'est la règle de Q.A — un texte juridique faux est pire
 * qu'une page absente — tenue jusqu'au dernier champ.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/**
 * La forme d'une valeur, et donc sa saisie et sa vérification.
 *
 * - `ligne` : une ligne de texte ;
 * - `texte` : un ou plusieurs paragraphes, séparés par une ligne vide ;
 * - `liste` : un élément par ligne, rendu en liste à puces ;
 * - `email`, `telephone`, `url` : vérifiés à la saisie.
 */
export type NatureVariable = "ligne" | "texte" | "liste" | "email" | "telephone" | "url";

export type GroupeVariable =
  | "editeur"
  | "hebergement"
  | "contact"
  | "donnees"
  | "conditions";

export const LIBELLE_GROUPE: Record<GroupeVariable, string> = {
  editeur: "L'éditeur",
  hebergement: "L'hébergement",
  contact: "Le contact",
  donnees: "Les données personnelles",
  conditions: "Les conditions de vente",
};

export interface VariableJuridique {
  cle: string;
  groupe: GroupeVariable;
  libelle: string;
  /** Ce qu'il faut saisir, et d'où le tirer. Dit à l'écran, sous le champ. */
  aide: string;
  nature: NatureVariable;
  /**
   * Facultative : le passage qui l'emploie disparaît quand elle est vide.
   * Une variable obligatoire vide bloque la publication.
   */
  facultative?: true;
}

export const VARIABLES_JURIDIQUES: readonly VariableJuridique[] = [
  // ── L'éditeur ──────────────────────────────────────────────────────
  {
    cle: "denomination",
    groupe: "editeur",
    libelle: "Dénomination sociale",
    aide: "Telle qu'inscrite au RCCM. Elle figure aussi sur les reçus de paiement, avec la forme juridique, le siège, le RCCM, l'IFU et l'adresse de contact.",
    nature: "ligne",
  },
  {
    cle: "forme_juridique",
    groupe: "editeur",
    libelle: "Forme juridique",
    aide: "Par exemple : société par actions simplifiée de droit OHADA.",
    nature: "ligne",
  },
  {
    cle: "capital_social",
    groupe: "editeur",
    libelle: "Capital social",
    aide: "Montant et devise, tels qu'inscrits aux statuts. Par exemple : 1 000 000 F CFA.",
    nature: "ligne",
  },
  {
    cle: "siege_social",
    groupe: "editeur",
    libelle: "Siège social",
    aide: "Adresse complète du siège, ville et pays.",
    nature: "ligne",
  },
  {
    cle: "rccm",
    groupe: "editeur",
    libelle: "Numéro RCCM",
    aide: "Numéro d'immatriculation au registre du commerce et du crédit mobilier. Il figure aussi sur les reçus de paiement.",
    nature: "ligne",
  },
  {
    cle: "ifu",
    groupe: "editeur",
    libelle: "Identifiant fiscal unique (IFU)",
    aide: "Tel qu'attribué par la direction générale des impôts.",
    nature: "ligne",
  },
  {
    cle: "directeur_publication",
    groupe: "editeur",
    libelle: "Directeur de la publication",
    aide: "Nom et qualité. Par exemple : Jeanne Dossou, présidente.",
    nature: "ligne",
  },
  {
    cle: "marque",
    groupe: "editeur",
    libelle: "Protection de la marque",
    aide: "La marque ImmiPro est-elle déposée, auprès de quel office (OAPI ?) et sous quel numéro ? Écrire la phrase telle qu'elle doit paraître.",
    nature: "texte",
  },
  // ── L'hébergement ──────────────────────────────────────────────────
  {
    cle: "hebergeur",
    groupe: "hebergement",
    libelle: "Hébergeur",
    aide: "Raison sociale exacte, selon le contrat d'hébergement. Aujourd'hui : un serveur privé virtuel Infomaniak, à vérifier.",
    nature: "ligne",
  },
  {
    cle: "hebergeur_adresse",
    groupe: "hebergement",
    libelle: "Adresse de l'hébergeur",
    aide: "Adresse complète du siège de l'hébergeur.",
    nature: "ligne",
  },
  {
    cle: "hebergeur_pays",
    groupe: "hebergement",
    libelle: "Pays du centre de données",
    aide: "Le pays où se trouve physiquement le serveur, selon le contrat.",
    nature: "ligne",
  },
  // ── Le contact ─────────────────────────────────────────────────────
  {
    cle: "email_contact",
    groupe: "contact",
    libelle: "Adresse électronique de contact",
    aide: "Une adresse réellement relevée : quelqu'un la lit et y répond. Une adresse qui ne répond pas est pire que pas d'adresse.",
    nature: "email",
  },
  {
    cle: "delai_reponse",
    groupe: "contact",
    libelle: "Délai de réponse annoncé",
    aide: "Le délai que l'équipe tient réellement. Par exemple : deux jours ouvrés.",
    nature: "ligne",
  },
  {
    cle: "telephone",
    groupe: "contact",
    libelle: "Téléphone",
    aide: "Facultatif. Au format international : +229 01 00 00 00 00.",
    nature: "telephone",
    facultative: true,
  },
  {
    cle: "horaires",
    groupe: "contact",
    libelle: "Horaires",
    aide: "Facultatif. Par exemple : du lundi au vendredi, de 9 h à 17 h, heure de Cotonou.",
    nature: "ligne",
    facultative: true,
  },
  {
    cle: "adresse_postale",
    groupe: "contact",
    libelle: "Adresse postale",
    aide: "Facultatif, si elle diffère du siège social.",
    nature: "ligne",
    facultative: true,
  },
  // ── Les données personnelles ───────────────────────────────────────
  {
    cle: "responsable_traitement",
    groupe: "donnees",
    libelle: "Responsable du traitement",
    aide: "L'entité responsable, et la personne ou la fonction chargée de la protection des données.",
    nature: "texte",
  },
  {
    cle: "email_donnees",
    groupe: "donnees",
    libelle: "Adresse pour exercer ses droits",
    aide: "L'adresse où écrire pour l'accès, la rectification, l'opposition. Peut être l'adresse de contact.",
    nature: "email",
  },
  {
    cle: "autorite_controle",
    groupe: "donnees",
    libelle: "Autorité de contrôle et formalités",
    aide: "L'autorité compétente (APDP au Bénin ?) et les formalités accomplies : déclaration, autorisation, notamment pour les pièces d'identité.",
    nature: "texte",
  },
  {
    cle: "bases_legales",
    groupe: "donnees",
    libelle: "Bases légales des traitements",
    aide: "Pour chaque catégorie de données (compte, profil, dossier, pièces, textes, paiements, consentements, rendez-vous, sécurité), la base légale retenue. Une ligne par catégorie.",
    nature: "liste",
  },
  {
    cle: "sous_traitants",
    groupe: "donnees",
    libelle: "Sous-traitants",
    aide: "Un sous-traitant par ligne : nom, rôle et pays de traitement. Hébergement, prestataire d'IA retenu, FedaPay, Stripe, messagerie.",
    nature: "liste",
  },
  {
    cle: "transferts",
    groupe: "donnees",
    libelle: "Transferts hors du Bénin",
    aide: "L'encadrement juridique de chaque transfert et les formalités accomplies.",
    nature: "texte",
  },
  {
    cle: "ia_conservation",
    groupe: "donnees",
    libelle: "Ce que le prestataire d'IA fait des données",
    aide: "Conservation, entraînement de modèles : selon le contrat souscrit avec le prestataire retenu.",
    nature: "texte",
  },
  {
    cle: "duree_comptable",
    groupe: "donnees",
    libelle: "Durée de conservation comptable",
    aide: "La durée légale de conservation des reçus, factures, avoirs et écritures de paiement : 10 ans selon l'avis comptable M.C (OHADA et fiscal béninois).",
    nature: "ligne",
  },
  {
    cle: "securite_complements",
    groupe: "donnees",
    libelle: "Chiffrement au repos et sauvegardes",
    aide: "Ce qui est réellement en place : chiffrement des données au repos, fréquence et durée de conservation des sauvegardes.",
    nature: "texte",
  },
  {
    cle: "age_minimum",
    groupe: "donnees",
    libelle: "Âge minimum",
    aide: "L'âge minimum pour créer un compte et payer, et ce qui est prévu pour un mineur.",
    nature: "texte",
  },
  {
    cle: "information_modifications",
    groupe: "donnees",
    libelle: "Information en cas de modification",
    aide: "Comment et avec quel délai les utilisateurs sont informés d'une modification importante de la page « Données personnelles ».",
    nature: "texte",
  },
  // ── Les conditions de vente ────────────────────────────────────────
  {
    cle: "mention_tva",
    groupe: "conditions",
    libelle: "Régime de TVA",
    aide: "La mention à porter près des prix, selon le régime de TVA applicable.",
    nature: "ligne",
  },
  {
    cle: "piece_comptable",
    groupe: "conditions",
    libelle: "Pièce comptable émise",
    aide: "Les précisions sur la facture remise après chaque paiement confirmé : facture normalisée et code de certification, régime de TVA de Rêveur Digital (avis comptable M.C du 04/10/2026).",
    nature: "texte",
  },
  {
    cle: "retractation",
    groupe: "conditions",
    libelle: "Droit de rétractation",
    aide: "Le régime applicable et son délai, le cas des candidats qui paient en euros depuis l'Union européenne, et l'exception pour un service exécuté avec l'accord exprès du candidat.",
    nature: "texte",
  },
  {
    cle: "remboursement_mobile_money",
    groupe: "conditions",
    libelle: "Remboursement Mobile Money",
    aide: "Chez le prestataire actuel, un remboursement n'est possible que par MTN Mobile Money. Ce qui est prévu pour un paiement fait par un autre opérateur.",
    nature: "texte",
  },
  {
    cle: "remboursement_demande",
    groupe: "conditions",
    libelle: "Demande de remboursement",
    aide: "Par quelle voie le candidat demande un remboursement, et dans quel délai il reçoit une réponse.",
    nature: "texte",
  },
  {
    cle: "mandat_consultant",
    groupe: "conditions",
    libelle: "Encaissement pour les consultants",
    aide: "Le mandat d'encaissement et le reversement du prix de la consultation au consultant.",
    nature: "texte",
  },
  {
    cle: "suspension_compte",
    groupe: "conditions",
    libelle: "Suspension et fermeture d'un compte",
    aide: "Les cas où ImmiPro peut suspendre ou fermer un compte : fraude, faux documents, usage abusif, et la procédure suivie.",
    nature: "texte",
  },
  {
    cle: "responsabilite",
    groupe: "conditions",
    libelle: "Limites de responsabilité",
    aide: "Plafond de responsabilité, force majeure, interruptions pour maintenance.",
    nature: "texte",
  },
  {
    cle: "modification_conditions",
    groupe: "conditions",
    libelle: "Modification des conditions",
    aide: "Le délai de préavis avant l'entrée en vigueur d'une nouvelle version, et si une nouvelle acceptation est demandée.",
    nature: "texte",
  },
  {
    cle: "droit_applicable",
    groupe: "conditions",
    libelle: "Droit applicable et litiges",
    aide: "Le droit applicable, le cas des candidats consommateurs résidant hors du Bénin, une médiation préalable éventuelle, la juridiction compétente.",
    nature: "texte",
  },
];

export type Valeurs = Readonly<Record<string, string>>;

export const variable = (cle: string): VariableJuridique | undefined =>
  VARIABLES_JURIDIQUES.find((v) => v.cle === cle);

/* ------------------------------------------------------------------ *
 * La vérification d'une valeur.
 * ------------------------------------------------------------------ */

/** Au-delà, ce n'est plus une variable, c'est un texte à relire en revue de code. */
export const LONGUEUR_MAXI: Record<NatureVariable, number> = {
  ligne: 300,
  email: 254,
  telephone: 40,
  url: 300,
  liste: 4000,
  texte: 4000,
};

/**
 * Le motif du refus d'une valeur, ou `null` si elle est admise.
 *
 * Une valeur vide n'est pas refusée ici : elle s'enregistre, comme un
 * brouillon. C'est la publication qui exige les variables d'un texte —
 * la même règle que B-08, pour la même raison.
 */
export function motifDeRefus(v: VariableJuridique, valeur: string): string | null {
  const texte = valeur.trim();
  if (texte === "") return null;
  if (texte.length > LONGUEUR_MAXI[v.nature]) {
    return `« ${v.libelle} » dépasse ${LONGUEUR_MAXI[v.nature]} caractères : raccourcir, ou faire évoluer le texte lui-même en revue de code.`;
  }
  if (texte.includes("{{") || texte.includes("}}")) {
    return `« ${v.libelle} » ne peut pas contenir « {{ » ni « }} », réservés aux variables des modèles.`;
  }
  switch (v.nature) {
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(texte)
        ? null
        : `« ${v.libelle} » n'est pas une adresse électronique : attendu par exemple contact@immipro.app.`;
    case "telephone":
      return /^\+\d[\d\s.-]{6,}$/u.test(texte)
        ? null
        : `« ${v.libelle} » doit commencer par l'indicatif international : par exemple +229 01 00 00 00 00.`;
    case "url":
      return /^https:\/\/[^\s]+$/u.test(texte)
        ? null
        : `« ${v.libelle} » doit être une adresse en https://.`;
    case "ligne":
      return texte.includes("\n")
        ? `« ${v.libelle} » tient sur une ligne : pour plusieurs paragraphes, c'est une autre variable.`
        : null;
    case "liste":
    case "texte":
      return null;
    default: {
      const jamais: never = v.nature;
      return jamais;
    }
  }
}

/** Les refus de toutes les valeurs saisies, par clé. Une clé inconnue est refusée. */
export function verifierLesValeurs(valeurs: Valeurs): Record<string, string> {
  const refus: Record<string, string> = {};
  for (const [cle, valeur] of Object.entries(valeurs)) {
    const v = variable(cle);
    if (!v) {
      refus[cle] = `« ${cle} » n'est pas une variable des textes juridiques.`;
      continue;
    }
    const motif = motifDeRefus(v, valeur);
    if (motif) refus[cle] = motif;
  }
  return refus;
}

/** Une valeur renseignée : non vide une fois débarrassée de ses espaces. */
export const renseignee = (valeurs: Valeurs, cle: string): boolean =>
  (valeurs[cle] ?? "").trim() !== "";
