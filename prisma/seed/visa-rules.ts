import { PrismaClient } from "@prisma/client";
import { visaRulesSchema, SCHEMA_VERSION, peutEtrePubliee } from "../../src/domain/rules/schema";

const prisma = new PrismaClient();

/**
 * Vague 1 : Pays-Bas, Suisse, Émirats arabes unis.
 * Données relevées le 2026-09-11. Voir NOTES.md pour le niveau de confiance
 * de chaque source et les points restant à confirmer.
 */

const rules = [
  // ────────────────────────────────────────────────────────────────
  // PAYS-BAS — études
  // Source : IND (autorité néerlandaise d'immigration), montants 2026
  // ────────────────────────────────────────────────────────────────
  {
    countryCode: "NL",
    visaType: "etudes_mvv_vvr",
    category: "ETUDES" as const,
    version: 1,
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-12-31",
    sourceUrl: "https://ind.nl/en/required-amounts-income-requirements",
    sourceTier: "OFFICIEL" as const,
    verifiedAt: "2026-09-11",
    verifiedBy: "gislain",
    nextReviewAt: "2026-12-01", // les montants IND changent au 1er janvier
    status: "PUBLISHED" as const,
    rules: {
      libelle: "Séjour pour études (MVV + VVR)",
      langues_acceptees: ["en", "nl"],
      niveau_langue_min: "B2",
      frais_scolarite: { min: 6000, max: 20000, devise: "EUR", periodicite: "annuel" },
      frais_dossier: null,
      preuve_fonds: { valeur: 1130.77, devise: "EUR", periodicite: "mensuel" },
      delai_traitement_jours: { min: 60, max: 90 },
      travail_autorise: {
        autorise: true,
        limite_hebdomadaire_heures: 16,
        plein_temps_vacances: true, // juin, juillet, août
        delai_carence_mois: null,
        permis_employeur_requis: true, // TWV délivré par l'UWV à l'employeur
      },
      apres_etudes: {
        dispositif: "Zoekjaar / orientation year",
        duree_mois: 12,
        renouvelable: false,
        delai_depot_apres_diplome_mois: 36,
        travail_pendant_recherche_heures: null, // aucune restriction, pas de TWV
      },
      conditions: [
        {
          code: "preuve_fonds_annuelle",
          operateur: "gte",
          valeur: 13569.24, // 1130.77 × 12
          unite: "EUR",
          message_echec:
            "L'IND exige 1 130,77 € par mois de frais de séjour, soit 13 569,24 € pour une année, hors frais de scolarité.",
          bloquant: true,
        },
        {
          code: "passeport_validite_min",
          operateur: "gte",
          valeur: 6,
          unite: "mois",
          message_echec:
            "Votre passeport doit rester valable au moins 6 mois après la date de début du programme.",
          bloquant: true,
        },
        {
          code: "progression_academique",
          operateur: "gte",
          valeur: 50,
          unite: "pourcent_credits",
          message_echec:
            "L'établissement signale à l'IND tout étudiant validant moins de 50 % de ses crédits annuels, ce qui peut entraîner le retrait du titre de séjour.",
          bloquant: false,
        },
      ],
      pieces_requises: [
        { code: "passeport", libelle: "Passeport", obligatoire: true, traduction_assermentee: false, legalisation: false },
        { code: "admission", libelle: "Lettre d'admission inconditionnelle", obligatoire: true, traduction_assermentee: false, legalisation: false },
        { code: "preuve_fonds", libelle: "Justificatif de ressources (relevé, bourse ou garant)", obligatoire: true, traduction_assermentee: false, legalisation: false },
        { code: "assurance_maladie", libelle: "Assurance maladie", obligatoire: true, traduction_assermentee: false, legalisation: false },
        { code: "diplome", libelle: "Diplôme le plus élevé", obligatoire: true, delai_obtention_jours: 30, traduction_assermentee: true, legalisation: true },
      ],
      reserves: [
        "La demande est déposée par l'établissement auprès de l'IND, pas par le candidat.",
        "Les montants IND sont révisés au 1er janvier de chaque année.",
      ],
    },
  },

  // ────────────────────────────────────────────────────────────────
  // PAYS-BAS — emploi qualifié (kennismigrant / carte bleue UE)
  // ────────────────────────────────────────────────────────────────
  {
    countryCode: "NL",
    visaType: "emploi_kennismigrant",
    category: "EMPLOI" as const,
    version: 1,
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-12-31",
    sourceUrl: "https://ind.nl/en/required-amounts-income-requirements",
    sourceTier: "OFFICIEL" as const,
    verifiedAt: "2026-09-11",
    verifiedBy: "gislain",
    nextReviewAt: "2026-12-01",
    status: "PUBLISHED" as const,
    rules: {
      libelle: "Travailleur hautement qualifié (kennismigrant) et carte bleue européenne",
      langues_acceptees: ["en", "nl"],
      niveau_langue_min: null,
      frais_scolarite: null,
      frais_dossier: null,
      preuve_fonds: null,
      delai_traitement_jours: { min: 14, max: 90 },
      travail_autorise: {
        autorise: true,
        limite_hebdomadaire_heures: null,
        plein_temps_vacances: true,
        delai_carence_mois: null,
        permis_employeur_requis: true, // l'employeur doit être « erkend referent »
      },
      apres_etudes: null,
      conditions: [
        {
          code: "salaire_min_moins_30_ans",
          operateur: "gte",
          valeur: 4357,
          unite: "EUR_brut_mensuel",
          message_echec: "Seuil kennismigrant 2026 pour un candidat de moins de 30 ans : 4 357 € bruts par mois.",
          bloquant: true,
        },
        {
          code: "salaire_min_30_ans_et_plus",
          operateur: "gte",
          valeur: 5942,
          unite: "EUR_brut_mensuel",
          message_echec: "Seuil kennismigrant 2026 à partir de 30 ans : 5 942 € bruts par mois.",
          bloquant: true,
        },
        {
          code: "salaire_min_critere_reduit",
          operateur: "gte",
          valeur: 3122,
          unite: "EUR_brut_mensuel",
          message_echec:
            "Critère réduit à 3 122 € bruts par mois si la demande est déposée pendant l'année de recherche, ou dans les 3 ans suivant l'obtention du diplôme.",
          bloquant: false,
        },
        {
          code: "salaire_min_carte_bleue",
          operateur: "gte",
          valeur: 5942,
          unite: "EUR_brut_mensuel",
          message_echec: "Carte bleue européenne 2026 : 5 942 € bruts par mois, ou 4 754 € pour un diplômé récent.",
          bloquant: false,
        },
        {
          code: "employeur_reconnu",
          operateur: "exists",
          valeur: "erkend_referent",
          message_echec:
            "L'employeur doit être référent reconnu auprès de l'IND. Sans cela, la procédure kennismigrant est fermée.",
          bloquant: true,
        },
      ],
      pieces_requises: [
        { code: "passeport", libelle: "Passeport", obligatoire: true, traduction_assermentee: false, legalisation: false },
        { code: "contrat_travail", libelle: "Contrat de travail", obligatoire: true, traduction_assermentee: false, legalisation: false },
        { code: "diplome", libelle: "Diplôme", obligatoire: false, traduction_assermentee: true, legalisation: true },
      ],
      reserves: [
        "Prime de vacances, avantages en nature et éléments variables ne comptent pas dans le calcul du seuil.",
        "Le critère réduit ne s'applique qu'aux diplômés dans les 3 ans suivant l'obtention du diplôme.",
      ],
    },
  },

  // ────────────────────────────────────────────────────────────────
  // SUISSE — études (permis B, procédure cantonale)
  // ────────────────────────────────────────────────────────────────
  {
    countryCode: "CH",
    visaType: "etudes_permis_b",
    category: "ETUDES" as const,
    version: 1,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    sourceUrl:
      "https://www.vd.ch/population/population-etrangere/entree-et-sejour/etats-tiers/sejour-6-mois-pour-la-recherche-dun-emploi-pour-les-etudiants-diplomes-dune-haute-ecole-suisse",
    sourceTier: "INSTITUTIONNEL" as const,
    verifiedAt: "2026-09-11",
    verifiedBy: "gislain",
    nextReviewAt: "2026-11-15",
    status: "PUBLISHED" as const,
    rules: {
      libelle: "Autorisation de séjour pour études (permis B)",
      langues_acceptees: ["fr", "de", "it", "en"],
      niveau_langue_min: "B2",
      frais_scolarite: { min: 1000, max: 4000, devise: "CHF", periodicite: "annuel" },
      frais_dossier: null,
      preuve_fonds: { valeur: 21000, devise: "CHF", periodicite: "annuel" },
      delai_traitement_jours: { min: 56, max: 84 },
      travail_autorise: {
        autorise: true,
        limite_hebdomadaire_heures: 15,
        plein_temps_vacances: true,
        delai_carence_mois: 6, // aucun emploi pendant les 6 premiers mois pour les États tiers
        permis_employeur_requis: true, // demande accessoire au permis B, déposée par l'employeur
      },
      apres_etudes: {
        dispositif: "Autorisation de courte durée pour recherche d'emploi (art. 21 al. 3 LEI)",
        duree_mois: 6,
        renouvelable: false,
        delai_depot_apres_diplome_mois: null,
        travail_pendant_recherche_heures: 15,
      },
      conditions: [
        {
          code: "preuve_fonds_annuelle",
          operateur: "gte",
          valeur: 21000,
          unite: "CHF",
          message_echec:
            "Comptez environ 21 000 CHF par an de ressources disponibles. Le montant exact est fixé par le canton de destination.",
          bloquant: true,
        },
        {
          code: "carence_travail",
          operateur: "gte",
          valeur: 6,
          unite: "mois",
          message_echec:
            "Ressortissant d'un État tiers, vous ne pouvez exercer aucune activité lucrative pendant les 6 premiers mois de formation.",
          bloquant: false,
        },
        {
          code: "assurance_maladie",
          operateur: "exists",
          valeur: "assurance_lamal_ou_equivalent",
          message_echec:
            "L'assurance maladie est obligatoire dès l'arrivée. Comptez 300 à 400 CHF par mois au tarif étudiant.",
          bloquant: true,
        },
      ],
      pieces_requises: [
        { code: "passeport", libelle: "Passeport", obligatoire: true, traduction_assermentee: false, legalisation: false },
        { code: "admission", libelle: "Attestation d'immatriculation de la haute école", obligatoire: true, traduction_assermentee: false, legalisation: false },
        { code: "preuve_fonds", libelle: "Justificatif de moyens financiers", obligatoire: true, traduction_assermentee: false, legalisation: false },
        { code: "logement", libelle: "Justificatif de logement", obligatoire: true, traduction_assermentee: false, legalisation: false },
        { code: "assurance_maladie", libelle: "Assurance maladie", obligatoire: true, traduction_assermentee: false, legalisation: false },
        { code: "cv_plan_etudes", libelle: "CV et plan d'études motivé", obligatoire: true, traduction_assermentee: false, legalisation: false },
      ],
      reserves: [
        "La Suisse ne délivre pas de visa étudiant fédéral : la procédure est cantonale et les exigences varient d'un canton à l'autre.",
        "Les autorisations de travail délivrées aux diplômés d'États tiers restent soumises aux quotas annuels fixés par le Conseil fédéral.",
        "Le montant de 21 000 CHF est un ordre de grandeur : vérifier auprès du service cantonal des migrations concerné.",
      ],
    },
  },

  // ────────────────────────────────────────────────────────────────
  // ÉMIRATS ARABES UNIS — études
  // DRAFT : aucune source officielle (ICP / GDRFA / u.ae) vérifiée à ce jour.
  // ────────────────────────────────────────────────────────────────
  {
    countryCode: "AE",
    visaType: "etudes_residence_etudiante",
    category: "ETUDES" as const,
    version: 1,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    sourceUrl: "https://u.ae/en/information-and-services/visa-and-emirates-id",
    sourceTier: "SECONDAIRE" as const,
    verifiedAt: "2026-09-11",
    verifiedBy: "gislain",
    nextReviewAt: "2026-09-30", // à reprendre sur source officielle avant publication
    status: "DRAFT" as const,
    rules: {
      libelle: "Résidence étudiante parrainée par l'université",
      langues_acceptees: ["en", "ar"],
      niveau_langue_min: "IELTS 6.0",
      frais_scolarite: { min: 10000, max: 30000, devise: "AED", periodicite: "annuel" },
      frais_dossier: null,
      preuve_fonds: null,
      delai_traitement_jours: { min: 21, max: 35 },
      travail_autorise: {
        autorise: true,
        limite_hebdomadaire_heures: null,
        plein_temps_vacances: false,
        delai_carence_mois: null,
        permis_employeur_requis: true, // permis MOHRE + NOC de l'université
      },
      apres_etudes: {
        dispositif: "Visa de travail parrainé par l'employeur, ou Golden Visa pour diplômés distingués",
        duree_mois: 24,
        renouvelable: true,
        delai_depot_apres_diplome_mois: 24,
        travail_pendant_recherche_heures: null,
      },
      conditions: [
        {
          code: "parrainage_universite",
          operateur: "exists",
          valeur: "sponsor_universitaire",
          message_echec:
            "Le titre de séjour étudiant est parrainé par l'université : sans inscription dans un établissement accrédité, aucune demande n'est possible.",
          bloquant: true,
        },
        {
          code: "noc_travail_etudiant",
          operateur: "exists",
          valeur: "noc_universite",
          message_echec:
            "Le droit au travail n'est pas inclus dans le titre étudiant : il faut un permis MOHRE obtenu par l'employeur et une attestation de non-objection de l'université.",
          bloquant: false,
        },
        {
          code: "golden_visa_gpa",
          operateur: "gte",
          valeur: 3.5,
          unite: "GPA_sur_4",
          message_echec:
            "Le Golden Visa diplômés vise les meilleurs profils : GPA d'au moins 3,5 selon la classe de l'université, diplôme récent.",
          bloquant: false,
        },
      ],
      pieces_requises: [
        { code: "passeport", libelle: "Passeport", obligatoire: true, traduction_assermentee: false, legalisation: false },
        { code: "admission", libelle: "Lettre d'admission d'un établissement accrédité", obligatoire: true, traduction_assermentee: false, legalisation: false },
        { code: "visite_medicale", libelle: "Examen médical sur place", obligatoire: true, traduction_assermentee: false, legalisation: false },
        { code: "assurance_maladie", libelle: "Assurance santé", obligatoire: true, traduction_assermentee: false, legalisation: false },
        { code: "diplome", libelle: "Diplôme légalisé et attesté", obligatoire: true, delai_obtention_jours: 45, traduction_assermentee: true, legalisation: true },
      ],
      reserves: [
        "Fiche non publiable en l'état : les chiffres proviennent de sources secondaires et doivent être repris sur icp.gov.ae, gdrfa.ae ou u.ae.",
        "Les procédures diffèrent entre émirats (Dubaï relève de la GDRFA, les autres de l'ICP).",
        "La légalisation des diplômes béninois pour les Émirats est une étape longue à confirmer auprès du consulat.",
      ],
    },
  },
];

