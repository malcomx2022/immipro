import PgBoss from "pg-boss";

export const JOBS = {
  /** Balayage antivirus, avant toute promotion (I.D, WF-06 étape 2). */
  BALAYAGE_PIECE: "document.balayage",
  ANALYSE_DOCUMENT: "document.analyse",
  RECONCILIATION_PAIEMENT: "paiement.reconciliation",
  PURGE_RETENTION: "retention.purge",
  VEILLE_ECHEANCE: "veille.echeance",
  /** Déclassement des pièces dont la validité est dépassée (RG-07.4). */
  PEREMPTION_PIECES: "document.peremption",
  DIVERGENCE_REGLEMENTAIRE: "regle.divergence",
  /**
   * Rappels d'échéancier (WF-09 étape 3), branchés le 22/09/2026.
   *
   * Elle était déclarée sans écrivain, avec ce motif : « l'envoi attend
   * la messagerie ». Le transport SMTP a été branché le matin même, et
   * la phrase est devenue fausse sans que rien ne bouge — un candidat
   * dont une échéance était dépassée depuis trois jours ne recevait
   * toujours rien. Le worker la planifie désormais toutes les heures (S.87) :
   * chaque candidat reçoit son rappel à huit heures dans son fuseau.
   */
  RAPPEL_ECHEANCIER: "echeancier.rappel",
  /**
   * Resonde des services extérieurs (I.C). Un constat a une durée de
   * validité : sans repasse, celui du démarrage se périmerait et l'état
   * de service retomberait à « aucune nouvelle » après quelques heures
   * de fonctionnement normal.
   */
  SONDE_SERVICES: "exploitation.sonde",

  /**
   * Brouillons laissés de côté — RG-04.2, branchée le 23/09/2026.
   *
   * `ABANDONNE` existait dans l'enum, l'écran savait l'afficher, et rien
   * ne l'écrivait : un brouillon de vingt et un mois restait `BROUILLON`
   * et n'avait reçu aucune relance.
   */
  BROUILLONS_INACTIFS: "dossier.inactivite",
  /** Arbitrage S.78 — dossiers soumis et suspendus : annonce, puis échéance. */
  CONSERVATION_PIECES: "dossier.conservation",
  /**
   * Relances après dépôt, J+30 puis J+60 depuis la date réelle — WF-10
   * étape 2, arbitrage S.89. L'étape était écrite dans DOC-11 et rien ne
   * la tenait.
   */
  SUIVI_DEPOT: "dossier.suivi-depot",

  /**
   * Reprise des contrôles restés sans verdict — I.D, branchée le
   * 24/09/2026.
   *
   * Quatre causes sur six laissent le fichier en quarantaine en disant
   * au candidat « tu n'as rien à faire » : deux ne consomment aucune
   * reprise de `REPRISES`, les deux autres les épuisent en dix minutes.
   * Passé cela, plus rien ne revenait chercher la pièce, et l'incident
   * se lisait dans l'état de service sans être traité.
   */
  REPRISE_QUARANTAINE: "document.reprise",

  /**
   * Reprise des demandes de remboursement qui ne sont pas parties —
   * K.C, RG-05.1, branchée le 24/09/2026.
   *
   * `RESTE_A_FAIRE.DECIDE` disait « La demande n'est pas partie. Relance
   * l'envoi », et personne ne la relançait : les deux appelants qui
   * comptent avalent l'échec d'envoi, à juste titre — une panne du
   * fournisseur ne doit faire échouer ni une annulation ni une
   * anonymisation. Rien ne revenait ensuite, et la somme due attendait
   * qu'un opérateur la voie dans B-04.
   */
  RELANCE_REMBOURSEMENT: "paiement.relance",
} as const;

/**
 * Les files que l'application utilise, déclarées en un seul endroit.
 *
 * pg-boss 10 ne crée plus la file au premier `send` : la table `job` est
 * partitionnée par nom de file et porte une clé étrangère vers `queue`.
 * Poster ou planifier sur une file inconnue échoue — c'est ainsi que le
 * worker s'arrêtait sur « Queue paiement.reconciliation not found » dès
 * que le paquet de production a enfin pu démarrer. Tant que l'image ne
 * contenait pas de worker exécutable, l'erreur suivante restait cachée
 * derrière la première.
 *
 * La déclaration vit ici et non dans le worker parce que le processus web
 * poste lui aussi : le dépôt d'une pièce (WF-06) et la publication d'une
 * règle (WF-14) n'ont pas à attendre qu'un worker soit passé avant elles.
 * `create_queue` est idempotente côté serveur — `ON CONFLICT DO NOTHING`,
 * puis sortie immédiate — donc un redémarrage ne recrée rien et ne perd
 * aucun job en attente.
 */
export const FILES: readonly string[] = Object.values(JOBS);

