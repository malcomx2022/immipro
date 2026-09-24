import type { DocumentState } from "@/domain/completeness/score";

/**
 * Vérifications déterministes — WF-06 étape 6, RG-06.1 et RG-06.3.
 *
 * « Tout ce qui est vérifiable sans IA l'est sans IA. » Une validité de
 * passeport est une soustraction de dates, un seuil de fonds est une
 * comparaison de nombres. Les confier à un modèle, c'est accepter qu'elles
 * soient fausses de temps en temps, sur des décisions qui font rater un
 * départ. Le modèle lit le document ; ce fichier juge.
 *
 * Le message suit la doctrine d'erreur du projet : **la mesure constatée,
 * l'exigence, puis le geste**. « Ton passeport expire dans 4 mois, il en
 * faut 6 » se corrige ; « document non conforme » ne se corrige pas.
 * L'exigence et le geste viennent du référentiel (`message_echec`), la
 * mesure vient de la pièce — aucun des deux ne suffit seul.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type Operateur = "gte" | "lte" | "eq" | "in" | "exists";

export interface Condition {
  code: string;
  operateur: Operateur;
  valeur: number | string | string[];
  unite?: string | undefined;
  message_echec: string;
  bloquant: boolean;
  /**
   * La pièce qui établit la condition. Déclarée par le référentiel, jamais
   * devinée — voir `domain/rules/schema.ts` pour ce que la devinette
   * coûtait.
   */
  piece?: string | undefined;
  /** Groupe d'alternatives : satisfaire l'un satisfait le groupe. */
  alternative?: string | undefined;
}

/**
 * Les conditions qu'une pièce établit.
 *
 * **Une seule implémentation de cette relation**, et c'est le correctif.
 * Il y en avait deux — l'une dans le job d'analyse, l'autre dans le calcul
 * de complétude — écrites différemment, comparant des préfixes de codes.
 * Deux réponses possibles à la même question, et aucune des deux juste.
 */
export const conditionsDeLaPiece = (
  conditions: readonly Condition[],
  codePiece: string,
): readonly Condition[] => conditions.filter((c) => c.piece === codePiece);

/**
 * Les membres d'un groupe d'alternatives, séparés de ceux qui se jugent
 * seuls. Une seule implémentation, parce que deux endroits en ont besoin :
 * le jugement d'une pièce et l'affichage de ce que la règle demande.
 */
function grouperParAlternative(conditions: readonly Condition[]): {
  seules: Condition[];
  groupes: Map<string, Condition[]>;
} {
  const groupes = new Map<string, Condition[]>();
  const seules: Condition[] = [];
  for (const condition of conditions) {
    if (condition.alternative === undefined) {
      seules.push(condition);
      continue;
    }
    const groupe = groupes.get(condition.alternative);
    if (groupe) groupe.push(condition);
    else groupes.set(condition.alternative, [condition]);
  }
  return { seules, groupes };
}

/** Une exigence, telle qu'elle s'affiche en regard de la lecture. */
export interface ExigenceAffichee {
  /** Le code de la condition, rendu lisible : « salaire min 30 ans et plus ». */
  intitule: string;
  /** Le seuil, mis en forme comme le constat d'un échec l'est. */
  valeur: string;
  /** Une condition non bloquante se recommande, elle n'arrête pas un dossier. */
  bloquante: boolean;
}

/**
 * Un bloc d'exigences : une condition seule, ou un groupe d'alternatives.
 *
 * Le groupe reste groupé jusqu'à l'écran. Aplatir les quatre seuils de
 * salaire kennismigrant en quatre lignes ferait lire quatre exigences
 * cumulées là où une seule s'applique — c'est la faute que
 * `evaluerConditions` refuse déjà de commettre en les jugeant.
 */
export interface BlocDExigences {
  /** Vrai quand en satisfaire une suffit. */
  auChoix: boolean;
  exigences: readonly ExigenceAffichee[];
}

