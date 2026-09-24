/**
 * Le contrat d'ouverture d'un paiement, et le point de branchement unique.
 *
 * Deux fournisseurs, un seul contrat : le reste du code ne sait pas s'il
 * parle à FedaPay ou à Stripe, et n'a pas à le savoir — le rail suit la
 * devise (N.A) et le client ne le choisit jamais.
 *
 * **Deux opérations, et il en faut deux.** `creer` ouvre une session avec
 * une clé d'idempotence stable ; `retrouver` va rechercher celle dont on
 * connaît déjà l'identifiant. Sans la seconde, une reprise après réponse
 * perdue devrait refaire un appel de création — sûr grâce à la clé, mais
 * aveugle : on ne saurait pas qu'on reprend.
 *
 * **Aucune des deux ne confirme quoi que ce soit.** Une session ouverte
 * est une page où le candidat *pourra* payer. `CONFIRMEE` et le crédit du
 * quota n'ont qu'une source, la notification signée (RG-05.1, INV-7).
 */
import type { Devise } from "@/domain/payments/pricing";

export interface DemandeDOuverture {
  /** Notre référence interne. Elle voyage et doit revenir au webhook. */
  reference: string;
  montant: number;
  devise: Devise;
  /** Dérivée de la référence — voir `domain/paiement/ouverture.ts`. */
  cle: string;
  /** Où le fournisseur ramène le navigateur. Cette adresse ne confirme rien. */
  retour: string;
  /** Ce que le candidat lit sur la page hébergée. Aucune donnée nominative. */
  intitule: string;
}

export interface SessionHebergee {
  /**
   * L'identifiant chez le fournisseur, **préfixé** comme le webhook le
   * préfixe : `stripe:cs_…`, `fedapay:1234`. Les deux écrivent la même
   * colonne, et une colonne unique ne supporte pas deux graphies.
   */
  providerTxId: string;
  /** Vérifiée avant d'être rendue : https, et sur le domaine du fournisseur. */
  url: string;
  /** Ce que le fournisseur a enregistré — comparé à ce qu'on a décidé. */
  montant: number;
  devise: string;
}

/**
 * Le résultat, jamais une exception : un fournisseur injoignable est un
 * cas ordinaire du métier, pas un incident de programmation. Et les trois
 * issues ne se traitent pas pareil — réessayer, refuser, alerter.
 */
/**
 * Ce que le fournisseur a répondu, quand il a répondu.
 *
 * `detail` est obligatoire sur toutes les issues d'échec, et il l'est
 * devenu le 24/09/2026 : `injoignable` n'en portait aucun — « on ne sait
 * pas plus », disait le contrat — alors que l'adaptateur, lui, savait. Il
 * distinguait un 503 d'un délai réseau et rendait la même valeur vide pour
 * les deux. Le compilateur oblige désormais chaque site à dire lequel.
 *
 * `statut` est celui rendu par le fournisseur, absent quand il n'a pas
 * répondu du tout. C'est lui qui remplit `Diagnostic.statutAmont` — un
 * champ déclaré, affiché par `BlocEchec` (« · réponse 503 ») et qu'aucun
 * code de production n'écrivait.
 *
 * Ni l'un ni l'autre ne quitte le serveur vers un écran candidat : ils
 * décrivent la **forme** du problème, jamais un secret ni le corps reçu.
 */
export interface Constat {
  statut?: number;
  detail: string;
}

/**
 * Le constat d'un appel qui n'a produit aucune réponse — réseau coupé,
 * DNS muet, délai dépassé. Il se distingue d'un 5xx : là, le fournisseur
 * a répondu qu'il allait mal ; ici, on ne sait même pas si la demande est
 * passée. C'est exactement pourquoi la clé d'idempotence est dérivée.
 */
export const SANS_REPONSE = "aucune réponse (réseau ou délai)";

export type Ouverture =
  | { issue: "ouverte"; session: SessionHebergee }
  /** Réseau, délai, 5xx : la demande n'a pas abouti. */
  | ({ issue: "injoignable" } & Constat)
  /**
   * Le fournisseur a répondu, et sa réponse n'est pas celle qu'on attend :
   * champ absent, URL sur un domaine étranger, forme inconnue.
   */
  | ({ issue: "reponse_inattendue" } & Constat)
  /** Le fournisseur refuse la demande elle-même (montant, devise, compte). */
  | ({ issue: "refusee" } & Constat)
  /**
   * La transaction existe chez le fournisseur, l'URL n'a pas pu être
   * obtenue. Le cas de FedaPay, dont l'ouverture se fait en deux appels :
   * sans cette issue, l'identifiant de la première étape serait perdu et
   * la tentative suivante créerait une seconde transaction. Ici, il est
   * rendu, enregistré, et `retrouver` reprend là où on s'est arrêté.
   */
  | ({ issue: "creee_sans_url"; providerTxId: string } & Constat);

/**
 * Les issues d'échec du contrat, telles que le domaine les nomme.
 *
 * L'égalité est vérifiée par un essai de typage : une sixième issue
 * ajoutée ici sans être nommée dans `domain/paiement/ouverture` ne
 * compilera plus. Sans cela, elle retomberait silencieusement dans la
 * branche par défaut du lecteur — ce qui est exactement le défaut que
 * ce contrat vient de corriger.
 */
export type IssueDEchec = Exclude<Ouverture["issue"], "ouverte">;

export interface Ouvreur {
  /** Le fournisseur, tel que le rail le nomme. */
  readonly fournisseur: "FEDAPAY" | "STRIPE";
  creer: (demande: DemandeDOuverture) => Promise<Ouverture>;
  /**
   * La référence attendue est passée, et non déduite de la réponse : une
   * session retrouvée doit porter **notre** référence, sans quoi ce n'est
   * pas la nôtre. La vérifier contre elle-même ne vérifierait rien.
   *
   * La devise l'est aussi, et pour une raison moins évidente : un
   * fournisseur peut rendre une transaction **sans code ISO** — FedaPay
   * documente `currency_id`, un entier, sur sa lecture. Sans elle, la
   * reprise rendait une devise vide, la concordance échouait, et
   * **toute reprise se soldait par un écart** là où rien ne divergeait.
   * Elle ne sert que de repli : dès que le fournisseur dit la devise,
   * c'est la sienne qui est rendue et comparée.
   */
  retrouver: (providerTxId: string, reference: string, devise: Devise) => Promise<Ouverture>;
}