/**
 * La politique de reprise du balayage — I.D, lot du 22/09/2026.
 *
 * Sans elle, pg-boss n'essaie **qu'une fois** : un moteur antivirus
 * redémarré pendant le dépôt laissait la pièce en quarantaine pour de
 * bon, et personne ne revenait jamais la chercher. Le balayage est la
 * seule file dont l'échec est attendu en exploitation ordinaire — un
 * service tiers qui bouge —, et c'est la seule qui la porte.
 *
 * Six reprises avec délai croissant depuis dix secondes couvrent une
 * indisponibilité de l'ordre de dix minutes, ce qui est la durée d'un
 * redémarrage ou d'un déploiement du moteur. `TENTATIVES_AVANT_INCIDENT`
 * vaut trois : l'incident devient donc visible **avant** que les reprises
 * soient épuisées, ce qui est l'intérêt d'un seuil — être prévenu pendant
 * qu'on peut encore agir, et non après.
 *
 * Trois files en portent une désormais, et le commentaire disait « la
 * seule » bien après qu'elles furent deux.
 *
 * Une cause qui ne se reprend pas seule ne consomme aucune de ces
 * reprises : `balayerUnePiece` ne lève pas dans ce cas et la tâche
 * s'achève sur `BLOQUEE`, incident ouvert.
 */
export const REPRISES: Readonly<Record<string, PgBoss.RetryOptions>> = {
  [JOBS.BALAYAGE_PIECE]: { retryLimit: 6, retryDelay: 10, retryBackoff: true },
  /*
    L'extraction est branchée sur un service réel (22/09/2026), et DOC-11
    demande pour WF-06 « backoff exponentiel ; au-delà de 3 échecs,
    bascule en revue manuelle ». Le compte des trois est tenu par le job
    lui-même, sur la version : lui seul distingue une saturation — qui se
    rejoue — d'un scan flou, qui ne se rejouera jamais mieux.

    La limite de la file est plus haute que ce compte, et volontairement :
    elle borne les reprises de l'enveloppe — un worker tué en cours de
    tâche, une base momentanément indisponible — qui ne sont pas des
    tentatives de lecture et ne doivent pas consommer le compte.
  */
  [JOBS.ANALYSE_DOCUMENT]: { retryLimit: 6, retryDelay: 15, retryBackoff: true },
  /*
    La propagation d'une divergence n'a qu'une occasion : elle est postée
    à la publication d'une version, et rien ne la replanifie. Un dossier
    qu'elle n'a pas prévenu ne le sera donc jamais — et « une condition
    d'éligibilité a disparu » est précisément ce qu'on ne peut pas ne pas
    dire (RG-11.3).

    Elle lève quand un dossier lui a échappé, et la reprise saute ceux
    qui sont déjà prévenus : rejouer ne coûte qu'une requête par dossier
    traité. Le délai part de trente secondes parce que la cause attendue
    est un relais de messagerie sous charge, qui se dégage en minutes et
    non en secondes.
  */
  [JOBS.DIVERGENCE_REGLEMENTAIRE]: { retryLimit: 8, retryDelay: 30, retryBackoff: true },
};

/**
 * `createQueue` est idempotente : sur une file qui existe déjà, elle sort
 * sans rien changer. Une politique ajoutée après coup ne s'appliquerait
 * donc qu'aux installations neuves — le genre de correctif qui a l'air
 * déployé et ne l'est pas. `updateQueue` la pose sur l'existant.
 */
export async function declarerLesFiles(instance: PgBoss): Promise<void> {
  for (const nom of FILES) {
    const reprises = REPRISES[nom];
    await instance.createQueue(nom, reprises ? { name: nom, ...reprises } : undefined);
    if (reprises) await instance.updateQueue(nom, { name: nom, ...reprises });
  }
}

/** Files de jobs stockées dans PostgreSQL — pas de Redis au démarrage. */
let demarrage: Promise<PgBoss> | null = null;

async function demarrer(): Promise<PgBoss> {
  try {
    const instance = new PgBoss(process.env.DATABASE_URL!);
    await instance.start();
    await declarerLesFiles(instance);
    return instance;
  } catch (erreur) {
    // Un démarrage raté ne se met pas en cache : la base peut revenir, et
    // le prochain appel doit réessayer plutôt que rejouer l'échec.
    demarrage = null;
    throw erreur;
  }
}

export function getQueue(): Promise<PgBoss> {
  // La promesse est mémorisée, pas l'instance : deux appels concurrents au
  // premier démarrage partagent la même connexion au lieu d'en ouvrir deux,
  // et aucun ne reçoit un pg-boss pas encore démarré.
  demarrage ??= demarrer();
  return demarrage;
}

/**
 * Poste un job et refuse le silence.
 *
 * `send` rend `null` — sans lever — lorsque la file n'existe pas : le job
 * est perdu et l'appelant croit l'avoir mis en file. Le dépôt d'une pièce
 * répondrait « en cours d'analyse » à un candidat dont le fichier ne
 * serait jamais balayé. Les files étant désormais déclarées au démarrage
 * de chaque processus, le cas ne devrait plus se produire ; s'il revient,
 * il doit faire du bruit plutôt que de passer pour un succès.
 */
export async function poster<T extends object>(
  instance: PgBoss,
  file: string,
  donnees: T,
): Promise<string> {
  const id = await instance.send(file, donnees);
  if (id === null) throw new Error(`Job refusé par la file « ${file} » : rien n'a été mis en attente.`);
  return id;
}
