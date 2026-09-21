import type { Reponses } from "@/domain/redaction/entretien";

/**
 * La mise en forme et l'analyse critique — R-03 et R-04, WF-08.
 *
 * **Ni l'une ni l'autre n'est branchée, et rien ne les simule.** C'est la
 * règle d'I.C, appliquée à la sixième dépendance du registre : un
 * `NON_BRANCHE` qui rendrait un texte ferait apparaître des versions que
 * personne n'a écrites, sous une pièce qu'un candidat déposera en son nom.
 *
 * Les deux vivent ici parce qu'elles emploient la même clé, et nulle part
 * ailleurs parce qu'elles ne font pas le même métier : se tromper sur un
 * paragraphe est un défaut de rédaction, ne pas voir une incohérence entre
 * deux pièces est un défaut de lecture. Le registre les sépare déjà
 * d'`extraction`, qui lit les pièces déposées.
 *
 * Ce qui est écrit ici est ce qui peut l'être sans la clé : les deux points
 * de branchement, et la forme exacte de ce qu'ils rendront. Le jour où
 * `ANTHROPIC_API_KEY` existe, ce sont ces deux fonctions qu'on remplace, et
 * rien d'autre.
 */

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
  questions: readonly { readonly rang: number; readonly section: string; readonly intitule: string }[];
}

export interface TexteProduit {
  /** Le corps entier, paragraphes séparés par une ligne vide. */
  texte: string;
  jetonsEntree: number;
  jetonsSortie: number;
}

/**
 * Rend la première version, ou `null` si elle n'a pas pu être produite —
 * service absent, appel en échec, réponse inattendue.
 *
 * `null` n'est pas « le texte est vide » : c'est « aucun texte n'a été
 * écrit ». Les deux se ressemblent à l'écran, et c'est précisément ce que
 * R-03 confondait — une pièce jamais mise en forme s'y présentait comme
 * une pièce dont l'éditeur n'avait rien à montrer.
 */
export type Redacteur = (matiere: MatiereDeLaPiece) => Promise<TexteProduit | null>;

export const REDACTEUR_NON_BRANCHE: Redacteur = async () => null;

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
 * Rend l'analyse d'une version, ou `null` si elle n'a pas eu lieu.
 *
 * La distinction porte tout R-04 : `{ remarques: [] }` veut dire « relu,
 * rien à reprendre », `null` veut dire « pas relu ». L'écran affichait le
 * premier message dans les deux cas, alors qu'aucune analyse n'avait jamais
 * tourné — un avis rassurant rendu sans avoir lu.
 */
export type Critique = (
  texte: string,
  matiere: MatiereDeLaPiece,
) => Promise<CritiqueProduite | null>;

export const CRITIQUE_NON_BRANCHEE: Critique = async () => null;

/** La clé sans laquelle ni l'une ni l'autre ne tourne. */
export const VARIABLES = ["ANTHROPIC_API_KEY"];

export const redactionConfiguree = (
  environnement: Readonly<Record<string, string | undefined>> = process.env,
): boolean => VARIABLES.every((v) => (environnement[v] ?? "").trim() !== "");
