/**
 * L'échec côté serveur : `EchecHttp`, et ce qu'en reçoivent un écran
 * candidat (`pourCandidat`) et le back-office (`pourOperateur`) — DOC-12 §16.
 *
 * Le catalogue des échecs (codes, textes, tons) vit dans le domaine,
 * `domain/echecs/catalogue.ts`, depuis la revue du 07/10/2026 (F8) : un
 * écran client en a besoin, et n'a pas à importer de `src/server`. Il est
 * réexporté ici pour les routes et les services.
 */
import {
  ECHECS,
  type CodeEchec,
  type Echec,
  type EchecCandidat,
} from "@/domain/echecs/catalogue";

export { ECHECS, type CodeEchec, type Echec, type EchecCandidat, type Ton } from "@/domain/echecs/catalogue";

/**
 * Détail technique d'un échec. Il ne quitte jamais le serveur vers un écran
 * candidat (règle 3) ; le back-office le reçoit parce que son lecteur ouvre
 * le journal juste après — c'est l'exception assumée du message B-02.
 */
export interface Diagnostic {
  /** Service ou dépendance en cause : « fedapay », « minio », « regles ». */
  service?: string;
  /** Statut renvoyé par la dépendance, quand il y en a un. */
  statutAmont?: number;
  /** Horodatage ISO de l'échec. */
  survenuA: string;
  /** Corrélation avec le journal. */
  trace?: string;
}

export class EchecHttp extends Error {
  readonly echec: Echec;
  readonly diagnostic?: Diagnostic;
  /** Détail par champ, pour `champs_invalides`. */
  readonly champs?: Record<string, string>;

  constructor(
    code: CodeEchec,
    options: { diagnostic?: Diagnostic; champs?: Record<string, string>; corps?: string } = {},
  ) {
    const modele = ECHECS[code];
    super(`${code}: ${modele.titre}`);
    this.name = "EchecHttp";
    this.echec = { code, ...modele, ...(options.corps ? { corps: options.corps } : {}) };
    this.diagnostic = options.diagnostic;
    this.champs = options.champs;
  }
}

export const echec = (
  code: CodeEchec,
  options?: ConstructorParameters<typeof EchecHttp>[1],
): EchecHttp => new EchecHttp(code, options);

export function pourCandidat(e: EchecHttp): EchecCandidat {
  const { titre, corps, conserve, action, ton } = e.echec;
  return {
    titre,
    corps,
    ...(conserve ? { conserve } : {}),
    action,
    ton,
    ...(e.champs ? { champs: e.champs } : {}),
  };
}

/**
 * Les échecs dont le « ce qui reste » parle de ce que le **candidat**
 * possède — et qui n'a donc rien à dire à un opérateur.
 *
 * Vingt codes sont atteignables depuis une route du back-office, et
 * plusieurs servaient au veilleur la phrase écrite pour un candidat. Sur
 * une fiche au contenu illisible, l'administrateur lisait :
 *
 *     Les conditions n'ont pas pu être chargées
 *     Rien n'est affiché plutôt qu'une information peut-être périmée […]
 *     **Ton dossier et tes pièces ne changent pas.**
 *     Réessayer
 *
 * Il n'a ni dossier ni pièces. Et « Réessayer » était la seule issue
 * offerte, alors que le serveur avait calculé — et envoyé — de quoi agir :
 * `trace: "NL/etudes_mvv_vvr v3"`, qui nomme la fiche à réparer.
 *
 * Pour un opérateur, « ce qui reste » n'est pas la question : c'est le
 * diagnostic qui y répond. La ligne est donc omise, et non réécrite —
 * inventer huit phrases d'opérateur ferait décider ici d'une voix qui
 * appartient au produit.
 *
 * Le critère est de **nommer un objet du candidat** — son dossier, ses
 * pièces, son panier, son accord, son analyse — et non d'employer la
 * deuxième personne : le back-office tutoie aussi son opérateur. « Tes
 * autres réponses sont gardées » reste donc servi, parce qu'un veilleur qui
 * édite une règle a bien des réponses ; « ton panier reste tel quel », non.
 *
 * La liste est tenue par un essai dans les deux sens : un `conserve` qui
 * nomme un objet du candidat est ici, et un code d'ici en nomme bien un.
 * Un échec nouveau force donc la décision.
 */
export const CONSERVE_DU_CANDIDAT: readonly CodeEchec[] = [
  "authentification_requise",
  "consentement_manquant",
  "quota_epuise",
  "redaction_non_couverte",
  "dossiers_au_maximum",
  "regle_indisponible",
  "etat_incompatible",
  "fichier_refuse",
  "piece_deja_deposee",
  "televersement_indisponible",
  "creneau_indisponible",
  "paiement_indisponible",
  "paiement_sans_conditions",
  "paiement_sans_facturation",
  "facturation_identite_manquante",
  "montee_indisponible",
  "ouverture_impossible",
  "ouverture_refusee",
  "paiement_introuvable",
  "recu_indisponible",
];

/** Ce que reçoit le back-office : la même chose, plus de quoi agir dessus. */
export interface EchecOperateur extends EchecCandidat {
  code: CodeEchec;
  diagnostic?: Diagnostic;
}

export function pourOperateur(e: EchecHttp): EchecOperateur {
  const candidat = pourCandidat(e);
  /*
    Le `conserve` du candidat ne suit pas quand il parle de ce qu'il
    possède : un veilleur n'a ni dossier, ni pièces, ni panier. Ceux qui
    parlent du référentiel — « la version enregistrée reste celle d'avant »
    — restent, parce qu'ils disent à l'opérateur ce qu'il voulait savoir.
  */
  if (CONSERVE_DU_CANDIDAT.includes(e.echec.code)) delete candidat.conserve;
  return {
    ...candidat,
    code: e.echec.code,
    ...(e.diagnostic ? { diagnostic: e.diagnostic } : {}),
  };
}

/**
 * Échecs survenant alors que le candidat avait quelque chose en cours. La
 * règle 2 les oblige à dire ce qui reste : c'est la première question de
 * quelqu'un qui vient de passer vingt minutes à remplir.
 *
 * Les autres — un droit refusé, une adresse inconnue, un montant sous le
 * plancher — n'interrompent aucune saisie et n'ont rien à conserver.
 */
export const INTERROMPENT_UNE_SAISIE: readonly CodeEchec[] = [
  "champs_invalides",
  "authentification_requise",
  "trop_de_requetes",
  "consentement_manquant",
  "quota_epuise",
  "redaction_non_couverte",
  "dossiers_au_maximum",
  "regle_indisponible",
  "dossier_fige",
  "etat_incompatible",
  "fichier_refuse",
  "piece_deja_deposee",
  "televersement_indisponible",
  "devise_figee",
  "paiement_introuvable",
  "service_indisponible",
];
