import {
  randomBytes,
  randomInt,
  scrypt,
  timingSafeEqual,
  createHash,
  type ScryptOptions,
} from "node:crypto";

/**
 * Empreintes et secrets à usage unique.
 *
 * `scrypt` vient de Node : pas de dépendance ajoutée pour une brique dont la
 * moindre faiblesse se paie en fuite de mots de passe. Les paramètres sont
 * ceux recommandés par l'OWASP pour scrypt — N = 2^16, r = 8, p = 1 — soit
 * environ 64 Mio de mémoire par calcul. C'est volontairement coûteux : c'est
 * tout l'intérêt, et cela borne aussi le nombre de connexions simultanées
 * qu'une instance encaisse, ce que la limitation de débit prend en charge.
 *
 * L'empreinte stockée porte ses propres paramètres. Le jour où N augmente,
 * les empreintes existantes restent vérifiables et se réécrivent à la
 * prochaine connexion réussie, sans migration ni réinitialisation de masse.
 */
/**
 * `promisify` retiendrait la surcharge à trois arguments et perdrait les
 * options : sans elles, `scrypt` retomberait sur ses paramètres par défaut,
 * mille fois moins coûteux que ceux choisis ici. Le calcul serait rapide, le
 * typage content, et les empreintes faibles.
 */
const scryptAsync = (
  secret: string,
  sel: Buffer,
  longueur: number,
  options: ScryptOptions,
): Promise<Buffer> =>
  new Promise((resoudre, rejeter) => {
    scrypt(secret, sel, longueur, options, (erreur, cle) =>
      erreur ? rejeter(erreur) : resoudre(cle),
    );
  });

const N = 2 ** 16;
const R = 8;
const P = 1;
const LONGUEUR_CLE = 32;
const LONGUEUR_SEL = 16;

export async function empreinte(secret: string): Promise<string> {
  const sel = randomBytes(LONGUEUR_SEL);
  const cle = await scryptAsync(secret.normalize("NFKC"), sel, LONGUEUR_CLE, {
    N,
    r: R,
    p: P,
    maxmem: 128 * N * R * 2,
  });
  return `scrypt$${N}$${R}$${P}$${sel.toString("base64url")}$${cle.toString("base64url")}`;
}

/**
 * Vérification à temps constant. Une empreinte illisible rend `false` et
 * n'interrompt rien : un enregistrement abîmé refuse la connexion, il
 * n'ouvre pas une trace d'erreur exploitable depuis l'extérieur.
 */
export async function correspond(secret: string, stockee: string): Promise<boolean> {
  const parts = stockee.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, sel, attendue] = parts;
  try {
    const cle = await scryptAsync(
      secret.normalize("NFKC"),
      Buffer.from(sel!, "base64url"),
      LONGUEUR_CLE,
      { N: Number(n), r: Number(r), p: Number(p), maxmem: 128 * Number(n) * Number(r) * 2 },
    );
    const reference = Buffer.from(attendue!, "base64url");
    return cle.length === reference.length && timingSafeEqual(cle, reference);
  } catch {
    return false;
  }
}

/** Vrai quand l'empreinte a été produite avec des paramètres dépassés. */
export function aRecalculer(stockee: string): boolean {
  const [algo, n] = stockee.split("$");
  return algo !== "scrypt" || Number(n) < N;
}

/**
 * Code de vérification à six chiffres (A-03).
 *
 * `randomInt` et non `Math.random` : le code ouvre une adresse email, il ne
 * doit pas se prédire depuis un code précédent. Le zéro de tête est conservé
 * — « 042 137 » est un code valide, et le tronquer réduirait l'espace de
 * recherche sans que personne s'en aperçoive.
 */
export const codeANChiffres = (n: number): string =>
  String(randomInt(0, 10 ** n)).padStart(n, "0");

/** Jeton d'URL, pour un lien à usage unique. */
export const jeton = (octets = 32): string => randomBytes(octets).toString("base64url");

/**
 * Suite aléatoire faite pour être dictée à voix haute.
 *
 * `base64url` convient à une URL et pas à un téléphone : son alphabet
 * contient `-` et `_`, qui s'épellent mal et se confondent, et il mêle
 * `0`/`O` et `1`/`I`/`l`. Une référence de paiement tirée ainsi donnait
 * `IMP-260920--AJX4Q`, avec deux tirets de suite, à l'usage même pour
 * lequel elle est dite lisible — la réclamation au téléphone.
 *
 * Trente et un caractères, tirés sans biais : `randomInt` rejette le
 * dernier intervalle incomplet, là où un modulo sur un octet favoriserait
 * les premières lettres de l'alphabet.
 */
const ALPHABET_DICTABLE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const suiteDictable = (longueur: number): string =>
  Array.from(
    { length: longueur },
    () => ALPHABET_DICTABLE[randomInt(0, ALPHABET_DICTABLE.length)]!,
  ).join("");

/**
 * Empreinte d'un jeton ou d'un code, pour le stockage.
 *
 * SHA-256 sans sel, contrairement au mot de passe, et c'est délibéré : le
 * secret est tiré au hasard et vit dix minutes, il n'y a pas de dictionnaire
 * à lui opposer. Un scrypt par vérification de code coûterait 64 Mio pour
 * rien. Ce qui compte ici est qu'une fuite de la base ne rende pas les
 * codes en attente utilisables.
 */
export const empreinteRapide = (valeur: string): string =>
  createHash("sha256").update(valeur).digest("base64url");

/**
 * Clé d'objet de stockage, non devinable (WF-06, étape 3).
 *
 * Le chemin porte le dossier pour que la purge et l'inventaire se fassent
 * par préfixe, et un suffixe aléatoire pour qu'on ne devine pas la clé d'un
 * autre candidat en incrémentant la sienne.
 */
export const cleObjet = (applicationId: string, documentCode: string): string =>
  `dossiers/${applicationId}/${documentCode}/${Date.now()}-${jeton(12)}`;
