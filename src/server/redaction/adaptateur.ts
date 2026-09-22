/**
 * La mise en forme et l'analyse critique, branchées — WF-08, 22/09/2026.
 *
 * ── Ce qui est transmis ─────────────────────────────────────────────
 *
 * Les réponses du candidat et le texte de sa version. Rien d'autre : ni
 * pièce jointe, ni identité, ni adresse. Le recoupement avec les autres
 * pièces se fait dans `domain/redaction/coherence.ts`, en TypeScript,
 * sur ce que le dossier sait déjà de lui-même — la règle d'architecture
 * 2 tient ici comme ailleurs, et elle évite en plus d'envoyer le contenu
 * d'un passeport pour relire une lettre.
 *
 * ── Pourquoi la mise en forme est diffusée ──────────────────────────
 *
 * Une lettre fait plusieurs milliers de jetons de sortie, et une demande
 * qui les attend en bloc atteint le délai de la passerelle avant d'avoir
 * fini. La réponse est donc lue au fil de l'eau et recollée à la fin.
 * L'analyse critique, elle, rend une liste courte et n'en a pas besoin.
 *
 * ── Ce qu'ils rendent quand rien n'aboutit ──────────────────────────
 *
 * Une cause, et les jetons consommés. Comme pour la lecture d'une pièce,
 * et pour la même raison : un appel interrompu a coûté, et ne pas
 * l'enregistrer en ferait un appel gratuit dans B-07 — le dépassement
 * silencieux qu'INV-6 interdit.
 */
import Anthropic from "@anthropic-ai/sdk";
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
  type RemarqueProduite,
} from "@/domain/redaction/commande";
import type { CauseDAppel } from "@/domain/ia/appel";
import { leClient } from "@/lib/ai";

/** Ce qu'une mise en forme rend, dans les deux cas. Les jetons sont toujours là. */
export type Redaction =
  | { etat: "ECRITE"; texte: string; jetonsEntree: number; jetonsSortie: number }
  | { etat: "SANS_TEXTE"; cause: CauseDAppel; detail: string; jetonsEntree: number; jetonsSortie: number };

/** Ce qu'une relecture rend. `remarques: []` est un résultat, pas une absence. */
export type Relecture =
  | {
      etat: "RELUE";
      remarques: readonly RemarqueProduite[];
      jetonsEntree: number;
      jetonsSortie: number;
    }
  | { etat: "SANS_AVIS"; cause: CauseDAppel; detail: string; jetonsEntree: number; jetonsSortie: number };

export type Redacteur = (matiere: MatiereDeLaPiece) => Promise<Redaction>;
export type Critique = (texte: string, matiere: MatiereDeLaPiece) => Promise<Relecture>;

const sansJetons = <E extends "SANS_TEXTE" | "SANS_AVIS">(
  etat: E,
  cause: CauseDAppel,
  detail: string,
) => ({ etat, cause, detail, jetonsEntree: 0, jetonsSortie: 0 }) as const;

export const REDACTEUR_NON_BRANCHE: Redacteur = async () =>
  sansJetons("SANS_TEXTE", "non_configure", "ANTHROPIC_API_KEY est vide dans cet environnement");

export const CRITIQUE_NON_BRANCHEE: Critique = async () =>
  sansJetons("SANS_AVIS", "non_configure", "ANTHROPIC_API_KEY est vide dans cet environnement");

/**
 * Ce qu'une erreur du SDK vaut comme cause.
 *
 * Ordonnée du plus précis au plus général : les sous-types d'`APIError`
 * se rattraperaient sinon sous le cas le plus large, et une clé refusée
 * se lirait « service injoignable » — un message qui envoie chercher une
 * panne réseau là où il faut renseigner un secret.
 */
export function causeDeLErreur(erreur: unknown): { cause: CauseDAppel; detail: string } {
  if (erreur instanceof Anthropic.AuthenticationError) {
    return { cause: "non_configure", detail: "la clé d'appel est refusée" };
  }
  if (erreur instanceof Anthropic.PermissionDeniedError) {
    return { cause: "non_configure", detail: "la clé n'a pas accès à ce modèle" };
  }
  if (erreur instanceof Anthropic.RateLimitError) {
    return { cause: "service_sature", detail: "la cadence d'appel est dépassée" };
  }
  if (erreur instanceof Anthropic.BadRequestError) {
    return { cause: "reponse_illisible", detail: "la demande a été refusée telle qu'elle est formée" };
  }
  if (erreur instanceof Anthropic.APIConnectionTimeoutError) {
    return { cause: "delai_depasse", detail: `sans réponse après ${DELAI_REDACTION_MS} ms` };
  }
  if (erreur instanceof Anthropic.APIConnectionError) {
    return { cause: "injoignable", detail: "le service n'a pas répondu" };
  }
  if (erreur instanceof Anthropic.APIError) {
    return { cause: "injoignable", detail: `réponse ${erreur.status ?? "sans code"}` };
  }
  const nom = (erreur as { name?: unknown })?.name;
  return nom === "TimeoutError" || nom === "AbortError"
    ? { cause: "delai_depasse", detail: `sans réponse après ${DELAI_REDACTION_MS} ms` }
    : { cause: "injoignable", detail: "le service n'a pas répondu" };
}

