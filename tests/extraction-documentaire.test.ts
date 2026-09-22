import { describe, expect, it } from "vitest";
import {
  GESTE_SANS_DATE_CIBLE,
  OBSTACLES_DU_MODELE,
  champsDemandes,
  instructions,
  lireLaReponse,
  mesurer,
  natureDuChamp,
  quiPeutAgir,
  schemaDeLaLecture,
  seReprendSeule,
  typeLisible,
} from "@/domain/dossiers/extraction";
import { evaluerConditions, type Condition } from "@/domain/dossiers/verification";

/**
 * Le branchement de l'extraction — WF-06 étape 5, 22/09/2026.
 *
 * ── Le défaut, tel qu'il s'est présenté ─────────────────────────────
 *
 * Avant d'écrire une ligne d'adaptateur, la chaîne a été exécutée avec
 * un extracteur rendant ce qu'un modèle rend quand on ne lui dit que
 * « passeport » : un numéro, un nom, une date d'expiration. Le dossier
 * en est ressorti
 *
 *     A_CORRIGER — « aucune valeur lisible constaté, 6 mois exigé.
 *     Ton passeport doit rester valable 6 mois après le départ.
 *     Fais-le renouveler puis redépose-le. »
 *
 * sur un passeport valable jusqu'en 2029. Deux causes, et aucune dans
 * l'adaptateur : l'extracteur n'apprenait jamais quelles conditions
 * portaient sur la pièce, et personne ne transformait la date lue en la
 * durée que la condition compare. `moisEntre` existait pour cela, sans
 * appelant.
 */

const PASSEPORT: Condition = {
  code: "passeport_validite_min",
  operateur: "gte",
  valeur: 6,
  unite: "mois",
  message_echec:
    "Ton passeport doit rester valable 6 mois après la date de départ. Fais-le renouveler, puis remplace le fichier.",
  bloquant: true,
};

const FONDS: Condition = {
  code: "preuve_fonds_annuelle",
  operateur: "gte",
  valeur: 13569.24,
  unite: "EUR",
  message_echec: "L'IND exige 13 569,24 € pour une année, hors frais de scolarité.",
  bloquant: true,
};

const EMPLOYEUR: Condition = {
  code: "employeur_reconnu",
  operateur: "exists",
  valeur: "erkend_referent",
  message_echec: "L'employeur doit être référent reconnu auprès de l'IND.",
  bloquant: true,
};

