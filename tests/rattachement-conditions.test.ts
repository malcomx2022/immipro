import { describe, expect, it } from "vitest";
import {
  conditionsDeLaPiece,
  conditionsHorsPieces,
  evaluerConditions,
  type Condition,
} from "@/domain/dossiers/verification";
import { raisonsDIncompletabilite, visaRulesSchema } from "@/domain/rules/schema";
import { REGLES_DE_REFERENCE } from "../prisma/seed/visa-rules.data";

/**
 * Le rattachement d'une condition à une pièce — correctif du 22/09/2026.
 *
 * ── Le défaut, tel qu'il s'est présenté ─────────────────────────────
 *
 * Le rapprochement se faisait par comparaison de préfixes de codes, à
 * deux endroits et selon deux règles différentes. Il marchait tant que
 * le référentiel nommait ses conditions d'après leurs pièces. Sur la
 * procédure kennismigrant, où les conditions s'appellent
 * `salaire_min_moins_30_ans` et la pièce `contrat_travail`, il ne
 * rapprochait rien du tout. Exécuté avant correction :
 *
 *     passeport        champs demandés : []
 *     contrat_travail  champs demandés : []
 *     diplome          champs demandés : []
 *     verdict sur une lecture vide : CONFORME
 *       « Les informations lues correspondent à ce qui est exigé. »
 *
 *     conditions tenues : toutes false
 *     palier : INCOMPLET | prêt : false
 *     ce qui manque : salaire_min_moins_30_ans, salaire_min_30_ans_et_plus,
 *                     employeur_reconnu
 *
 * Trois pièces déclarées conformes sans qu'une seule comparaison ait eu
 * lieu, et un dossier qu'aucun dépôt ne pouvait terminer.
 */

const salaire = (code: string, seuil: number, bloquant: boolean): Condition => ({
  code,
  operateur: "gte",
  valeur: seuil,
  unite: "EUR_brut_mensuel",
  message_echec: `Seuil ${code} : ${seuil} € bruts par mois.`,
  bloquant,
  piece: "contrat_travail",
  alternative: "salaire",
});

const MOINS_30 = salaire("salaire_min_moins_30_ans", 4357, true);
const PLUS_30 = salaire("salaire_min_30_ans_et_plus", 5942, true);
const REDUIT = salaire("salaire_min_critere_reduit", 3122, false);

const EMPLOYEUR: Condition = {
  code: "employeur_reconnu",
  operateur: "exists",
  valeur: "erkend_referent",
  message_echec: "L'employeur doit être référent reconnu auprès de l'IND.",
  bloquant: true,
  piece: "contrat_travail",
};

const CARENCE: Condition = {
  code: "carence_travail",
  operateur: "gte",
  valeur: 6,
  unite: "mois",
  message_echec: "Le travail n'est autorisé qu'après six mois de séjour.",
  bloquant: false,
};

