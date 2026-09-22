/**
 * L'extraction documentaire, branchée — WF-06 étape 5, 22/09/2026.
 *
 * ── Ce que l'adaptateur transmet ────────────────────────────────────
 *
 * Les octets de la pièce, une fois, dans le corps de l'appel. **Jamais
 * une URL** — ni présignée, ni permanente. Même règle que le balayage,
 * et pour la même raison : une adresse confiée à un tiers se rappelle
 * demain, et la purge de rétention (INV-5) n'en effacerait rien.
 *
 * ── Ce qu'il ne décide pas ──────────────────────────────────────────
 *
 * Le verdict. Le modèle lit ; `evaluerConditions` juge, en TypeScript.
 * Une validité de passeport est une soustraction de dates, et RG-06.1
 * n'admet pas qu'elle soit confiée à un modèle. L'adaptateur rend des
 * faits bruts et un décompte de jetons, rien d'autre.
 *
 * ── Ce qu'il rend quand rien n'a été lu ─────────────────────────────
 *
 * Une cause, et les jetons consommés. Les deux importent :
 *
 * - la cause décide de la suite — reprise du job, revue humaine, geste
 *   demandé au candidat — et remplace le `engineLog` unique
 *   « extracteur non branché », qui était vrai tant que rien n'appelait
 *   et serait devenu faux au premier appel ;
 * - les jetons se consomment aussi quand la réponse est inexploitable.
 *   Ne pas les enregistrer ferait d'un appel raté un appel gratuit dans
 *   B-07, ce qu'INV-6 appelle un dépassement silencieux.
 *
 * ── Trois refus avant le réseau ─────────────────────────────────────
 *
 * Le type MIME doit être transmissible, l'objet doit exister, sa taille
 * doit tenir sous la limite. Les trois se vérifient sans appeler
 * personne — et sans débiter quoi que ce soit.
 */
import Anthropic from "@anthropic-ai/sdk";
import {
  DELAI_EXTRACTION_MS,
  TAILLE_MAXI_EXTRACTION_OCTETS,
  TYPES_LISIBLES,
  instructions,
  lireLaReponse,
  schemaDeLaLecture,
  typeLisible,
  type CauseDeNonLecture,
  type DemandeDeLecture,
} from "@/domain/dossiers/extraction";
import type { ChampsExtraits } from "@/domain/dossiers/verification";
import { leClient, modeleConfigure } from "@/lib/ai";
import { lireUnePiece, tailleDUnePiece } from "@/lib/storage";

/** Ce qu'une lecture rend, dans les deux cas. Les jetons sont toujours là. */
export type Lecture =
  | {
      etat: "LUE";
      /** Les faits bruts, sous les codes demandés. Jamais une mesure. */
      bruts: ChampsExtraits;
      /** La pièce que le modèle reconnaît, choisie dans la checklist. */
      pieceIdentifiee: string | null;
      jetonsEntree: number;
      jetonsSortie: number;
    }
  | {
      etat: "NON_LUE";
      cause: CauseDeNonLecture;
      /** La forme de ce qui s'est passé. Jamais une clé, jamais un extrait. */
      detail: string;
      jetonsEntree: number;
      jetonsSortie: number;
    };

/** Ce dont l'adaptateur a besoin pour appeler : la pièce, et ce qu'on y cherche. */
export interface Piece {
  objectKey: string;
  mimeType: string | null;
}

/**
 * Rend une lecture, toujours. Ne lève pas : un service muet est un cas
 * ordinaire du métier, et c'est l'appelant qui en fait une reprise ou
 * une revue humaine.
 */
export type Extracteur = (piece: Piece, demande: DemandeDeLecture) => Promise<Lecture>;

const sansJetons = (cause: CauseDeNonLecture, detail: string): Lecture => ({
  etat: "NON_LUE",
  cause,
  detail,
  jetonsEntree: 0,
  jetonsSortie: 0,
});

export const EXTRACTEUR_NON_BRANCHE: Extracteur = async () =>
  sansJetons("non_configure", "ANTHROPIC_API_KEY est vide dans cet environnement");

/** La clé sans laquelle la lecture n'existe pas. Voir `DEPENDANCES`. */
export const VARIABLES = ["ANTHROPIC_API_KEY"] as const;