/**
 * Ce que la règle demande d'une pièce — C-08.
 *
 * ── La troisième devinette par préfixe ──────────────────────────────
 *
 * `conditionsDeLaPiece` existe parce que deux implémentations comparaient
 * des préfixes de codes. Une troisième restait, dans la lecture qui
 * alimente l'écran d'analyse : elle appariait `condition.code` et le code
 * de la pièce par `startsWith`, dans les deux sens.
 *
 * Sur le référentiel réel, dix-neuf pièces, sept portent une exigence
 * déclarée, et la devinette en trouvait quatre — par coïncidence de
 * graphie. Les trois perdues :
 *
 *     NL emploi_kennismigrant  contrat_travail  5 conditions, aucune affichée
 *     AE etudes                admission        parrainage_universite
 *     AE etudes                diplome          golden_visa_gpa
 *
 * L'écran rendait alors « Exigence : non lue » — qui dit que la pièce du
 * candidat était illisible sur ce point, alors que rien n'avait été
 * cherché au bon endroit.
 */
export function exigencesDeLaPiece(
  conditions: readonly Condition[],
  codePiece: string,
): BlocDExigences[] {
  const { seules, groupes } = grouperParAlternative(conditionsDeLaPiece(conditions, codePiece));
  /*
    L'intitulé est le code de la condition, sans ses tirets bas — la même
    transformation que l'écran applique déjà aux champs lus, juste
    au-dessus. Le référentiel ne porte pas de libellé court pour une
    condition : il porte `message_echec`, qui est une phrase d'échec et ne
    se lit pas en tête de colonne. En inventer un ici remettrait de la
    connaissance réglementaire dans la mise en forme, ce que ce module
    refuse ; un libellé propre se décide dans le référentiel.
  */
  const affichee = (c: Condition): ExigenceAffichee => ({
    intitule: c.code.replace(/_/gu, " "),
    valeur: mettreEnForme(Array.isArray(c.valeur) ? c.valeur.join(", ") : c.valeur, c.unite),
    bloquante: c.bloquant,
  });
  return [
    ...seules.map((c) => ({ auChoix: false, exigences: [affichee(c)] })),
    ...[...groupes.values()].map((membres) => ({
      auChoix: true,
      exigences: membres.map(affichee),
    })),
  ];
}

/**
 * La phrase qui accompagne un groupe d'alternatives. Elle dit que le seuil
 * applicable dépend d'un fait que le dossier ne porte pas — sans quoi
 * quatre seuils se lisent comme quatre exigences à tenir ensemble.
 */
export const MENTION_AU_CHOIX =
  "Un seul de ces seuils s'applique, et lequel dépend de ta situation.";

/**
 * Ce que l'écran dit quand la règle n'attache aucune condition à la pièce.
 *
 * C'est un état normal — un justificatif d'admission se fournit pour
 * lui-même, sans valeur à atteindre — et il ne se confond pas avec une
 * lecture qui a échoué.
 */
export const SANS_EXIGENCE_CHIFFREE =
  "La règle figée pour ce dossier n'attache aucun seuil à cette pièce : elle est demandée pour elle-même.";

/**
 * Les conditions qu'aucune pièce n'établit.
 *
 * Elles existent pour de bon : une carence de travail après l'arrivée, une
 * progression de crédits que l'établissement signale en cours d'année. Le
 * référentiel refuse qu'une **bloquante** soit dans ce cas — elle rendrait
 * le dossier impossible à terminer.
 */
export const conditionsHorsPieces = (
  conditions: readonly Condition[],
): readonly Condition[] => conditions.filter((c) => c.piece === undefined);

/** Champs lus dans la pièce. Les dates arrivent en ISO, les montants en nombre. */
export type ChampsExtraits = Record<string, string | number | null>;

export interface Echec {
  code: string;
  /** Mesure constatée, mise en forme : « 4 mois », « 850 000 F ». */
  constate: string;
  /** Exigence, mise en forme. */
  exige: string;
  bloquant: boolean;
  /** Geste attendu, tel qu'il est écrit dans le référentiel. */
  action: string;
}

