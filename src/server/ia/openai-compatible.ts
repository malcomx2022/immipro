import type { CauseDAppel } from "@/domain/ia/appel";
import {
  DELAI_EXTRACTION_MS,
  TYPES_LISIBLES,
  instructions,
  lireLaReponse,
  schemaDeLaLecture,
  type DemandeDeLecture,
} from "@/domain/dossiers/extraction";
import {
  DELAI_REDACTION_MS,
  JETONS_MAXI_CRITIQUE,
  JETONS_MAXI_REDACTION,
  instructionsDeCritique,
  instructionsDeRedaction,
  lireLaCritique,
  reponsesSituees,
  schemaDeLaCritique,
  texteExploitable,
  type MatiereDeLaPiece,
} from "@/domain/redaction/commande";
import type { Lecture } from "@/server/dossiers/extracteur";
import type { Critique, Redacteur, Redaction, Relecture } from "@/server/redaction/adaptateur";
import type { AppelMesure } from "./appel";

/**
 * L'adaptateur « compatible OpenAI » — S.94.
 *
 * ── Un protocole, pas une marque ─────────────────────────────────────
 *
 * L'interface `POST {base}/chat/completions` d'OpenAI est aussi servie par
 * Mistral, Google (Gemini), DeepSeek, Groq, ou un serveur local. Un seul
 * adaptateur les couvre tous : l'exploitant déclare l'adresse de base, la
 * clé et le modèle (`AI_OPENAI_URL`, `AI_OPENAI_API_KEY`,
 * `AI_OPENAI_MODEL`). Aucun SDK : `fetch`, comme les adaptateurs de
 * paiement, et aucune dépendance de plus à tenir à jour.
 *
 * ── Ce qui ne change pas avec le fournisseur ────────────────────────
 *
 * Les consignes, les schémas, la lecture des réponses et les causes
 * d'échec sont ceux du domaine — les mêmes que pour Anthropic. Une
 * réponse hors schéma finit en `reponse_illisible`, et une pièce n'est
 * jamais déclarée conforme sans lecture : un modèle moins bon envoie plus
 * de pièces en revue humaine, il n'en valide aucune à tort.
 *
 * ── Ce qui peut varier, et se dit ───────────────────────────────────
 *
 * - le PDF n'est pas lu partout : il ne part que si l'exploitant déclare
 *   `AI_OPENAI_PDF=oui` ; sinon la pièce part en revue humaine avec la
 *   cause `type_non_lisible`, et rien n'est converti en silence ;
 * - la sortie par schéma est demandée (`response_format: json_schema`,
 *   non stricte) ; un serveur qui l'ignore rend du texte, que la lecture
 *   du domaine refuse s'il n'a pas la forme attendue.
 *
 * Aucune clé, aucun corps de requête ni de réponse n'est journalisé : les
 * causes disent la forme de ce qui s'est passé, jamais le contenu.
 */

export interface ConfigurationCompatible {
  /** Adresse de base, déjà vérifiée : `https://…/v1`. */
  base: URL;
  cle: string;
  modele: string;
  /** Le serveur lit les PDF (`AI_OPENAI_PDF=oui`). */
  pdf: boolean;
}

/** Ce que rend un appel : la réponse lue, ou la cause de son absence. */
type Reponse =
  | {
      ok: true;
      texte: string;
      fin: string | null;
      refus: boolean;
      jetonsEntree: number;
      jetonsSortie: number;
    }
  | { ok: false; cause: CauseDAppel; detail: string };

/** Le statut HTTP d'une réponse en erreur, traduit en cause neutre. */
export function causeDuStatut(statut: number): { cause: CauseDAppel; detail: string } {
  if (statut === 401 || statut === 403) {
    return { cause: "non_configure", detail: `la clé d'appel est refusée (réponse ${statut})` };
  }
  if (statut === 404) {
    return {
      cause: "non_configure",
      detail: "l'adresse de base ou le modèle n'existe pas chez ce fournisseur (réponse 404)",
    };
  }
  if (statut === 429) return { cause: "service_sature", detail: "la cadence d'appel est dépassée" };
  if (statut === 503 || statut === 529) {
    return { cause: "service_sature", detail: `le service est surchargé (réponse ${statut})` };
  }
  if (statut >= 500 || statut === 408) {
    return { cause: "injoignable", detail: `réponse ${statut}` };
  }
  return {
    cause: "reponse_illisible",
    detail: `la demande a été refusée telle qu'elle est formée (réponse ${statut})`,
  };
}