describe("ce qu'on demande au modèle vient du référentiel", () => {
  /**
   * La nature du fait brut n'est pas celle de la condition. « Six mois de
   * validité » ne s'imprime sur aucun passeport ; ce qui y figure est une
   * date. Demander la durée, c'est demander un calcul — et RG-06.1
   * n'admet pas qu'une soustraction de dates décide d'un départ.
   */
  it("une exigence en mois demande une date, pas une durée", () => {
    expect(natureDuChamp(PASSEPORT)).toBe("date");
    expect(natureDuChamp(FONDS)).toBe("nombre");
    expect(natureDuChamp(EMPLOYEUR)).toBe("texte");
  });

  it("la demande porte les codes des conditions, qui sont ceux qu'on évaluera", () => {
    const champs = champsDemandes([PASSEPORT, FONDS]);
    expect(champs.map((c) => c.code)).toEqual([
      "passeport_validite_min",
      "preuve_fonds_annuelle",
    ]);
    // L'exigence du référentiel accompagne chaque champ : c'est le seul
    // contexte curé dont on dispose sur ce qui est cherché.
    expect(champs[0]!.exigence).toContain("6 mois");
  });

  /**
   * Le schéma ferme trois portes à la fois, et c'est pour cela qu'il est
   * construit ici plutôt qu'écrit à la main quelque part.
   */
  it("le schéma n'admet que les champs demandés, et propose une ligne de reclassement", () => {
    const schema = schemaDeLaLecture(champsDemandes([PASSEPORT]), [
      "passeport",
      "preuve_fonds",
    ]);
    const proprietes = schema.properties as Record<string, Record<string, unknown>>;

    expect(schema.additionalProperties).toBe(false);
    expect(proprietes.champs!.additionalProperties).toBe(false);
    expect(proprietes.champs!.required).toEqual(["passeport_validite_min"]);
    // La pièce reconnue se choisit dans la checklist : un texte libre
    // rendrait « on dirait autre chose », une énumération rend la ligne
    // où reclasser le fichier.
    expect(proprietes.piece_identifiee!.enum).toEqual(["passeport", "preuve_fonds", null]);
    // Et il existe une issue pour qui ne peut pas lire. Sans elle, un
    // modèle sommé de remplir un schéma remplit le schéma.
    expect(proprietes.obstacle!.enum).toEqual([...OBSTACLES_DU_MODELE, null]);
  });

  it("la consigne interdit d'inventer et interdit de juger", () => {
    const texte = instructions({
      codeAttendu: "passeport",
      intituleAttendu: "Passeport",
      codesDeLaChecklist: ["passeport"],
      champs: champsDemandes([PASSEPORT]),
    });
    expect(texte).toMatch(/reste à null/u);
    expect(texte).toMatch(/Ne calcule rien/u);
    // INV-1 — le modèle lit une pièce, il ne se prononce pas sur l'issue.
    expect(texte).toMatch(/ni sur l'issue de la démarche/u);
  });
});

describe("relire la réponse sans lui faire confiance", () => {
  const champs = champsDemandes([PASSEPORT, FONDS, EMPLOYEUR]);

  it("un nombre rendu en texte reste un nombre, un texte impossible devient null", () => {
    const lu = lireLaReponse(
      {
        piece_identifiee: "passeport",
        obstacle: null,
        champs: {
          passeport_validite_min: "2029-03-01",
          preuve_fonds_annuelle: "14500",
          employeur_reconnu: "",
        },
      },
      champs,
    );
    expect(lu).toMatchObject({
      pieceIdentifiee: "passeport",
      bruts: {
        passeport_validite_min: "2029-03-01",
        preuve_fonds_annuelle: 14500,
        employeur_reconnu: null,
      },
    });
  });

  it("un champ qu'on n'a pas demandé n'entre pas", () => {
    const lu = lireLaReponse(
      { piece_identifiee: null, obstacle: null, champs: { autre_chose: "valeur" } },
      champs,
    );
    expect("bruts" in lu && Object.keys(lu.bruts)).toEqual([
      "passeport_validite_min",
      "preuve_fonds_annuelle",
      "employeur_reconnu",
    ]);
    expect("bruts" in lu && lu.bruts.passeport_validite_min).toBeNull();
  });
});

describe("de ce qui est écrit à ce qui se compare", () => {
  /**
   * Le défaut, refait à l'endroit. Avec le repère du dossier, la date lue
   * devient la durée que la condition compare, et le passeport passe.
   */
  it("un passeport valable jusqu'en 2029 est conforme pour un départ en 2027", () => {
    const { champs, reserves } = mesurer(
      [PASSEPORT],
      { passeport_validite_min: "2029-03-01" },
      "2027-09-01",
    );
    expect(champs.passeport_validite_min).toBe(18);
    expect(reserves).toEqual([]);
    expect(evaluerConditions([PASSEPORT], champs, reserves).verdict).toBe("CONFORME");
  });

  it("et il ne l'est pas si le départ tombe trop près de son expiration", () => {
    const { champs } = mesurer(
      [PASSEPORT],
      { passeport_validite_min: "2027-01-01" },
      "2026-10-01",
    );
    expect(champs.passeport_validite_min).toBe(3);
    const verdict = evaluerConditions([PASSEPORT], champs);
    expect(verdict.verdict).toBe("A_CORRIGER");
    // La mesure constatée, l'exigence, puis le geste — la doctrine
    // d'erreur du projet, sur une mesure qui est enfin la bonne.
    expect(verdict.corps).toContain("3 mois constaté");
    expect(verdict.corps).toContain("6 mois exigé");
    expect(verdict.corps).toContain("Fais-le renouveler");
  });

  /**
   * Le cas ordinaire, et c'est ce qui le rend important : un dossier neuf
   * n'a pas de date cible, parce que le candidat dépose son passeport
   * avant d'avoir arrêté son départ.
   */
  it("sans date de départ, la validité n'est pas jugée : elle est mise en réserve", () => {
    const { champs, reserves } = mesurer(
      [PASSEPORT],
      { passeport_validite_min: "2029-03-01" },
      null,
    );
    expect(champs.passeport_validite_min).toBeNull();
    expect(reserves).toEqual([
      {
        code: "passeport_validite_min",
        manque: "la date de départ visée",
        action: GESTE_SANS_DATE_CIBLE,
      },
    ]);

    const verdict = evaluerConditions([PASSEPORT], champs, reserves);
    // Ni conforme — on n'a pas vérifié — ni fautive : rien n'est
    // reproché à la pièce, et le geste porte sur le dossier.
    expect(verdict.verdict).toBe("A_CORRIGER");
    expect(verdict.echecs).toEqual([]);
    expect(verdict.corps).toBe(GESTE_SANS_DATE_CIBLE);
    expect(verdict.corps).not.toContain("renouveler");
    // Et surtout pas le message qui a motivé ce lot.
    expect(verdict.corps).not.toContain("aucune valeur lisible");
  });

  /**
   * L'absence de repère ne se constate que sur une date effectivement
   * lue. Sinon, un passeport illisible s'entendrait dire « renseigne ta
   * date de départ », ce qui ne l'avancerait en rien.
   */
  it("une date non lue reste un défaut de la pièce, pas une réserve du dossier", () => {
    const { champs, reserves } = mesurer([PASSEPORT], { passeport_validite_min: null }, null);
    expect(champs.passeport_validite_min).toBeNull();
    expect(reserves).toEqual([]);
  });

  it("une date que le modèle n'a pas su former ne devient pas une durée", () => {
    const { champs, reserves } = mesurer(
      [PASSEPORT],
      { passeport_validite_min: "mars 2029" },
      "2027-09-01",
    );
    expect(champs.passeport_validite_min).toBeNull();
    expect(reserves).toEqual([]);
  });

  it("ce qui n'est pas une durée passe tel quel", () => {
    const { champs } = mesurer(
      [FONDS, EMPLOYEUR],
      { preuve_fonds_annuelle: 14500, employeur_reconnu: "erkend_referent" },
      null,
    );
    expect(champs).toEqual({
      preuve_fonds_annuelle: 14500,
      employeur_reconnu: "erkend_referent",
    });
  });

  /**
   * Une pièce entièrement en réserve ne doit pas se lire « hors sujet » :
   * les champs sont tous nuls, et c'est exactement la forme que prend un
   * fichier qui ne correspond pas. La différence est que l'un a été lu.
   */
  it("une pièce entièrement en réserve n'est pas déclarée hors sujet", () => {
    const { champs, reserves } = mesurer(
      [PASSEPORT],
      { passeport_validite_min: "2029-03-01" },
      null,
    );
    expect(evaluerConditions([PASSEPORT], champs, reserves).verdict).not.toBe("HORS_SUJET");
  });
});

describe("la suite d'une lecture qui n'aboutit pas", () => {
  it("seules les causes qui se dissipent seules sont rejouées", () => {
    expect(seReprendSeule("service_sature")).toBe(true);
    expect(seReprendSeule("injoignable")).toBe(true);
    expect(seReprendSeule("delai_depasse")).toBe(true);
    // Rejouer six fois un scan flou ou une clé absente encombre la file
    // et retarde d'autant la revue humaine, sans rien changer.
    expect(seReprendSeule("scan_illisible")).toBe(false);
    expect(seReprendSeule("non_configure")).toBe(false);
    expect(seReprendSeule("refus")).toBe(false);
  });

  it("seul le candidat peut reprendre une photo ; le reste est à la plateforme", () => {
    expect(quiPeutAgir("scan_illisible")).toBe("candidat");
    expect(quiPeutAgir("document_protege")).toBe("candidat");
    expect(quiPeutAgir("langue_non_geree")).toBe("candidat");
    expect(quiPeutAgir("service_sature")).toBe("plateforme");
    expect(quiPeutAgir("objet_absent")).toBe("plateforme");
  });

  it("un type que le dépôt n'admet pas ne part pas au service", () => {
    expect(typeLisible("application/pdf")).toBe(true);
    expect(typeLisible("image/png")).toBe(true);
    expect(typeLisible("image/webp")).toBe(false);
    expect(typeLisible(null)).toBe(false);
  });
});
