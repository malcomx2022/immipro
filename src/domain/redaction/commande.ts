/**
 * Ce qu'on demande au modèle pour une pièce rédigée, et comment on relit
 * ce qu'il rend — WF-08 étapes 3 et 4, branchées le 22/09/2026.
 *
 * ── Le défaut que ce lot corrige ────────────────────────────────────
 *
 * R-04 décidait d'afficher les remarques sur `redactionConfiguree()`,
 * c'est-à-dire sur la présence d'`ANTHROPIC_API_KEY`. Aucune analyse
 * n'ayant jamais tourné, la base rendait une liste vide, et l'écran la
 * lisait comme un résultat :
 *
 *     redactionConfiguree()       : true
 *     remarques rendues à l'écran : []
 *     état                        : RELUE_SANS_REMARQUE
 *     ce que le candidat lit      : « Rien à reprendre sur cette version. »
 *
 * — sur une lettre que personne n'avait lue. Le commentaire au-dessus de
 * la condition disait pourtant la règle juste : « la liste vide de la
 * base ne veut pas dire rien à reprendre ». C'est la condition qui ne la
 * tenait pas. Et le branchement de la lecture des pièces, deux heures
 * plus tôt, venait de rendre ce chemin ordinaire : toute installation
 * qui veut lire les pièces pose désormais cette clé.
 *
 * La relecture se constate donc **sur la version**, pas sur
 * l'environnement.
 *
 * ── Ce que le modèle fait, et ce qu'il ne fait pas ──────────────────
 *
 * Il **met en forme** ce que le candidat a répondu, et il **relève** des
 * écarts. Il ne note pas, ne classe pas, et ne dit rien de l'issue de la
 * démarche (INV-1). Un texte produit ici porte la mention de RG-08.1 et
 * reste celui du candidat : c'est lui qui le relit, le modifie et le
 * dépose.
 *
 * Module pur : aucune dépendance à Prisma, Next, au réseau ou au SDK.
 */
import type { CauseDAppel } from "@/domain/ia/appel";
import type { Reponses } from "@/domain/redaction/entretien";

export type { CauseDAppel };

/* ------------------------------------------------------------------ *
 * Ce qu'on donne au modèle, et ce qu'il rend.
 *
 * Ces formes vivaient dans `server/redaction/redacteur.ts`. Elles n'ont
 * rien de serveur — ce sont des données — et la règle d'architecture 1
 * veut que le domaine ne dépende pas de la couche qui l'appelle. Le
 * module serveur les réexporte pour ses appelants.
 * ------------------------------------------------------------------ */

export interface MatiereDeLaPiece {
  /** Le type de pièce, tel que le référentiel le nomme. */
  type: string;
  /** Ce que la pièce doit établir, repris du référentiel. */
  objet: string;
  /** Le pays de destination : les attendus diffèrent fortement (WF-08, étape 1). */
  pays: string;
  /** Les réponses de l'entretien, par rang de question. */
  reponses: Reponses;
  /** Les intitulés, dans l'ordre : la version en tire ses intertitres. */
  questions: readonly {
    readonly rang: number;
    readonly section: string;
    readonly intitule: string;
  }[];
}

export interface TexteProduit {
  /** Le corps entier, paragraphes séparés par une ligne vide. */
  texte: string;
  jetonsEntree: number;
  jetonsSortie: number;
}

export interface RemarqueProduite {
  genre: "INCOHERENCE" | "A_RENFORCER" | "FORME";
  titre: string;
  corps: string;
  ecarts?: readonly [{ source: string; valeur: string }, { source: string; valeur: string }];
}

export interface CritiqueProduite {
  remarques: readonly RemarqueProduite[];
  jetonsEntree: number;
  jetonsSortie: number;
}

/**
 * Le plafond de sortie d'une mise en forme.
 *
 * Une lettre de motivation tient en cinq cents mots, un projet d'études
 * en mille. Le plafond laisse de la marge sans autoriser un texte que
 * personne ne relira : au-delà, ce n'est plus une aide à la rédaction,
 * c'est un devoir à corriger.
 */
export const JETONS_MAXI_REDACTION = 4000;

/** La critique rend une liste courte ; elle n'a pas besoin de plus. */
export const JETONS_MAXI_CRITIQUE = 4000;

/**
 * Au-delà, l'appel est abandonné. Plus large que pour la lecture d'une
 * pièce : un texte s'écrit plus longtemps qu'une date ne se lit, et le
 * candidat attend devant son écran plutôt qu'un worker en file.
 */
export const DELAI_REDACTION_MS = 180_000;

/* ------------------------------------------------------------------ *
 * La mise en forme.
 * ------------------------------------------------------------------ */

/** Les réponses, dans l'ordre des questions, avec l'intitulé qui les a appelées. */
export interface ReponseSituee {
  section: string;
  intitule: string;
  reponse: string;
}

