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
