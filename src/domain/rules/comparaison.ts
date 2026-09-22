import type { VisaRulesPayload } from "./schema";

/**
 * Ce qui sépare deux versions d'une règle — WF-11 étapes 1 et 3, WF-14 §4.
 *
 * ── Ce que la comparaison ne voyait pas ─────────────────────────────
 *
 * Elle comparait les **codes** des conditions bloquantes : apparition,
 * disparition. Jamais leur valeur. Un seuil qui passe de 4 357 € à 1 000 €
 * garde son code, et la comparaison rendait donc `MINEUR` avec un diff
 * vide — sur quoi `propagerLaPublication` sort immédiatement et **aucun
 * dossier n'est prévenu**.
 *
 * C'est le changement réglementaire le plus attendu du produit qui passait
 * ainsi : DOC-11 nomme le cas — « Majeur | **Seuil** ou pièce obligatoire
 * modifié » — et RG-14.3 dit pourquoi il reviendra : « les montants IND
 * changent au 1er janvier ».
 *
 * ── Durcir n'est pas assouplir ──────────────────────────────────────
 *
 * Les deux sens d'un même changement ne se traitent pas de la même façon.
 * Un seuil **relevé** fait perdre l'éligibilité à qui l'atteignait tout
 * juste : c'est le cas critique, celui qui met le dossier en pause et
 * déclenche un email nominatif. Un seuil **abaissé** ne retire rien ; il
 * appelle une notification et une proposition de migration.
 *
 * Quand les deux versions ne s'ordonnent pas — l'opérateur change, l'unité
 * change, la condition devient bloquante, elle quitte son groupe
 * d'alternatives —, la réponse prudente est celle qui prévient : on tient
 * le changement pour un durcissement. Se tromper dans ce sens fait lire un
 * message de trop ; se tromper dans l'autre laisse quelqu'un déposer sous
 * une exigence qu'il ne remplit plus.
 *
 * ── Ce qui n'est pas une modification ───────────────────────────────
 *
 * `message_echec` est le texte que le candidat lit quand la condition
 * échoue. Le réécrire ne change aucune exigence, et faire partir une
 * alerte à tous les dossiers ouverts parce qu'une phrase a été clarifiée
 * apprendrait à ignorer les suivantes.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type Impact = "MINEUR" | "MAJEUR" | "CRITIQUE";

export interface Changement {
  champ: string;
  avant: unknown;
  apres: unknown;
}

type Condition = VisaRulesPayload["conditions"][number];

export interface Comparaison {
  impact: Impact;
  diff: Changement[];
  /**
   * Les codes des conditions bloquantes qu'une des deux versions porte et
   * que l'autre ne porte pas à l'identique. C'est cette liste — et non
   * l'impact — qui décide de la relecture par un second opérateur : WF-14
   * §4 la demande pour **toute** modification, durcissante ou non.
   */
  bloquantesTouchees: readonly string[];
}

/** Aucune des deux versions ne pose ce qui suit. */
const VIDE: Comparaison = { impact: "MINEUR", diff: [], bloquantesTouchees: [] };

const parCode = (conditions: readonly Condition[]): Map<string, Condition> =>
  new Map(conditions.map((c) => [c.code, c]));

const memeValeur = (a: Condition["valeur"], b: Condition["valeur"]): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Le nouveau seuil est-il plus exigeant que l'ancien ?
 *
 * `null` quand les deux ne s'ordonnent pas : l'appelant tient alors le
 * changement pour un durcissement, faute de savoir.
 */
