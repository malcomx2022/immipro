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
  causeDeLErreur as classer,
  texteRendu,
  type ChaineDAppel,
} from "@/server/ia/appel";
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
import { leClient } from "@/lib/ai";
import type { AppelMesure } from "@/server/ia/appel";
import {
  lireDesOctetsCompatible,
  type Authentification,
  type ConfigurationCompatible,
} from "@/server/ia/openai-compatible";
import {
  FOURNISSEURS,
  adresseDeBase,
  formeDuPdf,
  fournisseurChoisi,
  manqueDuFournisseur,
  modeDAuthentification,
  modeleDu,
  piecesAutoriseesChez,
} from "@/domain/ia/fournisseurs";
import { VARIABLE_COMPTE_DE_SERVICE, lireCompteDeService } from "@/domain/ia/compte-de-service";
import { lireUnePiece, tailleDUnePiece } from "@/lib/storage";

/** Ce qu'une lecture rend, dans les deux cas. Les jetons sont toujours là. */
export type Lecture = (
  | {
      etat: "LUE";
      bruts: ChampsExtraits;
      pieceIdentifiee: string | null;
      jetonsEntree: number;
      jetonsSortie: number;
    }
  | {
      etat: "NON_LUE";
      cause: CauseDeNonLecture;
      detail: string;
      jetonsEntree: number;
      jetonsSortie: number;
    }
) & {
  /** Chez qui l'appel est parti (S.94) ; absent quand aucun appel n'a eu lieu. */
  appel?: AppelMesure;
};

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
  sansJetons(
    "non_configure",
    "aucun fournisseur de lecture n'est branché dans cet environnement : l'écran Coûts IA dit ce qui manque",
  );

/** La clé sans laquelle la lecture n'existe pas. Voir `DEPENDANCES`. */
/** Les variables du fournisseur par défaut ; celles du fournisseur choisi se lisent dans `domain/ia/fournisseurs.ts`. */
export const VARIABLES = FOURNISSEURS.anthropic.variables;

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
 * La classification des erreurs du SDK et la lecture du texte rendu
 * vivent dans `server/ia/appel.ts` : les deux chaînes d'appel au modèle
 * en avaient chacune une copie identique, et le domaine s'interdit le
 * SDK. Ce qui reste propre à cette chaîne-ci est son vocabulaire.
 */
const CHAINE: ChaineDAppel = {
  cle: "la clé d'extraction",
  service: "le service de lecture",
  delaiMs: DELAI_EXTRACTION_MS,
};

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
    const { cause, detail } = classer(erreur, CHAINE);
    return sansJetons(cause, detail);
  }

  const jetonsEntree = message.usage.input_tokens;
  const jetonsSortie = message.usage.output_tokens;
  const appel: AppelMesure = { fournisseur: "anthropic", modele };
  const echoue = (cause: CauseDeNonLecture, detail: string): Lecture => ({
    etat: "NON_LUE",
    cause,
    detail,
    jetonsEntree,
    jetonsSortie,
    appel,
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
    appel,
  };
}

/** L'adaptateur complet : du stockage à la lecture. */
/**
 * Ce que tout lecteur partage, quel que soit le fournisseur — S.94 : le
 * type, la taille, la lecture du stockage de confiance. Seul l'envoi des
 * octets change d'un fournisseur à l'autre.
 */
type LecteurDOctets = (
  type: keyof typeof TYPES_LISIBLES,
  octets: Buffer,
  demande: DemandeDeLecture,
) => Promise<Lecture>;

export const extracteurAvec =
  (lecteur: LecteurDOctets): Extracteur =>
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

    return lecteur(piece.mimeType, octets, demande);
  };

/**
 * L'extracteur que le job exécutera, demandé au moment de s'en servir.
 *
 * L'état de service interroge cette fonction-là, jamais un registre tenu
 * à la main : comparer ce qu'elle rend à `EXTRACTEUR_NON_BRANCHE` dit si
 * un adaptateur existe, sans qu'aucune déclaration puisse survivre au
 * code qu'elle décrit.
 */
export const extracteurClaude = (cle: string, modele: string): Extracteur =>
  extracteurAvec((type, octets, demande) => lireDesOctets(cle, modele, type, octets, demande));

/**
 * L'extracteur que l'environnement désigne — S.94.
 *
 * Le fournisseur est celui de `AI_FOURNISSEUR_EXTRACTION` (Anthropic par
 * défaut). Tout ce qui empêche un appel rend **la même** fonction non
 * branchée — clé absente, fournisseur inconnu, pièces non autorisées chez
 * ce sous-traitant — : l'état de service la reconnaît par identité, et
 * l'écran Coûts IA dit laquelle des raisons tient.
 */
export const lExtracteur = (
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): Extracteur => {
  const choix = fournisseurChoisi(environnement, "extraction");
  if (!choix.connu) return EXTRACTEUR_NON_BRANCHE;
  const code = choix.fournisseur;
  if (manqueDuFournisseur(environnement, code) !== null) return EXTRACTEUR_NON_BRANCHE;
  if (!piecesAutoriseesChez(environnement, code)) return EXTRACTEUR_NON_BRANCHE;

  if (code === "anthropic") {
    const cle = (environnement[FOURNISSEURS.anthropic.variables[0]!] ?? "").trim();
    return extracteurClaude(cle, modeleDu(environnement, code)!);
  }
  const config = configurationCompatible(environnement);
  return config ? extracteurAvec((type, octets, demande) => lireDesOctetsCompatible(config, type, octets, demande)) : EXTRACTEUR_NON_BRANCHE;
};

/** La configuration du fournisseur compatible OpenAI, ou `null` si elle est incomplète. */
export function configurationCompatible(
  environnement: Readonly<Record<string, string | undefined>>,
): ConfigurationCompatible | null {
  if (manqueDuFournisseur(environnement, "openai_compatible") !== null) return null;
  const base = adresseDeBase((environnement.AI_OPENAI_URL ?? "").trim());
  const modele = modeleDu(environnement, "openai_compatible");
  const pdf = formeDuPdf(environnement);
  const auth = modeDAuthentification(environnement);
  if (!base || !modele || !pdf.connue || !auth.connu) return null;

  let authentification: Authentification;
  if (auth.mode === "compte_de_service_google") {
    const compte = lireCompteDeService(environnement[VARIABLE_COMPTE_DE_SERVICE]);
    if (!compte.ok) return null;
    authentification = { mode: "compte_de_service_google", compte: compte.compte };
  } else {
    authentification = { mode: "cle", cle: (environnement.AI_OPENAI_API_KEY ?? "").trim() };
  }
  return { base, authentification, modele, pdf: pdf.forme };
}

export const extractionConfiguree = (
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): boolean => lExtracteur(environnement) !== EXTRACTEUR_NON_BRANCHE;
