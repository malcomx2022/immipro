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
});

export type VisaRulesPayload = z.infer<typeof visaRulesSchema>;

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
