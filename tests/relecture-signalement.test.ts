import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  consommeUneAnalyse,
  mentionDeRelecture,
  mentionSuite,
  resultatAffiche,
} from "@/domain/dossiers/analyse";
import {
  AUTRE_CHOSE,
  MOTIF_DU_SIGNALEMENT,
  refusDuSignalement,
  resumeDuSignalement,
} from "@/domain/dossiers/signalement";
import { HISTORIQUE_VIDE, sortDeLaVersion, type VersionDeLaPiece } from "@/domain/dossiers/historique";
import { messageCoupure, mentionPied } from "@/domain/dossiers/televersement";
import { INTERDITS_ECRAN_CANDIDAT, verifierTexte } from "@/domain/copy/vocabulaire-interdit";

/**
 * S.157 — les trois anomalies de la recette RF-5 (R-01 à R-03), dans le
 * domaine. Le chemin réel contre une base s'éprouve dans `smoke:extraction`.
 */
const lecture = { verdict: "ILLISIBLE" as const, titre: "Cette pièce demande une relecture", corps: "Un opérateur regarde ta pièce." };
const quota = { restantes: 4, total: 5 };

describe("R-01 — la décision de la relecture prime sur la lecture", () => {
  it("remplace verdict, titre et texte par la décision", () => {
    expect(resultatAffiche(lecture, null)).toEqual(lecture);
    expect(
      resultatAffiche(lecture, {
        verdict: "CONFORME",
        titre: "Ta pièce a été acceptée après relecture",
        message: "La pièce est validée, tu n'as rien à refaire.",
      }),
    ).toEqual({
      verdict: "CONFORME",
      titre: "Ta pièce a été acceptée après relecture",
      corps: "La pièce est validée, tu n'as rien à refaire.",
    });
  });

  it("garde le prix d'une reprise sur la lecture (FON-03), pas sur la décision", () => {
    // Lue illisible, relue « à corriger » : la reprise reste gratuite.
    expect(consommeUneAnalyse("ILLISIBLE")).toBe(false);
    expect(mentionSuite("A_CORRIGER", quota, "ILLISIBLE")).toBe("Cette reprise ne consomme pas d'analyse");
    // Lue conforme, relue « à corriger » : la reprise se paie.
    expect(mentionSuite("A_CORRIGER", quota, "CONFORME")).toBe("Analyses restantes : 4 sur 5");
    // Acceptée : aucune reprise n'est proposée, la mention redit le solde.
    expect(mentionSuite("CONFORME", quota, "ILLISIBLE")).toBe("Analyses restantes : 4 sur 5");
    // Sans relecture, rien ne change.
    expect(mentionSuite("ILLISIBLE", quota)).toBe("Cette reprise ne consomme pas d'analyse");
  });

  it("dit la relecture en cours, et se tait une fois tranchée", () => {
    expect(mentionDeRelecture({ etat: "EN_COURS", signalee: true })).toContain("Ton signalement est enregistré");
    expect(mentionDeRelecture({ etat: "EN_COURS", signalee: false })).toContain("relit la pièce");
    expect(mentionDeRelecture({ etat: "TRANCHEE", decideeLe: "2026-10-09T18:00:00Z" })).toBeNull();
  });

  it("lit la revue de la lecture affichée dans la lecture de C-08", () => {
    const lectureServeur = readFileSync("src/server/lecture/dossiers.ts", "utf8");
    expect(lectureServeur).toContain("include: { review: true }");
    expect(lectureServeur).toContain("resultatAffiche(");
  });
});

describe("R-02 — la coupure ne promet que ce qui aura lieu", () => {
  it("promet l'envoi automatique seulement quand il est armé", () => {
    expect(messageCoupure("ENVOI_EN_ATTENTE")).toContain("sera envoyé dès le retour du réseau");
    expect(messageCoupure("HORS_LIGNE")).not.toContain("sera envoyé");
    expect(messageCoupure("RELANCE_ECHOUEE")).toContain("Réessayer l'envoi");
    expect(mentionPied("RESEAU_COUPE", "HORS_LIGNE")).not.toContain("automatique");
  });

  it("relance l'envoi de lui-même au retour du réseau", () => {
    const ecran = readFileSync(
      "src/app/(app)/(dossier)/dossiers/[id]/pieces/[pieceId]/PieceDuDossier.tsx",
      "utf8",
    );
    expect(ecran).toMatch(/if \(aRelancer\.current\) relancer\(\);/u);
    expect(ecran).toContain("void envoiCourant.current(true)");
  });
});

describe("R-03 — signalement et historique", () => {
  const lus = ["Titulaire", "Solde disponible"];

  it("n'accepte que les valeurs montrées, ou « autre chose »", () => {
    expect(refusDuSignalement([], lus)).toContain("Coche au moins une valeur");
    expect(refusDuSignalement(["Solde disponible"], lus)).toBeNull();
    expect(refusDuSignalement([AUTRE_CHOSE], lus)).toBeNull();
    expect(refusDuSignalement(["Numéro inventé"], lus)).toContain("Recharge-la");
  });

  it("résume pour l'opérateur ce que le candidat désigne", () => {
    expect(resumeDuSignalement(["Solde disponible", AUTRE_CHOSE])).toBe(
      "Le candidat signale comme fausses : Solde disponible, Autre chose.",
    );
    expect(MOTIF_DU_SIGNALEMENT.trim().length).toBeGreaterThan(0);
  });

  it("dit le sort de chaque version", () => {
    const base: VersionDeLaPiece = {
      rang: 1,
      courante: false,
      deposeeLe: "2026-10-09T10:00:00Z",
      fichier: "releve.pdf",
      controle: "SAINE",
      purgee: false,
      verdictLu: "ILLISIBLE",
      decision: null,
    };
    expect(sortDeLaVersion({ ...base, controle: "INFECTEE" })).toContain("Écartée");
    expect(sortDeLaVersion({ ...base, controle: "EN_QUARANTAINE" })).toContain("en cours");
    expect(sortDeLaVersion(base)).toBe("Lue automatiquement : illisible.");
    expect(sortDeLaVersion({ ...base, decision: "CONFORME" })).toBe(
      "Relue par une personne de l'équipe : conforme.",
    );
    expect(sortDeLaVersion({ ...base, verdictLu: null, purgee: true })).toContain("supprimé");
  });

  it("n'écrit aucune promesse ni note chez le candidat", () => {
    const textes = [
      HISTORIQUE_VIDE,
      messageCoupure("ENVOI_EN_ATTENTE"),
      messageCoupure("RELANCE_ECHOUEE"),
      messageCoupure("HORS_LIGNE"),
      mentionDeRelecture({ etat: "EN_COURS", signalee: true })!,
      refusDuSignalement([], lus)!,
      refusDuSignalement(["x"], lus)!,
    ];
    for (const t of textes) expect(verifierTexte(t, INTERDITS_ECRAN_CANDIDAT)).toEqual([]);
  });

  it("ouvre une seule revue par lecture, et la trace au journal", () => {
    const service = readFileSync("src/server/dossiers/signalement.ts", "utf8");
    expect(service).toContain('reason: "SIGNALE_PAR_LE_CANDIDAT"');
    expect(service).toContain('action: "piece.signalement"');
    expect(service).toContain("exigerModifiable(dossier)");
    expect(service).toContain('"P2002"');
  });
});