async function main() {
  for (const r of rules) {
    // 1. Validation du payload
    const payload = visaRulesSchema.parse(r.rules);

    // 2. Garde-fou : pas de publication sur source secondaire
    const status = peutEtrePubliee(r.sourceTier) ? r.status : "DRAFT";
    if (status !== r.status) {
      console.warn(`[${r.countryCode}/${r.visaType}] forcé en DRAFT : source ${r.sourceTier}`);
    }

    // 3. Archivage de la version précédente s'il y en a une
    await prisma.visaRule.updateMany({
      where: { countryCode: r.countryCode, visaType: r.visaType, status: "PUBLISHED" },
      data: { status: "ARCHIVED", effectiveTo: new Date(r.effectiveFrom) },
    });

    await prisma.visaRule.upsert({
      where: {
        countryCode_visaType_version: {
          countryCode: r.countryCode,
          visaType: r.visaType,
          version: r.version,
        },
      },
      update: {
        rules: payload,
        sourceUrl: r.sourceUrl,
        sourceTier: r.sourceTier,
        verifiedAt: new Date(r.verifiedAt),
        verifiedBy: r.verifiedBy,
        nextReviewAt: new Date(r.nextReviewAt),
        status,
      },
      create: {
        countryCode: r.countryCode,
        visaType: r.visaType,
        category: r.category,
        version: r.version,
        effectiveFrom: new Date(r.effectiveFrom),
        effectiveTo: r.effectiveTo ? new Date(r.effectiveTo) : null,
        rules: payload,
        schemaVersion: SCHEMA_VERSION,
        sourceUrl: r.sourceUrl,
        sourceTier: r.sourceTier,
        verifiedAt: new Date(r.verifiedAt),
        verifiedBy: r.verifiedBy,
        nextReviewAt: new Date(r.nextReviewAt),
        status,
      },
    });

    console.log(`✓ ${r.countryCode}/${r.visaType} v${r.version} — ${status}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
