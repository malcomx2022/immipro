import { createHmac, timingSafeEqual } from "node:crypto";
import { CLES } from "./secrets";

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

/**
 * Ce qui distingue un fournisseur d'un autre : le nom de l'en-tête, celui
 * du champ, et où se lit le secret. Décrit ici plutôt que recopié dans
 * chaque appel, parce que l'état de service a besoin de fabriquer un
 * en-tête valide pour éprouver la vérification — et qu'une sonde qui
 * recopierait ces trois valeurs éprouverait sa propre copie.
 */
export interface Fournisseur {
  cle: string;
  entete: string;
  champSignature: string;
  /**
   * Le secret, lu à l'appel. L'environnement est un paramètre pour que la
   * sonde de l'état de service puisse éprouver exactement ce chemin-ci sur
   * l'environnement qu'elle examine — et non un second chemin écrit pour
   * elle, qui ne prouverait que lui-même.
   */
  secret: (environnement?: Readonly<Record<string, string | undefined>>) => string | undefined;
}

export const FEDAPAY: Fournisseur = {
  cle: "fedapay",
  entete: "x-fedapay-signature",
  champSignature: "s",
  secret: (environnement = process.env) => environnement[CLES.FEDAPAY.webhook],
};

export const STRIPE: Fournisseur = {
  cle: "stripe",
  entete: "stripe-signature",
  champSignature: "v1",
  secret: (environnement = process.env) => environnement[CLES.STRIPE.webhook],
};

export const FOURNISSEURS: readonly Fournisseur[] = [FEDAPAY, STRIPE];

export const verifierPour = (
  fournisseur: Fournisseur,
  requete: Request,
  corpsBrut: string,
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): boolean =>
  signatureValide({
    entete: requete.headers.get(fournisseur.entete),
    corpsBrut,
    secret: fournisseur.secret(environnement),
    champSignature: fournisseur.champSignature,
  });

export const signatureFedaPay = (requete: Request, corpsBrut: string): boolean =>
  verifierPour(FEDAPAY, requete, corpsBrut);

export const signatureStripe = (requete: Request, corpsBrut: string): boolean =>
  verifierPour(STRIPE, requete, corpsBrut);

/**
 * Fabrique l'en-tête qu'un fournisseur enverrait pour ce corps-là. Sert à
 * la sonde de l'état de service, et à rien d'autre : c'est un calcul
 * local, sans appel réseau et sans écriture.
 */
export const enteteSignee = (
  fournisseur: Fournisseur,
  corpsBrut: string,
  secret: string,
  horodatage: number,
): string =>
  `t=${horodatage},${fournisseur.champSignature}=${createHmac("sha256", secret)
    .update(`${horodatage}.${corpsBrut}`, "utf8")
    .digest("hex")}`;
