import { z } from "zod";
import type { TransactionStatus } from "@prisma/client";
import type { CauseRefus } from "@/domain/paiement/echec";

/**
 * Lecture des notifications des deux rails.
 *
 * Les charges utiles ne sont pas de nous : elles sont validées avant d'être
 * lues, comme toute entrée. Une notification authentiquement signée mais de
 * forme inattendue n'est pas une notification de confiance — elle signale un
 * changement d'API du fournisseur, et l'écrire en base sans la comprendre
 * ferait plus de dégâts que la refuser.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

const ETATS_FEDAPAY: Record<string, TransactionStatus> = {
  approved: "CONFIRMEE",
  transferred: "CONFIRMEE",
  pending: "EN_ATTENTE",
  declined: "ECHOUEE",
  canceled: "ECHOUEE",
  failed: "ECHOUEE",
  refunded: "REMBOURSEE",
};

/**
 * Ce que le `status` de FedaPay dit déjà de la cause — N.B, confirmé par
 * O.A le 20/09/2026.
 *
 * Les trois états d'échec se lisaient comme un seul, et l'information était
 * là depuis le début : « canceled » n'est pas « declined », et aucun des
 * deux n'est « failed ». Le rail n'en dit pas plus — pas de code de refus
 * normalisé —, donc le solde n'est jamais nommé de ce côté.
 *
 * **La condition d'entrée dans cette table, et c'est O.A qui la pose.**
 * Un état ne peut s'y traduire que par une cause que le vocabulaire de
 * `status` distingue réellement. `SOLDE_INSUFFISANT` et `MOYEN_INVALIDE`
 * nomment une défaillance précise de l'instrument du payeur : les faire
 * sortir de « declined » serait les deviner. Il faudrait pour cela un code
 * de refus **normalisé et contractuellement stable**, et le webhook n'en
 * porte pas.
 *
 * L'API de consultation d'une transaction en expose peut-être un. On ne
 * l'appellera pas pour autant : interroger une seconde adresse à chaque
 * échec, dans le seul but de fabriquer une précision incertaine, coûte un
 * aller-retour sur le chemin d'un webhook et rapporte une cause dont on ne
 * pourrait pas garantir le sens. L'étude de la documentation reste à faire
 * et **ne bloque rien** ; elle décidera si une valeur stable existe. Un
 * test tient la condition d'ici là.
 */
const CAUSES_FEDAPAY: Record<string, CauseRefus> = {
  declined: "REFUS_EMETTEUR",
  canceled: "ANNULE_PAR_LE_PAYEUR",
  failed: "INCIDENT_TECHNIQUE",
};

/**
 * Codes de refus de Stripe, normalisés par le réseau — N.B.
 *
 * Ils arrivent dans `last_payment_error`, qui porte aussi un message
 * rédigé et les quatre derniers chiffres de la carte. Rien de tout cela
 * n'entre en base : seul le code est lu, et seul ce tableau décide ce
 * qu'on en retient. Un code inconnu ne devient pas « solde insuffisant »
 * par défaut — il retombe sur le refus sans raison.
 */
const CAUSES_STRIPE: Record<string, CauseRefus> = {
  insufficient_funds: "SOLDE_INSUFFISANT",
  card_velocity_exceeded: "SOLDE_INSUFFISANT",
  expired_card: "MOYEN_INVALIDE",
  incorrect_number: "MOYEN_INVALIDE",
  incorrect_cvc: "MOYEN_INVALIDE",
  invalid_account: "MOYEN_INVALIDE",
  invalid_expiry_month: "MOYEN_INVALIDE",
  invalid_expiry_year: "MOYEN_INVALIDE",
  processing_error: "INCIDENT_TECHNIQUE",
  issuer_not_available: "INCIDENT_TECHNIQUE",
  try_again_later: "INCIDENT_TECHNIQUE",
};

