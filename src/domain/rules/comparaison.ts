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
 * ── Le délai d'instruction, qui ne décide pas de l'éligibilité ──────
 *
 * Il n'entrait pas non plus dans la comparaison, et pour une raison qui
 * se tenait : un délai qui s'allonge ne rend personne inéligible. Mais il
 * déplace **toutes** les dates du dossier. L'échéancier se calcule à
 * rebours depuis la date cible, en retirant le délai d'instruction : de 90
 * à 150 jours, la date de dépôt avance de deux mois. Exécuté avant
 * correction, sur un dossier visant la rentrée du 1er septembre 2027 :
 *
 *     v1 delai_traitement_jours.max = 90
 *     v2 delai_traitement_jours.max = 150
 *     impact = MINEUR      diff = []
 *     bilan  = {"dossiers":0,"alertes":0,…}
 *     notifications reçues par le candidat : 0
 *     dépôt : 2027-06-03 — inchangé
 *     ce qu'il devrait être sur 150 jours : 2027-04-04
 *
 * Soixante jours de retard que personne ne signale, sur ce que RG-09.3
 * nomme : « un délai réglementaire modifié déclenche un recalcul intégral
 * de l'échéancier et une notification explicite. »
 *
 * Il entre donc au diff, et il n'entre pas dans `bloquantesTouchees` : ce
 * n'est pas une condition, WF-14 §4 ne le vise pas. L'impact reste
 * `MAJEUR` — notification et proposition de migration —, jamais
 * `CRITIQUE` : mettre un dossier en pause parce que l'autorité annonce
 * deux mois de plus retirerait au candidat la seule chose qui lui reste,
 * le temps de s'organiser.
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
  /**
   * Le délai d'instruction, quand il a bougé. C'est ce champ — et non
   * l'impact — qui fait dire à l'alerte ce que le calendrier devient :
   * RG-09.3 demande une notification « explicite », et « une exigence a
   * changé » ne dit pas qu'il faut déposer deux mois plus tôt.
   */
  delaiDInstruction: EvolutionDuDelai | null;
  /**
   * Les pièces obligatoires qu'une version exige et pas l'autre, avec leur
   * libellé.
   *
   * Le diff les portait déjà, mais sous forme de `piece.<code>` : un code
   * de référentiel, que l'écran d'arbitrage ne peut pas montrer à un
   * candidat. Il ne montrait donc rien — « ta checklist passe à la version
   * 5 » nommait la checklist sans nommer une seule de ses lignes, et le
   * candidat découvrait ce qu'il devait fournir **après** avoir tranché.
   */
  piecesTouchees: EvolutionDesPieces;
}

/** Une pièce, telle qu'elle se montre — son code ne sort jamais à l'écran. */
export interface PieceNommee {
  code: string;
  libelle: string;
}

export interface EvolutionDesPieces {
  /** Obligatoires dans la nouvelle version et pas dans l'ancienne. */
  ajoutees: readonly PieceNommee[];
  /**
   * Obligatoires dans l'ancienne et plus dans la nouvelle. `encoreDemandee`
   * distingue les deux façons de sortir : une pièce qui devient
   * complémentaire reste à fournir si on veut, une pièce disparue ne se
   * demande plus du tout. Les confondre ferait jeter un document qu'on
   * pouvait encore joindre.
   */
  retirees: readonly (PieceNommee & { encoreDemandee: boolean })[];
  /**
   * Présentes dans les deux versions, avec une **durée de validité**
   * différente — RG-06.6.
   *
   * Elle ne figurait nulle part dans la comparaison, et la conséquence
   * n'était pas seulement un écran muet : une version qui ne change que
   * cela donnait `impact: MINEUR` et un diff vide, donc aucune divergence,
   * aucune notification, et un dossier qui gardait l'ancienne durée pour
   * toujours.
   *
   * Le sens n'est pas symétrique. Une durée **allongée** laisse demander
   * la pièce plus tôt ; une durée **raccourcie** fait qu'une pièce
   * obtenue à la date que l'échéancier annonçait est périmée le jour du
   * dépôt — obtenue dans les temps, et refusée.
   */
  validites: readonly (PieceNommee & { avant: number | null; apres: number | null })[];
}

/** Fourchette de jours annoncée par l'autorité, ou son absence. */
export type Delai = { min: number; max: number } | null;

