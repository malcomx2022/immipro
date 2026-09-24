/**
 * Le rail de remboursement sortant — arbitrage du 21/09/2026.
 *
 * **Trois faits, et le produit n'en écrivait que deux.** K.C ouvrait la
 * décision de rembourser, M.B enregistrait la confirmation que l'argent
 * était reparti. Entre les deux manquait la demande envoyée au
 * fournisseur : une obligation ouverte et une demande acceptée se
 * lisaient pareil, et une tentative échouée ne laissait aucune trace.
 *
 * Les trois, dans l'ordre, et aucun ne se substitue à un autre :
 *
 * 1. **décidé** — on doit rendre cette somme, et pourquoi (K.C) ;
 * 2. **demandé** — le fournisseur a accepté la demande ; c'est un accusé
 *    de réception, pas un virement ;
 * 3. **versé** — sa notification signée le dit, et elle seule (M.B,
 *    INV-7).
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type EtapeRemboursement = "DECIDE" | "DEMANDE" | "VERSE";

export const LIBELLE_ETAPE: Record<EtapeRemboursement, string> = {
  DECIDE: "Décidé, pas encore demandé",
  DEMANDE: "Demandé au fournisseur, en attente de confirmation",
  VERSE: "Versé et confirmé",
};

export interface EtatRemboursement {
  dueAt: Date | null;
  requestedAt: Date | null;
  refundedAt: Date | null;
}

/** Où en est un remboursement, ou `null` s'il n'en a jamais été question. */
export function etapeDe(etat: EtatRemboursement): EtapeRemboursement | null {
  if (etat.refundedAt) return "VERSE";
  if (etat.requestedAt) return "DEMANDE";
  if (etat.dueAt) return "DECIDE";
  return null;
}

/**
 * Ce qu'il reste à faire, dit à l'opérateur qui regarde la file.
 *
 * Une demande partie et non confirmée n'est pas une affaire classée :
 * c'est le cas le plus facile à oublier, parce qu'il ressemble à un
 * succès. Il doit se voir comme une obligation en attente, et non comme
 * un remboursement fait.
 */
export const RESTE_A_FAIRE: Record<EtapeRemboursement, string> = {
  DECIDE: "La demande n'est pas partie. Relance l'envoi.",
  DEMANDE:
    "Le fournisseur a accepté la demande, sans confirmer le versement. Tant que sa notification signée n'est pas arrivée, la somme n'est pas rendue.",
  VERSE: "Rien : la notification signée du fournisseur a confirmé le versement.",
};

/**
 * La clé d'idempotence d'une demande de remboursement.
 *
 * Dérivée de la référence, et non tirée au sort : deux tentatives sur la
 * même transaction portent la même clé, et le fournisseur reconnaît la
 * seconde comme un rejeu plutôt que d'envoyer l'argent deux fois. C'est
 * la propriété qui rend une nouvelle tentative sûre après un échec
 * d'appel — et un échec d'appel est le cas ordinaire, pas l'exception.
 *
 * Elle ne se stocke pas : une valeur dérivée qu'on enregistre finit par
 * diverger de ce dont elle est dérivée.
 */
export const cleDIdempotence = (reference: string): string => `remboursement:${reference}`;

// ── Ce que le fournisseur répond, et ce qu'on en fait ────────────────────

/**
 * Les cinq issues d'une demande de remboursement.
 *
 * Elles se distinguent parce qu'elles n'appellent pas la même suite, et
 * les confondre coûte cher dans les deux sens : traiter un refus
 * définitif comme une erreur passagère fait relancer indéfiniment une
 * demande que le fournisseur n'exécutera jamais ; traiter une panne
 * réseau comme un refus classe une dette que personne n'a payée.
 *
 * - **`acceptee`** — le fournisseur a pris la demande. Un accusé de
 *   réception, pas un virement (INV-7) ;
 * - **`refusee_definitivement`** — il refuse, et réessayer ne changera
 *   rien : somme déjà rendue de son côté, transaction trop ancienne,
 *   compte fermé. Il faut un humain ;
 * - **`temporaire`** — réseau, délai, panne. On ne sait pas si la demande
 *   est passée : la clé d'idempotence est faite pour ça ;
 * - **`reponse_illisible`** — il a répondu quelque chose qui n'est pas
 *   au schéma. On ne devine pas : ni accepté, ni refusé ;
 * - **`non_configure`** — aucune clé, ou adaptateur non opérationnel.
 *   Rien n'est parti, et c'est dit.
 */
