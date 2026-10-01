/**
 * Le référentiel de référence, en données — et rien d'autre.
 *
 * Il vivait dans le script d'insertion, qui ouvre une connexion Prisma dès
 * son chargement : personne ne pouvait donc le relire sans base. Or c'est
 * exactement ce qu'un garde-fou doit faire — vérifier que les règles
 * livrées sont terminables, sans dépendre d'un serveur.
 *
 * Le script d'insertion l'importe ; `tests/rattachement-conditions.test.ts`
 * aussi.
 */
/**
 * Vague 1 : Pays-Bas, Suisse, Émirats arabes unis.
 * Données relevées le 2026-09-11 ; Émirats repris sur sources officielles
 * le 2026-10-01 (S.95). Voir docs/visa-rules.md pour le niveau de confiance
 * de chaque source et les points restant à confirmer.
 */

export const REGLES_DE_REFERENCE = [
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
          piece: "preuve_fonds",
          operateur: "gte",
          valeur: 13569.24, // 1130.77 × 12
          unite: "EUR",
          message_echec:
            "L'IND exige 1 130,77 € par mois de frais de séjour, soit 13 569,24 € pour une année, hors frais de scolarité.",
          bloquant: true,
        },
        {
          code: "passeport_validite_min",
          piece: "passeport",
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
            "L'établissement signale à l'IND tout étudiant validant moins de la moitié de ses crédits annuels, ce qui peut entraîner le retrait du titre de séjour.",
          bloquant: false,
        },
      ],
      pieces_requises: [
        { code: "passeport", libelle: "Passeport", obligatoire: true, traduction_assermentee: false, legalisation: false },
        { code: "admission", libelle: "Lettre d'admission inconditionnelle", obligatoire: true, traduction_assermentee: false, legalisation: false },
        { code: "preuve_fonds", libelle: "Justificatif de ressources (relevé, bourse ou garant)", obligatoire: true, validite_mois: 3, traduction_assermentee: false, legalisation: false },
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
          piece: "contrat_travail",
          alternative: "salaire",
          operateur: "gte",
          valeur: 4357,
          unite: "EUR_brut_mensuel",
          message_echec: "Seuil kennismigrant 2026 pour un candidat de moins de 30 ans : 4 357 € bruts par mois.",
          bloquant: true,
        },
        {
          code: "salaire_min_30_ans_et_plus",
          piece: "contrat_travail",
          alternative: "salaire",
          operateur: "gte",
          valeur: 5942,
          unite: "EUR_brut_mensuel",
          message_echec: "Seuil kennismigrant 2026 à partir de 30 ans : 5 942 € bruts par mois.",
          bloquant: true,
        },
        {
          code: "salaire_min_critere_reduit",
          piece: "contrat_travail",
          alternative: "salaire",
          operateur: "gte",
          valeur: 3122,
          unite: "EUR_brut_mensuel",
          message_echec:
            "Critère réduit à 3 122 € bruts par mois si la demande est déposée pendant l'année de recherche, ou dans les 3 ans suivant l'obtention du diplôme.",
          bloquant: false,
        },
        {
          code: "salaire_min_carte_bleue",
          piece: "contrat_travail",
          alternative: "salaire",
          operateur: "gte",
          valeur: 5942,
          unite: "EUR_brut_mensuel",
          message_echec: "Carte bleue européenne 2026 : 5 942 € bruts par mois, ou 4 754 € pour un diplômé récent.",
          bloquant: false,
        },
        {
          code: "employeur_reconnu",
          piece: "contrat_travail",
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
          piece: "preuve_fonds",
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
          piece: "assurance_maladie",
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
        { code: "preuve_fonds", libelle: "Justificatif de moyens financiers", obligatoire: true, validite_mois: 3, traduction_assermentee: false, legalisation: false },
        { code: "logement", libelle: "Justificatif de logement", obligatoire: true, traduction_assermentee: false, legalisation: false },
        { code: "assurance_maladie", libelle: "Assurance maladie", obligatoire: true, traduction_assermentee: false, legalisation: false },
        { code: "cv_plan_etudes", libelle: "CV et plan d'études motivé", nature: "rediger" as const, obligatoire: true, traduction_assermentee: false, legalisation: false },
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
  // Reprise sur sources officielles le 2026-10-01 (S.95) :
  //  - ICP, délivrance d'un titre de séjour (étudiant) — durée, pièces,
  //    passeport 6 mois, assurance, 180 jours après les études, frais :
  //    https://icp.gov.ae/en/services-details/?serviceid=64afe3c1035448005bd52e64
  //  - ICP, permis d'entrée pour études — 60 jours pour entrer, frais :
  //    https://icp.gov.ae/en/services-details/?serviceid=64afe3c1035448005bd52e60
  //  - GDRFA Dubaï, titre de séjour étudiant — examen médical, frais,
  //    60 jours de grâce : https://www.gdrfad.gov.ae/en/services/f52024e0-b812-11ed-5210-4cd98f768936
  //  - u.ae, séjour pour études (parrainage) et dispositions générales
  //    (examen médical à partir de 18 ans, carte d'identité émirienne)
  //  - u.ae, permis de travail (permis de formation et d'emploi étudiant)
  //  - ICP, résidence dorée (étudiants et diplômés exceptionnels)
  // Reste en DRAFT : publication par un opérateur en B-02, qui relit
  // (WF-14 §4, S.46).
  // ────────────────────────────────────────────────────────────────
  {
    countryCode: "AE",
    visaType: "etudes_residence_etudiante",
    category: "ETUDES" as const,
    version: 1,
    effectiveFrom: "2026-10-01",
    effectiveTo: null,
    sourceUrl: "https://icp.gov.ae/en/services-details/?serviceid=64afe3c1035448005bd52e64",
    sourceTier: "OFFICIEL" as const,
    verifiedAt: "2026-10-01",
    // Relevé préparé avec un assistant IA : la relecture humaine reste à
    // faire, et c'est elle qui publie.
    verifiedBy: "releve-assiste",
    nextReviewAt: "2027-01-01",
    status: "DRAFT" as const,
    rules: {
      libelle: "Titre de séjour pour études, parrainé par l'établissement",
      // Langues d'enseignement : fixées par l'établissement, aucune par
      // l'autorité d'immigration.
      langues_acceptees: ["en", "ar"],
      // Aucune source officielle de séjour ne fixe de niveau : c'est
      // l'établissement qui l'exige à l'admission. « IELTS 6.0 » venait
      // d'un agrégateur.
      niveau_langue_min: null,
      // Fixés par chaque établissement ; aucune source officielle de
      // séjour ne les publie.
      frais_scolarite: null,
      // Les frais diffèrent entre l'ICP et la GDRFA : ils sont donnés en
      // réserve, autorité par autorité, plutôt qu'en un seul montant faux
      // pour l'une des deux.
      frais_dossier: null,
      // Ni l'ICP ni la GDRFA ne publient de preuve de ressources chiffrée.
      preuve_fonds: null,
      // 2 jours (ICP) ou 48 heures (GDRFA) une fois la demande déposée par
      // l'établissement. Ce n'est pas le délai total, qui dépend de
      // l'établissement : l'échéancier n'en tire donc aucune date.
      delai_traitement_jours: null,
      travail_autorise: {
        autorise: true,
        limite_hebdomadaire_heures: null, // aucune limite publiée
        plein_temps_vacances: false,
        delai_carence_mois: null,
        permis_employeur_requis: true, // permis du MOHRE demandé par l'employeur
      },
      apres_etudes: {
        dispositif: "Maintien sur le territoire après la fin du programme (ICP)",
        duree_mois: 6, // « 180 days after the completion of the study period »
        renouvelable: false,
        delai_depot_apres_diplome_mois: null,
        travail_pendant_recherche_heures: null,
      },
      conditions: [
        {
          code: "parrainage_etablissement",
          piece: "admission",
          operateur: "exists",
          valeur: "attestation_inscription",
          message_echec:
            "Le titre de séjour étudiant est demandé par l'établissement, qui doit être agréé par le ministère de l'Éducation ou l'autorité éducative de l'émirat. Joignez l'attestation d'inscription qui précise votre programme et sa durée.",
          bloquant: true,
        },
        {
          code: "passeport_validite_min",
          piece: "passeport",
          operateur: "gte",
          valeur: 6,
          unite: "mois",
          message_echec:
            "Votre passeport doit rester valable au moins 6 mois à la date de la demande. Renouvelez-le avant que l'établissement ne dépose le dossier.",
          bloquant: true,
        },
        {
          code: "assurance_sante",
          piece: "assurance_maladie",
          operateur: "exists",
          valeur: "assurance_valide_aux_emirats",
          message_echec:
            "Une assurance santé valable aux Émirats est exigée pour le titre de séjour. Joignez l'attestation de couverture.",
          bloquant: true,
        },
        {
          code: "permis_travail_etudiant",
          operateur: "exists",
          valeur: "permis_mohre",
          message_echec:
            "Le titre étudiant ne vaut pas autorisation de travail : l'employeur doit obtenir un permis de formation et d'emploi étudiant auprès du MOHRE, valable trois mois.",
          bloquant: false,
        },
      ],
      pieces_requises: [
        { code: "passeport", libelle: "Passeport", obligatoire: true, traduction_assermentee: false, legalisation: false },
        { code: "photo", libelle: "Photo d'identité en couleur, fond blanc", obligatoire: true, traduction_assermentee: false, legalisation: false },
        { code: "admission", libelle: "Attestation d'inscription précisant le programme et sa durée", obligatoire: true, traduction_assermentee: false, legalisation: false },
        { code: "assurance_maladie", libelle: "Assurance santé valable aux Émirats", obligatoire: true, traduction_assermentee: false, legalisation: false },
        { code: "visite_medicale", libelle: "Examen médical sur place (à partir de 18 ans)", nature: "demarche" as const, obligatoire: true, traduction_assermentee: false, legalisation: false },
        { code: "carte_identite_emirienne", libelle: "Demande de carte d'identité émirienne", nature: "demarche" as const, obligatoire: true, traduction_assermentee: false, legalisation: false },
      ],
      reserves: [
        "La demande est déposée par l'établissement, qui parraine l'étudiant. À Dubaï, elle relève de la GDRFA ; dans les autres émirats, de l'ICP.",
        "Le permis d'entrée doit être utilisé dans les 60 jours suivant sa délivrance, et le titre de séjour demandé dans les 60 jours suivant l'entrée.",
        "Frais publiés par l'ICP : 300 AED pour le permis d'entrée, puis 320 AED pour le titre de séjour. Par la GDRFA à Dubaï : 240 AED, plus 500 AED si la demande est faite depuis le territoire et 20 AED de livraison. Ces montants ne comprennent ni l'examen médical, ni la carte d'identité, ni l'assurance.",
        "Le traitement annoncé par l'autorité est de 2 jours une fois la demande déposée. Le délai total dépend de l'établissement : demandez-lui le sien.",
        "La durée du titre de séjour suit celle du programme. Après une annulation ou une expiration, la GDRFA accorde 60 jours pour quitter le territoire.",
        "Le niveau de langue et les frais de scolarité sont fixés par chaque établissement, pas par l'autorité d'immigration.",
        "Les diplômés peuvent demander une résidence dorée de 10 ans : moyenne d'au moins 3,5 sur 4 dans un établissement émirien de catégorie A, 3,8 en catégorie B, ou 3,5 dans l'une des 100 premières universités mondiales, diplôme obtenu depuis moins de deux ans et attesté par le ministère de l'Éducation. L'ICP fixe les critères ; la plateforme ne se prononce pas sur leur issue.",
        "La légalisation d'un diplôme béninois pour les Émirats n'est décrite par aucune source relevée : à confirmer auprès de l'établissement et de l'ambassade.",
      ],
    },
  },
];
