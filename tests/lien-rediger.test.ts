/**
 * S.218 — « Rédiger » mène à l'entretien guidé, ou au dépôt.
 *
 * Relevé en production le 06/11 : la ligne « CV et plan d'études motivé »
 * (Suisse, études) menait à `/dossiers/<id>/redaction/<id du document>`,
 * que la page de rédaction lit comme un type de pièce : « Cette page
 * n'existe pas ou plus ». Le lien de toute pièce à rédiger était faux ; et
 * cette pièce-là n'a, de plus, aucun entretien guidé.
 */
import { describe, expect, it } from "vitest";
import type { Document } from "@prisma/client";
import { libelleAction, lienDePiece, sousTitreDepot, type Piece } from "@/domain/dossiers/piece";
import { PIECES_REDIGEABLES, typeDeRedaction } from "@/lib/contenu/redaction";
import { versPiece } from "@/server/vue/dossier";
import { REGLES_DE_REFERENCE } from "../prisma/seed/visa-rules.data";

const DOSSIER = "e8d4245b-bf30-4168-a6ac-525233253be7";
const DOCUMENT = "4d3de69b-3d1a-49df-8b00-000000000000";

const piece = (p: Partial<Piece>): Piece => ({
  id: DOCUMENT,
  code: "MOT",
  libelle: "Lettre de motivation",
  famille: "COMPLEMENTAIRE",
  etat: "ATTENDUE",
  remede: "REDIGER",
  ...p,
});

const document = (code: string, remedy: Document["remedy"], extra: Partial<Document> = {}): Document =>
  ({
    id: DOCUMENT,
    applicationId: DOSSIER,
    code,
    label: code,
    family: "OBLIGATOIRE",
    required: true,
    remedy,
    status: "ATTENDUE",
    extracted: null,
    feedback: null,
    finding: null,
    hint: null,
    validityMonths: null,
    expiresAt: null,
    analyzedAt: null,
    createdAt: new Date("2026-11-01T00:00:00Z"),
    ...extra,
  }) as Document;

describe("le lien d'une pièce à rédiger", () => {
  it("mène à l'entretien de son type, jamais à l'identifiant du document", () => {
    const lien = lienDePiece(DOSSIER, piece({ redaction: "lettre-motivation" }));
    expect(lien).toBe(`/dossiers/${DOSSIER}/redaction/lettre-motivation`);
    expect(lien).not.toContain(DOCUMENT);
  });
  it("sans entretien guidé, mène au dépôt et se nomme « Ajouter »", () => {
    const sansEntretien = piece({ code: "CVP", libelle: "CV et plan d'études motivé" });
    expect(lienDePiece(DOSSIER, sansEntretien)).toBe(`/dossiers/${DOSSIER}/pieces/${DOCUMENT}`);
    expect(libelleAction(sansEntretien)).toBe("Ajouter");
    expect(sousTitreDepot(sansEntretien)).toMatch(/^Dépose ton document en PDF/u);
    expect(sousTitreDepot(sansEntretien)).not.toMatch(/entretien guidé/u);
  });
  it("avec entretien, le dépôt propose aussi la rédaction", () => {
    expect(sousTitreDepot(piece({ redaction: "lettre-motivation" }))).toMatch(/rédige-la avec l'entretien guidé/u);
  });
  it("une pièce à téléverser garde son dépôt, même si un type traîne", () => {
    expect(lienDePiece(DOSSIER, piece({ remede: "TELEVERSER", redaction: "lettre-motivation" })))
      .toBe(`/dossiers/${DOSSIER}/pieces/${DOCUMENT}`);
  });
});

describe("typeDeRedaction — du code du référentiel à la route", () => {
  it.each(PIECES_REDIGEABLES.map((p) => [p.type.replace(/-/gu, "_"), p.type]))("%s → %s", (code, type) => {
    expect(typeDeRedaction(code)).toBe(type);
  });
  it.each(["cv_plan_etudes", "passeport", "", "lettre motivation"])("%j n'a pas d'entretien", (code) => {
    expect(typeDeRedaction(code)).toBeNull();
  });
});

describe("versPiece — la vue porte l'entretien de la pièce", () => {
  it("une lettre de motivation à rédiger porte son type", () => {
    expect(versPiece(document("lettre_motivation", "REDIGER"), "2026-11-06")).toMatchObject({
      id: DOCUMENT, remede: "REDIGER", redaction: "lettre-motivation",
    });
  });
  it("le CV et plan d'études (Suisse) n'en porte aucun, et mène au dépôt", () => {
    const vue = versPiece(document("cv_plan_etudes", "REDIGER"), "2026-11-06");
    expect(vue.redaction).toBeUndefined();
    expect(lienDePiece(DOSSIER, vue)).toBe(`/dossiers/${DOSSIER}/pieces/${DOCUMENT}`);
    expect(libelleAction(vue)).toBe("Ajouter");
  });
  it("une pièce à téléverser n'en porte jamais", () => {
    expect(versPiece(document("lettre_motivation", "TELEVERSER"), "2026-11-06").redaction).toBeUndefined();
  });
});

describe("inventaire du référentiel", () => {
  it("chaque pièce « à rédiger » du référentiel a un entretien, sauf celles listées ici", () => {
    const sansEntretien = REGLES_DE_REFERENCE.flatMap((r) =>
      (r.rules.pieces_requises as readonly { code: string; nature?: string }[])
        .filter((p) => p.nature === "rediger" && typeDeRedaction(p.code) === null)
        .map((p) => `${r.countryCode}:${p.code}`),
    );
    // Décision du 06/11 : le CV et plan d'études suisse se dépose en attendant
    // un entretien dédié. Toute nouvelle pièce sans entretien doit être vue.
    expect(sansEntretien).toEqual(["CH:cv_plan_etudes"]);
  });
});