export type IssueDeDemande =
  | "acceptee"
  | "refusee_definitivement"
  | "temporaire"
  | "reponse_illisible"
  | "non_configure";

export interface SuiteDeLaTentative {
  /**
   * La demande est-elle acceptée ? Seul ce cas pose `refundRequestedAt`.
   * Tous les autres laissent la dette exactement où elle était.
   */
  acceptee: boolean;
  /**
   * Faut-il un humain ? Un refus définitif et une réponse illisible, oui :
   * dans les deux cas la relance automatique tournerait à vide. Une panne
   * et une absence de clé, non — la première se reprend, la seconde se
   * configure.
   */
  exigeUnHumain: boolean;
  /** Ce que l'opérateur lit dans la file. */
  message: string;
}

/**
 * La suite d'une tentative, par issue — `switch` exhaustif à dessein.
 *
 * Une sixième issue ne compilera pas tant qu'on n'aura pas répondu aux
 * deux questions qui décident du sort d'une dette : est-elle demandée, et
 * faut-il quelqu'un ?
 *
 * **Aucune issue ne solde la dette.** Elle ne s'éteint que sur
 * `refundedAt`, écrit par la notification signée — pas ici.
 */
export function suiteDeLaTentative(issue: IssueDeDemande): SuiteDeLaTentative {
  switch (issue) {
    case "acceptee":
      return {
        acceptee: true,
        exigeUnHumain: false,
        message:
          "Le fournisseur a accepté la demande. Tant que sa notification signée n'est pas arrivée, la somme n'est pas rendue.",
      };
    case "refusee_definitivement":
      return {
        acceptee: false,
        exigeUnHumain: true,
        message:
          "Le fournisseur refuse la demande, et une relance ne changera rien. À reprendre à la main : vérifier si la somme a déjà été rendue de son côté.",
      };
    case "temporaire":
      return {
        acceptee: false,
        exigeUnHumain: false,
        message:
          "Le fournisseur n'a pas répondu. On ne sait pas si la demande est passée : la reprise portera la même clé, et il y reconnaîtra un rejeu.",
      };
    case "reponse_illisible":
      return {
        acceptee: false,
        exigeUnHumain: true,
        message:
          "Le fournisseur a répondu quelque chose d'inattendu. Rien n'est conclu — ni accepté, ni refusé — et la demande est à vérifier chez lui.",
      };
    case "non_configure":
      return {
        acceptee: false,
        exigeUnHumain: false,
        message:
          "Aucune demande n'est partie : le rail de remboursement n'est pas configuré pour ce fournisseur. La dette reste due.",
      };
    default: {
      const jamais: never = issue;
      throw new Error(`Issue de remboursement non arbitrée : ${JSON.stringify(jamais)}`);
    }
  }
}

/**
 * L'identifiant du fournisseur est-il présent, et est-il le sien ?
 *
 * Les deux rails écrivent la même colonne, préfixée : `stripe:cs_…`,
 * `fedapay:1234`. Une demande de remboursement envoyée avec
 * l'identifiant de l'autre rail — ou sans identifiant du tout — ne
 * rembourse rien et peut, au pire, viser une transaction étrangère.
 *
 * On vérifie donc **avant** d'appeler, plutôt que de laisser le
 * fournisseur répondre « inconnu » et compter cela comme une tentative.
 */
export const PREFIXE_FOURNISSEUR: Record<"FEDAPAY" | "STRIPE", string> = {
  FEDAPAY: "fedapay:",
  STRIPE: "stripe:",
};

