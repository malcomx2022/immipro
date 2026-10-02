/**
 * Le compte de service Google, pour appeler Vertex AI — S.99.
 *
 * ── Pourquoi une clé ne suffit pas ──────────────────────────────────
 *
 * Vertex AI sert Gemini par l'interface compatible OpenAI, mais ne prend
 * pas de clé d'API fixe : il attend un **jeton OAuth** d'une heure,
 * obtenu en signant une affirmation avec la clé privée d'un compte de
 * service. C'est ce qui distingue Vertex de l'API Gemini « Developer »,
 * que le banc a écartée pour les pièces (55 jours de conservation, sans
 * lieu garanti) : Vertex offre la région UE et la conservation zéro, et
 * son prix d'entrée est ce jeton.
 *
 * ── Ce que ce module fait, et ce qu'il laisse au serveur ────────────
 *
 * Il **lit** le compte de service tel que Google le livre (le fichier
 * JSON, collé tel quel ou encodé en base64 dans une variable), le
 * **refuse** avec un motif qui se corrige, et **compose** l'affirmation à
 * signer. La signature et l'échange contre un jeton sont des opérations
 * de clé et de réseau : elles vivent dans `server/ia/jeton-google.ts`.
 *
 * L'adresse d'échange est celle que le fichier porte, mais seulement si
 * elle est chez Google : une affirmation signée vaut accès au projet
 * pendant une heure, et ne part pas vers une adresse qu'un fichier
 * modifié aurait choisie.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export interface CompteDeService {
  /** `client_email` : l'émetteur de l'affirmation. */
  email: string;
  /** `private_key`, au format PEM. */
  clePrivee: string;
  /** `token_uri` : où l'affirmation s'échange contre un jeton. */
  adresseJeton: string;
}

export type DefautDuCompte =
  | "absent"
  | "illisible"
  | "pas_un_compte_de_service"
  | "champ_manquant"
  | "adresse_hors_google";

export const VARIABLE_COMPTE_DE_SERVICE = "AI_OPENAI_COMPTE_DE_SERVICE";

export const MOTIF_DU_COMPTE: Record<DefautDuCompte, string> = {
  absent: `renseigner ${VARIABLE_COMPTE_DE_SERVICE} avec le fichier JSON du compte de service Google, tel quel ou encodé en base64`,
  illisible: `${VARIABLE_COMPTE_DE_SERVICE} n'est ni du JSON ni du base64 de JSON : recopier le fichier de clé du compte de service sans le modifier`,
  pas_un_compte_de_service: `${VARIABLE_COMPTE_DE_SERVICE} n'est pas une clé de compte de service (type « service_account » attendu) : créer une clé JSON dans IAM, Comptes de service`,
  champ_manquant: `${VARIABLE_COMPTE_DE_SERVICE} n'a pas client_email, private_key et token_uri : recopier le fichier de clé en entier`,
  adresse_hors_google: `le token_uri de ${VARIABLE_COMPTE_DE_SERVICE} n'est pas une adresse https de Google : la clé a été modifiée, en télécharger une nouvelle`,
};

/** La portée qui ouvre Vertex AI. */
export const PORTEE_VERTEX = "https://www.googleapis.com/auth/cloud-platform";

/** Durée demandée pour un jeton : l'heure que Google accorde au plus. */
export const DUREE_DU_JETON_SECONDES = 3600;

/**
 * Un jeton se renouvelle avant d'expirer, pas après : un appel de lecture
 * dure jusqu'à deux minutes, et un jeton qui expire pendant l'appel le
 * ferait échouer en `non_configure`, comme une clé refusée.
 */
export const MARGE_DE_RENOUVELLEMENT_SECONDES = 300;

const estObjet = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function analyser(texte: string): unknown {
  try {
    return JSON.parse(texte);
  } catch {
    // Pas du JSON : peut-être du base64, la forme commode dans un fichier d'environnement.
  }
  if (!/^[A-Za-z0-9+/=_-]+$/u.test(texte)) return undefined;
  try {
    const binaire = atob(texte.replace(/-/gu, "+").replace(/_/gu, "/"));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(binaire, (c) => c.charCodeAt(0))));
  } catch {
    return undefined;
  }
}

/** L'adresse d'échange admise : https, chez Google. */
export function adresseDeJetonAdmise(adresse: string): boolean {
  try {
    const url = new URL(adresse);
    return url.protocol === "https:" && (url.hostname === "googleapis.com" || url.hostname.endsWith(".googleapis.com"));
  } catch {
    return false;
  }
}

export function lireCompteDeService(
  brut: string | undefined,
): { ok: true; compte: CompteDeService } | { ok: false; defaut: DefautDuCompte } {
  const texte = (brut ?? "").trim();
  if (texte === "") return { ok: false, defaut: "absent" };

  const lu = analyser(texte);
  if (!estObjet(lu)) return { ok: false, defaut: "illisible" };
  if (lu.type !== "service_account") return { ok: false, defaut: "pas_un_compte_de_service" };

  const { client_email: email, private_key: clePrivee, token_uri: adresseJeton } = lu;
  if (
    typeof email !== "string" || email === "" ||
    typeof clePrivee !== "string" || !clePrivee.includes("PRIVATE KEY") ||
    typeof adresseJeton !== "string" || adresseJeton === ""
  ) {
    return { ok: false, defaut: "champ_manquant" };
  }
  if (!adresseDeJetonAdmise(adresseJeton)) return { ok: false, defaut: "adresse_hors_google" };

  return { ok: true, compte: { email, clePrivee, adresseJeton } };
}

/**
 * L'en-tête et la charge de l'affirmation à signer (RFC 7523), à
 * l'instant donné. Rien n'est lu de l'horloge ici : le serveur passe
 * l'instant, et le test aussi.
 */
export function affirmation(
  compte: CompteDeService,
  maintenantSecondes: number,
): { entete: Record<string, string>; charge: Record<string, string | number> } {
  return {
    entete: { alg: "RS256", typ: "JWT" },
    charge: {
      iss: compte.email,
      scope: PORTEE_VERTEX,
      aud: compte.adresseJeton,
      iat: maintenantSecondes,
      exp: maintenantSecondes + DUREE_DU_JETON_SECONDES,
    },
  };
}

/** Le jeton en main sert-il encore pour un appel qui commence maintenant ? */
export const jetonEncoreValable = (expireASecondes: number, maintenantSecondes: number): boolean =>
  expireASecondes - maintenantSecondes > MARGE_DE_RENOUVELLEMENT_SECONDES;