/**
 * Les réponses effectivement données, rattachées à leur question.
 *
 * Une réponse vide est écartée plutôt que transmise vide : la question
 * passée doit rester passée, et présenter « FINANCEMENT : » sans rien
 * derrière invite à combler le vide, ce que l'étape 3 interdit.
 */
export function reponsesSituees(matiere: MatiereDeLaPiece): readonly ReponseSituee[] {
  return matiere.questions
    .map((q) => ({
      section: q.section,
      intitule: q.intitule,
      reponse: (matiere.reponses[q.rang] ?? "").trim(),
    }))
    .filter((r) => r.reponse.length > 0);
}

/**
 * La consigne de mise en forme.
 *
 * Trois interdits, et chacun ferme une façon précise de nuire :
 *
 * - **n'ajoute aucun fait** — c'est ce qui sépare une mise en forme
 *   d'une fabrication, et c'est la pièce que le candidat signera.
 *   Inventer un stage, un montant ou une intention l'expose devant une
 *   administration, et il ne le verra pas s'il découvre le texte écrit.
 * - **ne promets rien** — INV-2 : ni chances, ni garantie, ni
 *   appréciation de l'issue. Le texte part dans un dossier réel.
 * - **écris à la première personne, dans sa langue** — le candidat doit
 *   pouvoir relire une phrase et la reconnaître comme la sienne.
 */
export function instructionsDeRedaction(matiere: MatiereDeLaPiece): string {
  const reponses = reponsesSituees(matiere);
  return [
    `Tu mets en forme une pièce d'un dossier d'immigration : ${matiere.type}.`,
    `Ce que la pièce doit établir : ${matiere.objet}`,
    `Destination du dossier : ${matiere.pays}. Les attendus d'une administration à l'autre diffèrent — écris pour celle-là.`,
    "",
    "Tu pars des réponses ci-dessous, et de rien d'autre.",
    "- N'ajoute aucun fait qui ne s'y trouve pas : ni date, ni montant, ni établissement, ni intention. Le texte sera déposé au nom de cette personne.",
    "- Si une information manque pour un paragraphe, écris le paragraphe plus court plutôt que de le combler.",
    "- Écris à la première personne, en français, dans un registre sobre et direct.",
    "- Ne promets aucun résultat, ne juge pas les chances du dossier, ne t'adresse pas au candidat : tu écris le texte, tu ne le commentes pas.",
    "- Sépare les paragraphes par une ligne vide. Pas de titre général, pas de formule de politesse inventée si elle n'est pas dans les réponses.",
    "",
    "Les réponses :",
    ...reponses.map((r) => `\n[${r.section}] ${r.intitule}\n${r.reponse}`),
  ].join("\n");
}

/**
 * Un texte rendu est-il exploitable ?
 *
 * Un modèle qui n'a rien à dire rend parfois une phrase d'excuse. La
 * prendre pour une version la ferait apparaître dans l'historique du
 * candidat, datée et numérotée, comme un état de son travail.
 */
export const TEXTE_MINIMUM_CARACTERES = 200;

export const texteExploitable = (texte: string): boolean =>
  texte.trim().length >= TEXTE_MINIMUM_CARACTERES;

/* ------------------------------------------------------------------ *
 * L'analyse critique.
 * ------------------------------------------------------------------ */

/** Les genres que la base sait stocker. `INCOHERENCE_DOSSIER` n'en est pas : il se recalcule. */
export const GENRES_PRODUITS = ["INCOHERENCE", "A_RENFORCER", "FORME"] as const;

export type GenreProduit = (typeof GENRES_PRODUITS)[number];

/**
 * Au-delà, ce n'est plus une relecture, c'est une punition.
 *
 * Un candidat qui reçoit vingt remarques n'en traite aucune. La borne
 * est dans la consigne **et** appliquée à la relecture : une consigne
 * qu'on n'applique pas est une intention.
 */
export const REMARQUES_MAXI = 8;

/**
 * La consigne d'analyse.
 *
 * Elle demande ce que le recoupement déterministe ne sait pas faire, et
 * rien de plus : `domain/redaction/coherence.ts` compare déjà ce qui se
 * compare sans modèle — la destination citée, le niveau de langue — et
 * le refaire ici produirait deux fois le même écart, sous deux genres
 * différents.
 */