export interface EvolutionDuDelai {
  avant: Delai;
  apres: Delai;
  /**
   * Jours dont la date de dépôt de l'échéancier **avance**. Positif quand
   * le délai s'allonge, négatif quand il raccourcit.
   *
   * C'est le maximum qui compte, et non la moyenne de la fourchette :
   * `echeancesDepuis` calcule à rebours depuis le pire des deux, parce
   * qu'un échéancier construit sur le meilleur fait arriver en retard une
   * fois sur deux.
   */
  joursDAvance: number;
}

/** Aucune des deux versions ne pose ce qui suit. */
const VIDE: Comparaison = {
  impact: "MINEUR",
  diff: [],
  bloquantesTouchees: [],
  delaiDInstruction: null,
  piecesTouchees: { ajoutees: [], retirees: [], validites: [] },
};

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

  /*
    Les pièces obligatoires. Le delta se calcule une fois, avec les
    libellés, et le diff en dérive — l'écran d'arbitrage a besoin des deux
    et ne peut pas reconstruire un libellé depuis `piece.<code>`.
  */
  const piecesTouchees = evolutionDesPieces(avant, apres);
  for (const piece of piecesTouchees.ajoutees) {
    diff.push({ champ: `piece.${piece.code}`, avant: null, apres: "obligatoire" });
  }
  for (const piece of piecesTouchees.retirees) {
    diff.push({ champ: `piece.${piece.code}`, avant: "obligatoire", apres: null });
  }
  /*
    Une durée de validité qui bouge entre au diff comme le délai
    d'instruction : elle gêne — elle déplace la date à laquelle demander
    la pièce —, elle ne rend pas inéligible. Donc `MAJEUR`, jamais
    `CRITIQUE`. Sans cette ligne, une version qui ne change que cela
    sortait en `MINEUR` avec un diff vide, et la propagation passait son
    chemin sans prévenir personne.
  */
  for (const piece of piecesTouchees.validites) {
    diff.push({
      champ: `piece.${piece.code}.validite_mois`,
      avant: piece.avant,
      apres: piece.apres,
    });
  }

  /*
    Le délai d'instruction — RG-09.3.

    Il entre au diff comme les autres, mais il ressort en plus tel quel :
    l'alerte doit pouvoir dire « de 90 à 150 jours » et « ta date de dépôt
    avance de 60 jours », ce qu'un `{ champ, avant, apres }` de texte ne
    permet pas de recalculer sans le reparser.
  */
  const delaiDInstruction = evolutionDuDelai(
    avant.delai_traitement_jours,
    apres.delai_traitement_jours,
  );
  if (delaiDInstruction) {
    diff.push({
      champ: "delai_traitement_jours",
      avant: delaiLisible(delaiDInstruction.avant),
      apres: delaiLisible(delaiDInstruction.apres),
    });
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

  return {
    impact,
    diff,
    bloquantesTouchees: [...bloquantesTouchees],
    delaiDInstruction,
    piecesTouchees,
  };
}

/**
 * Ce que les deux versions exigent et que l'autre n'exige pas.
 *
 * Seules les **obligatoires** comptent : une pièce complémentaire qui
 * apparaît n'oblige à rien, et l'annoncer comme un changement apprendrait
 * à ignorer les annonces suivantes.
 *
 * Une pièce peut sortir de deux façons, et le mot n'est pas le même :
 * devenue complémentaire, elle reste joignable ; disparue, elle ne se
 * demande plus. `encoreDemandee` porte la distinction.
 */
function evolutionDesPieces(
  avant: VisaRulesPayload,
  apres: VisaRulesPayload,
): EvolutionDesPieces {
  const obligatoires = (p: VisaRulesPayload) =>
    new Map(p.pieces_requises.filter((x) => x.obligatoire).map((x) => [x.code, x.libelle]));
  const codesApres = new Set(apres.pieces_requises.map((p) => p.code));
  const avantObl = obligatoires(avant);
  const apresObl = obligatoires(apres);

  /*
    La validité se compare sur les pièces des **deux** versions, sans
    filtre d'obligation : une pièce complémentaire périssable porte elle
    aussi une échéance « à demander au plus tôt », et l'obtenir trop tôt
    la rend inutilisable de la même façon.
  */
  const validiteAvant = new Map(
    avant.pieces_requises.map((x) => [x.code, x.validite_mois ?? null]),
  );

  return {
    ajoutees: [...apresObl]
      .filter(([code]) => !avantObl.has(code))
      .map(([code, libelle]) => ({ code, libelle })),
    retirees: [...avantObl]
      .filter(([code]) => !apresObl.has(code))
      .map(([code, libelle]) => ({ code, libelle, encoreDemandee: codesApres.has(code) })),
    validites: apres.pieces_requises
      .filter((x) => validiteAvant.has(x.code))
      .map((x) => ({
        code: x.code,
        libelle: x.libelle,
        avant: validiteAvant.get(x.code) ?? null,
        apres: x.validite_mois ?? null,
      }))
      .filter((x) => x.avant !== x.apres),
  };
}

