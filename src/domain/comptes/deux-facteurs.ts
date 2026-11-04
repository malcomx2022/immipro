/**
 * Double authentification TOTP — S.214, WF-02.
 *
 * Le mot de passe seul se perd : réutilisé ailleurs, deviné, lu par-dessus
 * l'épaule dans un cybercafé. Le second facteur est un code à six chiffres
 * que produit une application d'authentification (RFC 6238) depuis un
 * secret partagé une fois, à l'enrôlement, par un code QR.
 *
 * Ce module décide ; il ne calcule aucune empreinte. Le HMAC est injecté
 * par le serveur (`server/securite/totp`) : le domaine reste pur, et ses
 * tests rejouent les vecteurs de la RFC avec la fonction de Node.
 *
 * ── Quatre décisions, chacune pour une attaque ───────────────────────
 *
 * 1. **Anti-rejeu.** Un code n'est accepté que pour un pas de temps
 *    strictement postérieur au dernier accepté. Un code lu sur un écran,
 *    ou intercepté, ne rouvre rien dans ses trente secondes de validité.
 *
 * 2. **Fenêtre étroite et dérive retenue.** Un pas de part et d'autre de
 *    l'horloge du serveur, pas davantage : chaque pas admis ajoute un code
 *    qu'un attaquant peut deviner. Mais un téléphone dont l'horloge avance
 *    d'une minute serait refusé à chaque fois. Le décalage du dernier code
 *    accepté est donc retenu (RFC 6238 §6), borné à un pas, et la fenêtre
 *    se centre sur lui. L'écart total à l'horloge du serveur ne dépasse
 *    jamais deux pas.
 *
 * 3. **Blocage avec hystérésis.** Cinq codes faux bloquent le second
 *    facteur quinze minutes, indépendamment du blocage du mot de passe —
 *    qui connaît le mot de passe ne remet pas ce compteur à zéro en le
 *    réinitialisant. À la levée, le compteur ne repart pas de zéro mais de
 *    trois : deux nouveaux essais faux rebloquent. Seul un code juste
 *    l'efface. Sans cela, un attaquant aurait cinq essais par quart
 *    d'heure, indéfiniment ; avec, deux.
 *
 * 4. **Codes de secours.** Dix codes à usage unique, montrés une fois,
 *    gardés en empreinte. Ils servent quand le téléphone est perdu ; un
 *    code utilisé ne sert plus.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/** Durée d'un pas de temps, en secondes (RFC 6238, valeur par défaut). */
export const PERIODE_SECONDES = 30;
export const CHIFFRES_TOTP = 6;
/** Octets du secret partagé : 160 bits, la taille de la sortie de SHA-1 (RFC 4226 §4). */
export const OCTETS_SECRET = 20;
/** Pas admis de part et d'autre du centre de la fenêtre. */
export const FENETRE_PAS = 1;
/** Borne du décalage d'horloge retenu, en pas. */
export const DERIVE_MAX = 1;

export const ECHECS_AVANT_BLOCAGE_2FA = 5;
export const BLOCAGE_2FA_MINUTES = 15;
/** Niveau où redescend le compteur à la levée du blocage — l'hystérésis. */
export const ECHECS_APRES_LEVEE = 3;

/** Le défi de connexion : mot de passe juste, code attendu. */
export const VALIDITE_DEFI_MINUTES = 5;
export const ESSAIS_PAR_DEFI = 5;

export const NOMBRE_CODES_DE_SECOURS = 10;
/** Huit caractères dictables, présentés « ABCD-EFGH ». */
export const LONGUEUR_CODE_DE_SECOURS = 8;
/** L'alphabet de `suiteDictable` : ni 0/O, ni 1/I/L. */
export const ALPHABET_DE_SECOURS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const EMETTEUR = "ImmiPro";

