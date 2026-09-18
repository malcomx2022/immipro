import type {
  Classement,
  DestinationEcartee,
  FicheDestination,
  Mention,
} from "@/domain/destinations/fiche";

/**
 * Contenu de référence des fiches destination.
 *
 * Provisoire et assumé comme tel : les fiches viendront du référentiel
 * `visa_rules` une fois le schéma Prisma dérivé de DOC-11 (le prototype ne
 * modélise pas la donnée, §5 du guide de démarrage). D'ici là, les valeurs
 * sont celles du prototype, qui sont définitives et portent leur source.
 *
 * Le jour où la lecture passe en base, seul ce fichier change : les écrans
 * ne connaissent que les types de `domain/destinations/fiche`.
 */
const VERIFIEE_LE = "2026-09-11";

const MENTION_CLASSEMENT: Mention = {
  source: "ind.nl, make-it-in-germany.com, canada.ca, campusfrance.org",
  verifieeLe: VERIFIEE_LE,
};

export const PAYS_BAS: FicheDestination = {
  slug: "pays-bas",
  code: "NL",
  pays: "Pays-Bas",
  intitule: "Séjour études — permis VVR étudiant",
  resume: "Séjour études, licence acceptée avec anglais B2.",
  reperes: [
    { intitule: "Coût de la première année", valeur: "6 900 000 F" },
    { intitule: "Ressources à prouver", valeur: "1 130,77 € / mois" },
    { intitule: "Fenêtre après diplôme", valeur: "12 mois" },
    { intitule: "Délai d'instruction", valeur: "60 jours" },
  ],
  conditions: [
    { intitule: "Admission", valeur: "Établissement agréé IND" },
    { intitule: "Ressources", valeur: "1 130,77 € par mois" },
    { intitule: "Passeport", valeur: "Valide 6 mois après le retour" },
    { intitule: "Assurance", valeur: "Obligatoire dès l'arrivée" },
    { intitule: "Frais de demande", valeur: "243 € · 159 000 F" },
  ],
  travailEtudiant:
    "16 heures par semaine pendant l'année, ou temps plein en juin, juillet et août. L'employeur doit détenir un permis de travail à ton nom : c'est lui qui en fait la demande, pas toi.",
  apresDiplome:
    "Le permis « zoekjaar » ouvre 12 mois de recherche d'emploi sans conditions de salaire, à demander dans les trois ans suivant l'obtention du diplôme.",
  reserves: [
    {
      ton: "attention",
      texte:
        "Le montant de ressources est réévalué chaque année en janvier. Une demande déposée après la publication du nouveau barème est instruite sur le montant à jour.",
    },
    {
      ton: "neutre",
      texte:
        "Les délais d'instruction de 60 jours sont des délais légaux maximums, pas des délais observés.",
    },
  ],
  piecesAReunir: 8,
  mention: {
    source: "ind.nl",
    verifieeLe: VERIFIEE_LE,
    relectureLe: "2026-12-11",
    autorite: "Immigratie- en Naturalisatiedienst (ind.nl)",
  },
};

export const ALLEMAGNE: FicheDestination = {
  slug: "allemagne",
  code: "DE",
  pays: "Allemagne",
  intitule: "Séjour études — visa national D",
  resume: "Compte bloqué obligatoire, cursus en anglais disponible.",
  reperes: [
    { intitule: "Coût de la première année", valeur: "7 400 000 F" },
    { intitule: "Compte bloqué", valeur: "11 904 € / an" },
    { intitule: "Fenêtre après diplôme", valeur: "18 mois" },
    { intitule: "Délai d'instruction", valeur: "6 à 12 semaines" },
  ],
  conditions: [
    { intitule: "Admission", valeur: "Établissement reconnu par le Land" },
    { intitule: "Ressources", valeur: "11 904 € sur compte bloqué" },
    { intitule: "Passeport", valeur: "Valide pendant tout le séjour" },
    { intitule: "Assurance", valeur: "Obligatoire dès la demande" },
  ],
  travailEtudiant:
    "140 jours pleins ou 280 demi-journées par an, sans autorisation préalable.",
  apresDiplome:
    "18 mois de recherche d'emploi correspondant au niveau du diplôme obtenu.",
  reserves: [
    {
      ton: "attention",
      texte:
        "Le montant du compte bloqué est fixé chaque année par le ministère fédéral des Affaires étrangères et s'applique à la date de la demande.",
    },
  ],
  piecesAReunir: 9,
  mention: {
    source: "make-it-in-germany.com",
    verifieeLe: VERIFIEE_LE,
    relectureLe: "2026-12-11",
    autorite: "Make it in Germany — portail du gouvernement fédéral",
  },
};

