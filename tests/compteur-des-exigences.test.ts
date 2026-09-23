import { describe, expect, it } from "vitest";
import { computeCompleteness, versClient } from "@/domain/completeness/score";
import { libelleDenombrement } from "@/components/ui/CompletenessTier";
import {
  CE_QUI_DECIDE,
  CE_QUI_NE_PESE_PAS,
  expliquerLaCompletude,
} from "@/domain/completeness/explication";
import { resumeDuJour, type Dossier } from "@/domain/dossiers/dossier";

/**
 * Une exigence n'est pas une pièce — correctif du lot précédent.
 *
 * ── Le défaut, tel qu'il s'est présenté ─────────────────────────────
 *
 * `compteurs.obligatoiresManquantes` additionnait les pièces obligatoires
 * non conformes **et** les conditions bloquantes non tenues. Tant que le
 * chemin des écrans passait `conditions: []`, cela ne se voyait pas. Le lot
 * qui a réuni les deux calculs l'a rendu visible : sur un dossier dont
 * toutes les pièces sont conformes et dont une seule condition bloque,
 *
 *     compteurs    : {"obligatoiresManquantes":1,"conformes":2}
 *     dénombrement : « 1 pièce obligatoire manque »
 *
 * — et le candidat descendait d'un écran pour trouver une checklist
 * entièrement verte. La contradiction était visible à l'œil nu.
 *
 * L'explication du palier disait la même chose à l'envers : les conditions
 * y figuraient sous « ce qui ne pèse pas », alors qu'elles venaient de se
 * mettre à peser.
 */
const resultat = (conditionsEchouees: number, piecesManquantes = 0) =>
  versClient(
    computeCompleteness({
      documents: [
        { code: "passeport", libelle: "Passeport", required: true, status: "CONFORME" },
        {
          code: "preuve_fonds",
          libelle: "Ressources",
          required: true,
          status: piecesManquantes > 0 ? "ATTENDUE" : "CONFORME",
        },
      ],
      conditions: Array.from({ length: conditionsEchouees }, (_, i) => ({
        code: `exigence_${i}`,
        bloquant: true,
        satisfaite: false,
        messageEchec: `L'autorité exige la pièce numéro ${i}.`,
      })),
      coherence: 1,
      redaction: 1,
    }),
  );

describe("le compteur distingue une pièce d'une exigence", () => {
  it("ne compte que des pièces parmi les obligatoires manquantes", () => {
    const { compteurs } = resultat(1);

    expect(compteurs.obligatoiresManquantes).toBe(0);
    expect(compteurs.exigencesNonTenues).toBe(1);
    expect(compteurs.conformes).toBe(2);
  });

  it("compte les deux séparément quand les deux manquent", () => {
    const { compteurs } = resultat(2, 1);

    expect(compteurs.obligatoiresManquantes).toBe(1);
    expect(compteurs.exigencesNonTenues).toBe(2);
  });
});

describe("l'en-tête de complétude", () => {
  it("n'annonce pas une pièce manquante sur une checklist entièrement verte", () => {
    const phrase = libelleDenombrement(resultat(1).compteurs);

    expect(phrase).toBe("1 exigence n'est pas remplie");
    expect(phrase).not.toContain("pièce obligatoire");
  });

  it("nomme les deux quand les deux manquent", () => {
    expect(libelleDenombrement(resultat(2, 1).compteurs)).toBe(
      "1 pièce obligatoire manque, 2 exigences ne sont pas remplies",
    );
  });

  it("garde sa phrase d'origine quand rien ne manque", () => {
    expect(libelleDenombrement(resultat(0).compteurs)).toBe(
      "Toutes les pièces demandées sont conformes",
    );
  });

  it("garde sa phrase d'origine quand seules des complémentaires restent", () => {
    expect(
      libelleDenombrement({
        obligatoiresManquantes: 0,
        exigencesNonTenues: 0,
        facultativesManquantes: 2,
        conformes: 3,
      }),
    ).toBe("2 pièces complémentaires restent à traiter");
  });
});

describe("l'explication du palier", () => {
  it("range les conditions parmi ce qui décide, et non parmi ce qui ne pèse pas", () => {
    expect(CE_QUI_DECIDE.some((p) => p.includes("conditions bloquantes"))).toBe(true);
    expect(CE_QUI_NE_PESE_PAS.some((p) => p.includes("conditions"))).toBe(false);
  });

  it("dit qu'aucune pièce ne lève l'exigence, pour ne pas envoyer chercher", () => {
    const { surTonDossier } = expliquerLaCompletude(resultat(1));
    const phrase = surTonDossier.find((p) => p.includes("exigence"))!;

    expect(phrase).toContain("aucune pièce ne la lève");
    expect(phrase).toContain("n'est pas remplie");
  });

  /** L'accord porte sur le verbe, le participe et le pronom à la fois. */
  it("accorde correctement au pluriel", () => {
    const { surTonDossier } = expliquerLaCompletude(resultat(2));
    const phrase = surTonDossier.find((p) => p.includes("exigences"))!;

    expect(phrase).toContain("ne sont pas remplies");
    expect(phrase).toContain("aucune pièce ne les lève");
    expect(phrase).not.toContain("n'est pas remplies");
  });
});

describe("le résumé du tableau de bord", () => {
  const dossier = (completude: ReturnType<typeof resultat>): Dossier =>
    ({
      id: "d",
      destination: { slug: "s", pays: "P", resume: "", autorite: "" },
      statut: "ACTIF",
      completude,
      prochaineAction: "",
      pieces: [],
    }) as unknown as Dossier;

  it("n'annonce pas « rien ne bloque » quand une exigence bloque", () => {
    const phrase = resumeDuJour([dossier(resultat(1))]);

    expect(phrase).not.toContain("rien ne bloque");
    expect(phrase).toBe("1 dossier ouvert, 1 exigence à lever.");
  });

  it("nomme les deux quand les deux manquent", () => {
    expect(resumeDuJour([dossier(resultat(2, 1))])).toBe(
      "1 dossier ouvert, 1 pièce obligatoire à réunir et 2 exigences à lever.",
    );
  });

  it("dit « rien ne bloque » quand rien ne bloque", () => {
    expect(resumeDuJour([dossier(resultat(0))])).toBe("1 dossier ouvert, rien ne bloque un dépôt.");
  });
});
