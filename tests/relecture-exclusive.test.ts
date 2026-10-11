import { describe, expect, it } from "vitest";
import {
  etatDeLaReservation,
  RELECTURE_EN_COURS,
  RELECTURE_REMPLACEE,
  RELECTURE_INTERROMPUE,
} from "@/domain/redaction/relecture-reservation";
import { INTERDITS_PARTOUT, verifierTexte } from "@/domain/copy/vocabulaire-interdit";

const maintenant = new Date("2026-10-11T12:00:00Z");
describe("WF-08 — disponibilité d'une réservation de relecture", () => {
  it("un avis déjà daté prime même sur une ancienne réservation", () => {
    expect(etatDeLaReservation(maintenant, new Date(0), maintenant)).toBe("RELUE");
  });
  it("sans avis ni réservation, un geste est possible", () => {
    expect(etatDeLaReservation(null, null, maintenant)).toBe("LIBRE");
  });
  it.each([
    [-1, "EXPIREE"],
    [0, "EXPIREE"],
    [1, "EN_COURS"],
  ] as const)("échéance à %+d ms : %s", (ecart, attendu) => {
    expect(etatDeLaReservation(null, new Date(maintenant.getTime() + ecart), maintenant)).toBe(
      attendu,
    );
  });
  it.each([RELECTURE_EN_COURS, RELECTURE_REMPLACEE, RELECTURE_INTERROMPUE])(
    "le message candidat respecte le vocabulaire : %s",
    (message) => {
      expect(verifierTexte(message, INTERDITS_PARTOUT)).toEqual([]);
    },
  );
});
