import { MENTION_ENCAISSEMENT_SUSPENDU } from "@/domain/paiement/ouverture";
import {
  MENTION_FACTURATION_EN_ATTENTE,
  MENTION_IDENTITE_MANQUANTE,
} from "@/domain/facturation/facture";
/**
 * Contrat d'échec de l'API — DOC-12 §16, « Langue des messages d'erreur ».
 *
 * Les sept règles d'écriture du prototype portent sur des écrans. Elles se
 * tiennent en réalité ici : un écran ne peut pas écrire « ton brouillon est
 * conservé » si la réponse du serveur ne le lui dit pas, et il ne peut pas
 * taire un code technique que le serveur lui a envoyé dans le corps.
 *
 * Trois règles deviennent donc structurelles, et non plus des consignes de
 * relecture :
 *
 * - **Règle 1 — le titre nomme le fait.** `titre` est obligatoire et dit ce
 *   qui n'a pas eu lieu, jamais « une erreur est survenue ».
 * - **Règle 2 — le corps dit ce qui est conservé.** `conserve` est un champ
 *   à part entière, exigé sur tout échec survenant en cours de saisie ou de
 *   dépôt. Un test vérifie qu'aucun de ces échecs ne part sans lui.
 * - **Règle 3 — aucun code technique dans un écran candidat.** Le
 *   `diagnostic` (code interne, service, horodatage) vit dans un champ
 *   séparé que `pourCandidat` ne sérialise pas et que `pourOperateur`
 *   conserve. La règle cesse d'être une discipline d'écriture : la donnée
 *   n'arrive pas jusqu'à l'écran candidat.
 *
 * La règle 4 (une seule action principale) appartient à l'écran : le serveur
 * propose `action`, l'écran en fait un bouton. La règle 5 (tutoiement) tient
 * dans les textes ci-dessous. La règle 7 (rouge pour l'échec, ambre pour
 * l'attente) passe par `ton`, que l'écran traduit en couleur — le serveur ne
 * décide pas d'un jeton de couleur, il décide de la nature de l'échec.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau. Il vit dans
 * le domaine depuis la revue du 07/10/2026 (F8) : des écrans client
 * (`lib/api.ts`, la pièce d'un dossier) importaient la valeur `ECHECS`
 * depuis `src/server`. `server/http/echecs.ts` garde ce qui lève et
 * sérialise, et réexporte ce catalogue : ses importateurs ne changent pas.
 */

/**
 * Nature de l'échec, d'où l'écran tire sa couleur (règle 7).
 *
 * - `echec` : quelque chose n'a pas eu lieu et ne se reproduira pas seul.
 * - `attente` : rien n'a échoué, tout est différé — le hors-ligne de $-06.
 * - `limite` : une borne prévue est atteinte, comme le quota de C-07. Ni
 *   rouge ni ambre : ce n'est pas une panne, et l'écrire comme telle ferait
 *   croire à un défaut du produit.
 */
export type Ton = "echec" | "attente" | "limite";

export type CodeEchec =
  // Requête
  | "corps_illisible"
  | "champs_invalides"
  | "methode_refusee"
  // Accès
  | "authentification_requise"
  | "droits_insuffisants"
  | "introuvable"
  | "trop_de_requetes"
  | "origine_refusee"
  // Consentement et quota
  | "consentement_manquant"
  | "quota_epuise"
  | "redaction_non_couverte"
  // Dossier
  | "dossiers_au_maximum"
  | "regle_indisponible"
  | "dossier_fige"
  | "etat_incompatible"
  // Pièce
  | "fichier_refuse"
  | "piece_deja_deposee"
  | "televersement_indisponible"
  // Paiement
  | "montant_sous_le_minimum"
  | "devise_figee"
  | "montee_indisponible"
  | "creneau_indisponible"
  | "paiement_indisponible"
  | "paiement_sans_conditions"
  | "paiement_sans_facturation"
  | "facturation_identite_manquante"
  | "ouverture_impossible"
  | "ouverture_refusee"
  | "signature_invalide"
  | "paiement_introuvable"
  | "recu_indisponible"
  // Back-office
  | "rapprochement_en_cours"
  // Contenu éditorial et textes d'une règle
  | "publication_refusee"
  // Infrastructure
  | "service_indisponible";