const lireReponse = (charge: unknown): Omit<Extract<Reponse, { ok: true }>, "ok"> | null => {
  const c = charge as {
    choices?: { finish_reason?: unknown; message?: { content?: unknown; refusal?: unknown } }[];
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
  } | null;
  const choix = c?.choices?.[0];
  if (!choix?.message) return null;
  const nombre = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const refus = typeof choix.message.refusal === "string" && choix.message.refusal.length > 0;
  return {
    texte: typeof choix.message.content === "string" ? choix.message.content : "",
    fin: typeof choix.finish_reason === "string" ? choix.finish_reason : null,
    refus: refus || choix.finish_reason === "content_filter",
    jetonsEntree: nombre(c?.usage?.prompt_tokens),
    jetonsSortie: nombre(c?.usage?.completion_tokens),
  };
};

/** L'appel HTTP, et rien d'autre. */
export async function appelerCompatible(
  config: ConfigurationCompatible,
  corps: Record<string, unknown>,
  delaiMs: number,
): Promise<Reponse> {
  const url = new URL("chat/completions", config.base.href.endsWith("/") ? config.base : `${config.base.href}/`);
  let reponse: Response;
  try {
    reponse = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.cle}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ model: config.modele, ...corps }),
      signal: AbortSignal.timeout(delaiMs),
    });
  } catch (erreur) {
    const nom = (erreur as { name?: unknown })?.name;
    return nom === "TimeoutError" || nom === "AbortError"
      ? { ok: false, cause: "delai_depasse", detail: `sans réponse après ${delaiMs} ms` }
      : { ok: false, cause: "injoignable", detail: "le service n'a pas répondu" };
  }

  if (!reponse.ok) {
    // Le corps n'est pas lu : il peut contenir un écho de la demande.
    await reponse.body?.cancel().catch(() => undefined);
    return { ok: false, ...causeDuStatut(reponse.status) };
  }

  const charge = await reponse.json().catch(() => null);
  const lue = lireReponse(charge);
  if (!lue) return { ok: false, cause: "reponse_illisible", detail: "la réponse n'a pas la forme d'une complétion" };
  return { ok: true, ...lue };
}

const mesure = (config: ConfigurationCompatible): AppelMesure => ({
  fournisseur: "openai_compatible",
  modele: config.modele,
});

// ── Lecture des pièces ──────────────────────────────────────────────────

/** Lit les octets d'une pièce déjà vérifiée (type, taille) par l'appelant. */
export async function lireDesOctetsCompatible(
  config: ConfigurationCompatible,
  type: keyof typeof TYPES_LISIBLES,
  octets: Buffer,
  demande: DemandeDeLecture,
): Promise<Lecture> {
  const appel = mesure(config);
  const sansJetons = (cause: Extract<Lecture, { etat: "NON_LUE" }>["cause"], detail: string): Lecture => ({
    etat: "NON_LUE",
    cause,
    detail,
    jetonsEntree: 0,
    jetonsSortie: 0,
    appel,
  });

  const donnees = `data:${type};base64,${octets.toString("base64")}`;
  let piece: Record<string, unknown>;
  if (TYPES_LISIBLES[type] === "document") {
    if (!config.pdf) {
      return sansJetons(
        "type_non_lisible",
        "ce fournisseur n'est pas déclaré lecteur de PDF (AI_OPENAI_PDF)",
      );
    }
    piece = { type: "file", file: { filename: "piece.pdf", file_data: donnees } };
  } else {
    piece = { type: "image_url", image_url: { url: donnees } };
  }

  const reponse = await appelerCompatible(
    config,
    {
      max_tokens: 4096,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "lecture",
          schema: schemaDeLaLecture(demande.champs, demande.codesDeLaChecklist),
          strict: false,
        },
      },
      messages: [
        { role: "user", content: [piece, { type: "text", text: instructions(demande) }] },
      ],
    },
    DELAI_EXTRACTION_MS,
  );
  if (!reponse.ok) return sansJetons(reponse.cause, reponse.detail);

  const echoue = (cause: Extract<Lecture, { etat: "NON_LUE" }>["cause"], detail: string): Lecture => ({
    etat: "NON_LUE",
    cause,
    detail,
    jetonsEntree: reponse.jetonsEntree,
    jetonsSortie: reponse.jetonsSortie,
    appel,
  });
  if (reponse.refus) return echoue("refus", "le service de lecture a refusé de traiter la pièce");
  if (reponse.fin === "length") {
    return echoue("reponse_illisible", "la réponse a été interrompue avant d'être complète");
  }

  let charge: unknown;
  try {
    charge = JSON.parse(reponse.texte);
  } catch {
    return echoue("reponse_illisible", "la réponse n'est pas du JSON");
  }
  const relue = lireLaReponse(charge, demande.champs);
  if ("cause" in relue) return echoue(relue.cause, "la réponse n'a pas la forme annoncée au schéma");
  if (relue.obstacle !== null) return echoue(relue.obstacle, "le modèle signale un obstacle à la lecture");

  return {
    etat: "LUE",
    bruts: relue.bruts,
    pieceIdentifiee: relue.pieceIdentifiee,
    jetonsEntree: reponse.jetonsEntree,
    jetonsSortie: reponse.jetonsSortie,
    appel,
  };
}

