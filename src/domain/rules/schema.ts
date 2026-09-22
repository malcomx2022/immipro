import { z } from "zod";

/**
 * Contrat du champ VisaRule.rules (jsonb).
 * Toute écriture passe par ce schéma : pas de règle en base sans validation.
 * Incrémenter SCHEMA_VERSION à chaque changement incompatible.
 */
export const SCHEMA_VERSION = 1;

const montant = z.object({
  valeur: z.number().nonnegative(),
  devise: z.enum(["EUR", "CHF", "AED", "XOF", "USD", "CAD"]),
  periodicite: z.enum(["mensuel", "annuel", "unique"]),
});

const fourchette = z.object({
  min: z.number().nonnegative(),
  max: z.number().nonnegative(),
  devise: z.enum(["EUR", "CHF", "AED", "XOF", "USD", "CAD"]),
  periodicite: z.enum(["mensuel", "annuel"]),
});

/** Une condition évaluable par le moteur de complétude, sans IA. */
const conditionDeterministe = z.object({
  code: z.string(),                       // "passeport_validite_min"
  operateur: z.enum(["gte", "lte", "eq", "in", "exists"]),
  valeur: z.union([z.number(), z.string(), z.array(z.string())]),
  unite: z.string().optional(),           // "mois", "EUR", "points"
  message_echec: z.string(),              // texte actionnable affiché à l'utilisateur
  bloquant: z.boolean(),                  // true = filtrage strict, false = pondéré

  /**
   * La pièce qui établit cette condition, par son code — 22/09/2026.
   *
   * Elle se **déclare**. Elle se déduisait du code par comparaison de
   * préfixes, à deux endroits et selon deux règles différentes, et le
   * rapprochement était faux dès que le référentiel nommait une condition
   * autrement que sa pièce : `salaire_min_moins_30_ans` ne partage aucun
   * préfixe avec `contrat_travail`. Sur la procédure kennismigrant, aucune
   * des cinq conditions ne se rattachait à quoi que ce soit — l'extraction
   * ne demandait aucun champ, chaque pièce ressortait « conforme » sans
   * qu'une seule comparaison ait eu lieu, et le dossier ne pouvait jamais
   * devenir prêt.
   *
   * Absente, la condition ne s'établit par aucune pièce déposée : une
   * carence de travail, une progression de crédits constatée après
   * l'arrivée. C'est un cas réel, et c'est pourquoi le champ est
   * facultatif — mais il ne l'est pas pour une condition bloquante, voir
   * `visaRulesSchema`.
   */
  piece: z.string().optional(),

  /**
   * Groupe d'alternatives : le seuil applicable dépend d'un fait que le
   * dossier ne porte pas.
   *
   * Les quatre seuils de salaire kennismigrant sont le cas d'espèce :
   * 4 357 € avant trente ans, 5 942 € à partir de trente ans, et deux
   * variantes de procédure. Les évaluer séparément dit à un candidat de
   * vingt-cinq ans qu'il lui manque mille cinq cents euros. Le groupe est
   * satisfait dès qu'un de ses membres l'est ; il n'échoue que si aucun ne
   * l'est, ce qui est alors vrai quel que soit le seuil applicable.
   */
  alternative: z.string().optional(),
});

const pieceRequise = z.object({
  code: z.string(),                       // "releve_bancaire"
  libelle: z.string(),
  obligatoire: z.boolean(),
  delai_obtention_jours: z.number().int().nonnegative().optional(),
  traduction_assermentee: z.boolean().default(false),
  legalisation: z.boolean().default(false),
  /**
   * Ce qu'il faut faire pour lever le manque.
   *
   * C'est une propriété de l'exigence, pas de l'écran : un veilleur qui lit
   * « examen médical sur place » sait que c'est une démarche et non un
   * fichier. Le déduire du code par motif — ce que faisait le serveur — se
   * trompait précisément là : « visite_medicale » y devenait un
   * téléversement, et le bouton aurait dit « Ajouter » pour un rendez-vous
   * à prendre. « Ajouter » mentirait sur l'effort demandé.
   *
   * Le défaut couvre le cas courant, un document qu'on possède déjà, et
   * n'oblige pas à reprendre les fiches existantes.
   */
  nature: z.enum(["televerser", "rediger", "demarche"]).default("televerser"),
});

export const visaRulesSchema = z.object({
  libelle: z.string(),
  langues_acceptees: z.array(z.string()),           // ISO 639-1
  niveau_langue_min: z.string().nullable(),         // "B2", "IELTS 6.5", null

  frais_scolarite: fourchette.nullable(),
  frais_dossier: montant.nullable(),
  preuve_fonds: montant.nullable(),

  delai_traitement_jours: z.object({ min: z.number(), max: z.number() }).nullable(),

  travail_autorise: z.object({
    autorise: z.boolean(),
    limite_hebdomadaire_heures: z.number().nullable(),
    plein_temps_vacances: z.boolean(),
    delai_carence_mois: z.number().nullable(),      // CH : 6 mois
    permis_employeur_requis: z.boolean(),           // NL : TWV, AE : MOHRE
  }),

  apres_etudes: z.object({
    dispositif: z.string().nullable(),
    duree_mois: z.number().nullable(),
    renouvelable: z.boolean(),
    delai_depot_apres_diplome_mois: z.number().nullable(),
    travail_pendant_recherche_heures: z.number().nullable(),
  }).nullable(),

  conditions: z.array(conditionDeterministe),
  pieces_requises: z.array(pieceRequise),

  /** Ce que la plateforme n'affirme pas. Alimente le disclaimer contextuel. */
  reserves: z.array(z.string()).default([]),
}).superRefine((payload, ctx) => {
  /*
    Intégrité référentielle, et elle seule : une condition qui nomme une
    pièce nomme une pièce qui existe.

    Ce qu'elle ne fait **pas** : exiger qu'une condition bloquante nomme
    une pièce. Ce schéma est repassé **à chaque lecture** — une règle
    figée par un dossier ouvert avant cette évolution n'en porte aucune,
    et la refuser ici rendrait illisibles des règles que des dossiers en
    cours ont gelées (INV-3). Une exigence nouvelle sur la forme du
    référentiel se pose à la publication, où elle arrête une règle avant
    qu'un dossier soit ouvert dessus, et non au moment de relire ce qui
    existe déjà.
  */
  const codes = new Set(payload.pieces_requises.map((p) => p.code));
  for (const [rang, condition] of payload.conditions.entries()) {
    if (condition.piece !== undefined && !codes.has(condition.piece)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["conditions", rang, "piece"],
        message: `La condition « ${condition.code} » se rattache à « ${condition.piece} », qui ne figure pas dans les pièces requises.`,
      });
    }
  }
});

