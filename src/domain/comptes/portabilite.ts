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
  "Pour chaque dossier : le palier de complétude, les manques dans l'ordre où ils te sont présentés, et ce qui a pesé pour l'établir.",
  /*
    Les décisions que le candidat a prises lui-même, et que l'export ne
    rendait pas : son arbitrage quand une règle change (T-02), sa réponse
    à une proposition de partenaire (T-03). L'en-tête de la lecture dit
    que l'export « couvre le compte entier », et `CE_QUE_NE_CONTIENT_PAS`
    existe pour annoncer les manques avant le bouton — ces deux-là
    n'étaient ni dans l'un ni dans l'autre.
  */
  "Tes décisions : ce que tu as choisi quand une règle a changé sur un dossier, et ta réponse à chaque proposition de partenaire.",
  "Tes rendez-vous avec un consultant : date, durée, cabinet et suite donnée.",
];

/**
 * Ce qu'il ne contient pas, et pourquoi. Écrit avant le bouton : découvrir
 * après téléchargement que les pièces n'y sont pas ferait recommencer.
 */
export const CE_QUE_NE_CONTIENT_PAS: readonly string[] = [
  "Les fichiers eux-mêmes — passeport, relevés, diplômes. Ils se téléchargent depuis l'archive de chaque dossier, un par un.",
  "Les pièces déjà purgées : leur contenu n'existe plus, seuls le verdict et sa date restent.",
  // L.A — la limite est annoncée avant le téléchargement, comme le reste.
  // Découvrir dans le fichier qu'une chose manque vaut moins que le lire
  // sur l'écran qui propose de le produire.
  "La pondération interne des facteurs de complétude. L'export dit ce qui a pesé et dans quel ordre, pas avec quels coefficients.",
];

/**
 * Ce que l'export rend, table par table — et ce qu'il ne rend pas.
 *
 * ── Deux décisions du candidat n'y étaient pas ──────────────────────
 *
 * L'en-tête de la lecture dit que l'export « couvre le compte entier », et
 * `CE_QUE_NE_CONTIENT_PAS` existe pour annoncer les manques **avant** le
 * bouton. Deux tables échappaient aux deux : `RuleMigration`, qui porte
 * l'arbitrage rendu quand une règle change (T-02), et `PartnerReferral`,
 * qui porte la réponse à une proposition de partenaire (T-03). Ce sont ses
 * décisions, prises sur ses écrans, et le fichier n'en disait rien.
 * Constaté en exécution sur un compte qui avait les deux.
 *
 * Le champ `rendezVous` de la racine, lui, valait `[]` sur un compte qui
 * en avait : une liste vide ne renvoie pas vers les dossiers, elle dit
 * qu'il n'y en a aucun.
 *
 * ── Pourquoi une table plutôt qu'une relecture ──────────────────────
 *
 * Un oubli d'export ne se voit pas : le fichier produit est bien formé, il
 * lui manque seulement une clé que personne ne cherche. La table ci-dessous
 * oblige à décider, relation par relation, et un essai la compare au schéma
 * Prisma — une relation ajoutée au compte ou au dossier sans décision ne
 * passe plus.
 *
 * `false` est une décision écrite, pas un oubli : elle dit pourquoi.
 */
export const EXPORTE: Record<string, true | string> = {
  // Sur le compte
  profile: true,
  consents: true,
  applications: true,
  transactions: true,
  notifications: true,
  aiUsage:
    "Comptage de jetons par opération (INV-6). C'est une mesure de notre consommation, pas une donnée fournie par la personne ; son équivalent lisible — les analyses consommées — est exporté depuis `AnalysisCredit`.",
  sessions:
    "Empreintes de session et dates de connexion. Les exporter rendrait un fichier qui, volé, dit où et quand se connecter ; la liste des appareils se consulte à l'écran, où elle se révoque.",
  secrets:
    "Empreintes de mot de passe et secrets d'authentification. Rien de ce qui protège le compte ne sort du serveur.",
  // Sur un dossier
  documents: true,
  deadlines: true,
  credits: true,
  migrations: true,
  appointments: true,
  correctionsDeDepot: true,
  completenessReviews: true,
  referrals: true,
  accesses:
    "Accords de partage avec un consultant. Ils se lisent et se révoquent à l'écran ; leur export reste à trancher, comme le journal d'audit des accès administrateurs à une pièce (RG-15.1).",
};

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