export const CANADA: FicheDestination = {
  slug: "canada",
  code: "CA",
  pays: "Canada",
  intitule: "Permis d'études",
  resume:
    "Budget au-dessus de ta fourchette, fenêtre après diplôme la plus longue.",
  reperes: [
    { intitule: "Coût de la première année", valeur: "11 200 000 F" },
    { intitule: "Ressources à prouver", valeur: "20 635 CAD / an" },
    { intitule: "Fenêtre après diplôme", valeur: "jusqu'à 36 mois" },
    { intitule: "Délai d'instruction", valeur: "12 semaines" },
  ],
  conditions: [
    { intitule: "Admission", valeur: "Établissement désigné (EED)" },
    { intitule: "Ressources", valeur: "20 635 CAD par an, hors scolarité" },
    { intitule: "Passeport", valeur: "Valide pendant tout le séjour" },
    { intitule: "Attestation provinciale", valeur: "Exigée dans la plupart des provinces" },
  ],
  travailEtudiant:
    "24 heures par semaine hors campus pendant les sessions, temps plein pendant les congés prévus au calendrier.",
  apresDiplome:
    "Le permis de travail post-diplôme ouvre jusqu'à 36 mois, selon la durée du programme suivi.",
  reserves: [
    {
      ton: "attention",
      texte:
        "Le plafond national de permis d'études est révisé chaque année : une place d'attestation provinciale peut manquer même avec une admission valide.",
    },
  ],
  piecesAReunir: 11,
  mention: {
    source: "canada.ca",
    verifieeLe: VERIFIEE_LE,
    relectureLe: "2026-12-11",
    autorite: "Immigration, Réfugiés et Citoyenneté Canada (canada.ca)",
  },
};

export const FICHES: readonly FicheDestination[] = [PAYS_BAS, ALLEMAGNE, CANADA];

const ECARTEES: readonly DestinationEcartee[] = [
  {
    code: "FR",
    pays: "France",
    motif:
      "Campagne Campus France close pour la rentrée 2027, réouverture en octobre.",
  },
  {
    code: "AU",
    pays: "Australie",
    motif:
      "Coût de la première année à 19 millions F, au-delà de ta fourchette.",
  },
  {
    code: "GB",
    pays: "Royaume-Uni",
    motif:
      "IELTS 6.5 exigé par la majorité des cursus, ton niveau déclaré est B2.",
  },
];

/**
 * Classement affiché sur P-03. Le tri viendra du moteur de règles ; ici il
 * est celui du prototype, et la mention rappelle sur quoi il porte.
 */
export const CLASSEMENT: Classement = {
  retenues: FICHES,
  ecartees: ECARTEES,
  mention: MENTION_CLASSEMENT,
};

/** Les trois destinations les plus demandées, mises en avant sur P-01. */
export const LES_PLUS_DEMANDEES = [
  {
    fiche: PAYS_BAS,
    cout: "Environ 6 900 000 F par an, frais et vie courante",
    fenetre: "Fenêtre après diplôme : 12 mois",
  },
  {
    fiche: CANADA,
    cout: "Environ 11 200 000 F par an, frais et vie courante",
    fenetre: "Fenêtre après diplôme : jusqu'à 36 mois",
  },
  {
    fiche: ALLEMAGNE,
    cout: "Environ 7 400 000 F par an, frais et vie courante",
    fenetre: "Fenêtre après diplôme : 18 mois",
  },
] as const;

/**
 * Critères comparés sur C-03, dans l'ordre où ils écartent une destination :
 * le coût d'abord, puis ce qu'il faut prouver, puis ce qui se passe après.
 */
export const CRITERES_COMPARATEUR = [
  { cle: "cout", intitule: "Coût 1re année" },
  { cle: "ressources", intitule: "Ressources à prouver" },
  { cle: "travail", intitule: "Travail étudiant" },
  { cle: "apres", intitule: "Après diplôme" },
  { cle: "delai", intitule: "Délai d'instruction" },
  { cle: "langue", intitule: "Langue du cursus" },
  { cle: "frais", intitule: "Frais de demande" },
] as const;

export type CleCritere = (typeof CRITERES_COMPARATEUR)[number]["cle"];

export const COMPARAISON: Record<string, Record<CleCritere, string>> = {
  "pays-bas": {
    cout: "6 900 000 F",
    ressources: "13 569,24 € / an",
    travail: "16 h / semaine, permis demandé par l'employeur",
    apres: "12 mois",
    delai: "60 jours",
    langue: "Anglais",
    frais: "243 €",
  },
  allemagne: {
    cout: "7 400 000 F",
    ressources: "11 904 € bloqués",
    travail: "140 jours pleins par an, sans permis employeur",
    apres: "18 mois",
    delai: "6 à 12 semaines",
    langue: "Anglais ou allemand",
    frais: "75 €",
  },
  canada: {
    cout: "11 200 000 F",
    ressources: "20 635 CAD / an",
    travail: "24 h / semaine hors campus, sans permis séparé",
    apres: "jusqu'à 36 mois",
    delai: "12 semaines",
    langue: "Anglais ou français",
    frais: "150 CAD",
  },
};

/** Le critère qui se lit de travers le plus souvent, expliqué sous le tableau. */
export const LECTURE_ATTENTIVE = {
  titre: "Le travail étudiant se lit de près",
  texte:
    "Aux Pays-Bas, c'est l'employeur qui demande le permis de travail à ton nom, et beaucoup de petits employeurs refusent cette démarche. En Allemagne et au Canada, aucune autorisation séparée n'est requise.",
} as const;

export const MENTION_ACCUEIL: Mention = {
  source: "ind.nl, canada.ca, make-it-in-germany.com",
  verifieeLe: VERIFIEE_LE,
};
