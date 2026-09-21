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
