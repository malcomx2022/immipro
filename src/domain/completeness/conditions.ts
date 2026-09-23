import type { ConditionInput } from "./score";

/**
 * Conditions déterministes d'une règle figée, évaluées une seule fois —
 * RG-07.1, INV-3.
 *
 * ── Deux calculs de la même chose, et un seul voyait les conditions ──
 *
 * `completudeDesPieces` appelait `computeCompleteness` avec
 * `conditions: []`, en dur. `recalculerCompletude`, côté serveur, les
 * évaluait pour de bon et décidait le passage à `PRET`. Les deux
 * prétendaient répondre à « le dossier est-il prêt ? », et l'un ignorait
 * la moitié de la question.
 *
 * Exécuté avant correction, sur un dossier dont **toutes** les pièces sont
 * conformes et dont la règle figée porte une condition bloquante qu'aucune
 * pièce n'établit :
 *
 *     la vue candidat  : palier COMPLET, ready true, missing []
 *                        « Rien ne bloque un dépôt. »
 *     la base          : ACTIF — le serveur a refusé de le déclarer prêt
 *
 * Le candidat lit que rien ne bloque son dépôt sur le seul dossier que la
 * plateforme ne le laissera pas déposer : `declarerLeDepot` n'accepte que
 * `PRET`. Le commentaire de `completudeDesPieces` promettait pourtant que
 * « le tableau de bord, la checklist et l'écran de complétude comptent la
 * même chose ». Ils comptaient bien la même chose — entre eux. Aucun ne
 * comptait comme la base.
 *
 * ── Ce que la lecture défensive permet ──────────────────────────────
 *
 * La règle figée est lue comme `delaiInstructionJours` la lit : sans
 * repasser le schéma. Une règle gelée par un dossier ouvert avant une
 * évolution du référentiel doit rester lisible (INV-3), et une vue
 * candidat n'a pas à échouer parce qu'un champ a changé de forme.
 */
export interface ConditionDuDossier {
  code: string;
  bloquant: boolean;
  message_echec: string;
  /** La pièce qui l'établit. Absente, aucun dépôt ne la satisfait. */
  piece?: string;
}

const texte = (valeur: unknown): string | undefined =>
  typeof valeur === "string" && valeur.length > 0 ? valeur : undefined;

/** Les conditions d'une règle figée, lues sans repasser le schéma. */
export function conditionsDeLaRegle(rules: unknown): ConditionDuDossier[] {
  if (typeof rules !== "object" || rules === null) return [];
  const brutes = (rules as Record<string, unknown>).conditions;
  if (!Array.isArray(brutes)) return [];

  const lues: ConditionDuDossier[] = [];
  for (const brute of brutes) {
    if (typeof brute !== "object" || brute === null) continue;
    const champ = brute as Record<string, unknown>;
    const code = texte(champ.code);
    if (code === undefined) continue;
    lues.push({
      code,
      bloquant: champ.bloquant === true,
      message_echec: texte(champ.message_echec) ?? "",
      ...(texte(champ.piece) !== undefined ? { piece: texte(champ.piece)! } : {}),
    });
  }
  return lues;
}

/**
 * Une condition est tenue dès que **la pièce qui la porte** est conforme.
 *
 * Laquelle, c'est le référentiel qui le dit — le rapprochement par
 * préfixes de codes se trompait sur la procédure kennismigrant, où les
 * conditions s'appellent `salaire_min_moins_30_ans` et la pièce
 * `contrat_travail`.
 *
 * Sans pièce déclarée, la condition n'est tenue par aucun dépôt. C'est la
 * réponse prudente, et elle décide différemment selon le caractère
 * bloquant : voir `conditionsEvaluees`.
 */
export const conditionTenue = (
  condition: Pick<ConditionDuDossier, "piece">,
  conformes: ReadonlySet<string>,
): boolean => (condition.piece === undefined ? false : conformes.has(condition.piece));

/**
 * Les conditions qui pèsent sur ce que le candidat peut faire aujourd'hui.
 *
 * Une condition **facultative sans pièce** est écartée : elle ne s'établit
 * par aucun dépôt — une carence de travail après l'arrivée, une
 * progression de crédits signalée en cours d'année — et la compter non
 * satisfaite ferait porter au candidat un manque qu'aucun geste ne lève.
 *
 * Une **bloquante** sans pièce reste comptée non satisfaite. L'écarter
 * reviendrait à déclarer un dossier prêt sur une exigence que personne n'a
 * vérifiée. Elle ne devrait plus se produire — la publication d'une règle
 * la refuse — et ne subsiste que sur une règle figée avant cette garde.
 */
/**
 * Les codes **du référentiel** des pièces conformes.
 *
 * Il se construit depuis les documents, jamais depuis les `Piece` d'un
 * écran : `Piece.code` est une pastille de trois lettres — `passeport` y
 * devient `PAS` — et rapprocher l'une de l'autre ne rapproche rien.
 */
export const codesConformes = (
  documents: readonly { code: string; status: string }[],
): ReadonlySet<string> =>
  new Set(documents.filter((d) => d.status === "CONFORME").map((d) => d.code));

export function conditionsEvaluees(
  rules: unknown,
  conformes: ReadonlySet<string>,
): ConditionInput[] {
  return conditionsDeLaRegle(rules)
    .filter((c) => c.piece !== undefined || c.bloquant)
    .map((c) => ({
      code: c.code,
      bloquant: c.bloquant,
      satisfaite: conditionTenue(c, conformes),
      messageEchec: c.message_echec,
    }));
}
