import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { sansCommentaires } from "@/domain/copy/source";
import {
  MENTION_AIDE_A_LA_REDACTION,
  MOTIF_PREMIERE_VERSION,
  MOTIF_REECRITURE,
  REPONSES_MINIMUM,
  etatDeLaPiece,
  messageDEtat,
  motifDeRestauration,
  nombreDeReponsesTexte,
  obstacleALEnregistrement,
  texteDeLaVersion,
  versionCourante,
  type Version,
} from "@/domain/redaction/versions";
import {
  ACTION_RELECTURE,
  RESUME_ANALYSE_INDISPONIBLE,
  RESUME_SANS_TEXTE,
  etatDeLaRelecture,
  resumeRelecture,
  resumeSelonLEtat,
  type Remarque,
} from "@/domain/redaction/relecture";
import {
  CRITIQUE_NON_BRANCHEE,
  REDACTEUR_NON_BRANCHE,
  redactionConfiguree,
} from "@/server/redaction/redacteur";

/**
 * La seconde moitié de WF-08 — R-03 et R-04.
 *
 * Les deux écrans lisaient des données que rien n'écrivait, et présentaient
 * cette absence comme un état normal : un onglet « Éditeur » sans champ de
 * saisie, et une relecture qui répondait « Rien à reprendre » sans avoir lu.
 */

const version = (rang: number, texte: string): Version => ({
  rang,
  enregistreeLe: `2026-09-${String(10 + rang).padStart(2, "0")}T10:00:00.000Z`,
  paragraphes: [{ section: "PARCOURS", texte }],
  motif: "Enregistrement",
});

describe("les trois états d'une pièce, que R-03 réduisait à un seul", () => {
  it("distingue l'entretien trop court, la mise en forme à demander et le service absent", () => {
    const base = { versions: [] as Version[] };
    expect(etatDeLaPiece({ ...base, reponses: 1, redactionDisponible: true })).toBe(
      "ENTRETIEN_INSUFFISANT",
    );
    expect(
      etatDeLaPiece({ ...base, reponses: REPONSES_MINIMUM, redactionDisponible: true }),
    ).toBe("A_METTRE_EN_FORME");
    expect(
      etatDeLaPiece({ ...base, reponses: REPONSES_MINIMUM, redactionDisponible: false }),
    ).toBe("MISE_EN_FORME_INDISPONIBLE");
    expect(
      etatDeLaPiece({
        versions: [version(1, "Un texte.")],
        reponses: 0,
        redactionDisponible: false,
      }),
    ).toBe("REDIGEE");
  });

  /**
   * L'état vide ne propose rien quand rien ne peut être proposé : un bouton
   * offert alors que le service est absent est un bouton qui ne rendra rien
   * (règle de Q.A).
   */
  it("ne propose aucune action quand le service est absent", () => {
    const message = messageDEtat("MISE_EN_FORME_INDISPONIBLE", 6)!;
    expect(message.action).toBeNull();
    expect(message.corps).toContain("n'est pas encore branché");
    // Et il dit que rien n'est perdu : c'est ce qu'on veut savoir d'abord.
    expect(message.corps).toContain("enregistrées et rien n'est perdu");
  });

  it("dit combien de réponses manquent, pas seulement qu'il en manque", () => {
    const message = messageDEtat("ENTRETIEN_INSUFFISANT", 1)!;
    expect(message.corps).toContain(`${REPONSES_MINIMUM - 1}`);
    expect(message.action).toBe("Reprendre l'entretien");
  });

  it("ne dit rien quand la pièce est rédigée", () => {
    expect(messageDEtat("REDIGEE", 8)).toBeNull();
  });

  it("compte les réponses réellement remplies", () => {
    expect(nombreDeReponsesTexte({ 0: "oui", 1: "   ", 2: "non" })).toBe(2);
    expect(nombreDeReponsesTexte({})).toBe(0);
  });
});

