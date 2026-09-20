/**
 * Portabilité et archive — A-05, C-11, WF-15.
 *
 * Deux téléchargements, deux besoins, et les confondre donnerait un fichier
 * qui ne sert ni à l'un ni à l'autre :
 *
 * - **Mes données** répond au droit d'accès et de portabilité. Il faut un
 *   format structuré et relisible par une machine : c'est du JSON, et il
 *   couvre le compte entier.
 * - **Mon dossier** répond à un geste, pas à un droit : quelqu'un qui va
 *   clôturer veut garder ce qu'il a réuni avant que la purge l'emporte. Il
 *   faut quelque chose qui se lise et s'imprime, dossier par dossier.
 *
 * Les fichiers téléversés ne sont dans aucun des deux. Ils se téléchargent
 * un par un, par une URL signée valable cinq minutes, générée au clic
 * (règle d'architecture 4). Ce n'est pas un pis-aller : une archive unique
 * de plusieurs dizaines de méga-octets, sur une connexion mobile qui coupe,
 * échoue au bout de quatre minutes et ne laisse rien. Pièce par pièce, ce
 * qui est passé est passé.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/**
 * Version du format. Elle est dans le fichier parce qu'un export se relit
 * des mois après : sans elle, un champ renommé rend illisible ce qui a été
 * exporté avant.
 */
export const VERSION_EXPORT = "1.0";

/** « immipro-mes-donnees-2026-09-20.json ». */
export const nomDuFichier = (jour: string): string => `immipro-mes-donnees-${jour}.json`;

/**
 * Ce que le fichier dit de lui-même, en tête. Quelqu'un qui l'ouvre six
 * mois plus tard, sans le contexte de l'écran, doit comprendre ce qu'il a
 * sous les yeux et ce qui manque.
 */
export const A_PROPOS =
  "Export des données de ton compte ImmiPro. Les fichiers que tu as téléversés n'y sont pas : ils se téléchargent un par un depuis l'archive de chaque dossier, par un lien valable cinq minutes.";

/** Ce que l'export contient, dans l'ordre où cela intéresse la personne. */
export const CE_QUE_CONTIENT: readonly string[] = [
  "Ton compte : nom, adresse email, téléphone, pays, date d'inscription.",
  "Ton profil : objectif, diplôme, domaine, langues, budget déclaré.",
  "Tes dossiers : destination, dates, état de chaque pièce et verdict de chaque analyse.",
  "Les textes que tu as rédigés ici, dans toutes leurs versions.",
  "Tes reçus de paiement, tes analyses consommées et tes autorisations.",
];

/**
 * Ce qu'il ne contient pas, et pourquoi. Écrit avant le bouton : découvrir
 * après téléchargement que les pièces n'y sont pas ferait recommencer.
 */
export const CE_QUE_NE_CONTIENT_PAS: readonly string[] = [
  "Les fichiers eux-mêmes — passeport, relevés, diplômes. Ils se téléchargent depuis l'archive de chaque dossier, un par un.",
  "Les pièces déjà purgées : leur contenu n'existe plus, seuls le verdict et sa date restent.",
];

export const MENTION_FORMAT =
  "Le fichier est au format JSON. Il s'ouvre dans un éditeur de texte, et se relit par un autre service.";

/**
 * Archive d'un dossier — C-11.
 *
 * L'écran s'imprime : c'est ce qui en fait un PDF sans qu'aucune
 * bibliothèque ne le fabrique, et ce qui le rend lisible sur un poste
 * partagé de cybercafé où rien ne s'installe.
 */
export const TITRE_ARCHIVE = "Archive du dossier";

export const MENTION_IMPRESSION =
  "Cette page s'imprime. Depuis ton navigateur, « Imprimer » puis « Enregistrer au format PDF ».";

/**
 * Ce que l'archive ne peut pas rendre. La phrase est au présent et sans
 * détour : une pièce purgée ne revient pas, et le dire au moment où
 * quelqu'un vient chercher ses fichiers vaut mieux qu'un lien qui échoue.
 */
export const MENTION_PIECE_PURGEE =
  "Le contenu de cette pièce a été supprimé. Le verdict de l'analyse et sa date restent.";

export const MENTION_LIEN_COURT =
  "Chaque lien de téléchargement est créé au clic et vaut cinq minutes. Passé ce délai, redemande-le.";