/**
 * Lit la pièce, sous plafond.
 *
 * Le plafond est appliqué **pendant** la lecture et pas seulement sur la
 * taille annoncée : un objet dont les métadonnées mentent, ou qui a
 * grandi entre la mesure et la lecture, ne doit pas remplir la mémoire
 * du worker. La taille annoncée épargne le téléchargement dans le cas
 * ordinaire ; celle-ci est la garantie.
 */
async function lireSousPlafond(objectKey: string): Promise<Buffer | "trop_volumineux"> {
  const flux = await lireUnePiece(objectKey);
  const morceaux: Buffer[] = [];
  let total = 0;
  for await (const morceau of flux) {
    const bloc = morceau as Buffer;
    total += bloc.length;
    if (total > TAILLE_MAXI_EXTRACTION_OCTETS) {
      flux.destroy();
      return "trop_volumineux";
    }
    morceaux.push(bloc);
  }
  return Buffer.concat(morceaux);
}

/**
 * Le bloc de contenu qui porte la pièce.
 *
 * Il précède le texte de la consigne, et l'ordre n'est pas décoratif :
 * l'API demande que le document vienne avant l'instruction qui porte
 * dessus.
 */
function blocDeLaPiece(
  type: keyof typeof TYPES_LISIBLES,
  octets: Buffer,
): Anthropic.ContentBlockParam {
  const data = octets.toString("base64");
  return TYPES_LISIBLES[type] === "document"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
    : {
        type: "image",
        source: { type: "base64", media_type: type as "image/jpeg" | "image/png", data },
      };
}

/**
 * Ce qu'une erreur du SDK vaut comme cause.
 *
 * La chaîne est ordonnée du plus précis au plus général : les sous-types
 * d'`APIError` se rattraperaient sans cela sous le cas le plus large, et
 * une clé refusée se lirait « service injoignable » — un message qui
 * envoie chercher une panne réseau là où il faut renseigner un secret.
 */
export function causeDeLErreur(erreur: unknown): { cause: CauseDeNonLecture; detail: string } {
  if (erreur instanceof Anthropic.AuthenticationError) {
    return { cause: "non_configure", detail: "la clé d'extraction est refusée" };
  }
  if (erreur instanceof Anthropic.PermissionDeniedError) {
    return { cause: "non_configure", detail: "la clé d'extraction n'a pas accès à ce modèle" };
  }
  if (erreur instanceof Anthropic.RateLimitError) {
    return { cause: "service_sature", detail: "la cadence d'appel est dépassée" };
  }
  if (erreur instanceof Anthropic.BadRequestError) {
    return { cause: "reponse_illisible", detail: "la demande a été refusée telle qu'elle est formée" };
  }
  if (erreur instanceof Anthropic.APIConnectionTimeoutError) {
    return { cause: "delai_depasse", detail: `sans réponse après ${DELAI_EXTRACTION_MS} ms` };
  }
  if (erreur instanceof Anthropic.APIConnectionError) {
    return { cause: "injoignable", detail: "le service de lecture n'a pas répondu" };
  }
  if (erreur instanceof Anthropic.APIError) {
    return { cause: "injoignable", detail: `réponse ${erreur.status ?? "sans code"}` };
  }
  const nom = (erreur as { name?: unknown })?.name;
  return nom === "TimeoutError" || nom === "AbortError"
    ? { cause: "delai_depasse", detail: `sans réponse après ${DELAI_EXTRACTION_MS} ms` }
    : { cause: "injoignable", detail: "le service de lecture n'a pas répondu" };
}

/** Le texte que le modèle a rendu, concaténé. Les blocs de réflexion sont ignorés. */
const texteRendu = (message: Anthropic.Message): string =>
  message.content
    .filter((bloc): bloc is Anthropic.TextBlock => bloc.type === "text")
    .map((bloc) => bloc.text)
    .join("");

/**
 * L'appel lui-même, sur des octets déjà en main.
 *
 * Séparé de la lecture du stockage pour la même raison que le balayage :
 * ce qui s'éprouve doit être le chemin que la production emprunte, et un
 * essai n'a pas de pièce déposée à présenter.
 */
