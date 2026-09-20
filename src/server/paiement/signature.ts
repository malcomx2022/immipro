import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Vérification de signature des webhooks — INV-7, RG-05.3.
 *
 * « Les routes de webhook sont exclues du rate limiting mais soumises à
 * vérification de signature. » La dispense de comptage repose entièrement
 * sur cette fonction : si elle est permissive, la route est une porte
 * ouverte que rien ne ralentit.
 *
 * Trois défauts classiques sont traités ici plutôt que dans chaque route :
 *
 * 1. **Comparaison à temps constant.** Un `===` sur une signature fuit sa
 *    valeur octet par octet à qui mesure le temps de réponse.
 * 2. **Horodatage vérifié.** Sans fenêtre de tolérance, une notification
 *    authentique capturée aujourd'hui se rejoue dans six mois avec sa
 *    signature valide. L'idempotence par `PaymentEvent.providerEventId`
 *    empêche le double crédit ; elle n'empêche pas de ressusciter un
 *    paiement expiré.
 * 3. **Signature calculée sur les octets reçus.** Le corps est passé en
 *    texte brut : reparsé puis re-sérialisé, il changerait d'espaces et de
 *    l'ordre de ses clés, et aucune signature ne correspondrait plus.
 */

/** Au-delà, la notification est tenue pour un rejeu. */
export const TOLERANCE_SECONDES = 300;

const egalesEnTempsConstant = (a: string, b: string): boolean => {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
};

export interface EnteteSignee {
  horodatage: number;
  signatures: string[];
}

/**
 * Lit un en-tête de la forme `t=1758240000,s=abc…` — celle de FedaPay comme
 * celle de Stripe, au nom du champ près. Plusieurs signatures peuvent
 * coexister pendant une rotation de secret ; il suffit qu'une corresponde.
 */
export function lireEntete(entete: string | null, champSignature: string): EnteteSignee | null {
  if (!entete) return null;
  let horodatage: number | null = null;
  const signatures: string[] = [];
  for (const partie of entete.split(",")) {
    const [cle, valeur] = partie.split("=", 2);
    if (!cle || valeur === undefined) continue;
    if (cle.trim() === "t") horodatage = Number(valeur);
    else if (cle.trim() === champSignature) signatures.push(valeur.trim());
  }
  if (horodatage === null || !Number.isFinite(horodatage) || signatures.length === 0) return null;
  return { horodatage, signatures };
}

export interface Verification {
  entete: string | null;
  corpsBrut: string;
  secret: string | undefined;
  champSignature: string;
  maintenant?: number;
}

export function signatureValide({
  entete,
  corpsBrut,
  secret,
  champSignature,
  maintenant = Date.now(),
}: Verification): boolean {
  // Un secret absent ne vaut pas un secret vide : sans lui, la signature
  // n'est pas « invalide », elle n'est pas vérifiable. Refuser est la seule
  // réponse sûre, et le journal du serveur dit pourquoi.
  if (!secret) {
    console.error("[webhook] secret de signature absent de la configuration");
    return false;
  }
  const lu = lireEntete(entete, champSignature);
  if (!lu) return false;

  const ecart = Math.abs(maintenant / 1000 - lu.horodatage);
  if (ecart > TOLERANCE_SECONDES) return false;

  const attendue = createHmac("sha256", secret)
    .update(`${lu.horodatage}.${corpsBrut}`, "utf8")
    .digest("hex");

  return lu.signatures.some((s) => egalesEnTempsConstant(s, attendue));
}

export const signatureFedaPay = (requete: Request, corpsBrut: string): boolean =>
  signatureValide({
    entete: requete.headers.get("x-fedapay-signature"),
    corpsBrut,
    secret: process.env.FEDAPAY_WEBHOOK_SECRET,
    champSignature: "s",
  });

export const signatureStripe = (requete: Request, corpsBrut: string): boolean =>
  signatureValide({
    entete: requete.headers.get("stripe-signature"),
    corpsBrut,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
    champSignature: "v1",
  });