export type DefautDIdentifiant = "absent" | "autre_fournisseur";

export function defautDIdentifiant(
  providerTxId: string | null,
  fournisseur: "FEDAPAY" | "STRIPE",
): DefautDIdentifiant | null {
  if (!providerTxId || providerTxId.trim() === "") return "absent";
  return providerTxId.startsWith(PREFIXE_FOURNISSEUR[fournisseur]) ? null : "autre_fournisseur";
}

export const MOTIF_IDENTIFIANT: Record<DefautDIdentifiant, string> = {
  absent:
    "Aucun identifiant de transaction chez le fournisseur : aucune session n'a jamais été ouverte, il n'y a rien à rembourser chez lui. À reprendre à la main.",
  autre_fournisseur:
    "L'identifiant enregistré n'est pas celui du fournisseur de cette transaction. Aucune demande n'est partie : elle viserait un paiement étranger.",
};

// ── Le quota d'un pack remboursé ─────────────────────────────────────────

export type SuiteDuQuota =
  /** Rien n'a été consommé : les droits ouverts se retirent en entier. */
  | { suite: "RETRAIT_INTEGRAL"; retire: number }
  /** Une partie a servi : aucun remboursement intégral automatique. */
  | { suite: "REVUE_MANUELLE"; ouvertes: number; consommees: number };

/**
 * Ce qu'il advient des droits quand un remboursement s'initie.
 *
 * **Les droits non consommés partent à l'initiation**, pas à la
 * confirmation : entre les deux il peut s'écouler des jours, et laisser
 * un pack utilisable pendant qu'on rend son prix revient à l'offrir.
 *
 * **Une consommation partielle ne se rembourse pas automatiquement en
 * entier.** Le produit ne sait pas ce que vaut une analyse déjà rendue —
 * c'est une question commerciale, pas arithmétique — et trancher à sa
 * place produirait soit un cadeau, soit une retenue qu'aucune condition
 * n'annonce. Le cas passe en revue manuelle.
 *
 * **Et rien n'est recrédité ni effacé rétroactivement.** Les lignes des
 * analyses consommées restent : le grand livre s'ajoute, il ne se
 * réécrit pas.
 */
export function suiteDuQuota(ouvertes: number, consommees: number): SuiteDuQuota {
  if (consommees > 0) return { suite: "REVUE_MANUELLE", ouvertes, consommees };
  return { suite: "RETRAIT_INTEGRAL", retire: ouvertes };
}

export const MOTIF_REVUE_PARTIELLE =
  "Une partie du pack a déjà été consommée. Le remboursement intégral n'est pas prononcé automatiquement : à trancher à la main.";

/** Ce que le candidat lit quand la somme est effectivement revenue. */
export const CONFIRMATION_AU_CANDIDAT =
  "Ton remboursement est parti. Selon ta banque ou ton opérateur, il peut mettre quelques jours à apparaître sur ton compte.";

/* ── La reprise d'une dette dont l'envoi n'est pas parti ──────────────── */

/**
 * Ce qui manquait, et que rien ne faisait.
 *
 * `RESTE_A_FAIRE.DECIDE` dit, depuis le premier jour : « La demande n'est
 * pas partie. **Relance l'envoi.** » Personne ne la relançait.
 * `initierLeRemboursement` a trois appelants — l'annulation d'une
 * consultation, la suppression d'un compte, et un bouton du back-office —
 * et les deux premiers avalent l'échec (`.catch(() => null)`), ce qui est
 * juste sur le moment : une panne du fournisseur ne doit faire échouer ni
 * une annulation ni une anonymisation. Mais rien ne revenait ensuite.
 *
 * Constaté en exécution, après une première tentative en échec passager,
 * puis **toutes** les passes que l'ouvrier planifie :
 *
 *     premier envoi : temporaire
 *     refundDueAt=true refundRequestedAt=false refundedAt=false
 *     après réconciliation, péremption, purge, inactivité, rappels :
 *       tentatives       : 1
 *       demandes parties : 1
 *
 * Une somme due à un candidat, jamais redemandée, jusqu'à ce qu'un
 * opérateur la remarque dans B-04 et clique. Tout le reste était là : la
 * clé d'idempotence « faite pour ça », le compteur de tentatives, la date
 * de la dernière — dont le schéma dit « il faut savoir depuis quand on
 * essaie » — et jusqu'à l'index `(refundDueAt, refundedAt)`. Il manquait
 * la passe.
 */