function plusExigeant(avant: Condition, apres: Condition): boolean | null {
  if (avant.operateur !== apres.operateur) return null;
  if ((avant.unite ?? null) !== (apres.unite ?? null)) return null;

  switch (apres.operateur) {
    case "gte":
      return typeof avant.valeur === "number" && typeof apres.valeur === "number"
        ? apres.valeur > avant.valeur
        : null;
    case "lte":
      return typeof avant.valeur === "number" && typeof apres.valeur === "number"
        ? apres.valeur < avant.valeur
        : null;
    case "in": {
      // Une option retirée ferme une porte ; une option ajoutée en ouvre une.
      if (!Array.isArray(avant.valeur) || !Array.isArray(apres.valeur)) return null;
      const restantes = new Set(apres.valeur);
      return avant.valeur.some((v) => !restantes.has(v));
    }
    case "eq":
    case "exists":
      // Rien à ordonner : « exactement ceci » remplacé par « exactement
      // cela » peut fermer la porte à qui remplissait le premier.
      return memeValeur(avant.valeur, apres.valeur) ? false : null;
    default: {
      const jamais: never = apres.operateur;
      throw new Error(`Opérateur non arbitré : ${JSON.stringify(jamais)}`);
    }
  }
}

/**
 * La condition a-t-elle changé d'exigence ? Et ce changement durcit-il ?
 *
 * `null` en première position veut dire « inchangée ». Le `message_echec`
 * n'entre pas dans la comparaison.
 */
function evolution(
  avant: Condition,
  apres: Condition,
): { champ: string; avant: unknown; apres: unknown; durcit: boolean } | null {
  if (avant.bloquant !== apres.bloquant) {
    return {
      champ: `condition.${apres.code}.bloquant`,
      avant: avant.bloquant,
      apres: apres.bloquant,
      // Devenir bloquante ferme une porte ; cesser de l'être en ouvre une.
      durcit: apres.bloquant,
    };
  }
  if ((avant.alternative ?? null) !== (apres.alternative ?? null)) {
    return {
      champ: `condition.${apres.code}.alternative`,
      avant: avant.alternative ?? null,
      apres: apres.alternative ?? null,
      // Quitter un groupe rend la condition exigible seule ; le rejoindre
      // la rend satisfaisable par un autre de ses membres.
      durcit: apres.alternative === undefined,
    };
  }
  if ((avant.piece ?? null) !== (apres.piece ?? null)) {
    return {
      champ: `condition.${apres.code}.piece`,
      avant: avant.piece ?? null,
      apres: apres.piece ?? null,
      // Changer de pièce porteuse change qui l'établit, pas le niveau
      // d'exigence. La checklist bouge, l'éligibilité non.
      durcit: false,
    };
  }
  if (
    avant.operateur !== apres.operateur ||
    (avant.unite ?? null) !== (apres.unite ?? null) ||
    !memeValeur(avant.valeur, apres.valeur)
  ) {
    const ordre = plusExigeant(avant, apres);
    return {
      champ: `condition.${apres.code}.valeur`,
      avant: seuilLisible(avant),
      apres: seuilLisible(apres),
      durcit: ordre ?? true,
    };
  }
  return null;
}

/** « ≥ 4357 EUR_brut_mensuel », pour que le diff se lise sans le schéma. */
const seuilLisible = (c: Condition): string => {
  const signe = { gte: "≥", lte: "≤", eq: "=", in: "parmi", exists: "présent" }[c.operateur];
  const valeur = Array.isArray(c.valeur) ? c.valeur.join(", ") : String(c.valeur);
  return c.unite ? `${signe} ${valeur} ${c.unite}` : `${signe} ${valeur}`;
};

/**
 * Comparaison de deux versions.
 *
 * Seules les conditions bloquantes et les pièces obligatoires décident de
 * l'impact : un délai de traitement qui s'allonge gêne, il ne rend pas
 * inéligible.
 */