/**
 * Une condition qu'on ne peut pas juger, et le geste qui le permettra.
 *
 * Distincte d'un échec, et la distinction est tout : un échec dit que la
 * pièce ne satisfait pas l'exigence, une réserve dit qu'on ne le sait
 * pas. Les confondre ferait envoyer refaire un document qui n'a rien —
 * c'est le défaut établi le 22/09/2026, quand un passeport valable
 * jusqu'en 2029 ressortait « aucune valeur lisible, 6 mois exigés ».
 */
export interface Reserve {
  code: string;
  /** Ce qui manque, nommé. */
  manque: string;
  /** Le geste attendu. Il porte sur le dossier, pas sur la pièce. */
  action: string;
}

export interface Verdict {
  verdict: Extract<DocumentState, "CONFORME" | "A_CORRIGER" | "HORS_SUJET">;
  titre: string;
  /** Message complet affiché au candidat : constat, exigence, geste. */
  corps: string;
  /** Le même constat en forme brève, pour la ligne de checklist. */
  constat?: string;
  echecs: Echec[];
  /**
   * Ce que le verdict suppose, quand il suppose quelque chose.
   *
   * Un groupe d'alternatives satisfait par certains de ses membres et pas
   * par tous **est** satisfait — mais seulement si c'est bien le seuil
   * atteint qui s'applique. Le dire n'est pas une précaution de style :
   * un salaire de 4 400 € satisfait le seuil des moins de trente ans et
   * pas celui des trente ans et plus, et « correspond à ce qui est
   * exigé » tairait laquelle des deux situations a été supposée.
   */
  mentions: readonly string[];
  /**
   * Ce qui n'a pas pu être jugé. Vide dans le cas ordinaire.
   *
   * Une pièce sous réserve n'est pas conforme — on n'a pas vérifié — et
   * elle n'est pas fautive non plus. `analyse.ts` s'en sert pour ne pas
   * proposer de remplacer un fichier qui n'a rien à se reprocher.
   */
  reserves: readonly Reserve[];
}

