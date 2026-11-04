import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

/**
 * Chiffrement au repos du second facteur — S.214.
 *
 * Le secret TOTP n'est pas une empreinte : le serveur doit le relire pour
 * calculer le code attendu. Il est donc **chiffré**, AES-256-GCM, sous une
 * clé qui n'est pas dans la base : `DEUX_FACTEURS_CLE`, 32 octets en
 * base64. Une copie de la base seule ne donne aucun secret.
 *
 * Les données associées portent l'identifiant du compte : une ligne
 * recopiée d'un compte sur un autre ne se déchiffre pas, l'étiquette GCM
 * la refuse.
 *
 * Les codes de secours, eux, n'ont pas à être relus : ils sont gardés en
 * HMAC-SHA256, sous une sous-clé dérivée (HKDF) de la même clé. Huit
 * caractères dictables, c'est une quarantaine de bits : un SHA-256 nu se
 * retrouverait par essais en quelques heures sur une copie de la base ;
 * sans la clé, il n'y a rien à essayer.
 *
 * Format : `v1.<iv>.<étiquette>.<données>`, base64url. Le préfixe de
 * version laisse changer d'algorithme ou de clé sans migration.
 */

export const VARIABLE_CLE = "DEUX_FACTEURS_CLE";
const VERSION = "v1";
const OCTETS_CLE = 32;
const OCTETS_IV = 12;

export class CleAbsente extends Error {
  constructor() {
    super(`${VARIABLE_CLE} absente ou invalide : 32 octets attendus, en base64.`);
  }
}

/** La clé maîtresse, ou `null` : absente, ou d'une autre taille que 32 octets. */
export function cleMaitresse(env: Readonly<Record<string, string | undefined>> = process.env): Buffer | null {
  const brute = env[VARIABLE_CLE]?.trim();
  if (!brute) return null;
  const cle = Buffer.from(brute.replace(/-/gu, "+").replace(/_/gu, "/"), "base64");
  return cle.length === OCTETS_CLE ? cle : null;
}

const exiger = (): Buffer => {
  const cle = cleMaitresse();
  if (!cle) throw new CleAbsente();
  return cle;
};

const sousCle = (cle: Buffer, usage: string): Buffer =>
  Buffer.from(hkdfSync("sha256", cle, Buffer.alloc(0), `immipro:${usage}`, OCTETS_CLE));

export function chiffrer(clair: string, lieA: string): string {
  const iv = randomBytes(OCTETS_IV);
  const chiffreur = createCipheriv("aes-256-gcm", sousCle(exiger(), "second-facteur"), iv);
  chiffreur.setAAD(Buffer.from(lieA, "utf8"));
  const donnees = Buffer.concat([chiffreur.update(clair, "utf8"), chiffreur.final()]);
  const etiquette = chiffreur.getAuthTag();
  return [VERSION, iv, etiquette, donnees].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

/** Rend `null` pour une enveloppe illisible, altérée ou liée à un autre compte. */
export function dechiffrer(enveloppe: string, lieA: string): string | null {
  const parts = enveloppe.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  const [, iv, etiquette, donnees] = parts as [string, string, string, string];
  try {
    const dechiffreur = createDecipheriv(
      "aes-256-gcm",
      sousCle(exiger(), "second-facteur"),
      Buffer.from(iv, "base64url"),
    );
    dechiffreur.setAAD(Buffer.from(lieA, "utf8"));
    dechiffreur.setAuthTag(Buffer.from(etiquette, "base64url"));
    return Buffer.concat([dechiffreur.update(Buffer.from(donnees, "base64url")), dechiffreur.final()]).toString(
      "utf8",
    );
  } catch (erreur) {
    if (erreur instanceof CleAbsente) throw erreur;
    return null;
  }
}

/** Empreinte d'un code de secours, liée au compte. */
export const empreinteDeSecours = (code: string, userId: string): string =>
  createHmac("sha256", sousCle(exiger(), "codes-de-secours")).update(`${userId}:${code}`).digest("base64url");