describe("la pièce qui établit une condition se déclare, elle ne se devine pas", () => {
  it("le rattachement ne dépend plus du nom de la condition", () => {
    const toutes = [MOINS_30, PLUS_30, REDUIT, EMPLOYEUR, CARENCE];
    expect(conditionsDeLaPiece(toutes, "contrat_travail").map((c) => c.code)).toEqual([
      "salaire_min_moins_30_ans",
      "salaire_min_30_ans_et_plus",
      "salaire_min_critere_reduit",
      "employeur_reconnu",
    ]);
    // Et une pièce qui ne porte rien n'attrape rien par ressemblance de nom.
    expect(conditionsDeLaPiece(toutes, "passeport")).toEqual([]);
    expect(conditionsHorsPieces(toutes).map((c) => c.code)).toEqual(["carence_travail"]);
  });

  /**
   * La garde qui empêche le défaut de revenir, et elle est à la
   * publication : le schéma est repassé à **chaque lecture**, et une
   * règle figée par un dossier ouvert avant cette évolution n'en porte
   * aucune (INV-3). La refuser à la lecture rendrait illisible ce que
   * des dossiers en cours ont gelé.
   */
  it("une condition bloquante sans pièce ne peut plus être publiée", () => {
    const base = {
      libelle: "Procédure d'essai",
      langues_acceptees: ["fr"],
      niveau_langue_min: null,
      frais_scolarite: null,
      frais_dossier: null,
      preuve_fonds: null,
      delai_traitement_jours: null,
      travail_autorise: {
        autorise: true,
        limite_hebdomadaire_heures: 20,
        plein_temps_vacances: true,
        delai_carence_mois: null,
        permis_employeur_requis: false,
      },
      apres_etudes: null,
      pieces_requises: [
        {
          code: "contrat_travail",
          libelle: "Contrat de travail",
          obligatoire: true,
          traduction_assermentee: false,
          legalisation: false,
        },
      ],
      reserves: [],
    };

    const orpheline = visaRulesSchema.parse({
      ...base,
      conditions: [{ ...MOINS_30, piece: undefined }],
    });
    expect(raisonsDIncompletabilite(orpheline)).toHaveLength(1);
    expect(raisonsDIncompletabilite(orpheline)[0]).toContain("jamais prêt");

    // Rattachée, elle passe.
    const rattachee = visaRulesSchema.parse({ ...base, conditions: [MOINS_30] });
    expect(raisonsDIncompletabilite(rattachee)).toEqual([]);

    // Une facultative sans pièce reste légitime : elle ne s'établit par
    // aucun dépôt et n'empêche rien.
    const facultative = visaRulesSchema.parse({ ...base, conditions: [CARENCE] });
    expect(raisonsDIncompletabilite(facultative)).toEqual([]);
  });

  /** Le schéma, lui, refuse une pièce qui n'existe pas — à la lecture comme ailleurs. */
  it("une condition ne peut pas se rattacher à une pièce absente de la checklist", () => {
    const lu = visaRulesSchema.safeParse({
      libelle: "Procédure d'essai",
      langues_acceptees: ["fr"],
      niveau_langue_min: null,
      frais_scolarite: null,
      frais_dossier: null,
      preuve_fonds: null,
      delai_traitement_jours: null,
      travail_autorise: {
        autorise: true,
        limite_hebdomadaire_heures: 20,
        plein_temps_vacances: true,
        delai_carence_mois: null,
        permis_employeur_requis: false,
      },
      apres_etudes: null,
      conditions: [{ ...MOINS_30, piece: "piece_inexistante" }],
      pieces_requises: [],
      reserves: [],
    });
    expect(lu.success).toBe(false);
  });
});

describe("un seuil dont l'applicabilité dépend du candidat", () => {
  const groupe = [MOINS_30, PLUS_30, REDUIT];
  const lu = (montant: number) => ({
    salaire_min_moins_30_ans: montant,
    salaire_min_30_ans_et_plus: montant,
    salaire_min_critere_reduit: montant,
  });

  /**
   * Le défaut que le groupe évite : évalués séparément, ces trois seuils
   * disent à quelqu'un de vingt-cinq ans payé 4 400 € qu'il lui manque
   * les mille cinq cents euros qui le séparent du seuil des trente ans
   * et plus.
   */
  it("satisfaire un seuil suffit, et le verdict dit lequel n'est pas atteint", () => {
    const verdict = evaluerConditions(groupe, lu(4400));
    expect(verdict.verdict).toBe("CONFORME");
    expect(verdict.echecs).toEqual([]);
    expect(verdict.mentions).toHaveLength(1);
    expect(verdict.corps).toContain("dépend de ta situation");
    // `Intl` sépare les milliers par une espace fine insécable : la
    // comparer à une espace ordinaire ferait échouer un test juste.
    expect(verdict.corps).toMatch(/5\s942/u);
  });

  /** Tous atteints : rien à supposer, rien à mentionner. */
  it("aucune mention quand tous les seuils sont atteints", () => {
    const verdict = evaluerConditions(groupe, lu(7000));
    expect(verdict.verdict).toBe("CONFORME");
    expect(verdict.mentions).toEqual([]);
    expect(verdict.corps).not.toContain("dépend de ta situation");
  });

  /**
   * Sous le plus bas des seuils, le constat est vrai quel que soit celui
   * qui s'applique — et c'est le plus bas qu'on cite, pas le plus élevé.
   */
  it("n'atteindre aucun seuil est un échec, cité au seuil le moins exigeant", () => {
    const verdict = evaluerConditions(groupe, lu(2900));
    expect(verdict.verdict).toBe("A_CORRIGER");
    expect(verdict.echecs).toHaveLength(1);
    expect(verdict.echecs[0]!.code).toBe("salaire_min_critere_reduit");
    expect(verdict.corps).toMatch(/3\s122/u);
    expect(verdict.corps).not.toMatch(/5\s942/u);
  });
});