export function evaluerConditions(
  conditions: readonly Condition[],
  champs: ChampsExtraits,
  /**
   * Les conditions mises en réserve, hors du jugement.
   *
   * Passées plutôt que déduites d'une valeur nulle : « non mesurable »
   * et « non lu » se ressemblent dans les données et ne se ressemblent
   * pas du tout pour le candidat. Le premier lui demande de renseigner
   * son dossier, le second de redéposer sa pièce.
   */
  reserves: readonly Reserve[] = [],
): Verdict {
  const enReserve = new Set(reserves.map((r) => r.code));
  const jugeables = conditions.filter((c) => !enReserve.has(c.code));
  // Aucun champ lu alors que des conditions portent sur la pièce : le
  // document n'est pas celui qu'on attendait. C'est un constat, pas un
  // reproche — et il ouvre une action précise, le reclassement.
  if (
    jugeables.length > 0 &&
    Object.values(champs).every((v) => v === null || v === undefined)
  ) {
    return {
      verdict: "HORS_SUJET",
      titre: "Ce document ne correspond pas à la pièce attendue",
      corps:
        "Aucune des informations attendues n'a été trouvée dans ce fichier. Vérifie que tu as bien envoyé le bon document, ou reclasse-le dans la ligne qui lui correspond.",
      echecs: [],
      mentions: [],
      reserves,
    };
  }

  const echecs: Echec[] = [];
  const valeurLue = (condition: Condition) =>
    champs[condition.code] ?? champs[racine(condition.code)] ?? null;
  const echecDe = (condition: Condition): Echec => ({
    code: condition.code,
    constate: mettreEnForme(valeurLue(condition), condition.unite),
    exige: mettreEnForme(
      Array.isArray(condition.valeur) ? condition.valeur.join(", ") : condition.valeur,
      condition.unite,
    ),
    bloquant: condition.bloquant,
    action: condition.message_echec,
  });

  /*
    Les alternatives d'abord, parce qu'elles ne se jugent pas une par une.

    Quatre seuils de salaire kennismigrant, dont celui qui s'applique
    dépend de l'âge du candidat — un fait que le dossier ne porte pas.
    Les évaluer séparément dit à quelqu'un de vingt-cinq ans qu'il lui
    manque les mille cinq cents euros qui séparent son seuil de celui
    des trente ans et plus.

    Le groupe est satisfait dès qu'un membre l'est. Il n'échoue que si
    aucun ne l'est : le constat est alors vrai quel que soit le seuil
    applicable, et c'est le plus bas qu'on cite — celui que le candidat
    n'atteint même pas.
  */
  const { seules, groupes } = grouperParAlternative(jugeables);

  for (const condition of seules) {
    if (!satisfaite(condition, valeurLue(condition))) echecs.push(echecDe(condition));
  }

  const mentions: string[] = [];

  for (const membres of groupes.values()) {
    const tenus = membres.filter((c) => satisfaite(c, valeurLue(c)));
    if (tenus.length > 0) {
      // Satisfait — mais par certains seuils seulement. Nommer ceux qui
      // ne le sont pas est la seule façon que le candidat vérifie si
      // c'est bien le sien qui a été atteint.
      const manques = membres.filter((c) => !tenus.includes(c));
      if (manques.length > 0) {
        mentions.push(
          `Le seuil applicable dépend de ta situation. Ce qui est lu satisfait ${listeDeSeuils(tenus)}, et pas ${listeDeSeuils(manques)} : vérifie lequel te concerne.`,
        );
      }
      continue;
    }
    // Le seuil le moins exigeant : ne pas l'atteindre, c'est n'atteindre
    // aucun des autres, quel que soit celui qui s'applique.
    const [premier] = [...membres].sort(
      (a, b) => exigenceComparable(a) - exigenceComparable(b),
    );
    echecs.push(echecDe(premier!));
  }

  if (echecs.length === 0) {
    /*
      Rien à reprocher, mais tout n'a pas été vérifié : l'annoncer
      conforme affirmerait un contrôle qui n'a pas eu lieu. La pièce
      attend un renseignement du dossier, et le message le demande —
      sans faire croire que le fichier est en cause.
    */
    if (reserves.length > 0) {
      return {
        verdict: "A_CORRIGER",
        titre:
          reserves.length > 1
            ? `${reserves.length} renseignements manquent pour vérifier cette pièce`
            : "Un renseignement manque pour vérifier cette pièce",
        corps: reserves.map((r) => r.action).join(" "),
        constat: `${reserves[0]!.manque} n'est pas renseignée.`,
        echecs: [],
        mentions,
        reserves,
      };
    }
    /*
      Aucune condition ne porte sur cette pièce : il n'y avait rien à
      comparer, et le dire « les informations lues correspondent à ce qui
      est exigé » affirmerait une vérification qui n'a pas eu lieu.

      Le cas est légitime — une lettre d'admission est exigée sans qu'un
      seuil chiffré porte dessus — et il était aussi celui d'une
      procédure entière dont aucune condition ne se rattachait à rien :
      trois pièces déclarées conformes par cette phrase, sans qu'une
      seule comparaison ait été faite.
    */
    if (conditions.length === 0) {
      return {
        verdict: "CONFORME",
        titre: "Cette pièce est reçue",
        corps:
          "Le référentiel ne pose aucune condition chiffrée sur cette pièce : elle est reçue telle quelle. Son contenu n'a donc pas été comparé à un seuil.",
        echecs: [],
        mentions: [],
        reserves: [],
      };
    }
    return {
      verdict: "CONFORME",
      titre: "Cette pièce est conforme",
      corps: ["Les informations lues correspondent à ce qui est exigé.", ...mentions].join(" "),
      echecs: [],
      mentions,
      reserves: [],
    };
  }

  const premier = echecs[0]!;
  const constat = `${premier.constate} constaté, ${premier.exige} exigé.`;

  return {
    verdict: "A_CORRIGER",
    titre: echecs.length > 1 ? `${echecs.length} points à corriger` : "Un point à corriger",
    corps: [
      ...echecs.map((e) => `${e.constate} constaté, ${e.exige} exigé. ${e.action}`),
      ...reserves.map((r) => r.action),
      ...mentions,
    ].join(" "),
    constat,
    echecs,
    mentions,
    reserves,
  };
}

