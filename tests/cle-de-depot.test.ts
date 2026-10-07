import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { cleObjet } from "@/server/securite/secret";
import {
  cleDeDepotValide,
  prefixeDeDepot,
  REFUS_DE_LA_CONFIRMATION,
} from "@/domain/dossiers/televersement";
import { sansCommentaires } from "@/domain/copy/source";

/**
 * La clé d'un dépôt — revue du 07/10/2026, M1.
 *
 * La confirmation écrivait la clé que le navigateur renvoyait, sans la
 * vérifier. Avec la clé d'un autre candidat, le balayage promouvait son
 * fichier sous un autre dossier et le rendait lisible. `smoke:balayage`
 * l'exécute contre un stockage ; ces cas tiennent la forme de la clé.
 */
describe("une confirmation ne désigne que le dépôt de sa pièce", () => {
  const DOSSIER = "6f1c2e7a-0000-4000-8000-000000000001";

  it("toute clé fabriquée par le serveur est reconnue", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(cleDeDepotValide(cleObjet(DOSSIER, "passeport"), DOSSIER, "passeport")).toBe(true);
    }
  });

  it("refuse la clé d'un autre dossier — le défaut reproduit", () => {
    const autre = cleObjet("6f1c2e7a-0000-4000-8000-000000000002", "passeport");
    expect(cleDeDepotValide(autre, DOSSIER, "passeport")).toBe(false);
  });

  it("refuse la clé d'une autre pièce, une clé arbitraire, un chemin détourné", () => {
    expect(cleDeDepotValide(cleObjet(DOSSIER, "releve_bancaire"), DOSSIER, "passeport")).toBe(false);
    expect(cleDeDepotValide("une/cle/quelconque", DOSSIER, "passeport")).toBe(false);
    expect(
      cleDeDepotValide(`${prefixeDeDepot(DOSSIER, "passeport")}../../autre/x`, DOSSIER, "passeport"),
    ).toBe(false);
    expect(cleDeDepotValide(prefixeDeDepot(DOSSIER, "passeport"), DOSSIER, "passeport")).toBe(false);
  });

  it("la clé fabriquée et la clé vérifiée partagent leur préfixe", () => {
    expect(cleObjet(DOSSIER, "passeport").startsWith(prefixeDeDepot(DOSSIER, "passeport"))).toBe(true);
  });

  it("les refus disent quoi refaire", () => {
    expect(REFUS_DE_LA_CONFIRMATION.cle).toContain("Relance l'envoi");
    expect(REFUS_DE_LA_CONFIRMATION.absent).toContain("cinq minutes");
    expect(REFUS_DE_LA_CONFIRMATION.taille(120 * 1024, 340 * 1024)).toBe(
      "Le fichier reçu fait 120 Ko, ta demande en annonçait 340 Ko : l'envoi a été interrompu. Relance-le depuis ta checklist.",
    );
  });

  it("la route vérifie le dépôt avant d'enregistrer la version", () => {
    const route = sansCommentaires(
      readFileSync("src/app/api/dossiers/[id]/pieces/[pieceId]/depot/route.ts", "utf8"),
    );
    const verification = route.indexOf("await exigerUnDepotConforme(corps.cle, corps.octets");
    expect(verification).toBeGreaterThan(-1);
    expect(verification).toBeLessThan(route.indexOf("enregistrerLaVersion(piece.id"));
  });
});
