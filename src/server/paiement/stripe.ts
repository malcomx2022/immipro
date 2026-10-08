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
import { SANS_REPONSE } from "./ouvreur";
import type { DemandeDOuverture, Ouverture, Ouvreur } from "./ouvreur";
import type { Consultant } from "./consultation";
import type { DemandeDeRemboursement, Remboursement, Rembourseur } from "./rembourseur";
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

    if (!reponse) return { issue: "injoignable", detail: SANS_REPONSE };
    if (reponse.statut >= 500) {
      return { issue: "injoignable", statut: reponse.statut, detail: "le fournisseur est en panne" };
    }
    if (reponse.statut >= 400) {
      const erreur = schemaErreur.safeParse(reponse.charge);
      return {
        issue: "refusee",
        statut: reponse.statut,
        detail: erreur.success ? (erreur.data.error?.type ?? "refus") : "refus",
      };
    }
    return lireLaSession(reponse.charge, demande.reference);
  },

  async retrouver(providerTxId: string, reference: string): Promise<Ouverture> {
    // La devise n'est pas reprise : Stripe rend toujours `currency` sur
    // une session, et le repli du contrat n'a donc jamais à servir ici.
    const identifiant = providerTxId.replace(/^stripe:/u, "");
    const reponse = await appeler(cle, `/checkout/sessions/${encodeURIComponent(identifiant)}`, {});
    if (!reponse) return { issue: "injoignable", detail: SANS_REPONSE };
    if (reponse.statut >= 500) {
      return { issue: "injoignable", statut: reponse.statut, detail: "le fournisseur est en panne" };
    }
    if (reponse.statut >= 400) {
      return { issue: "refusee", statut: reponse.statut, detail: "session introuvable chez Stripe" };
    }
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
  // Ce que la session a encaissé, en unités mineures — E2.
  amount_total: z.number().nullish(),
  currency: z.string().nullish(),
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
        /*
          La charge, développée par le remboursement seulement : son
          `amount_refunded` dit si le paiement a déjà été remboursé chez
          Stripe (E3).
        */
        latest_charge: z
          .union([z.string(), z.object({ amount_refunded: z.number().nullish() })])
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
    const sansMontant = { montantMineur: null, devise: null };
    if (lu.data.payment_status === "paid") {
      return {
        issue: "connu",
        statut: "CONFIRMEE",
        providerTxId: `stripe:${lu.data.id}`,
        montantMineur: lu.data.amount_total ?? null,
        devise: lu.data.currency ? lu.data.currency.toUpperCase() : null,
      };
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
          ...sansMontant,
        };
      }
      /*
        Une intention réussie dont la session n'est pas encore « paid » :
        le montant de la session est celui qu'elle encaisse.
      */
      return {
        issue: "connu",
        statut: traduit,
        providerTxId: `stripe:${lu.data.id}`,
        ...(traduit === "CONFIRMEE"
          ? {
              montantMineur: lu.data.amount_total ?? null,
              devise: lu.data.currency ? lu.data.currency.toUpperCase() : null,
            }
          : sansMontant),
      };
    }

    // Session expirée sans paiement : le fournisseur la connaît, rien
    // n'a été réglé, personne n'a refusé. L'expiration reste celle de la
    // plateforme, pas la sienne.
    if (lu.data.status === "expired") return { issue: "sans_paiement" };
    return { issue: "sans_paiement" };
  },
});

/* ------------------------------------------------------------------ *
 * Remboursement sortant — la demande part, l'argent non.
 * ------------------------------------------------------------------ */

/**
 * Ce que Stripe rend sur un remboursement.
 *
 * Le `status` est lu, jamais supposé : c'est lui qui sépare une demande
 * prise en charge d'un refus. Et même `succeeded` ne fait pas écrire
 * `refundedAt` chez nous — seule la notification signée `charge.refunded`
 * l'écrit (INV-7). Ce que l'adaptateur rend s'arrête à « il a pris la
 * demande ».
 */
const schemaRemboursement = z.object({
  id: z.string().min(1),
  status: z.string().nullish(),
});

/**
 * Les états d'un remboursement Stripe, et ce qu'ils valent ici.
 *
 * Table fermée : un état inconnu n'est pas rangé par défaut du côté
 * rassurant. Il rend `reponse_illisible`, qui appelle un humain — un
 * état qu'on ne connaît pas est exactement le cas où deviner coûte cher.
 */
export const ETAT_DU_REMBOURSEMENT: Readonly<Record<string, "acceptee" | "refusee">> = {
  succeeded: "acceptee",
  pending: "acceptee",
  requires_action: "acceptee",
  failed: "refusee",
  canceled: "refusee",
};

/**
 * Les types d'erreur qui ne se relancent pas.
 *
 * `invalid_request_error` couvre le remboursement déjà fait, la charge
 * trop ancienne, l'intention inexistante : relancer n'y changera rien.
 * Tout le reste — `api_error`, `rate_limit_error`, un type inconnu — est
 * tenu pour passager, ce qui est le côté sûr : on réessaie une dette
 * plutôt que de la classer.
 */
const REFUS_DEFINITIF = new Set(["invalid_request_error", "card_error"]);

