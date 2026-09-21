/**
 * Le point de branchement du remboursement sortant.
 *
 * ── Ce qui a changé, et ce qui n'a surtout pas changé ───────────────
 *
 * Il n'y avait rien : `NON_BRANCHE` rendait `null`, et c'était la
 * réponse honnête tant qu'aucun adaptateur n'était écrit. Stripe l'est
 * désormais ; FedaPay ne l'est pas, faute de documentation vérifiée, et
 * le dit lui-même plutôt que de deviner un format (voir `fedapay.ts`).
 *
 * **La règle d'INV-7 est intacte.** Ce module envoie une demande et rend
 * ce que le fournisseur a répondu. Il n'écrit rien, ne solde aucune
 * dette, et n'a aucun moyen de le faire : `refundedAt` et `REMBOURSEE`
 * ne s'écrivent que dans `appliquerLaNotification`, sur notification
 * signée. Un appel API qui rend 200 ressemble à un remboursement fait —
 * c'est précisément pourquoi il ne suffit pas.
 *
 * ── Le fournisseur ne se devine pas ──────────────────────────────────
 *
 * Il se lit sur la colonne `provider` de la transaction, posée à la
 * création d'après la devise (N.A). Une transaction ouverte chez l'un ne
 * se rembourse pas chez l'autre — et l'appelant vérifie en plus que
 * `providerTxId` porte bien le préfixe de ce fournisseur-là
 * (`defautDIdentifiant`), avant qu'aucun appel ne parte.
 */

import { CLES, CLES_SORTANTES, environnementNormalise } from "./secrets";
import { remboursementStripe } from "./stripe";
import { remboursementFedaPay } from "./fedapay";
import type { Rembourseur } from "./rembourseur";

export type { DemandeDeRemboursement, Remboursement, Rembourseur } from "./rembourseur";

/**
 * Le rembourseur d'un fournisseur, ou `null` quand sa clé manque.
 *
 * `null` et « adaptateur non opérationnel » sont deux choses, et
 * l'appelant les distingue : la première ne produit aucun appel, la
 * seconde en produit un qui rend `non_configure` avec sa raison. Les
 * deux laissent la dette due — c'est le reste qui diffère, à savoir ce
 * que l'opérateur doit faire.
 */
export function leRembourseur(
  fournisseur: "FEDAPAY" | "STRIPE",
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): Rembourseur | null {
  const lu = environnementNormalise(environnement);
  if (fournisseur === "FEDAPAY") {
    return (lu[CLES.FEDAPAY.apiKey] ?? "").trim() ? remboursementFedaPay() : null;
  }
  const cle = (lu[CLES.STRIPE.apiKey] ?? "").trim();
  return cle ? remboursementStripe(cle) : null;
}

/**
 * Les clés sans lesquelles aucune demande ne part — nomenclature unique,
 * voir `secrets.ts`. Ce sont les clés **sortantes** : celles avec
 * lesquelles on appelle le fournisseur, et non celles avec lesquelles il
 * signe ce qu'il nous envoie.
 */
export const VARIABLES: readonly string[] = CLES_SORTANTES;

/**
 * L'environnement est lu normalisé : l'ancienne graphie `*_SECRET_KEY` est
 * comprise jusqu'à sa date de retrait, et un seul module la connaît.
 */
export const remboursementConfigure = (
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): boolean => {
  const lu = environnementNormalise(environnement);
  return VARIABLES.every((v) => (lu[v] ?? "").trim() !== "");
};

/**
 * La capacité est-elle réellement branchée ?
 *
 * **Non, et pour une raison que le code porte.** La question est posée
 * aux adaptateurs — `operationnel` —, et FedaPay répond non : son format
 * de remboursement n'a pas pu être vérifié, il ne devine pas. Aucun
 * appel réseau n'est fait pour le savoir : ce serait interroger un
 * fournisseur à chaque lecture de l'état de service.
 *
 * Il faut **les deux** rails, comme la rédaction demande ses deux
 * fonctions : un candidat qui a payé en francs CFA ne se rembourse pas
 * parce que l'euro, lui, est branché. Tant que FedaPay ne l'est pas, la
 * capacité se lit non branchée — ce qui est la vérité, et ce que la
 * décision d'exploitation doit voir.
 *
 * Un test éprouve `operationnel` contre le comportement des deux
 * adaptateurs, pour que cette lecture reste une mesure et ne devienne
 * pas une déclaration qu'on oublie de démentir.
 */
export const remboursementBranche = (): boolean =>
  remboursementStripe("sonde").operationnel && remboursementFedaPay().operationnel;
