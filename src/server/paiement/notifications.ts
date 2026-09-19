import { z } from "zod";
import type { TransactionStatus } from "@prisma/client";

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

const ETATS_STRIPE: Record<string, TransactionStatus> = {
  "checkout.session.completed": "CONFIRMEE",
  "payment_intent.succeeded": "CONFIRMEE",
  "payment_intent.processing": "EN_ATTENTE",
  "payment_intent.payment_failed": "ECHOUEE",
  "charge.refunded": "REMBOURSEE",
};

export interface Lue {
  providerTxId: string;
  reference: string;
  statut: TransactionStatus;
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
  const statut = ETATS_FEDAPAY[lu.data.entity.status.toLowerCase()];
  if (!statut) return null;
  return {
    providerTxId: `fedapay:${lu.data.entity.id}`,
    reference: lu.data.entity.reference,
    statut,
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
    }),
  }),
});

export function lireStripe(charge: unknown): Lue | null {
  const lu = schemaStripe.safeParse(charge);
  if (!lu.success) return null;
  const statut = ETATS_STRIPE[lu.data.type];
  if (!statut) return null;
  return {
    providerTxId: `stripe:${lu.data.data.object.id}`,
    reference: lu.data.data.object.metadata.reference,
    statut,
  };
}