export const remboursementStripe = (cle: string): Rembourseur => ({
  fournisseur: "STRIPE",
  operationnel: true,

  async demander(demande: DemandeDeRemboursement): Promise<Remboursement> {
    /*
      Notre `providerTxId` est celui d'une **session** de paiement, et
      Stripe ne rembourse pas une session : il rembourse une intention ou
      une charge. Le premier appel va donc chercher l'intention que la
      session a produite.

      C'est aussi la seule vérification qui vaille que la session est bien
      la nôtre : on relit `metadata[reference]` avant de rembourser quoi
      que ce soit. Rembourser la session d'un autre candidat parce qu'un
      identifiant a été mal recopié est le genre d'erreur qu'on ne répare
      pas avec un correctif.
    */
    const identifiant = demande.providerTxId.replace(/^stripe:/u, "");
    const session = await appeler(
      cle,
      `/checkout/sessions/${encodeURIComponent(identifiant)}?expand[]=payment_intent.latest_charge`,
      {},
    );
    if (!session) return { issue: "temporaire", detail: "session injoignable" };
    if (session.statut >= 500) return { issue: "temporaire", detail: `session ${session.statut}` };
    if (session.statut >= 400) {
      return { issue: "refusee_definitivement", detail: "session inconnue chez Stripe" };
    }

    const lue = schemaConsultation.safeParse(session.charge);
    if (!lue.success) return { issue: "reponse_illisible", detail: "session illisible au schéma" };
    if (lue.data.metadata?.reference !== demande.reference) {
      return {
        issue: "refusee_definitivement",
        detail: "la session ne porte pas notre référence",
      };
    }

    const intention =
      typeof lue.data.payment_intent === "string"
        ? lue.data.payment_intent
        : (lue.data.payment_intent?.id ?? null);
    if (!intention) {
      /*
        Une session sans intention n'a jamais été payée. Ce n'est pas une
        panne : il n'y a rien à rendre, et relancer ne fera rien
        apparaître. L'opérateur doit le savoir plutôt que de voir la
        tentative se répéter.
      */
      return {
        issue: "refusee_definitivement",
        detail: "la session ne porte aucune intention de paiement : rien n'a été encaissé",
      };
    }

    /*
      Déjà remboursé chez Stripe — revue du 07/10/2026, E3. Un geste fait
      au tableau de bord, ou une demande précédente dont la réponse s'est
      perdue, a déjà rendu de l'argent : en demander encore rembourserait
      deux fois. Rien ne part ; la notification signée `charge.refunded`
      soldera la dette si la somme est la bonne, et ouvrira un écart sinon.
    */
    const charge =
      typeof lue.data.payment_intent === "object" && lue.data.payment_intent !== null
        ? lue.data.payment_intent.latest_charge
        : null;
    const dejaRendu = typeof charge === "object" && charge !== null ? (charge.amount_refunded ?? 0) : 0;
    if (dejaRendu > 0) {
      return {
        issue: "refusee_definitivement",
        detail: "le paiement est déjà remboursé chez Stripe : ne pas relancer, la notification signée soldera la dette si la somme est la bonne",
      };
    }

    const reponse = await appeler(cle, "/refunds", {
      // La même clé à chaque tentative : Stripe y reconnaît un rejeu et
      // rend le remboursement déjà créé, au lieu d'en créer un second.
      idempotence: demande.cle,
      corps: formulaire({
        payment_intent: intention,
        amount: versSousUnite(demande.montant, demande.devise),
        // Notre référence voyage aussi ici : elle revient dans la
        // notification signée, qui doit savoir quoi confirmer.
        "metadata[reference]": demande.reference,
      }),
    });

    if (!reponse) return { issue: "temporaire", detail: "remboursement injoignable" };
    if (reponse.statut === 429) return { issue: "temporaire", detail: "cadence limitée" };
    if (reponse.statut >= 500) return { issue: "temporaire", detail: `réponse ${reponse.statut}` };
    if (reponse.statut >= 400) {
      const erreur = schemaErreur.safeParse(reponse.charge);
      const type = erreur.success ? (erreur.data.error?.type ?? "") : "";
      return REFUS_DEFINITIF.has(type)
        ? { issue: "refusee_definitivement", detail: type }
        : { issue: "temporaire", detail: type === "" ? `réponse ${reponse.statut}` : type };
    }

    const lu = schemaRemboursement.safeParse(reponse.charge);
    if (!lu.success) {
      return { issue: "reponse_illisible", detail: "remboursement illisible au schéma" };
    }
    const etat = ETAT_DU_REMBOURSEMENT[(lu.data.status ?? "").toLowerCase()];
    if (etat === undefined) {
      return { issue: "reponse_illisible", detail: "état de remboursement non reconnu" };
    }
    if (etat === "refusee") {
      return { issue: "refusee_definitivement", detail: `état ${lu.data.status}` };
    }

    /*
      Accepté, et rien de plus. `succeeded` arrive ici comme `pending` :
      Stripe dit que le remboursement est passé de son côté, nous
      attendons quand même sa notification signée pour l'écrire. C'est
      INV-7, et c'est aussi la seule lecture qui reste vraie quand il
      annule un remboursement `succeeded` — cela arrive.
    */
    return {
      issue: "acceptee",
      accepteLe: new Date(),
      providerRefundId: `stripe:${lu.data.id}`,
    };
  },
});