export function comparerLesVersions(
  avant: VisaRulesPayload,
  apres: VisaRulesPayload,
): Comparaison {
  const diff: Changement[] = [];
  const bloquantesTouchees = new Set<string>();
  let durcissement = false;

  const conditionsAvant = parCode(avant.conditions);
  const conditionsApres = parCode(apres.conditions);

  for (const [code, condition] of conditionsApres) {
    const ancienne = conditionsAvant.get(code);
    if (!ancienne) {
      if (!condition.bloquant) continue;
      diff.push({ champ: `condition.${code}`, avant: null, apres: "exigée" });
      bloquantesTouchees.add(code);
      // Une exigence nouvelle se satisfait — on fournit la pièce. Elle ne
      // retire pas l'éligibilité de la façon dont un seuil relevé le fait.
      continue;
    }
    const bouge = evolution(ancienne, condition);
    if (!bouge) continue;
    diff.push({ champ: bouge.champ, avant: bouge.avant, apres: bouge.apres });
    if (ancienne.bloquant || condition.bloquant) {
      bloquantesTouchees.add(code);
      if (bouge.durcit) durcissement = true;
    }
  }

  for (const [code, condition] of conditionsAvant) {
    if (conditionsApres.has(code) || !condition.bloquant) continue;
    diff.push({ champ: `condition.${code}`, avant: "exigée", apres: null });
    bloquantesTouchees.add(code);
    /*
      Une condition bloquante qui disparaît est traitée comme critique :
      un dispositif supprimé fait perdre l'éligibilité aussi sûrement
      qu'un seuil relevé, et c'est le comportement retenu depuis le
      premier jour.
    */
    durcissement = true;
  }

  const obligatoiresAvant = new Set(
    avant.pieces_requises.filter((p) => p.obligatoire).map((p) => p.code),
  );
  const obligatoiresApres = new Set(
    apres.pieces_requises.filter((p) => p.obligatoire).map((p) => p.code),
  );
  for (const code of obligatoiresApres) {
    if (!obligatoiresAvant.has(code)) {
      diff.push({ champ: `piece.${code}`, avant: null, apres: "obligatoire" });
    }
  }
  for (const code of obligatoiresAvant) {
    if (!obligatoiresApres.has(code)) {
      diff.push({ champ: `piece.${code}`, avant: "obligatoire", apres: null });
    }
  }

  const fondsAvant = avant.preuve_fonds?.valeur ?? null;
  const fondsApres = apres.preuve_fonds?.valeur ?? null;
  if (fondsAvant !== fondsApres) {
    diff.push({ champ: "preuve_fonds", avant: fondsAvant, apres: fondsApres });
  }

  if (avant.niveau_langue_min !== apres.niveau_langue_min) {
    diff.push({
      champ: "niveau_langue_min",
      avant: avant.niveau_langue_min,
      apres: apres.niveau_langue_min,
    });
  }

  const dispositifPerdu =
    avant.apres_etudes?.dispositif != null && apres.apres_etudes?.dispositif == null;

  const impact: Impact =
    dispositifPerdu || durcissement ? "CRITIQUE" : diff.length > 0 ? "MAJEUR" : "MINEUR";

  return { impact, diff, bloquantesTouchees: [...bloquantesTouchees] };
}

export const comparaisonVide = (): Comparaison => ({ ...VIDE });

/**
 * WF-14 §4 : « Relecture par un second opérateur pour toute modification
 * de condition bloquante. »
 *
 * Le contrôle porte sur **toute** modification, pas seulement sur celles
 * qui durcissent : abaisser un seuil de 4 357 € à 1 000 € n'enlève
 * l'éligibilité à personne, et ouvre une procédure à des dossiers qu'elle
 * n'aurait pas dû accueillir. Les deux sens méritent deux paires d'yeux.
 */
export const relectureExigee = (comparaison: Comparaison): boolean =>
  comparaison.bloquantesTouchees.length > 0;

/**
 * Ce que le refus dit à l'opérateur. Il nomme la condition et le
 * changement : « la publication est refusée » seul n'apprend rien.
 */
export function motifDeRelecture(comparaison: Comparaison): string {
  const touchees = comparaison.bloquantesTouchees;
  const nommees = touchees.slice(0, 3).join(", ");
  const reste = touchees.length > 3 ? `, et ${touchees.length - 3} autre(s)` : "";
  return (
    `Cette version modifie ${touchees.length > 1 ? "des conditions bloquantes" : "une condition bloquante"} ` +
    `(${nommees}${reste}). WF-14 demande qu'un second opérateur la relise : ` +
    `demande à un autre administrateur de publier, ou fais relire avant de reprendre la main.`
  );
}