/* ------------------------------------------------------------------ *
 * Base32 (RFC 4648), l'alphabet que lisent les applications.
 * ------------------------------------------------------------------ */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function versBase32(octets: Uint8Array): string {
  let bits = 0;
  let valeur = 0;
  let sortie = "";
  for (const octet of octets) {
    valeur = (valeur << 8) | octet;
    bits += 8;
    while (bits >= 5) {
      sortie += BASE32[(valeur >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) sortie += BASE32[(valeur << (5 - bits)) & 31];
  return sortie;
}

/** Rend `null` pour un texte qui n'est pas du base32 : un secret abîmé ne se devine pas. */
export function depuisBase32(texte: string): Uint8Array | null {
  const net = texte.replace(/[\s=]/gu, "").toUpperCase();
  if (net.length === 0) return null;
  let bits = 0;
  let valeur = 0;
  const octets: number[] = [];
  for (const car of net) {
    const i = BASE32.indexOf(car);
    if (i < 0) return null;
    valeur = (valeur << 5) | i;
    bits += 5;
    if (bits >= 8) {
      octets.push((valeur >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(octets);
}

/** Le secret lisible à la main, par groupes de quatre : « JBSW Y3DP … ». */
export const secretEnGroupes = (base32: string): string => base32.replace(/(.{4})(?=.)/gu, "$1 ");

/* ------------------------------------------------------------------ *
 * Calcul du code (RFC 4226 §5.3, RFC 6238 §4).
 * ------------------------------------------------------------------ */

/** Le HMAC-SHA1, fourni par l'appelant. */
export type Hmac = (cle: Uint8Array, message: Uint8Array) => Uint8Array;

export const pasDeTemps = (maintenantMs: number): number =>
  Math.floor(maintenantMs / 1000 / PERIODE_SECONDES);

/** Le compteur en huit octets, gros-boutiste. */
export function compteurEnOctets(pas: number): Uint8Array {
  const octets = new Uint8Array(8);
  let reste = BigInt(pas);
  for (let i = 7; i >= 0; i -= 1) {
    octets[i] = Number(reste & 0xffn);
    reste >>= 8n;
  }
  return octets;
}

/** Troncature dynamique : quatre octets choisis par le dernier quartet. */
export function codeDepuisHmac(empreinte: Uint8Array, chiffres = CHIFFRES_TOTP): string {
  const decalage = empreinte[empreinte.length - 1]! & 0x0f;
  const binaire =
    ((empreinte[decalage]! & 0x7f) << 24) |
    (empreinte[decalage + 1]! << 16) |
    (empreinte[decalage + 2]! << 8) |
    empreinte[decalage + 3]!;
  return String(binaire % 10 ** chiffres).padStart(chiffres, "0");
}

export const codeAuPas = (secret: Uint8Array, pas: number, hmac: Hmac, chiffres = CHIFFRES_TOTP): string =>
  codeDepuisHmac(hmac(secret, compteurEnOctets(pas)), chiffres);

/** Comparaison sans court-circuit : le temps ne dit pas combien de chiffres sont justes. */
export function egaux(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let ecart = 0;
  for (let i = 0; i < a.length; i += 1) ecart |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return ecart === 0;
}

const borner = (n: number, max: number): number => Math.max(-max, Math.min(max, n));

/**
 * Les décalages essayés, dans l'ordre : le centre (la dérive retenue),
 * puis ses voisins. Jamais au-delà de `DERIVE_MAX + FENETRE_PAS`.
 */
export function decalagesAEssayer(derive: number): number[] {
  const centre = borner(Math.trunc(derive), DERIVE_MAX);
  const liste = [centre];
  for (let d = 1; d <= FENETRE_PAS; d += 1) liste.push(centre - d, centre + d);
  return liste;
}

export type VerdictDuCode =
  | { accepte: true; pas: number; derive: number }
  | { accepte: false; raison: "format" | "faux" | "rejeu" };

export const normaliserCodeTotp = (saisie: string): string => saisie.replace(/\D/gu, "");

/**
 * Le code est-il juste, et neuf ?
 *
 * Tous les décalages de la fenêtre sont calculés, même après une
 * correspondance : le temps de réponse ne dit pas lequel a servi. Un code
 * juste pour un pas déjà consommé (ou antérieur) est un rejeu.
 */
export function verifierLeCode(entree: {
  saisie: string;
  secret: Uint8Array;
  maintenantMs: number;
  dernierPas: number | null;
  derive: number;
  hmac: Hmac;
}): VerdictDuCode {
  const code = normaliserCodeTotp(entree.saisie);
  if (code.length !== CHIFFRES_TOTP) return { accepte: false, raison: "format" };
  const courant = pasDeTemps(entree.maintenantMs);
  let trouve: number | null = null;
  for (const decalage of decalagesAEssayer(entree.derive)) {
    const juste = egaux(codeAuPas(entree.secret, courant + decalage, entree.hmac), code);
    if (juste && trouve === null) trouve = decalage;
  }
  if (trouve === null) return { accepte: false, raison: "faux" };
  const pas = courant + trouve;
  if (entree.dernierPas !== null && pas <= entree.dernierPas) return { accepte: false, raison: "rejeu" };
  return { accepte: true, pas, derive: borner(trouve, DERIVE_MAX) };
}

/* ------------------------------------------------------------------ *
 * Blocage du second facteur, avec hystérésis.
 * ------------------------------------------------------------------ */

export interface EtatDuBlocage {
  bloque: boolean;
  /** Le compteur tel qu'il compte maintenant : redescendu à la levée. */
  echecs: number;
  essaisRestants: number;
  reprendDansMinutes: number;
}

export function etatDuBlocage(echecs: number, bloqueJusqua: Date | null, maintenant: Date): EtatDuBlocage {
  if (bloqueJusqua && bloqueJusqua.getTime() > maintenant.getTime()) {
    return {
      bloque: true,
      echecs,
      essaisRestants: 0,
      reprendDansMinutes: Math.max(1, Math.ceil((bloqueJusqua.getTime() - maintenant.getTime()) / 60_000)),
    };
  }
  // Un blocage levé ne rend pas la page blanche : le compteur redescend au
  // seuil intermédiaire, pas à zéro.
  const effectifs = bloqueJusqua ? Math.min(echecs, ECHECS_APRES_LEVEE) : echecs;
  return {
    bloque: false,
    echecs: effectifs,
    essaisRestants: Math.max(0, ECHECS_AVANT_BLOCAGE_2FA - effectifs),
    reprendDansMinutes: 0,
  };
}

/** L'état après un code faux, à partir de l'état effectif. */
export function apresUnEchec(
  etat: EtatDuBlocage,
  maintenant: Date,
): { echecs: number; bloqueJusqua: Date | null } {
  const echecs = etat.echecs + 1;
  return {
    echecs,
    bloqueJusqua:
      echecs >= ECHECS_AVANT_BLOCAGE_2FA ? new Date(maintenant.getTime() + BLOCAGE_2FA_MINUTES * 60_000) : null,
  };
}

/** Le message d'un code refusé : ce qui s'est passé, et ce qui reste. */
export function libelleDuRefus(
  raison: "format" | "faux" | "rejeu" | "secours",
  etat: EtatDuBlocage,
): string {
  if (etat.bloque) {
    return etat.reprendDansMinutes > 1
      ? `Trop de codes faux. La double authentification se rouvre dans ${etat.reprendDansMinutes} minutes ; un code de secours ne passe pas non plus d'ici là.`
      : "Trop de codes faux. La double authentification se rouvre dans une minute.";
  }
  const reste =
    etat.essaisRestants > 1
      ? `Il te reste ${etat.essaisRestants} essais avant un blocage de ${BLOCAGE_2FA_MINUTES} minutes.`
      : `Dernier essai avant un blocage de ${BLOCAGE_2FA_MINUTES} minutes.`;
  switch (raison) {
    case "format":
      return `Le code compte ${CHIFFRES_TOTP} chiffres, lus dans ton application d'authentification. ${reste}`;
    case "rejeu":
      return `Ce code vient déjà de servir. Attends le suivant dans ton application (il change toutes les ${PERIODE_SECONDES} secondes). ${reste}`;
    case "secours":
      return `Ce code de secours n'est pas valable ou a déjà servi. Chacun ne sert qu'une fois. ${reste}`;
    default:
      return `Ce code ne correspond pas. Vérifie que l'heure de ton téléphone est réglée automatiquement, puis saisis le code affiché. ${reste}`;
  }
}

/* ------------------------------------------------------------------ *
 * Codes de secours.
 * ------------------------------------------------------------------ */

/** Retire blancs et tirets, met en capitales. `null` si ce n'est pas un code de secours. */
export function normaliserCodeDeSecours(saisie: string): string | null {
  const net = saisie.replace(/[\s-]/gu, "").toUpperCase();
  if (net.length !== LONGUEUR_CODE_DE_SECOURS) return null;
  for (const car of net) if (!ALPHABET_DE_SECOURS.includes(car)) return null;
  return net;
}

export const formaterCodeDeSecours = (code: string): string =>
  `${code.slice(0, LONGUEUR_CODE_DE_SECOURS / 2)}-${code.slice(LONGUEUR_CODE_DE_SECOURS / 2)}`;

/** La saisie de la connexion : six chiffres, ou un code de secours. */
export type SaisieDuSecondFacteur =
  | { genre: "totp"; code: string }
  | { genre: "secours"; code: string }
  | { genre: "illisible" };

export function lireLaSaisie(saisie: string): SaisieDuSecondFacteur {
  const chiffres = normaliserCodeTotp(saisie);
  if (/^[\d\s-]+$/u.test(saisie.trim()) && chiffres.length === CHIFFRES_TOTP) {
    return { genre: "totp", code: chiffres };
  }
  const secours = normaliserCodeDeSecours(saisie);
  if (secours) return { genre: "secours", code: secours };
  return { genre: "illisible" };
}

/* ------------------------------------------------------------------ *
 * L'adresse que lit l'application d'authentification.
 * ------------------------------------------------------------------ */

/**
 * `otpauth://totp/ImmiPro:adresse?secret=…&issuer=ImmiPro…` — le format de
 * Google Authenticator, que lisent aussi Aegis, FreeOTP et les autres.
 * Les paramètres par défaut sont écrits : une application qui en
 * supposerait d'autres afficherait des codes faux sans rien dire.
 */
export function adresseOtpauth(compte: string, secretBase32: string): string {
  const libelle = `${encodeURIComponent(EMETTEUR)}:${encodeURIComponent(compte)}`;
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer: EMETTEUR,
    algorithm: "SHA1",
    digits: String(CHIFFRES_TOTP),
    period: String(PERIODE_SECONDES),
  });
  return `otpauth://totp/${libelle}?${params.toString()}`;
}

/** Le décompte des codes de secours, pour l'écran « Sécurité ». */
export function libelleCodesRestants(restants: number): string {
  if (restants === 0) {
    return "Aucun code de secours restant : génère-en de nouveaux avant de perdre ton téléphone.";
  }
  if (restants <= 2) {
    return `${restants === 1 ? "Un code de secours restant" : "Deux codes de secours restants"} : pense à en générer de nouveaux.`;
  }
  return `${restants} codes de secours restants sur ${NOMBRE_CODES_DE_SECOURS}.`;
}

/** Le titre du refus qui ramène au mot de passe : défi échu, épuisé ou servi. */
export const TITRE_CONNEXION_A_RECOMMENCER = "Connexion à recommencer";

/**
 * Le refus d'un compte interne sans second facteur — S.215. Il dit quoi
 * faire et où : l'activation ne demande que le mot de passe et le téléphone.
 */
export const SECOND_FACTEUR_REQUIS =
  "La double authentification est obligatoire pour le back-office. Active-la depuis « Sécurité du compte » (/compte/securite) : ton mot de passe et une application d'authentification sur ton téléphone suffisent.";

/** Le chemin où un compte interne sans second facteur est renvoyé. */
export const CHEMIN_ACTIVATION_EXIGEE = "/compte/securite?exige=1";

/** Pourquoi « Désactiver » n'est pas offert à un compte interne — S.215. */
export const DESACTIVATION_INTERDITE_INTERNE =
  "Ton rôle exige la double authentification : elle ne se désactive pas. Pour changer de téléphone, demande à un super-administrateur de la réinitialiser depuis Utilisateurs ; tu la réactiveras avec le nouveau téléphone à la connexion suivante.";