describe("la réécriture d'une version", () => {
  it("refuse d'enregistrer un texte vide, et dit ce que cela effacerait", () => {
    const courante = version(1, "Le texte d'origine.");
    expect(obstacleALEnregistrement("   ", courante)).toContain("effacerait");
  });

  it("refuse d'enregistrer un texte inchangé", () => {
    const courante = version(1, "Le texte d'origine.");
    expect(obstacleALEnregistrement(texteDeLaVersion(courante), courante)).toContain(
      "Rien n'a changé",
    );
  });

  it("accepte un texte modifié", () => {
    expect(obstacleALEnregistrement("Un autre texte.", version(1, "Le texte."))).toBeNull();
    // Première version : il n'y a rien à comparer.
    expect(obstacleALEnregistrement("Un texte.", undefined)).toBeNull();
  });

  /**
   * L'éditeur montre le texte entier, pas un champ par paragraphe : on
   * réécrit une lettre, et déplacer une phrase d'un paragraphe à l'autre
   * est le geste le plus courant d'une relecture.
   */
  it("recolle les paragraphes en un texte, intertitres compris", () => {
    const v: Version = {
      rang: 1,
      enregistreeLe: "2026-09-21T10:00:00.000Z",
      paragraphes: [
        { section: "PARCOURS", texte: "Première ligne." },
        { section: "", texte: "Sans intertitre." },
      ],
      motif: "Enregistrement",
    };
    expect(texteDeLaVersion(v)).toBe("PARCOURS\nPremière ligne.\n\nSans intertitre.");
  });

  it("nomme chaque motif de version, sans en inventer un générique", () => {
    expect(MOTIF_PREMIERE_VERSION).toContain("mise en forme");
    expect(MOTIF_REECRITURE).toContain("toi");
    expect(motifDeRestauration(2)).toBe("Retour au texte de la version 2");
  });

  /** La restauration crée une version, elle ne tronque pas l'historique. */
  it("laisse la version restaurée en tête, les suivantes conservées", () => {
    const versions = [version(1, "A"), version(2, "B"), version(3, "A")];
    expect(versionCourante(versions)?.rang).toBe(3);
    expect(versions).toHaveLength(3);
  });

  /** RG-08.1 : la mention voyage avec le texte, pas seulement à l'écran. */
  it("porte la mention d'aide à la rédaction", () => {
    expect(MENTION_AIDE_A_LA_REDACTION).toContain("aide à la rédaction");
    expect(MENTION_AIDE_A_LA_REDACTION).toContain("ta responsabilité");
    // Et jamais une promesse de résultat.
    expect(MENTION_AIDE_A_LA_REDACTION).not.toMatch(/garanti|chances|accept/iu);
  });
});

describe("R-04 rendait un avis favorable sans avoir lu", () => {
  const remarque: Remarque = {
    id: "r1",
    genre: "FORME",
    titre: "Une remarque",
    corps: "Un corps.",
    action: "Reprendre ce paragraphe",
  };

  /**
   * Le défaut, en une assertion : `[]` et `null` donnaient la même phrase,
   * et c'était la phrase rassurante.
   */
  it("ne dit pas « rien à reprendre » quand rien n'a été lu", () => {
    const jamais = etatDeLaRelecture({ remarques: null, texteExistant: true });
    expect(jamais).toBe("ANALYSE_INDISPONIBLE");
    expect(resumeSelonLEtat(jamais, null)).toBe(RESUME_ANALYSE_INDISPONIBLE);
    expect(resumeSelonLEtat(jamais, null)).not.toContain("Rien à reprendre");
    expect(resumeSelonLEtat(jamais, null)).toContain("sans l'avoir lu");
  });

  it("le dit quand la version a bien été lue sans remarque", () => {
    const relue = etatDeLaRelecture({ remarques: [], texteExistant: true });
    expect(relue).toBe("RELUE_SANS_REMARQUE");
    expect(resumeSelonLEtat(relue, [])).toBe(resumeRelecture([]));
    expect(resumeSelonLEtat(relue, [])).toContain("Rien à reprendre");
  });

  it("distingue encore l'absence de texte", () => {
    const sansTexte = etatDeLaRelecture({ remarques: null, texteExistant: false });
    expect(sansTexte).toBe("SANS_TEXTE");
    expect(resumeSelonLEtat(sansTexte, null)).toBe(RESUME_SANS_TEXTE);
  });

  it("garde son compte de remarques quand il y en a", () => {
    const etat = etatDeLaRelecture({ remarques: [remarque], texteExistant: true });
    expect(etat).toBe("RELUE");
    expect(resumeSelonLEtat(etat, [remarque])).toContain("1 point à traiter");
  });

  it("ne propose aucune action là où il n'y a rien à relancer", () => {
    expect(ACTION_RELECTURE.ANALYSE_INDISPONIBLE).toBeNull();
    expect(ACTION_RELECTURE.SANS_TEXTE).toBeNull();
    expect(ACTION_RELECTURE.RELUE).not.toBeNull();
  });

  /**
   * Le défaut que ce lot corrige, pris à la racine : une version jamais
   * relue devant un service disponible retombait sur « relu, rien à
   * reprendre ». Elle porte maintenant le seul geste de l'écran.
   */
  it("un service disponible sur une version non relue propose l'analyse, il ne conclut pas", () => {
    const etat = etatDeLaRelecture({
      remarques: null,
      texteExistant: true,
      analysePossible: true,
    });
    expect(etat).toBe("A_ANALYSER");
    expect(resumeSelonLEtat(etat, null)).not.toContain("Rien à reprendre");
    // RG-08.4 : le geste coûte, et il le dit avant le clic.
    expect(resumeSelonLEtat(etat, null)).toContain("quota");
    expect(ACTION_RELECTURE.A_ANALYSER).not.toBeNull();
  });

  /**
   * Et la réciproque : une liste vide **sous une relecture réelle** reste
   * un résultat. Sans elle, la correction aurait supprimé l'état qu'elle
   * existe pour rendre enfin vrai.
   */
  it("une version réellement relue sans remarque dit qu'il n'y a rien à reprendre", () => {
    const etat = etatDeLaRelecture({
      remarques: [],
      texteExistant: true,
      analysePossible: true,
    });
    expect(etat).toBe("RELUE_SANS_REMARQUE");
    expect(resumeSelonLEtat(etat, [])).toContain("Rien à reprendre");
  });
});

