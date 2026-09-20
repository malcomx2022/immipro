import type { Devise, Pack } from "@/domain/payments/pricing";

/**
 * Commande en cours — WF-05, écrans $-01 à $-06.
 *
 * Deux règles tenues par le type :
 *
 * 1. `pack` est nullable. Aucun pack n'est présélectionné sur $-01 : une
 *    mise en avant visuelle n'est pas un choix fait à la place du candidat,
 *    et c'est sur un écran de paiement que la nuance compte le plus.
 * 2. `conditionsAcceptees` part à faux et n'a pas de valeur par défaut.
 *    Le prototype cochait la case d'avance sur $-02 — celle qui porte
 *    l'acceptation des conditions et la mention de non-garantie. Une case
 *    pré-cochée n'est pas un consentement.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */
export interface Commande {
  pack: Pack | null;
  devise: Devise;
  /** Numéro Mobile Money du débit, saisi à l'inscription. */
  numero: string;
  conditionsAcceptees: boolean;
}

export const commandeInitiale = (devise: Devise, numero: string): Commande => ({
  pack: null,
  devise,
  numero,
  conditionsAcceptees: false,
});

/** Ce qui manque pour passer au récapitulatif, ou rien. */
export function obstacleAuRecapitulatif(commande: Commande): string | null {
  return commande.pack === null ? "Choisis un pack pour continuer." : null;
}

/** Ce qui manque pour déclencher le paiement, ou rien. */
export function obstacleAuPaiement(commande: Commande): string | null {
  if (commande.pack === null) return "Choisis un pack pour continuer.";
  if (!commande.conditionsAcceptees) {
    return "Accepte les conditions d'utilisation pour payer.";
  }
  return null;
}

export const commandePayable = (commande: Commande): boolean =>
  obstacleAuPaiement(commande) === null;

/**
 * Référence de transaction, préfixe IMP. Elle est la seule chose à citer au
 * support : elle apparaît sur $-04, $-05 et $-06, et jamais un code d'erreur.
 */
export const formaterReference = (reference: string): string =>
  reference.toUpperCase();