/** Le texte rendu, concaténé. Les blocs de réflexion sont ignorés. */
const texteRendu = (message: Anthropic.Message): string =>
  message.content
    .filter((bloc): bloc is Anthropic.TextBlock => bloc.type === "text")
    .map((bloc) => bloc.text)
    .join("");

/* ------------------------------------------------------------------ *
 * La mise en forme.
 * ------------------------------------------------------------------ */

export const redacteurClaude =
  (cle: string, modele: string): Redacteur =>
  async (matiere: MatiereDeLaPiece): Promise<Redaction> => {
    /*
      Aucune réponse, aucun appel. La route le vérifie déjà — il lui faut
      un minimum de réponses —, et le vérifier ici aussi n'est pas une
      redondance : l'adaptateur est le dernier endroit avant la dépense,
      et écrire à partir de rien produirait exactement le modèle
      pré-rempli générique que l'étape 3 de WF-08 écarte.
    */
    if (reponsesSituees(matiere).length === 0) {
      return sansJetons("SANS_TEXTE", "reponse_illisible", "aucune réponse à mettre en forme");
    }

    let message: Anthropic.Message;
    try {
      message = await leClient(cle)
        .messages.stream(
          {
            model: modele,
            max_tokens: JETONS_MAXI_REDACTION,
            messages: [{ role: "user", content: instructionsDeRedaction(matiere) }],
          },
          { timeout: DELAI_REDACTION_MS },
        )
        .finalMessage();
    } catch (erreur) {
      /*
        Aucun jeton n'est compté : sans réponse, l'usage n'est pas connu.
        Le supposer le ferait apparaître dans B-07 comme une mesure, alors
        que B-07 recalcule des coûts à partir de ces nombres.
      */
      const { cause, detail } = causeDeLErreur(erreur);
      return sansJetons("SANS_TEXTE", cause, detail);
    }

    const jetonsEntree = message.usage.input_tokens;
    const jetonsSortie = message.usage.output_tokens;
    const echoue = (cause: CauseDAppel, detail: string): Redaction => ({
      etat: "SANS_TEXTE",
      cause,
      detail,
      jetonsEntree,
      jetonsSortie,
    });

    if (message.stop_reason === "refusal") {
      return echoue("refus", "le service a refusé d'écrire cette pièce");
    }

    const texte = texteRendu(message).trim();

    /*
      Une réponse coupée au plafond rend un texte qui s'arrête au milieu
      d'une phrase. L'enregistrer le daterait et le numéroterait dans
      l'historique du candidat comme un état de son travail ; il vaut
      mieux ne rien créer et le lui dire.
    */
    if (message.stop_reason === "max_tokens") {
      return echoue("reponse_illisible", "le texte a été interrompu avant sa fin");
    }
    if (!texteExploitable(texte)) {
      return echoue("reponse_illisible", "le texte rendu est trop court pour être une version");
    }

    return { etat: "ECRITE", texte, jetonsEntree, jetonsSortie };
  };

/* ------------------------------------------------------------------ *
 * L'analyse critique.
 * ------------------------------------------------------------------ */

export const critiqueClaude =
  (cle: string, modele: string): Critique =>
  async (texte: string, matiere: MatiereDeLaPiece): Promise<Relecture> => {
    let message: Anthropic.Message;
    try {
      message = await leClient(cle).messages.create(
        {
          model: modele,
          max_tokens: JETONS_MAXI_CRITIQUE,
          output_config: { format: { type: "json_schema", schema: schemaDeLaCritique() } },
          messages: [{ role: "user", content: instructionsDeCritique(texte, matiere) }],
        },
        { timeout: DELAI_REDACTION_MS },
      );
    } catch (erreur) {
      const { cause, detail } = causeDeLErreur(erreur);
      return sansJetons("SANS_AVIS", cause, detail);
    }

    const jetonsEntree = message.usage.input_tokens;
    const jetonsSortie = message.usage.output_tokens;
    const echoue = (cause: CauseDAppel, detail: string): Relecture => ({
      etat: "SANS_AVIS",
      cause,
      detail,
      jetonsEntree,
      jetonsSortie,
    });

    if (message.stop_reason === "refusal") {
      return echoue("refus", "le service a refusé de relire cette pièce");
    }
    if (message.stop_reason === "max_tokens") {
      return echoue("reponse_illisible", "la réponse a été interrompue avant d'être complète");
    }

    let charge: unknown;
    try {
      charge = JSON.parse(texteRendu(message));
    } catch {
      return echoue("reponse_illisible", "la réponse n'est pas du JSON");
    }

    const relue = lireLaCritique(charge);
    if ("cause" in relue) {
      return echoue(relue.cause, "la réponse n'a pas la forme annoncée au schéma");
    }

    return { etat: "RELUE", remarques: relue, jetonsEntree, jetonsSortie };
  };