// ── Rédaction et relecture ──────────────────────────────────────────────

export const redacteurCompatible =
  (config: ConfigurationCompatible): Redacteur =>
  async (matiere: MatiereDeLaPiece): Promise<Redaction> => {
    const appel = mesure(config);
    // Écrire à partir de rien produirait le modèle générique que WF-08 écarte.
    if (reponsesSituees(matiere).length === 0) {
      return {
        etat: "SANS_TEXTE",
        cause: "reponse_illisible",
        detail: "aucune réponse à mettre en forme",
        jetonsEntree: 0,
        jetonsSortie: 0,
      };
    }
    const reponse = await appelerCompatible(
      config,
      {
        max_tokens: JETONS_MAXI_REDACTION,
        messages: [{ role: "user", content: instructionsDeRedaction(matiere) }],
      },
      DELAI_REDACTION_MS,
    );
    if (!reponse.ok) {
      return { etat: "SANS_TEXTE", cause: reponse.cause, detail: reponse.detail, jetonsEntree: 0, jetonsSortie: 0 };
    }
    const echoue = (cause: CauseDAppel, detail: string): Redaction => ({
      etat: "SANS_TEXTE",
      cause,
      detail,
      jetonsEntree: reponse.jetonsEntree,
      jetonsSortie: reponse.jetonsSortie,
      appel,
    });
    if (reponse.refus) return echoue("refus", "le service a refusé d'écrire cette pièce");
    // Un texte coupé au plafond ne devient pas une version datée.
    if (reponse.fin === "length") return echoue("reponse_illisible", "le texte a été interrompu avant sa fin");
    const texte = reponse.texte.trim();
    if (!texteExploitable(texte)) {
      return echoue("reponse_illisible", "le texte rendu est trop court pour être une version");
    }
    return {
      etat: "ECRITE",
      texte,
      jetonsEntree: reponse.jetonsEntree,
      jetonsSortie: reponse.jetonsSortie,
      appel,
    };
  };

export const critiqueCompatible =
  (config: ConfigurationCompatible): Critique =>
  async (texte: string, matiere: MatiereDeLaPiece): Promise<Relecture> => {
    const appel = mesure(config);
    const reponse = await appelerCompatible(
      config,
      {
        max_tokens: JETONS_MAXI_CRITIQUE,
        response_format: {
          type: "json_schema",
          json_schema: { name: "critique", schema: schemaDeLaCritique(), strict: false },
        },
        messages: [{ role: "user", content: instructionsDeCritique(texte, matiere) }],
      },
      DELAI_REDACTION_MS,
    );
    if (!reponse.ok) {
      return { etat: "SANS_AVIS", cause: reponse.cause, detail: reponse.detail, jetonsEntree: 0, jetonsSortie: 0 };
    }
    const echoue = (cause: CauseDAppel, detail: string): Relecture => ({
      etat: "SANS_AVIS",
      cause,
      detail,
      jetonsEntree: reponse.jetonsEntree,
      jetonsSortie: reponse.jetonsSortie,
      appel,
    });
    if (reponse.refus) return echoue("refus", "le service a refusé de relire cette pièce");
    if (reponse.fin === "length") {
      return echoue("reponse_illisible", "la réponse a été interrompue avant d'être complète");
    }
    let charge: unknown;
    try {
      charge = JSON.parse(reponse.texte);
    } catch {
      return echoue("reponse_illisible", "la réponse n'est pas du JSON");
    }
    const relue = lireLaCritique(charge);
    if ("cause" in relue) return echoue(relue.cause, "la réponse n'a pas la forme annoncée au schéma");
    return {
      etat: "RELUE",
      remarques: relue,
      jetonsEntree: reponse.jetonsEntree,
      jetonsSortie: reponse.jetonsSortie,
      appel,
    };
  };