export type VisaRulesPayload = z.infer<typeof visaRulesSchema>;

/**
 * Ce qui rend une règle impossible à terminer — 22/09/2026.
 *
 * Une condition bloquante qui ne nomme aucune pièce ne peut être
 * satisfaite par aucun dépôt : le calcul de complétude cherche la pièce
 * porteuse, n'en trouve pas, et conclut « non satisfaite », définitivement.
 * Le dossier reste `ACTIF` avec une exigence que le candidat ne peut lever.
 *
 * Une procédure entière était dans cet état — les cinq conditions
 * kennismigrant, dont trois bloquantes, ne se rattachaient à rien parce
 * que le rapprochement se faisait par préfixe de code et que
 * `salaire_min_moins_30_ans` n'en partage aucun avec `contrat_travail`.
 * Rien ne le signalait : les pièces ressortaient « conformes » sans
 * comparaison, et le dossier n'avançait pas.
 *
 * La vérification est **à la publication**, pas à la lecture : elle doit
 * arrêter une règle avant qu'un dossier soit ouvert dessus, sans rendre
 * illisibles celles qu'INV-3 a déjà figées.
 */
export function raisonsDIncompletabilite(payload: VisaRulesPayload): string[] {
  return payload.conditions
    .filter((c) => c.bloquant && c.piece === undefined)
    .map(
      (c) =>
        `La condition bloquante « ${c.code} » ne nomme aucune pièce : aucun dépôt ne pourrait la satisfaire, et le dossier ne deviendrait jamais prêt.`,
    );
}

/** Garde-fou : une règle ne passe PUBLISHED que sur source OFFICIEL ou INSTITUTIONNEL. */
export function peutEtrePubliee(tier: "OFFICIEL" | "INSTITUTIONNEL" | "SECONDAIRE") {
  return tier !== "SECONDAIRE";
}

/**
 * Textes d'une règle qui s'affichent tels quels chez le candidat.
 *
 * C'est le quatrième point d'application de la liste de vocabulaire, et il
 * était manquant. `domain/backoffice/regle.ts` vérifie les deux textes du
 * formulaire B-02 ; le payload en porte davantage — le libellé de la
 * procédure, chaque message d'échec de condition, chaque libellé de pièce,
 * chaque réserve. Un veilleur qui écrit une promesse dans un message
 * d'échec la ferait lire à chaque candidat dont la condition échoue, c'est-
 * à-dire précisément au moment le plus sensible.
 *
 * La fonction rend le chemin exact de la faute, pour que le refus pointe le
 * champ à reformuler et non « la règle ».
 */
export function textesCandidat(payload: VisaRulesPayload): { chemin: string; texte: string }[] {
  return [
    { chemin: "libelle", texte: payload.libelle },
    ...payload.conditions.map((c, i) => ({
      chemin: `conditions.${i}.message_echec`,
      texte: c.message_echec,
    })),
    ...payload.pieces_requises.map((p, i) => ({
      chemin: `pieces_requises.${i}.libelle`,
      texte: p.libelle,
    })),
    ...payload.reserves.map((r, i) => ({ chemin: `reserves.${i}`, texte: r })),
  ];
}

/**
 * Les deux textes que B-02 édite, réécrits dans le payload.
 *
 * C'est l'inverse exact de la projection que la lecture fait déjà :
 * `libelleCandidat` est `payload.libelle`, `reserveCandidat` la première
 * réserve. L'écran n'édite que ceux-là, et ne doit pouvoir toucher que
 * ceux-là — un formulaire qui renverrait le payload entier écraserait au
 * passage les champs qu'il n'affiche pas, avec la copie qu'il avait au
 * chargement.
 *
 * **Vider la réserve la retire.** C'est la symétrie de la lecture, qui
 * rend `reserves[0] ?? ""` : un champ vide ne peut signifier qu'une chose,
 * et faire survivre une réserve que l'opérateur vient d'effacer serait le
 * contraire de ce qu'il a demandé. Les réserves suivantes ne bougent pas :
 * le formulaire ne les montre pas, il ne les décide pas.
 */
export function avecLesTextesCandidat(
  payload: VisaRulesPayload,
  textes: { libelleCandidat: string; reserveCandidat: string },
): VisaRulesPayload {
  const libelle = textes.libelleCandidat.trim();
  const reserve = textes.reserveCandidat.trim();
  const suivantes = payload.reserves.slice(1);
  return {
    ...payload,
    libelle,
    reserves: reserve ? [reserve, ...suivantes] : suivantes,
  };
}
