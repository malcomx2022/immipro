import { createHmac, randomBytes, randomInt } from "node:crypto";
import {
  ALPHABET_DE_SECOURS,
  LONGUEUR_CODE_DE_SECOURS,
  NOMBRE_CODES_DE_SECOURS,
  OCTETS_SECRET,
  versBase32,
  type Hmac,
} from "@/domain/comptes/deux-facteurs";

/**
 * Les briques cryptographiques du second facteur — S.214. La décision vit
 * dans `domain/comptes/deux-facteurs` ; ici, seulement ce qui demande Node.
 */

export const hmacSha1: Hmac = (cle, message) =>
  new Uint8Array(createHmac("sha1", cle).update(message).digest());

/** Un secret neuf de 160 bits, en base32. */
export const secretNeuf = (): string => versBase32(new Uint8Array(randomBytes(OCTETS_SECRET)));

/** Dix codes de secours, tirés sans biais dans l'alphabet dictable. */
export const codesDeSecoursNeufs = (): string[] => {
  const codes = new Set<string>();
  while (codes.size < NOMBRE_CODES_DE_SECOURS) {
    codes.add(
      Array.from(
        { length: LONGUEUR_CODE_DE_SECOURS },
        () => ALPHABET_DE_SECOURS[randomInt(0, ALPHABET_DE_SECOURS.length)]!,
      ).join(""),
    );
  }
  return [...codes];
};