describe("une pièce sur laquelle rien ne porte n'est pas « conforme » par comparaison", () => {
  /**
   * C'était la phrase qui couvrait le défaut : trois pièces d'une
   * procédure entière la recevaient, et elle affirme une comparaison.
   */
  it("le dit reçue, et dit qu'elle n'a été comparée à rien", () => {
    const verdict = evaluerConditions([], { quoi_que_ce_soit: "lu" });
    expect(verdict.verdict).toBe("CONFORME");
    expect(verdict.corps).not.toContain("correspondent à ce qui est exigé");
    expect(verdict.corps).toContain("aucune condition chiffrée");
    expect(verdict.corps).toContain("n'a donc pas été comparé");
  });

  it("et une pièce sur laquelle une condition porte garde son verdict de comparaison", () => {
    const verdict = evaluerConditions([EMPLOYEUR], { employeur_reconnu: "erkend_referent" });
    expect(verdict.corps).toContain("correspondent à ce qui est exigé");
  });
});

describe("le référentiel livré est terminable", () => {
  /**
   * Le garde-fou permanent. Les quatre procédures livrées passaient la
   * validation de forme et l'une d'elles ne pouvait pas être terminée :
   * la forme d'une règle et sa terminabilité sont deux questions, et
   * seule la première était posée.
   */
  it("aucune procédure livrée ne porte une exigence qu'aucun dépôt ne lève", () => {
    expect(REGLES_DE_REFERENCE.length).toBeGreaterThan(3);
    for (const regle of REGLES_DE_REFERENCE) {
      const payload = visaRulesSchema.parse(regle.rules);
      expect(
        raisonsDIncompletabilite(payload),
        `${regle.countryCode}/${regle.visaType}`,
      ).toEqual([]);
    }
  });

  /**
   * Et chaque condition rattachée trouve bien sa pièce. Le schéma le
   * vérifie déjà ; le refaire ici nomme la procédure fautive, là où une
   * erreur Zod ne nomme qu'un chemin.
   */
  it("chaque condition rattachée nomme une pièce de sa propre checklist", () => {
    for (const regle of REGLES_DE_REFERENCE) {
      const payload = visaRulesSchema.parse(regle.rules);
      const codes = new Set(payload.pieces_requises.map((p) => p.code));
      for (const condition of payload.conditions) {
        if (condition.piece === undefined) continue;
        expect(codes.has(condition.piece), `${regle.visaType} · ${condition.code}`).toBe(true);
      }
    }
  });

  /**
   * Toute pièce obligatoire n'a pas à porter une condition — une lettre
   * d'admission s'exige sans seuil chiffré. Mais une procédure dont
   * **aucune** pièce n'en porte ne vérifie rien du tout, et c'est l'état
   * dans lequel kennismigrant se trouvait.
   */
  it("chaque procédure a au moins une pièce sur laquelle une condition porte", () => {
    for (const regle of REGLES_DE_REFERENCE) {
      const payload = visaRulesSchema.parse(regle.rules);
      const portees = payload.pieces_requises.filter((p) =>
        conditionsDeLaPiece(payload.conditions, p.code).length > 0,
      );
      expect(portees.length, `${regle.countryCode}/${regle.visaType}`).toBeGreaterThan(0);
    }
  });
});