/**
 * Le délai a-t-il bougé, et de combien la date de dépôt avance-t-elle ?
 *
 * `null` quand il n'a pas bougé. Une fourchette qui apparaît ou disparaît
 * en est une évolution : `echeancesDepuis` ne pose pas d'échéance de dépôt
 * quand le référentiel n'annonce aucun délai, et le calendrier du candidat
 * change donc du tout au tout.
 */
function evolutionDuDelai(avant: Delai, apres: Delai): EvolutionDuDelai | null {
  if (avant === null && apres === null) return null;
  if (avant?.min === apres?.min && avant?.max === apres?.max) return null;
  return { avant, apres, joursDAvance: (apres?.max ?? 0) - (avant?.max ?? 0) };
}

/**
 * « 60–90 jours », ou l'absence, pour que le diff se lise sans le schéma.
 *
 * Le tiret plutôt que « à » : la mention compose « passe de … à … », et
 * « passe de 60 à 90 jours à 60 à 150 jours » ne se lit pas.
 *
 * Exporté parce que l'écran d'arbitrage T-02 affiche le même délai sur ses
 * deux cartes de version : deux façons d'écrire une fourchette de jours
 * dans le même produit finiraient par diverger, et c'est au moment de
 * comparer deux versions que l'écart se remarquerait.
 */
export const delaiLisible = (delai: Delai): string =>
  delai === null
    ? "non annoncé"
    : delai.min === delai.max
      ? `${delai.max} jours`
      : `${delai.min}–${delai.max} jours`;

/**
 * Ce que l'alerte ajoute quand le délai a bougé — RG-09.3, « notification
 * explicite ».
 *
 * Elle nomme le nouveau délai **et** ce qu'il fait à la date de dépôt.
 * L'un sans l'autre laisse le calcul au candidat : « le délai passe à 150
 * jours » n'apprend rien à qui ne sait pas que son échéancier se construit
 * à rebours.
 *
 * Elle dit aussi que rien n'a encore bougé chez lui. INV-3 fige sa version
 * tant qu'il n'a pas tranché, et une phrase qui annonce un calendrier déjà
 * décalé lui ferait chercher des dates qu'il ne verra pas.
 */
export function mentionDuDelai(evolution: EvolutionDuDelai): string {
  const { avant, apres, joursDAvance } = evolution;

  if (apres === null) {
    return "L'autorité n'annonce plus de délai d'instruction. Si tu appliques cette version, l'échéancier ne place plus de date de dépôt : c'est à toi de la fixer.";
  }
  if (avant === null) {
    return `L'autorité annonce désormais un délai d'instruction de ${delaiLisible(apres)}. Si tu appliques cette version, ton échéancier place une date de dépôt à rebours de ta date cible.`;
  }

  const socle = `Le délai d'instruction annoncé passe de ${delaiLisible(avant)} à ${delaiLisible(apres)}.`;
  if (joursDAvance === 0) {
    // Seul le plancher a bougé : l'échéancier se construit sur le plafond.
    return `${socle} Ta date de dépôt ne change pas : elle se calcule sur le délai le plus long.`;
  }
  const jours = Math.abs(joursDAvance);
  const pluriel = jours > 1 ? "jours" : "jour";
  return joursDAvance > 0
    ? `${socle} Si tu appliques cette version, ta date de dépôt avance de ${jours} ${pluriel} : il faut déposer plus tôt pour la même date cible.`
    : `${socle} Si tu appliques cette version, ta date de dépôt recule de ${jours} ${pluriel} : tu disposes d'autant de temps en plus pour réunir tes pièces.`;
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
