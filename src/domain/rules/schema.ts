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