/** Le repos entre deux envois. Assez pour laisser passer une panne. */
export const REPOS_AVANT_RELANCE_MINUTES = 30;

/**
 * Au-delà, on arrête et on appelle quelqu'un.
 *
 * Une relance qui ne passe jamais ne se corrigera pas en insistant : au
 * bout de cinq, la cause n'est plus passagère même si chaque réponse
 * disait le contraire. Même forme que `TENTATIVES_AVANT_REVUE` pour la
 * lecture d'une pièce, et pour la même raison — rejouer sans fin une
 * tâche qui ne peut pas aboutir masque le problème au lieu de le
 * signaler.
 */
export const TENTATIVES_AVANT_HUMAIN = 5;

export type SuiteDeLaDette =
  /** L'envoi repart maintenant. */
  | "RELANCER"
  /** Il repartira : le repos n'est pas écoulé. */
  | "ATTENDRE"
  /** Cinq envois n'ont pas abouti. La passe s'arrête et ouvre un écart. */
  | "APPELER_UN_HUMAIN"
  /** Rien à faire : soldée, déjà demandée, ou déjà entre les mains d'un humain. */
  | "RIEN";

export interface DetteARelancer {
  dueAt: Date | null;
  requestedAt: Date | null;
  refundedAt: Date | null;
  /** Nombre d'envois déjà tentés, réussis ou non. */
  tentatives: number;
  derniereTentative: Date | null;
  /** Un écart est ouvert sur cette transaction : quelqu'un s'en occupe. */
  ecartOuvert: boolean;
}

/**
 * Que faire de cette dette aujourd'hui ?
 *
 * L'ordre des questions n'est pas neutre. `refundedAt` d'abord : une somme
 * rendue ne se redemande pas, quoi que disent les autres colonnes. Puis
 * `requestedAt` — **une demande acceptée n'est pas notre affaire** : elle
 * attend la notification signée du fournisseur, et la relancer enverrait
 * une seconde demande sur une première qui a abouti. C'est la distinction
 * que ce module existe pour tenir. La requête de la passe la filtre déjà,
 * et la règle est ici aussi : deux gardes valent mieux qu'une sur une
 * question d'argent, et la seconde survivra à une requête réécrite.
 *
 * L'écart ouvert passe avant le compteur : une dette qu'un humain regarde
 * déjà n'a pas besoin qu'on lui en ouvre un second, et la relancer
 * pendant qu'il l'examine brouillerait ce qu'il voit.
 */
export function suiteDeLaDette(dette: DetteARelancer, maintenant: Date): SuiteDeLaDette {
  if (dette.refundedAt !== null) return "RIEN";
  if (dette.requestedAt !== null) return "RIEN";
  if (dette.dueAt === null) return "RIEN";
  if (dette.ecartOuvert) return "RIEN";
  if (dette.tentatives >= TENTATIVES_AVANT_HUMAIN) return "APPELER_UN_HUMAIN";
  if (dette.derniereTentative === null) return "RELANCER";
  const repos = maintenant.getTime() - dette.derniereTentative.getTime();
  return repos >= REPOS_AVANT_RELANCE_MINUTES * 60_000 ? "RELANCER" : "ATTENDRE";
}

/**
 * Ce que l'opérateur lit quand la passe abandonne. Actionnable : il dit ce
 * qui a été tenté, combien de fois, et que la somme reste due.
 */
export const MOTIF_RELANCES_EPUISEES = (tentatives: number): string =>
  `La demande de remboursement n'est pas passée après ${tentatives} envois. La somme reste due et la relance automatique s'arrête : à reprendre à la main auprès du fournisseur.`;