describe("aucun service absent n'est simulé", () => {
  /**
   * Depuis le branchement du 22/09/2026, l'absence ne rend plus `null`
   * mais **nomme sa cause** : la route en tire le message, et le journal
   * la ligne que l'exploitant suit. Ce qui n'a pas changé, et qui est
   * tout, c'est qu'aucun texte n'est fabriqué.
   */
  it("la mise en forme et la critique ne rendent aucun texte, et disent pourquoi", async () => {
    const matiere = {
      piece: "Lettre de motivation",
      objet: "Motiver la candidature",
      pays: "les Pays-Bas",
      reponses: { 0: "Une réponse." },
      questions: [{ rang: 0, section: "PARCOURS", intitule: "Ton parcours ?" }],
    };

    const sansTexte = await REDACTEUR_NON_BRANCHE(matiere);
    expect(sansTexte.etat).toBe("SANS_TEXTE");
    expect("texte" in sansTexte).toBe(false);
    expect(sansTexte).toMatchObject({ cause: "non_configure" });

    const sansAvis = await CRITIQUE_NON_BRANCHEE("Un texte.", matiere);
    expect(sansAvis.etat).toBe("SANS_AVIS");
    /*
      Et surtout pas `remarques: []`, qui se lirait « relu, rien à
      reprendre » — le défaut que ce lot corrige, à sa source.
    */
    expect("remarques" in sansAvis).toBe(false);
    expect(sansAvis).toMatchObject({ cause: "non_configure" });
  });

  it("la clé décide, et l'environnement est passé plutôt que lu", () => {
    expect(redactionConfiguree({})).toBe(false);
    expect(redactionConfiguree({ ANTHROPIC_API_KEY: "   " })).toBe(false);
    expect(redactionConfiguree({ ANTHROPIC_API_KEY: "sk-test" })).toBe(true);
  });
});

/**
 * La route des versions — ce qu'elle refuse, et ce qu'elle ne fait pas payer.
 *
 * Trois propriétés qui portent sur du code appelant Prisma, et que le
 * source dit mieux qu'une base : elles tiennent à l'ordre des appels.
 */
describe("la route des versions ne fait pas payer une absence", () => {
  const source = readFileSync(
    "src/app/api/dossiers/[id]/redaction/[type]/version/route.ts",
    "utf8",
  );
  const code = sansCommentaires(source);

  /**
   * Débiter puis rendre s'annule, mais ouvre une fenêtre : entre les deux,
   * une interruption coûte une analyse pour un service dont on savait
   * d'avance qu'il ne répondrait pas. Ce qui est prévisible se vérifie
   * avant le débit.
   */
  it("ne débite rien quand le service est connu absent", () => {
    const garde = code.indexOf("if (!redactionConfiguree())");
    const debit = code.indexOf("debiterUneAnalyse(");
    expect(garde).toBeGreaterThan(0);
    expect(garde).toBeLessThan(debit);
  });

  /** INV-6 : le débit précède l'appel, jamais l'inverse. */
  it("débite avant d'appeler, quand le service est là", () => {
    expect(code.indexOf("debiterUneAnalyse(")).toBeLessThan(
      code.indexOf("leRedacteur()("),
    );
  });

  /**
   * La réécriture et la restauration sont le texte du candidat : aucun
   * modèle, aucun quota. Elles sortent de la fonction avant le débit.
   */
  it("ne débite ni la réécriture ni la restauration", () => {
    const debit = code.indexOf("debiterUneAnalyse(");
    for (const geste of ['geste === "reecriture"', 'geste === "restauration"']) {
      expect(code.indexOf(geste), geste).toBeGreaterThan(0);
      expect(code.indexOf(geste), geste).toBeLessThan(debit);
    }
  });

  /** Une version est un état passé : aucune écriture ne la modifie. */
  it("crée des versions, n'en modifie aucune", () => {
    expect(code).toContain("documentVersion.create");
    expect(code).not.toContain("documentVersion.update");
    expect(code).not.toContain("documentVersion.delete");
  });

  /** Le régime couvre ce qui coûte du quota (§ limites). */
  it("est au régime sensible", () => {
    expect(code).toContain('limite: "sensible"');
  });
});