export function instructionsDeCritique(texte: string, matiere: MatiereDeLaPiece): string {
  return [
    `Tu relis une pièce d'un dossier d'immigration : ${matiere.type}, pour une demande vers ${matiere.pays}.`,
    `Ce que la pièce doit établir : ${matiere.objet}`,
    "",
    "Relève ce qui affaiblit le texte, et rien d'autre.",
    `- Au plus ${REMARQUES_MAXI} remarques. Une relecture qui en rend vingt n'en fait traiter aucune.`,
    "- INCOHERENCE : deux affirmations du texte qui ne peuvent pas être vraies ensemble. Nomme les deux valeurs.",
    "- A_RENFORCER : une affirmation attendue par cette administration que le texte laisse sans appui.",
    "- FORME : une tournure qui nuit à la lecture. Ce genre passe en dernier, et jamais au détriment des deux autres.",
    "",
    "- Chaque remarque dit le constat, puis le geste attendu. « Ce paragraphe est faible » ne se corrige pas ; « tu annonces un financement familial sans dire qui finance » se corrige.",
    "- Ne note pas le texte, ne le classe pas, ne donne aucune appréciation d'ensemble.",
    "- Ne te prononce ni sur la recevabilité du dossier, ni sur les chances d'obtention, ni sur l'issue de la démarche.",
    "- Si le texte ne prête à aucune remarque, rends une liste vide. C'est un résultat, et il sera affiché comme tel.",
    "",
    "Le texte :",
    "",
    texte,
  ].join("\n");
}

/**
 * Le schéma de la réponse.
 *
 * Fermé sur les trois genres et sur les champs attendus. `ecarts` n'est
 * demandé que pour ce qu'il sert : une incohérence nomme les deux
 * valeurs qui divergent, sans quoi le candidat ne sait pas laquelle des
 * deux corriger (RG-08.3).
 */
export function schemaDeLaCritique(): Record<string, unknown> {
  const ecart = {
    type: "object",
    additionalProperties: false,
    required: ["source", "valeur"],
    properties: {
      source: { type: "string", description: "Le passage du texte qui porte la valeur." },
      valeur: { type: "string", description: "La valeur telle qu'elle est écrite." },
    },
  };
  return {
    type: "object",
    additionalProperties: false,
    required: ["remarques"],
    properties: {
      remarques: {
        type: "array",
        maxItems: REMARQUES_MAXI,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["genre", "titre", "corps", "ecarts"],
          properties: {
            genre: { type: "string", enum: [...GENRES_PRODUITS] },
            titre: {
              type: "string",
              description: "Le constat en une ligne, sans jugement de valeur.",
            },
            corps: {
              type: "string",
              description: "Le constat, puis le geste attendu. Jamais une appréciation seule.",
            },
            ecarts: {
              type: ["array", "null"],
              minItems: 2,
              maxItems: 2,
              items: ecart,
              description:
                "Les deux valeurs qui divergent, sur une INCOHERENCE. Null pour les autres genres.",
            },
          },
        },
      },
    },
  };
}

const estObjet = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const lireLEcart = (v: unknown): { source: string; valeur: string } | null => {
  if (!estObjet(v)) return null;
  const { source, valeur } = v;
  return typeof source === "string" && typeof valeur === "string" ? { source, valeur } : null;
};

/**
 * Relit la charge sans lui faire confiance.
 *
 * Le schéma est annoncé à l'appel ; il n'est pas une garantie que ce
 * module peut invoquer. Une remarque mal formée est **écartée**, et non
 * réparée : une remarque sans corps ne dirait rien au candidat, et une
 * incohérence sans ses deux valeurs retomberait dans le « document non
 * conforme » que la doctrine d'erreur du projet interdit.
 *
 * Une liste vide est rendue telle quelle. C'est un résultat — « relu,
 * rien à reprendre » — et c'est précisément la distinction que ce lot
 * existe pour rétablir.
 */
export function lireLaCritique(
  charge: unknown,
): readonly RemarqueProduite[] | { cause: CauseDAppel } {
  if (!estObjet(charge)) return { cause: "reponse_illisible" };
  const brutes = charge.remarques;
  if (!Array.isArray(brutes)) return { cause: "reponse_illisible" };

  const remarques: RemarqueProduite[] = [];
  for (const brute of brutes.slice(0, REMARQUES_MAXI)) {
    if (!estObjet(brute)) continue;
    const { genre, titre, corps } = brute;
    if (typeof genre !== "string" || !(GENRES_PRODUITS as readonly string[]).includes(genre)) {
      continue;
    }
    if (typeof titre !== "string" || titre.trim() === "") continue;
    if (typeof corps !== "string" || corps.trim() === "") continue;

    const paire = Array.isArray(brute.ecarts) && brute.ecarts.length === 2
      ? ([lireLEcart(brute.ecarts[0]), lireLEcart(brute.ecarts[1])] as const)
      : null;

    // Une incohérence sans ses deux valeurs n'est pas une incohérence
    // qu'on peut présenter : elle dit qu'il y a un écart sans dire lequel.
    if (genre === "INCOHERENCE" && !(paire?.[0] && paire[1])) continue;

    remarques.push({
      genre: genre as GenreProduit,
      titre: titre.trim(),
      corps: corps.trim(),
      ...(paire?.[0] && paire[1] ? { ecarts: [paire[0], paire[1]] as const } : {}),
    });
  }
  return remarques;
}
