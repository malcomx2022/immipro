import { z } from "zod";
import type { TransactionStatus } from "@prisma/client";
import type { CauseRefus } from "@/domain/paiement/echec";
import { versMineur } from "@/domain/facturation/montants";

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

/**
 * Les états de transaction de FedaPay.
 *
 * Écrite d'après des charges utiles de notification observées, puis
 * **confirmée par la documentation publique** le 22/09/2026, qui donne la
 * même liste : `pending`, `approved`, `canceled`, `refunded`, `declined`,
 * `transferred`. Deux sources indépendantes qui concordent.
 *
 * Exportée pour que la consultation (RG-05.4) lise la même table que la
 * notification signée. Une seconde table divergerait au premier
 * correctif, et les deux chemins se mettraient à traduire le même mot
 * différemment — sur une décision qui crédite ou impute un échec.
 */
export const ETATS_FEDAPAY: Record<string, TransactionStatus> = {
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
export const CAUSES_FEDAPAY: Record<string, CauseRefus> = {
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
export const CAUSES_STRIPE: Record<string, CauseRefus> = {
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
  /**
   * Notre référence, quand le fournisseur la renvoie. `null` sinon : le
   * paiement se retrouve alors par `providerTxId`, posé à l'ouverture.
   */
  reference: string | null;
  statut: TransactionStatus;
  /** Pourquoi, quand le rail le dit. Jamais deviné (N.B). */
  cause?: CauseRefus;
  /**
   * Ce que le fournisseur dit avoir encaissé, en unités mineures — revue
   * du 07/10/2026, E2.
   *
   * Une confirmation créditait sur le seul statut : un paiement de
   * 10 000 F ouvrait un pack vendu 15 000 F. `null` quand la notification
   * ne le porte pas — un échec, une attente — ; une confirmation sans
   * montant ne concorde pas (`encaissementConcorde`).
   */
  montantMineur: number | null;
  /** La devise ISO, en capitales. `null` quand le rail ne la nomme pas. */
  devise: string | null;
  /**
   * Le cumul remboursé, en unités mineures, quand le rail le dit — revue
   * du 07/10/2026, E3. Stripe le porte sur `charge.refunded`
   * (`amount_refunded`) ; FedaPay ne le dit pas, et `null` laisse
   * s'appliquer un remboursement que la plateforme a elle-même initié.
   */
  rembourseMineur: number | null;
}

/**
 * Notre référence, telle que FedaPay la renvoie — 03/10/2026.
 *
 * L'adaptateur envoyait `reference` à la création et attendait de la
 * relire au même endroit. Mais `reference` n'est pas un champ de la
 * création : la documentation de `POST /transactions` ne le connaît pas,
 * et la réponse porte la référence que FedaPay génère (`trx_…`). La
 * comparaison échouait donc à chaque ouverture, et aucun paiement ne
 * pouvait partir de l'interface — ce que seul un appel réel pouvait
 * montrer, les essais sans réseau rendant la réponse qu'on leur dictait.
 *
 * Notre référence part désormais dans `custom_metadata.reference`,
 * documenté à la création et rendu à la lecture comme dans l'événement.
 * `merchant_reference`, rendu à la lecture, est accepté en repli.
 * `null` quand ni l'un ni l'autre ne revient : l'appelant décide alors
 * sur l'identifiant de transaction, jamais sur la référence de FedaPay.
 */
export function referenceMarchande(lue: {
  custom_metadata?: unknown;
  merchant_reference?: string | null;
}): string | null {
  const meta = lue.custom_metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const ref = (meta as Record<string, unknown>).reference;
    if (typeof ref === "string" && ref.trim() !== "") return ref;
  }
  const marchande = lue.merchant_reference?.trim();
  return marchande ? marchande : null;
}

/*
  L'événement porte la transaction entière sous `entity`. Sa `reference`
  est celle que FedaPay génère (`trx_…`) : la nôtre voyage dans
  `custom_metadata`, et c'est elle qu'on lit (03/10/2026). Le schéma
  exigeait `entity.reference` comme si c'était la nôtre — aucune
  notification réelle n'aurait retrouvé son paiement.
*/
const schemaFedaPay = z.object({
  entity: z.object({
    id: z.union([z.string(), z.number()]),
    status: z.string(),
    custom_metadata: z.unknown().optional(),
    merchant_reference: z.string().nullish(),
    /*
      Le montant, hors frais : vérifié le 08/10/2026 sur IMP-261005-P98AEE,
      `entity.amount` vaut 5 000 pour un Essentiel dont le widget affichait
      5 208 F frais compris (décision D-7). Facultatif, comme la devise :
      un `declined` sans montant lisible reste un refus lisible.
    */
    amount: z.number().nullish(),
    currency: z.object({ iso: z.string() }).nullish(),
    currency_id: z.union([z.string(), z.number()]).nullish(),
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
    reference: referenceMarchande(lu.data.entity),
    statut,
    ...(cause ? { cause } : {}),
    ...encaissementFedaPay(lu.data.entity),
    rembourseMineur: null,
  };
}

/**
 * Le montant FedaPay, ramené en unités mineures.
 *
 * FedaPay parle en unités entières de la devise. Le rail ne sert que le
 * franc CFA (N.A), dont l'unité mineure est le franc : une devise rendue
 * par son seul `currency_id`, sans code ISO, se compare donc en francs, et
 * reste `null` — seul le montant est alors comparé.
 */
export function encaissementFedaPay(entite: {
  amount?: number | null;
  currency?: { iso: string } | null;
}): { montantMineur: number | null; devise: string | null } {
  const devise = entite.currency?.iso ? entite.currency.iso.toUpperCase() : null;
  const montant = entite.amount;
  if (montant === null || montant === undefined || !Number.isFinite(montant)) {
    return { montantMineur: null, devise };
  }
  return { montantMineur: versMineur(montant, devise ?? "XOF"), devise };
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
      /*
        Ce qui a été encaissé ou rendu — revue du 07/10/2026, E2 et E3.
        Stripe parle déjà en unités mineures. La session porte
        `amount_total` et `payment_status`, l'intention `amount_received`,
        la charge remboursée `amount_refunded` (cumulé).
      */
      amount_total: z.number().nullish(),
      amount_received: z.number().nullish(),
      amount_refunded: z.number().nullish(),
      currency: z.string().nullish(),
      payment_status: z.string().nullish(),
    }),
  }),
});

export function lireStripe(charge: unknown): Lue | null {
  const lu = schemaStripe.safeParse(charge);
  if (!lu.success) return null;
  const objet = lu.data.data.object;
  const annonce = ETATS_STRIPE[lu.data.type];
  if (!annonce) return null;
  /*
    Une session terminée n'est pas forcément payée : un moyen différé la
    termine avec `payment_status: "unpaid"`, et le paiement arrive ou non
    plus tard. Seul `paid` confirme (E2) ; le reste est une attente.
  */
  const statut: TransactionStatus =
    lu.data.type === "checkout.session.completed" &&
    objet.payment_status !== undefined &&
    objet.payment_status !== null &&
    objet.payment_status !== "paid"
      ? "EN_ATTENTE"
      : annonce;

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
    providerTxId: `stripe:${objet.id}`,
    reference: objet.metadata.reference,
    statut,
    ...(cause ? { cause } : {}),
    montantMineur:
      statut === "CONFIRMEE" ? (objet.amount_total ?? objet.amount_received ?? null) : null,
    devise: objet.currency ? objet.currency.toUpperCase() : null,
    rembourseMineur: statut === "REMBOURSEE" ? (objet.amount_refunded ?? null) : null,
  };
}
