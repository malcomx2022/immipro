/**
 * L'adaptateur Stripe — ouverture d'une session de paiement hébergée.
 *
 * Un seul appel par opération, une clé d'idempotence sur la création, et
 * une réponse lue au schéma : ce qui n'y est pas déclaré n'atteint pas le
 * code qui décide. Une réponse inattendue n'envoie personne payer.
 *
 * **La référence interne voyage dans `metadata[reference]`**, parce que
 * c'est là que `lireStripe` va la chercher au retour du webhook. Les deux
 * lisent la même clé, et un test le vérifie : sans elle, la notification
 * signée arriverait sans savoir quel paiement elle confirme.
 *
 * **Le montant part en plus petite unité.** 12 € valent 1 200 pour Stripe.
 * La conversion vit dans le domaine, testée, et le retour est reconverti
 * avant d'être comparé à ce que la plateforme avait décidé.
 *
 * La clé secrète ne quitte jamais le serveur : elle n'est lue qu'ici, dans
 * un en-tête, et n'apparaît dans aucun journal ni aucune réponse.
 */
import { z } from "zod";
import {
  depuisSousUnite,
  verifierLUrlHebergee,
  versSousUnite,
} from "@/domain/paiement/ouverture";
import type { DemandeDOuverture, Ouverture, Ouvreur } from "./ouvreur";
import type { Consultant } from "./consultation";
import { CAUSES_STRIPE } from "./notifications";
import type { TransactionStatus } from "@prisma/client";

const BASE = "https://api.stripe.com/v1";

/** Le domaine, pas l'hôte : un sous-domaine peut changer, le domaine non. */
export const DOMAINES = ["stripe.com"] as const;

/** Au-delà, on tient l'appel pour perdu plutôt que de faire attendre. */
const DELAI_MS = 15_000;

const schemaSession = z.object({
  id: z.string().min(1),
  url: z.string().nullish(),
  amount_total: z.number().nullish(),
  currency: z.string().nullish(),
  metadata: z.object({ reference: z.string().nullish() }).nullish(),
});

/** Le corps d'erreur de Stripe. Seul le type est lu, jamais le message brut. */
const schemaErreur = z.object({ error: z.object({ type: z.string().optional() }).optional() });

const formulaire = (champs: Record<string, string | number>): string =>
  Object.entries(champs)
    .map(([c, v]) => `${encodeURIComponent(c)}=${encodeURIComponent(String(v))}`)
    .join("&");

async function appeler(
  cle: string,
  chemin: string,
  options: { corps?: string; idempotence?: string },
): Promise<{ statut: number; charge: unknown } | null> {
  const entetes: Record<string, string> = { Authorization: `Bearer ${cle}` };
  if (options.corps !== undefined) {
    entetes["Content-Type"] = "application/x-www-form-urlencoded";
  }
  if (options.idempotence) entetes["Idempotency-Key"] = options.idempotence;

  try {
    const reponse = await fetch(`${BASE}${chemin}`, {
      method: options.corps === undefined ? "GET" : "POST",
      headers: entetes,
      ...(options.corps === undefined ? {} : { body: options.corps }),
      signal: AbortSignal.timeout(DELAI_MS),
  });
    return { statut: reponse.status, charge: await reponse.json().catch(() => null) };
  } catch {
    // Réseau, délai, DNS : on ne sait pas si la demande est passée. C'est
    // exactement pourquoi la clé d'idempotence est dérivée et stable.
    return null;
  }
}

function lireLaSession(charge: unknown, attendue: string): Ouverture {
  const lu = schemaSession.safeParse(charge);
  if (!lu.success) return { issue: "reponse_inattendue", detail: "session illisible au schéma" };

  /*
    La référence doit être revenue telle quelle : c'est elle que
    `lireStripe` lit dans la notification signée. Une session dont la
    référence n'est pas la nôtre n'est pas la nôtre.
  */
  if (lu.data.metadata?.reference !== attendue) {
    return {
      issue: "reponse_inattendue",
      detail: "la référence interne n'est pas revenue telle quelle",
    };
  }

  const url = verifierLUrlHebergee(lu.data.url, DOMAINES);
  if (!url.valide) {
    // L'identifiant existe : la session est créée, seule l'URL manque.
    return {
      issue: "creee_sans_url",
      providerTxId: `stripe:${lu.data.id}`,
      detail: `url ${url.raison}`,
    };
  }
  if (typeof lu.data.amount_total !== "number" || !lu.data.currency) {
    return { issue: "reponse_inattendue", detail: "montant ou devise absents de la session" };
  }

  const devise = lu.data.currency.toUpperCase();
  return {
    issue: "ouverte",
    session: {
      providerTxId: `stripe:${lu.data.id}`,
      url: url.url,
      montant: depuisSousUnite(lu.data.amount_total, devise),
      devise,
    },
  };
}