const ETATS_STRIPE: Record<string, TransactionStatus> = {
  "checkout.session.completed": "CONFIRMEE",
  "payment_intent.succeeded": "CONFIRMEE",
  "payment_intent.processing": "EN_ATTENTE",
  "payment_intent.payment_failed": "ECHOUEE",
  "charge.refunded": "REMBOURSEE",
};

export interface Lue {
  /**
   * Ce qui se rejoue : la notification — M.B.
   *
   * Distinct de `providerTxId`, qui désigne la transaction. Une transaction
   * reçoit plusieurs notifications au cours de sa vie ; les confondre
   * faisait passer un remboursement pour un rejeu de la confirmation.
   */
  providerEventId: string;
  /** Ce dont on parle : la transaction chez le fournisseur. */
  providerTxId: string;
  reference: string;
  statut: TransactionStatus;
  /** Pourquoi, quand le rail le dit. Jamais deviné (N.B). */
  cause?: CauseRefus;
}

const schemaFedaPay = z.object({
  entity: z.object({
    id: z.union([z.string(), z.number()]),
    status: z.string(),
    // Référence interne transmise à la création puis renvoyée telle quelle.
    reference: z.string().min(1),
  }),
});

export function lireFedaPay(charge: unknown): Lue | null {
  const lu = schemaFedaPay.safeParse(charge);
  if (!lu.success) return null;
  const etat = lu.data.entity.status.toLowerCase();
  const statut = ETATS_FEDAPAY[etat];
  if (!statut) return null;
  const cause = CAUSES_FEDAPAY[etat];
  return {
    /**
     * FedaPay renvoie l'entité, pas l'événement : la charge utile n'a pas
     * d'identifiant de notification, et l'identifiant d'entité est le même
     * de la confirmation au remboursement. La clé est donc dérivée du
     * couple entité + état — ce qui distingue les notifications d'une même
     * transaction, et rend identiques deux envois de la même. Le jour où le
     * rail expose un identifiant d'événement, c'est lui qu'on lira.
     */
    providerEventId: `fedapay:${lu.data.entity.id}:${etat}`,
    providerTxId: `fedapay:${lu.data.entity.id}`,
    reference: lu.data.entity.reference,
    statut,
    ...(cause ? { cause } : {}),
  };
}

const schemaStripe = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  data: z.object({
    object: z.object({
      id: z.string().min(1),
      // La référence interne voyage dans les métadonnées : Stripe n'a pas de
      // champ de référence marchand qui survive à tous les types d'objet.
      metadata: z.object({ reference: z.string().min(1) }),
      /**
       * Le détail du refus, absent partout ailleurs que sur un échec.
       *
       * Seul `decline_code` est lu, et `code` à défaut. Le `message`
       * rédigé et les quatre derniers chiffres de la carte, qui voyagent
       * dans le même objet, ne sont pas déclarés ici : ce qui n'est pas au
       * schéma n'atteint pas le code qui écrit en base.
       */
      last_payment_error: z
        .object({ code: z.string().optional(), decline_code: z.string().optional() })
        .optional(),
    }),
  }),
});

export function lireStripe(charge: unknown): Lue | null {
  const lu = schemaStripe.safeParse(charge);
  if (!lu.success) return null;
  const statut = ETATS_STRIPE[lu.data.type];
  if (!statut) return null;

  const erreur = lu.data.data.object.last_payment_error;
  const code = erreur?.decline_code ?? erreur?.code;
  // Un échec annoncé sans code reconnu reste un refus sans raison : la
  // valeur par défaut ne doit accuser ni le solde ni le moyen.
  const cause: CauseRefus | undefined =
    statut === "ECHOUEE" ? ((code ? CAUSES_STRIPE[code] : undefined) ?? "REFUS_EMETTEUR") : undefined;

  return {
    // Stripe, lui, numérote ses événements : `evt_…` est exactement la clé
    // que l'idempotence demande, et il en émet un par notification.
    providerEventId: `stripe:${lu.data.id}`,
    providerTxId: `stripe:${lu.data.data.object.id}`,
    reference: lu.data.data.object.metadata.reference,
    statut,
    ...(cause ? { cause } : {}),
  };
}
