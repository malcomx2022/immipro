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
   * Rappels d'échéancier (WF-09 étape 3). Déclarée sans écrivain : la file
   * existe, personne n'y poste encore, l'envoi attend la messagerie. Une
   * file vide ne promet rien ; c'est l'écran qui doit rester honnête.
   */
  RAPPEL_ECHEANCIER: "echeancier.rappel",
  /**
   * Resonde des services extérieurs (I.C). Un constat a une durée de
   * validité : sans repasse, celui du démarrage se périmerait et l'état
   * de service retomberait à « aucune nouvelle » après quelques heures
   * de fonctionnement normal.
   */
  SONDE_SERVICES: "exploitation.sonde",
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
