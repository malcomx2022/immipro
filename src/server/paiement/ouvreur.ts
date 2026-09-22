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
export type Ouverture =
  | { issue: "ouverte"; session: SessionHebergee }
  /** Réseau, délai, 5xx : la demande n'a pas abouti, on ne sait pas plus. */
  | { issue: "injoignable" }
  /**
   * Le fournisseur a répondu, et sa réponse n'est pas celle qu'on attend :
   * champ absent, URL sur un domaine étranger, forme inconnue. `detail`
   * décrit la **forme**, jamais un secret ni le corps reçu.
   */
  | { issue: "reponse_inattendue"; detail: string }
  /** Le fournisseur refuse la demande elle-même (montant, devise, compte). */
  | { issue: "refusee"; detail: string }
  /**
   * La transaction existe chez le fournisseur, l'URL n'a pas pu être
   * obtenue. Le cas de FedaPay, dont l'ouverture se fait en deux appels :
   * sans cette issue, l'identifiant de la première étape serait perdu et
   * la tentative suivante créerait une seconde transaction. Ici, il est
   * rendu, enregistré, et `retrouver` reprend là où on s'est arrêté.
   */
  | { issue: "creee_sans_url"; providerTxId: string; detail: string };

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
