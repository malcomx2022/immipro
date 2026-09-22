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
}

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
      reserves,
    };
  }

  const echecs: Echec[] = [];

  for (const condition of jugeables) {
    const lu = champs[condition.code] ?? champs[racine(condition.code)] ?? null;
    if (!satisfaite(condition, lu)) {
      echecs.push({
        code: condition.code,
        constate: mettreEnForme(lu, condition.unite),
        exige: mettreEnForme(
          Array.isArray(condition.valeur) ? condition.valeur.join(", ") : condition.valeur,
          condition.unite,
        ),
        bloquant: condition.bloquant,
        action: condition.message_echec,
      });
    }
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
        reserves,
      };
    }
    return {
      verdict: "CONFORME",
      titre: "Cette pièce est conforme",
      corps: "Les informations lues correspondent à ce qui est exigé.",
      echecs: [],
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
    ].join(" "),
    constat,
    echecs,
    reserves,
  };
}

const racine = (code: string): string => code.split("_")[0] ?? code;

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
