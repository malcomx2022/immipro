import { createSign } from "node:crypto";
import type { CauseDAppel } from "@/domain/ia/appel";
import {
  affirmation,
  jetonEncoreValable,
  type CompteDeService,
} from "@/domain/ia/compte-de-service";

/**
 * Le jeton OAuth de Vertex AI, obtenu et renouvelé — S.99.
 *
 * L'affirmation est composée par le domaine
 * (`domain/ia/compte-de-service.ts`). Ce module la signe avec la clé
 * privée du compte de service, l'échange contre un jeton d'une heure, et
 * le garde en mémoire jusqu'à cinq minutes de son expiration. Aucune
 * bibliothèque Google : `node:crypto` et `fetch`, comme l'adaptateur
 * compatible lui-même.
 *
 * Rien de ce qui passe ici ne se journalise : ni la clé, ni l'affirmation,
 * ni le jeton. Les causes disent la forme de l'échec, jamais son contenu.
 */

/** Au-delà, l'échange est abandonné : l'appel qui l'attend a son propre délai. */
const DELAI_ECHANGE_MS = 15_000;

interface JetonEnMain {
  jeton: string;
  expireA: number;
}

const enMemoire = new Map<string, JetonEnMain>();

/** Pour les tests, et après un refus : le prochain appel redemande un jeton. */
export function oublierLeJetonGoogle(compte?: CompteDeService): void {
  if (compte) enMemoire.delete(compte.email);
  else enMemoire.clear();
}

const base64url = (donnees: string | Buffer): string =>
  Buffer.from(donnees).toString("base64").replace(/=+$/u, "").replace(/\+/gu, "-").replace(/\//gu, "_");

/** L'affirmation signée (JWT RS256), prête à échanger. */
export function affirmationSignee(compte: CompteDeService, maintenantSecondes: number): string {
  const { entete, charge } = affirmation(compte, maintenantSecondes);
  const corps = `${base64url(JSON.stringify(entete))}.${base64url(JSON.stringify(charge))}`;
  const signature = createSign("RSA-SHA256").update(corps).sign(compte.clePrivee);
  return `${corps}.${base64url(signature)}`;
}

export type JetonObtenu = { ok: true; jeton: string } | { ok: false; cause: CauseDAppel; detail: string };

/**
 * Un jeton valable pour un appel qui commence maintenant.
 *
 * L'échange échoue de trois façons, et chacune a sa cause : la clé
 * refusée (`non_configure` : un exploitant a un geste à faire), Google
 * injoignable ou trop lent (`injoignable`, `delai_depasse` : le job se
 * reprend), une réponse sans jeton (`reponse_illisible`).
 */
export async function jetonGoogle(
  compte: CompteDeService,
  maintenantMs: number = Date.now(),
): Promise<JetonObtenu> {
  const maintenant = Math.floor(maintenantMs / 1000);
  const enMain = enMemoire.get(compte.email);
  if (enMain && jetonEncoreValable(enMain.expireA, maintenant)) return { ok: true, jeton: enMain.jeton };

  let assertion: string;
  try {
    assertion = affirmationSignee(compte, maintenant);
  } catch {
    return {
      ok: false,
      cause: "non_configure",
      detail: "la clé privée du compte de service ne permet pas de signer : télécharger une nouvelle clé",
    };
  }

  let reponse: Response;
  try {
    reponse = await fetch(compte.adresseJeton, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
      signal: AbortSignal.timeout(DELAI_ECHANGE_MS),
    });
  } catch (erreur) {
    const nom = (erreur as { name?: unknown })?.name;
    return nom === "TimeoutError" || nom === "AbortError"
      ? { ok: false, cause: "delai_depasse", detail: "Google n'a pas délivré de jeton à temps" }
      : { ok: false, cause: "injoignable", detail: "le service de jetons de Google n'a pas répondu" };
  }

  if (!reponse.ok) {
    await reponse.body?.cancel().catch(() => undefined);
    if (reponse.status === 400 || reponse.status === 401 || reponse.status === 403) {
      return {
        ok: false,
        cause: "non_configure",
        detail: `Google refuse le compte de service (réponse ${reponse.status}) : vérifier que la clé est active et que le compte a le rôle Utilisateur Vertex AI`,
      };
    }
    return reponse.status === 429 || reponse.status === 503
      ? { ok: false, cause: "service_sature", detail: `le service de jetons est surchargé (réponse ${reponse.status})` }
      : { ok: false, cause: "injoignable", detail: `le service de jetons a répondu ${reponse.status}` };
  }

  const charge = (await reponse.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null;
  const jeton = charge?.access_token;
  if (typeof jeton !== "string" || jeton === "") {
    return { ok: false, cause: "reponse_illisible", detail: "la réponse de Google ne porte pas de jeton" };
  }
  const duree = typeof charge?.expires_in === "number" && charge.expires_in > 0 ? charge.expires_in : 3600;
  enMemoire.set(compte.email, { jeton, expireA: maintenant + duree });
  return { ok: true, jeton };
}
