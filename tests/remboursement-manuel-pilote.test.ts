import { describe, expect, it } from "vitest";
import {
  DEPENDANCES,
  SEUIL_PILOTE_REMBOURSEMENT_MANUEL,
  capacite,
  constater,
  etatDesCapacites,
  surveillanceRemboursementManuel,
} from "@/domain/exploitation/dependances";
import { constaterLesDependances, observer } from "@/server/exploitation/capacites";

/**
 * Le remboursement manuel FedaPay, accepté pour le pilote — décision du
 * 03/10/2026. FedaPay n'a pas d'API de remboursement (S.91) ; pour dix
 * dossiers, la procédure au tableau de bord, déclarée en B-04, suffit.
 */
const PILOTE = {
  PAIEMENT_FOURNISSEURS: "FEDAPAY",
  FEDAPAY_ENVIRONMENT: "sandbox",
  FEDAPAY_API_KEY: "sk_sandbox_essai",
  FEDAPAY_WEBHOOK_SECRET: "wh_sandbox_essai",
  APP_URL: "https://immipro.test",
};
const remboursement = DEPENDANCES.find((d) => d.cle === "remboursement")!;

describe("capacité « procédure manuelle »", () => {
  it("sans adaptateur, une procédure acceptée n'est pas une absence", () => {
    expect(
      capacite(remboursement, { adaptateur: false, configuree: true, sonde: "ABSENTE", procedureManuelle: true }),
    ).toBe("PROCEDURE_MANUELLE");
    expect(capacite(remboursement, { adaptateur: false, configuree: true, sonde: "ABSENTE" })).toBe(
      "IMPLEMENTATION_ABSENTE",
    );
  });

  it("le pilote FedaPay lit le remboursement en procédure manuelle", () => {
    const vu = observer(remboursement, PILOTE);
    expect(vu).toMatchObject({ adaptateur: false, procedureManuelle: true });
    expect(capacite(remboursement, vu)).toBe("PROCEDURE_MANUELLE");
  });

  it("elle est une réserve : l'instance passe en pilote, plus en inapte", () => {
    const constat = constater(remboursement, observer(remboursement, PILOTE));
    const etat = etatDesCapacites([constat]);
    expect(etat.aptitude).toBe("PILOTE");
    expect(etat.reserves).toContain("remboursement");
    expect(etat.bloquantes).not.toContain("remboursement");
  });

  it("sur l'environnement complet du pilote, plus aucune bloquante de paiement", () => {
    const constats = constaterLesDependances(PILOTE);
    const etat = etatDesCapacites(constats);
    for (const cle of ["paiements", "ouverture_paiement", "remboursement"]) {
      expect(etat.bloquantes, cle).not.toContain(cle);
    }
  });
});

describe("le seuil du pilote — l'alerte", () => {
  it("en bac à sable, les paiements d'essai ne comptent pas", () => {
    expect(surveillanceRemboursementManuel(50, false)).toMatchObject({ compte: false, depasse: false });
  });

  it("jusqu'au seuil, la décision couvre ; au-delà, elle ne couvre plus et le dit", () => {
    expect(SEUIL_PILOTE_REMBOURSEMENT_MANUEL).toBe(10);
    expect(surveillanceRemboursementManuel(10, true).depasse).toBe(false);
    const au_dela = surveillanceRemboursementManuel(11, true);
    expect(au_dela.depasse).toBe(true);
    expect(au_dela.message).toMatch(/Reprendre la décision/u);
  });
});