const racine = (code: string): string => code.split("_")[0] ?? code;

/**
 * De quoi ordonner les membres d'un groupe du moins exigeant au plus
 * exigeant. Un seuil `lte` s'ordonne à l'envers d'un `gte` : cinq mois au
 * plus est moins exigeant que trois. Ce qui n'est pas un seuil chiffré ne
 * s'ordonne pas et passe en tête — il sera cité tel quel.
 */
/** « 4 357 EUR_brut_mensuel » ou « 4 357 EUR_brut_mensuel et 3 122 EUR_brut_mensuel ». */
const listeDeSeuils = (conditions: readonly Condition[]): string =>
  conditions
    .map((c) =>
      mettreEnForme(
        Array.isArray(c.valeur) ? c.valeur.join(", ") : c.valeur,
        c.unite,
      ),
    )
    .join(" et ");

function exigenceComparable(condition: Condition): number {
  const seuil = Number(condition.valeur);
  if (!Number.isFinite(seuil)) return -Infinity;
  return condition.operateur === "lte" ? -seuil : seuil;
}

function satisfaite(condition: Condition, lu: string | number | null): boolean {
  if (condition.operateur === "exists") return lu !== null && lu !== "";
  if (lu === null) return false;

  if (condition.operateur === "in") {
    const admises = Array.isArray(condition.valeur) ? condition.valeur : [String(condition.valeur)];
    return admises.map((v) => v.toLowerCase()).includes(String(lu).toLowerCase());
  }

  if (condition.operateur === "eq") return String(lu).toLowerCase() === String(condition.valeur).toLowerCase();

  const mesure = Number(lu);
  const seuil = Number(condition.valeur);
  if (!Number.isFinite(mesure) || !Number.isFinite(seuil)) return false;

  return condition.operateur === "gte" ? mesure >= seuil : mesure <= seuil;
}

/**
 * Mise en forme d'une mesure. L'unité vient du référentiel et suit le
 * nombre : « 4 mois », « 1 130,77 EUR ». Une valeur absente s'écrit en toutes
 * lettres plutôt qu'en tiret — « aucune date lisible » dit ce qui s'est
 * passé, « — » laisse deviner.
 */
function mettreEnForme(valeur: string | number | null, unite?: string): string {
  if (valeur === null || valeur === "") return "aucune valeur lisible";
  const nombre = typeof valeur === "number" ? valeur : Number(valeur);
  const texte = Number.isFinite(nombre) && typeof valeur !== "string"
    ? new Intl.NumberFormat("fr-FR").format(nombre)
    : String(valeur);
  return unite ? `${texte} ${unite}` : texte;
}

/**
 * Nombre de mois entre deux dates, arrondi vers le bas.
 *
 * C'est la mesure de RG-06.3 — « votre passeport expire 4 mois après la date
 * de retour prévue, il en faut 6 ». Elle est ici, et non dans l'extracteur :
 * ce qui se calcule ne s'extrait pas.
 */
export function moisEntre(debutIso: string, finIso: string): number {
  const debut = new Date(debutIso);
  const fin = new Date(finIso);
  const mois =
    (fin.getUTCFullYear() - debut.getUTCFullYear()) * 12 +
    (fin.getUTCMonth() - debut.getUTCMonth());
  return fin.getUTCDate() < debut.getUTCDate() ? mois - 1 : mois;
}
