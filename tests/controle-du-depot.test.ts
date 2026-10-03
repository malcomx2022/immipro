import { describe, expect, it } from "vitest";
import {
  MENTION_ATTENTE_PROLONGEE,
  MENTION_EN_QUARANTAINE,
  controleDuDepot,
  type DernierDepot,
} from "@/domain/dossiers/quarantaine";
import { ATTENTE_AU_CONTROLE } from "@/domain/securite/balayage";
import { MENTION_NON_ANALYSEE } from "@/domain/dossiers/piece";

/**
 * Le contrôle du dernier dépôt, lu sur l'écran de la pièce — 03/10/2026.
 * Le balayage passait ; l'écran n'en disait rien.
 */
const DEPOT: DernierDepot = {
  etat: "EN_QUARANTAINE",
  depose: true,
  purge: false,
  depuis: new Date("2026-10-03T04:30:00Z"),
  controleLe: null,
};
const MAINTENANT = new Date("2026-10-03T04:30:20Z");

describe("controleDuDepot", () => {
  it("rien à dire sans dépôt, sur une version rédigée ou un fichier purgé", () => {
    expect(controleDuDepot(null)).toBeNull();
    expect(controleDuDepot({ ...DEPOT, depose: false })).toBeNull();
    expect(controleDuDepot({ ...DEPOT, etat: "SAINE", purge: true })).toBeNull();
  });

  it("en quarantaine : le contrôle est en cours, avec la mention ordinaire", () => {
    expect(controleDuDepot(DEPOT, MAINTENANT)).toEqual({
      etat: "EN_QUARANTAINE",
      titre: "Contrôle de sécurité en cours",
      corps: MENTION_EN_QUARANTAINE,
    });
  });

  it("une attente longue ou une cause connue ne promet plus « quelques instants »", () => {
    const tard = new Date("2026-10-03T05:00:00Z");
    expect(controleDuDepot(DEPOT, tard)?.corps).toBe(MENTION_ATTENTE_PROLONGEE);
    expect(controleDuDepot({ ...DEPOT, cause: "trop_volumineux" }, MAINTENANT)?.corps).toBe(
      ATTENTE_AU_CONTROLE.trop_volumineux,
    );
  });

  it("saine : le contrôle est passé, daté", () => {
    const controle = controleDuDepot({
      ...DEPOT,
      etat: "SAINE",
      controleLe: new Date("2026-10-03T04:30:12Z"),
    });
    expect(controle?.titre).toBe("Fichier reçu et contrôlé");
    expect(controle?.corps).toContain("le 03/10/2026");
  });

  it("infectée : le fichier est écarté et la suite est dite, même sans octet", () => {
    const controle = controleDuDepot({ ...DEPOT, etat: "INFECTEE", depose: false });
    expect(controle?.etat).toBe("INFECTEE");
    expect(controle?.corps).toMatch(/Dépose une nouvelle version/u);
  });
});

describe("motif de non-analyse sans pack", () => {
  it("ne parle pas d'analyses « utilisées » quand il n'y en a jamais eu", () => {
    expect(MENTION_NON_ANALYSEE.sans_pack).not.toMatch(/utilisées|recharger/u);
    expect(MENTION_NON_ANALYSEE.sans_pack).toMatch(/pas de pack/u);
  });
});