export async function lireDesOctets(
  cle: string,
  modele: string,
  type: keyof typeof TYPES_LISIBLES,
  octets: Buffer,
  demande: DemandeDeLecture,
): Promise<Lecture> {
  let message: Anthropic.Message;
  try {
    message = await leClient(cle).messages.create(
      {
        model: modele,
        max_tokens: 4096,
        output_config: {
          format: {
            type: "json_schema",
            schema: schemaDeLaLecture(demande.champs, demande.codesDeLaChecklist),
          },
        },
        messages: [
          {
            role: "user",
            content: [blocDeLaPiece(type, octets), { type: "text", text: instructions(demande) }],
          },
        ],
      },
      { timeout: DELAI_EXTRACTION_MS },
    );
  } catch (erreur) {
    /*
      Aucun jeton n'est compté ici : sans réponse, l'usage n'est pas
      connu. Le supposer le ferait apparaître dans B-07 comme une
      mesure, alors que ce serait une estimation — et B-07 recalcule des
      coûts à partir de ces nombres.
    */
    const { cause, detail } = causeDeLErreur(erreur);
    return sansJetons(cause, detail);
  }

  const jetonsEntree = message.usage.input_tokens;
  const jetonsSortie = message.usage.output_tokens;
  const echoue = (cause: CauseDeNonLecture, detail: string): Lecture => ({
    etat: "NON_LUE",
    cause,
    detail,
    jetonsEntree,
    jetonsSortie,
  });

  /*
    Un refus et une réponse tronquée se ressemblent — aucune des deux ne
    contient la lecture attendue — et se traitent différemment : la
    seconde est une réponse mal formée, la première n'en est pas une.
    Les distinguer met dans `engineLog` ce qu'un exploitant peut suivre.
  */
  if (message.stop_reason === "refusal") {
    return echoue("refus", "le service de lecture a refusé de traiter la pièce");
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

  const relue = lireLaReponse(charge, demande.champs);
  if ("cause" in relue) {
    return echoue(relue.cause, "la réponse n'a pas la forme annoncée au schéma");
  }
  if (relue.obstacle !== null) {
    return echoue(relue.obstacle, "le modèle signale un obstacle à la lecture");
  }

  return {
    etat: "LUE",
    bruts: relue.bruts,
    pieceIdentifiee: relue.pieceIdentifiee,
    jetonsEntree,
    jetonsSortie,
  };
}

/** L'adaptateur complet : du stockage à la lecture. */
export const extracteurClaude =
  (cle: string, modele: string): Extracteur =>
  async (piece: Piece, demande: DemandeDeLecture): Promise<Lecture> => {
    if (!typeLisible(piece.mimeType)) {
      return sansJetons("type_non_lisible", `type déposé : ${piece.mimeType ?? "aucun"}`);
    }

    /*
      La taille d'abord : un objet absent et un objet trop gros se
      distinguent ici, sans qu'un octet soit transféré ni qu'un jeton
      soit consommé. Le premier arrive pour de bon — une purge de
      rétention passée entre la mise en file et l'exécution.
    */
    const taille = await tailleDUnePiece(piece.objectKey);
    if (taille === null) {
      return sansJetons("objet_absent", "le stockage ne rend aucune taille pour cette version");
    }
    if (taille > TAILLE_MAXI_EXTRACTION_OCTETS) {
      return sansJetons("trop_volumineux", `${taille} octets, au-delà de la limite de transmission`);
    }

    let octets: Buffer;
    try {
      const lu = await lireSousPlafond(piece.objectKey);
      if (lu === "trop_volumineux") {
        return sansJetons(
          "trop_volumineux",
          "le flux dépasse la limite annoncée par les métadonnées",
        );
      }
      octets = lu;
    } catch {
      return sansJetons("objet_absent", "la lecture du stockage de confiance a échoué");
    }

    return lireDesOctets(cle, modele, piece.mimeType, octets, demande);
  };

/**
 * L'extracteur que le job exécutera, demandé au moment de s'en servir.
 *
 * L'état de service interroge cette fonction-là, jamais un registre tenu
 * à la main : comparer ce qu'elle rend à `EXTRACTEUR_NON_BRANCHE` dit si
 * un adaptateur existe, sans qu'aucune déclaration puisse survivre au
 * code qu'elle décrit.
 */
export const lExtracteur = (
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): Extracteur => {
  const cle = (environnement.ANTHROPIC_API_KEY ?? "").trim();
  return cle === "" ? EXTRACTEUR_NON_BRANCHE : extracteurClaude(cle, modeleConfigure(environnement));
};

export const extractionConfiguree = (
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): boolean => lExtracteur(environnement) !== EXTRACTEUR_NON_BRANCHE;