export const adaptateurStripe = (cle: string, retourAbsolu: (chemin: string) => string): Ouvreur => ({
  fournisseur: "STRIPE",

  async creer(demande: DemandeDOuverture): Promise<Ouverture> {
    const retour = retourAbsolu(demande.retour);
    const reponse = await appeler(cle, "/checkout/sessions", {
      idempotence: demande.cle,
      corps: formulaire({
        mode: "payment",
        // Les deux mènent à la page d'attente, qui ne conclut rien : un
        // candidat qui renonce ne doit pas tomber sur une page morte.
        success_url: retour,
        cancel_url: retour,
        "line_items[0][quantity]": 1,
        "line_items[0][price_data][currency]": demande.devise.toLowerCase(),
        "line_items[0][price_data][unit_amount]": versSousUnite(demande.montant, demande.devise),
        "line_items[0][price_data][product_data][name]": demande.intitule,
        // C'est ici que `lireStripe` ira chercher la référence au retour.
        "metadata[reference]": demande.reference,
        "payment_intent_data[metadata][reference]": demande.reference,
      }),
    });

    if (!reponse) return { issue: "injoignable" };
    if (reponse.statut >= 500) return { issue: "injoignable" };
    if (reponse.statut >= 400) {
      const erreur = schemaErreur.safeParse(reponse.charge);
      return { issue: "refusee", detail: erreur.success ? (erreur.data.error?.type ?? "refus") : "refus" };
    }
    return lireLaSession(reponse.charge, demande.reference);
  },

  async retrouver(providerTxId: string, reference: string): Promise<Ouverture> {
    const identifiant = providerTxId.replace(/^stripe:/u, "");
    const reponse = await appeler(cle, `/checkout/sessions/${encodeURIComponent(identifiant)}`, {});
    if (!reponse) return { issue: "injoignable" };
    if (reponse.statut >= 500) return { issue: "injoignable" };
    if (reponse.statut >= 400) return { issue: "refusee", detail: "session introuvable chez Stripe" };
    return lireLaSession(reponse.charge, reference);
  },
});

/* ------------------------------------------------------------------ *
 * Consultation — RG-05.4, le rattrapage d'un webhook perdu.
 * ------------------------------------------------------------------ */

/**
 * Ce que Stripe dit d'une session, et ce qu'on a le droit d'en conclure.
 *
 * Deux objets se lisent ensemble : la session porte `payment_status`, et
 * l'intention de paiement qu'elle contient porte l'état détaillé et, sur
 * un refus, son code. L'intention est demandée en expansion pour n'avoir
 * qu'un appel — une consultation qui en ferait deux doublerait le coût
 * d'un job qui tourne tous les quarts d'heure.
 */
const schemaConsultation = z.object({
  id: z.string().min(1),
  payment_status: z.string().nullish(),
  status: z.string().nullish(),
  metadata: z.object({ reference: z.string().nullish() }).nullish(),
  payment_intent: z
    .union([
      z.string(),
      z.object({
        id: z.string().min(1),
        status: z.string().nullish(),
        last_payment_error: z
          .object({ code: z.string().optional(), decline_code: z.string().optional() })
          .nullish(),
      }),
    ])
    .nullish(),
});

/**
 * L'état de l'intention de paiement, traduit dans le cycle interne.
 *
 * `canceled` et `requires_payment_method` sans erreur ne sont pas des
 * refus : personne n'a rejeté ce paiement, il n'a simplement pas eu
 * lieu. Les écrire `ECHOUEE` accuserait la carte d'un candidat qui a
 * seulement fermé l'onglet.
 */