export interface Echec {
  code: CodeEchec;
  statut: number;
  /** Règle 1 : le fait, pas le sentiment. */
  titre: string;
  /** Le corps du message. Tutoiement (règle 5). */
  corps: string;
  /**
   * Règle 2 : ce qui reste, écrit avant toute action. Absent seulement
   * quand rien n'était en cours — un droit refusé n'interrompt aucune saisie.
   */
  conserve?: string;
  /** Règle 4 : ce qu'il y a à faire maintenant. L'écran en fait un bouton. */
  action: string;
  ton: Ton;
}

/**
 * Catalogue. Un échec absent d'ici ne peut pas être renvoyé : c'est ce qui
 * empêche un « quelque chose s'est mal passé » d'apparaître le jour d'une
 * nouvelle route.
 */
export const ECHECS: Record<CodeEchec, Omit<Echec, "code">> = {
  corps_illisible: {
    statut: 400,
    titre: "La demande n'a pas pu être lue",
    corps: "Le contenu envoyé n'est pas au format attendu.",
    action: "Recommencer depuis l'écran",
    ton: "echec",
  },
  champs_invalides: {
    statut: 422,
    titre: "Certaines réponses ne sont pas exploitables",
    corps: "Les champs signalés sous chaque question disent ce qui manque.",
    conserve: "Tes autres réponses sont gardées, tu n'as rien à ressaisir.",
    action: "Corriger les champs signalés",
    ton: "echec",
  },
  methode_refusee: {
    statut: 405,
    titre: "Cette action n'est pas possible ici",
    corps: "L'adresse demandée ne traite pas ce type de demande.",
    action: "Revenir à l'écran précédent",
    ton: "echec",
  },
  authentification_requise: {
    statut: 401,
    titre: "Ta session a expiré",
    corps: "Il faut te reconnecter pour continuer.",
    conserve: "Ton dossier est conservé en l'état, rien n'est perdu.",
    action: "Se reconnecter",
    ton: "echec",
  },
  droits_insuffisants: {
    statut: 403,
    titre: "Cet espace ne t'est pas ouvert",
    corps: "Ton compte n'a pas accès à cette partie de la plateforme.",
    action: "Revenir à mes dossiers",
    ton: "echec",
  },
  introuvable: {
    statut: 404,
    titre: "Cette page n'existe pas ou plus",
    corps: "Le lien est peut-être ancien, ou l'élément a été supprimé.",
    // L'action reste neutre : cet échec est rendu aussi bien à un candidat
    // qu'à un opérateur du back-office, à qui « revenir à mes dossiers » ne
    // dirait rien.
    action: "Revenir à l'écran précédent",
    ton: "echec",
  },
  trop_de_requetes: {
    statut: 429,
    titre: "Trop de demandes en peu de temps",
    corps: "L'accès se rouvre dans un instant.",
    conserve: "Rien n'a été perdu de ce que tu as saisi.",
    action: "Réessayer dans une minute",
    ton: "attente",
  },
  /*
    Revue du 07/10/2026, F2 : une requête qui modifie quelque chose et
    vient d'une autre origine que la plateforme. Le cookie y est joint par
    le navigateur ; la demande, elle, n'a pas été faite depuis ImmiPro.
  */
  origine_refusee: {
    statut: 403,
    titre: "Cette demande ne vient pas d'ImmiPro",
    corps: "Elle a été envoyée depuis une autre page que la plateforme. Ouvre ImmiPro directement et recommence.",
    conserve: "Ce que tu as saisi reste à l'écran.",
    action: "Recharger la page",
    ton: "echec",
  },
  consentement_manquant: {
    statut: 403,
    titre: "L'analyse de tes pièces demande ton autorisation",
    corps:
      "Le traitement des pièces d'identité fait l'objet d'une autorisation à part, que tu peux retirer à tout moment.",
    conserve: "Ta pièce reste sur ton appareil tant que tu n'as pas décidé.",
    action: "Ouvrir mes autorisations",
    ton: "echec",
  },
  quota_epuise: {
    statut: 409,
    titre: "Les analyses de ton pack sont utilisées",
    corps:
      "Tu peux toujours téléverser et conserver tes pièces, sans vérification automatique.",
    conserve: "Les pièces déjà déposées et leurs vérifications restent en place.",
    action: "Recharger des analyses",
    ton: "limite",
  },
  /*
    Arbitrage S.80 : la rédaction assistée est un droit des packs Dossier
    et Dossier Pro, lu sur la couverture du dossier. Le refus dit d'abord
    ce qui reste au candidat — tout ce qu'il a écrit —, puis le geste qui
    ouvre l'assistance.
  */
  redaction_non_couverte: {
    statut: 403,
    titre: "La rédaction assistée n'est pas ouverte sur ce dossier",
    corps:
      "La proposition de texte et l'analyse critique s'ouvrent avec les packs Dossier et Dossier Pro. Tu peux écrire et réécrire ta pièce toi-même.",
    conserve: "Tes réponses, ton texte et les versions de ta pièce restent en place.",
    action: "Voir les packs",
    ton: "limite",
  },
  dossiers_au_maximum: {
    statut: 409,
    titre: "Tu as déjà trois dossiers ouverts",
    corps: "Trois dossiers menés en parallèle est le maximum.",
    conserve: "Tes dossiers en cours ne changent pas.",
    action: "Clôturer un dossier avant d'en ouvrir un autre",
    ton: "limite",
  },
  regle_indisponible: {
    statut: 503,
    titre: "Les conditions n'ont pas pu être chargées",
    corps:
      "Rien n'est affiché plutôt qu'une information peut-être périmée : une condition dépassée ferait prendre une mauvaise décision.",
    conserve: "Ton dossier et tes pièces ne changent pas.",
    action: "Réessayer",
    ton: "echec",
  },
  dossier_fige: {
    statut: 409,
    titre: "Ce dossier ne se modifie plus",
    corps: "Un dossier déposé ou clôturé garde l'état qu'il avait ce jour-là.",
    conserve: "Son contenu reste consultable.",
    action: "Ouvrir le dossier en lecture",
    ton: "limite",
  },
  etat_incompatible: {
    statut: 409,
    titre: "Cette étape n'est pas encore ouverte",
    corps: "Le dossier n'est pas dans l'état que cette action demande.",
    conserve: "Rien n'a changé dans ton dossier.",
    action: "Revenir au dossier",
    ton: "echec",
  },
  fichier_refuse: {
    statut: 422,
    titre: "Le fichier n'a pas pu être accepté",
    corps: "Le détail sous le champ dit ce qui bloque et comment le reprendre.",
    conserve: "Les pièces déjà déposées ne changent pas.",
    action: "Choisir un autre fichier",
    ton: "echec",
  },
  piece_deja_deposee: {
    statut: 409,
    titre: "Cette pièce est déjà en place",
    corps: "Le fichier envoyé est identique à celui déjà déposé.",
    conserve: "La vérification déjà faite reste valable, aucune analyse n'est décomptée.",
    action: "Revenir à la checklist",
    ton: "limite",
  },
  televersement_indisponible: {
    statut: 503,
    titre: "Les dépôts de pièces sont suspendus",
    corps:
      "Le contrôle de sécurité des fichiers n'est pas joignable, et aucune pièce n'est acceptée sans lui.",
    conserve: "Tes pièces déjà déposées ne changent pas, et rien de ce que tu as saisi n'est perdu.",
    action: "Réessayer plus tard",
    ton: "attente",
  },
  montant_sous_le_minimum: {
    statut: 422,
    titre: "Le montant est trop faible pour être encaissé",
    corps: "Les frais de collecte de l'opérateur dépassent la somme demandée.",
    action: "Choisir un autre montant",
    ton: "echec",
  },
  devise_figee: {
    statut: 409,
    titre: "La devise ne change plus",
    corps: "Le paiement a déjà été créé dans une devise, elle reste la sienne.",
    conserve: "Le paiement en cours reste valable.",
    action: "Reprendre le paiement en cours",
    ton: "limite",
  },
  /**
   * Le passage d'Essentiel à Dossier n'est pas ouvert sur ce dossier —
   * S.88. Le corps est remplacé par la raison précise, tirée du domaine
   * (`MESSAGE_DU_REFUS`) : « non disponible » seul ne dirait pas quoi
   * faire.
   */
  montee_indisponible: {
    statut: 409,
    titre: "Le passage à Dossier n'est pas possible sur ce dossier",
    corps: "L'achat Essentiel de ce dossier ne permet pas de payer la différence.",
    conserve: "Rien n'a été débité, et ton dossier garde sa couverture actuelle.",
    action: "Revenir à mon dossier",
    ton: "limite",
  },
  creneau_indisponible: {
    statut: 409,
    titre: "Ce créneau vient d'être pris",
    corps:
      "Quelqu'un l'a retenu pendant que tu choisissais, ou la tenue que tu avais a expiré.",
    conserve: "Ton accord de partage est enregistré : tu n'auras pas à le redonner.",
    action: "Choisir un autre créneau",
    ton: "limite",
  },
  /**
   * Un paiement réel sans conditions de vente publiées — décision du
   * 03/10/2026. L'espace d'essai reste ouvert ; l'encaissement réel attend
   * que `/conditions` ait une version validée (Q.A). Ce n'est pas une
   * panne : réessayer ne changera rien, et l'écran ne le propose pas.
   */
  paiement_sans_conditions: {
    statut: 503,
    titre: "Le paiement n'est pas encore ouvert",
    corps: MENTION_ENCAISSEMENT_SUSPENDU,
    conserve: "Rien n'a été débité, et ton dossier reste tel quel.",
    action: "Revenir à mon dossier",
    ton: "attente",
  },
  /**
   * Un paiement réel tant que la facturation n'est pas en place — avis
   * comptable M.C du 04/10/2026 : ne pas encaisser avant que le circuit
   * facture + avoir soit testé de bout en bout. Rien n'est à faire côté
   * candidat ; l'exploitant lit l'obstacle exact dans `/api/health`.
   */
  paiement_sans_facturation: {
    statut: 503,
    titre: "Le paiement n'est pas encore ouvert",
    corps: MENTION_FACTURATION_EN_ATTENTE,
    conserve: "Rien n'a été débité, et ton dossier reste tel quel.",
    action: "Revenir à mon dossier",
    ton: "attente",
  },
  /** Chaque facture porte le nom et l'adresse du client (M.C). */
  facturation_identite_manquante: {
    statut: 409,
    titre: "Il manque ton nom ou ton adresse de facturation",
    corps: MENTION_IDENTITE_MANQUANTE,
    conserve: "Rien n'a été débité, et ton panier reste tel quel.",
    action: "Compléter mon profil",
    ton: "limite",
  },
  paiement_indisponible: {
    statut: 503,
    titre: "Le paiement ne peut pas être ouvert",
    corps:
      "Notre prestataire de paiement n'a pas répondu, et aucune page de paiement n'a pu être ouverte.",
    conserve: "Rien n'a été débité et ton panier reste tel quel.",
    action: "Réessayer",
    ton: "attente",
  },
  /**
   * L'ouverture n'a pas abouti, et une nouvelle tentative n'y changera
   * rien : aucun adaptateur n'est branché, le fournisseur a refusé la
   * demande elle-même, ou sa réponse est hors du contrat qu'on lit.
   *
   * Elle s'est longtemps servie sous `paiement_indisponible`, dont le
   * corps dit « notre prestataire n'a pas répondu » et l'action
   * « Réessayer ». Les deux étaient faux ici : le fournisseur a répondu,
   * ou n'a pas été appelé, et le même essai rendra le même résultat.
   *
   * L'action s'adresse donc à ce que le candidat peut réellement faire —
   * changer de grille, donc de rail (N.A) — plutôt qu'à une patience
   * qui ne sera pas récompensée. Le diagnostic, lui, nomme le service et
   * ce qu'il a répondu, pour celui qui peut y revenir.
   */
  ouverture_impossible: {
    statut: 502,
    titre: "Le paiement n'a pas pu être ouvert",
    corps:
      "Notre prestataire n'a pas accepté la demande de paiement. Recommencer donnerait le même résultat : c'est de notre côté que cela se répare.",
    conserve: "Rien n'a été débité et ton panier reste tel quel.",
    action: "Essayer l'autre grille de prix",
    ton: "echec",
  },
  ouverture_refusee: {
    statut: 409,
    titre: "Ce paiement n'a pas été ouvert",
    corps:
      "La somme enregistrée par notre prestataire ne correspond pas à celle affichée, et nous ne t'envoyons pas payer un montant que nous n'avons pas décidé.",
    conserve: "Rien n'a été débité et ton panier reste tel quel.",
    action: "Revenir au récapitulatif",
    ton: "echec",
  },
  signature_invalide: {
    statut: 400,
    titre: "La notification n'a pas pu être authentifiée",
    corps: "La signature reçue ne correspond pas au secret de ce fournisseur.",
    action: "Vérifier le secret de signature du fournisseur",
    ton: "echec",
  },
  paiement_introuvable: {
    statut: 404,
    titre: "Ce paiement n'a pas été retrouvé",
    corps: "La référence ne correspond à aucun paiement de ton compte.",
    conserve: "Ton dossier est conservé en l'état.",
    action: "Revenir à mes paiements",
    ton: "echec",
  },
  recu_indisponible: {
    statut: 409,
    titre: "Ce reçu n'a pas été envoyé",
    corps: "L'état de ce paiement ne permet pas d'en établir le courrier.",
    conserve: "Ton paiement et ton dossier sont inchangés.",
    action: "Revenir au reçu",
    // Ni rouge ni ambre : rien n'est en panne, et l'écrire comme une panne
    // ferait chercher un défaut là où il n'y en a pas.
    ton: "limite",
  },
  /*
    Il sert à deux surfaces — un guide ou un article (B-08), les textes
    d'une règle en vigueur (B-02) —, et sa prose ne nomme donc ni l'un ni
    l'autre : « le document » laissait un veilleur de B-02 chercher quel
    document il venait de refuser.
  */
  publication_refusee: {
    statut: 409,
    titre: "Cette publication est refusée",
    corps: "Un ou plusieurs textes ne peuvent pas s'afficher chez le candidat.",
    conserve:
      "Rien n'est écrit : la version enregistrée reste celle d'avant, et rien de ce que tu as écrit n'est perdu.",
    action: "Corriger les passages signalés",
    ton: "echec",
  },
  rapprochement_en_cours: {
    statut: 409,
    titre: "Un rapprochement est déjà en cours",
    corps:
      "Une passe interroge déjà le fournisseur, lancée par le job automatique ou par un autre administrateur. En lancer une seconde ferait consulter deux fois les mêmes transactions.",
    conserve: "Cette demande n'a rien modifié : la passe en cours va à son terme.",
    action: "Réessayer dans quelques minutes",
    ton: "limite",
  },
  service_indisponible: {
    statut: 503,
    titre: "Le service n'a pas répondu",
    corps: "L'interruption vient de la plateforme, pas de ce que tu as envoyé.",
    conserve: "Ce que tu avais saisi est conservé, tu n'as rien à ressaisir.",
    action: "Réessayer",
    ton: "attente",
  },
};

/** Ce que reçoit un écran candidat. Sans code technique, sans service, sans trace. */
export interface EchecCandidat {
  titre: string;
  corps: string;
  conserve?: string;
  action: string;
  ton: Ton;
  champs?: Record<string, string>;
}