export const ETAT_DE_LINTENTION: Record<string, TransactionStatus | "SANS_PAIEMENT"> = {
  succeeded: "CONFIRMEE",
  processing: "EN_ATTENTE",
  requires_action: "EN_ATTENTE",
  requires_confirmation: "EN_ATTENTE",
  requires_capture: "EN_ATTENTE",
  requires_payment_method: "SANS_PAIEMENT",
  canceled: "SANS_PAIEMENT",
};

export const consultantStripe = (cle: string): Consultant => ({
  fournisseur: "STRIPE",

  async consulter(providerTxId, reference) {
    if (!providerTxId) {
      // Aucune session n'a été ouverte : il n'y a rien à consulter, et
      // ce n'est pas une anomalie — la transaction vient de naître.
      return { issue: "introuvable" };
    }
    const identifiant = providerTxId.replace(/^stripe:/u, "");
    const reponse = await appeler(
      cle,
      `/checkout/sessions/${encodeURIComponent(identifiant)}?expand[]=payment_intent`,
      {},
    );

    if (!reponse) return { issue: "indisponible", detail: "fournisseur injoignable" };
    if (reponse.statut >= 500) return { issue: "indisponible", detail: `réponse ${reponse.statut}` };
    if (reponse.statut === 404) return { issue: "introuvable" };
    if (reponse.statut >= 400) {
      // Un 4xx qui n'est pas un 404 est un défaut de notre côté — clé
      // révoquée, identifiant malformé. On ne prononce rien sur le
      // paiement pour autant.
      return { issue: "indisponible", detail: `réponse ${reponse.statut}` };
    }

    const lu = schemaConsultation.safeParse(reponse.charge);
    if (!lu.success) return { issue: "indisponible", detail: "session illisible au schéma" };

    /*
      L'identifiant rendu doit être celui qu'on a demandé, et la
      référence celle qu'on a posée à l'ouverture. Une réponse qui parle
      d'autre chose n'est pas une réponse sur notre paiement : on
      n'applique rien, et l'écart s'ouvre là où il se lit.
    */
    if (lu.data.id !== identifiant) {
      return { issue: "incoherent", detail: "la session rendue n'est pas celle demandée" };
    }
    if (lu.data.metadata?.reference && lu.data.metadata.reference !== reference) {
      return { issue: "incoherent", detail: "la référence interne de la session est une autre" };
    }

    const intention =
      typeof lu.data.payment_intent === "object" && lu.data.payment_intent !== null
        ? lu.data.payment_intent
        : null;

    // Payé, c'est payé : la session le dit sans ambiguïté, et c'est le
    // cas qui compte — un webhook perdu sur un paiement réussi.
    if (lu.data.payment_status === "paid") {
      return { issue: "connu", statut: "CONFIRMEE", providerTxId: `stripe:${lu.data.id}` };
    }

    if (intention?.status) {
      const traduit = ETAT_DE_LINTENTION[intention.status];
      if (traduit === undefined) {
        // Un état qu'on ne connaît pas ne se devine pas.
        return { issue: "indisponible", detail: "état d'intention inconnu" };
      }
      if (traduit === "SANS_PAIEMENT") {
        const erreur = intention.last_payment_error;
        const code = erreur?.decline_code ?? erreur?.code;
        if (!erreur) return { issue: "sans_paiement" };
        /*
          Là, et seulement là, un refus a été prononcé : l'intention
          porte l'erreur du dernier essai. La cause vient de sa table, et
          reste absente si le code n'y figure pas — mieux vaut un refus
          sans raison qu'une raison inventée (N.B).
        */
        return {
          issue: "connu",
          statut: "ECHOUEE",
          providerTxId: `stripe:${lu.data.id}`,
          ...(code && CAUSES_STRIPE[code] ? { cause: CAUSES_STRIPE[code] } : {}),
        };
      }
      return { issue: "connu", statut: traduit, providerTxId: `stripe:${lu.data.id}` };
    }

    // Session expirée sans paiement : le fournisseur la connaît, rien
    // n'a été réglé, personne n'a refusé. L'expiration reste celle de la
    // plateforme, pas la sienne.
    if (lu.data.status === "expired") return { issue: "sans_paiement" };
    return { issue: "sans_paiement" };
  },
});
