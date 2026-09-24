import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CONSERVATION_SOUMIS_MOIS,
  ETATS_SOUMIS_A_L_INACTIVITE,
  INVITATION_AVANT_JOURS,
  PREAVIS_JOURS,
  PROLONGATION_MOIS,
  avertissementDeSuspension,
  confirmationOuverte,
  debutDeLInvitation,
  echeanceAnnoncee,
  echeanceDeLaSuspension,
  echeanceProlongee,
  etatApresPurge,
  invitationDuDepot,
  preavisDuDepot,
  suiteDeLaSuspension,
  suiteDuDepot,
} from "@/domain/dossiers/conservation";
import { relanceDeBrouillon } from "@/domain/dossiers/inactivite";
import { echeanceDuDepot, echeanceDuDossierSoumis } from "@/server/dossiers/conservation";
import { conservationDuDepot } from "@/server/vue/dossier";
import {
  INTERDITS_INTERFACE_CANDIDAT,
  INTERDITS_PARTOUT,
  verifierTexte,
} from "@/domain/copy/vocabulaire-interdit";

/**
 * Arbitrage S.78 — la conservation des pièces selon l'état du dossier.
 *
 * Avant lui, un dossier payé, soumis ou suspendu dont le candidat ne
 * revenait jamais gardait ses pièces d'identité sans terme. Ces essais
 * tiennent les quatre règles, et ce qui les relie : aucune purge n'est
 * faite sans avoir été annoncée au moins trente jours avant.
 */

const JOUR = 86_400_000;
const jours = (n: number) => n * JOUR;
const DEPOT = new Date("2026-01-31T10:00:00Z");

describe("ce qu'une purge laisse", () => {
  it("un dossier soumis ou suspendu garde son état ; une clôture ou un abandon archivent", () => {
    expect(etatApresPurge("SOUMIS", false)).toBe("SOUMIS");
    expect(etatApresPurge("SUSPENDU", false)).toBe("SUSPENDU");
    expect(etatApresPurge("ISSUE_DECLAREE", false)).toBe("ARCHIVE");
    expect(etatApresPurge("ABANDONNE", false)).toBe("ARCHIVE");
  });

  it("la suppression de compte archive tout, comme avant", () => {
    for (const etat of ["SOUMIS", "SUSPENDU", "ACTIF", "PRET"] as const) {
      expect(etatApresPurge(etat, true), etat).toBe("ARCHIVE");
    }
  });

  it("n'est jamais plus proche que le préavis, même sur un stock ancien", () => {
    const maintenant = new Date("2028-06-01T00:00:00Z");
    const passee = new Date("2027-01-31T00:00:00Z");
    expect(echeanceAnnoncee(passee, maintenant).getTime()).toBe(
      maintenant.getTime() + jours(PREAVIS_JOURS),
    );
    const lointaine = new Date("2029-01-01T00:00:00Z");
    expect(echeanceAnnoncee(lointaine, maintenant)).toEqual(lointaine);
  });
});

describe("dossiers payés — RG-04.2 sans exception pour le paiement", () => {
  it("l'inactivité vise les brouillons, les dossiers actifs et les dossiers prêts", () => {
    expect([...ETATS_SOUMIS_A_L_INACTIVITE].sort()).toEqual(["ACTIF", "BROUILLON", "PRET"]);
  });

  /**
   * La requête ne partait que des brouillons. C'est elle qui décide de ce
   * qui est vu : une règle juste dans le domaine et une requête restée sur
   * `BROUILLON` laisseraient les dossiers payés hors du compte.
   */
  it("et la passe de nuit le lit de là, pas d'un état recopié", () => {
    const job = readFileSync("src/server/jobs/inactivite.ts", "utf8");
    expect(job).toMatch(/status: \{ in: \[\.\.\.ETATS_SOUMIS_A_L_INACTIVITE\] \}/u);
    expect(job).not.toMatch(/status: "BROUILLON"/u);
  });

  it("un dossier prêt est invité à déclarer son dépôt, pas à déposer une pièce", () => {
    const pret = relanceDeBrouillon("Pays-Bas", DEPOT, 8, true).corps;
    expect(pret).toContain("déclare-le dans ton dossier");
    expect(pret).not.toContain("Déposer une pièce suffit");
    expect(relanceDeBrouillon("Pays-Bas", DEPOT, 2).corps).toContain("Déposer une pièce suffit");
  });
});

describe("dossiers soumis — douze mois après le dépôt, six de plus par confirmation", () => {
  const echeance = echeanceDuDepot(DEPOT);

  it("conserve douze mois, sans déborder d'un 31", () => {
    expect(CONSERVATION_SOUMIS_MOIS).toBe(12);
    // Le 31 janvier plus douze mois : le 31 janvier suivant.
    expect(echeance.toISOString()).toBe("2027-01-31T10:00:00.000Z");
    expect(echeanceDuDepot(new Date("2027-02-28T00:00:00Z")).toISOString().slice(0, 10)).toBe(
      "2028-02-28",
    );
  });

  it("lit l'échéance posée, et se replie sur le dépôt déclaré à défaut", () => {
    const posee = new Date("2027-09-01T00:00:00Z");
    expect(
      echeanceDuDossierSoumis({ retentionUntil: posee, submittedAt: DEPOT, updatedAt: DEPOT }),
    ).toEqual(posee);
    expect(
      echeanceDuDossierSoumis({ retentionUntil: null, submittedAt: DEPOT, updatedAt: new Date() }),
    ).toEqual(echeance);
  });

  const au = (avantEcheance: number) => new Date(echeance.getTime() - jours(avantEcheance));

  it("se tait avant l'invitation, invite, puis annonce la purge", () => {
    const etat = { echeance, dejaInvite: false, purgeAnnoncee: false };
    expect(suiteDuDepot({ ...etat, maintenant: au(INVITATION_AVANT_JOURS + 1) })).toBe("RIEN");
    expect(suiteDuDepot({ ...etat, maintenant: au(INVITATION_AVANT_JOURS) })).toBe("INVITER");
    expect(suiteDuDepot({ ...etat, dejaInvite: true, maintenant: au(45) })).toBe("RIEN");
    expect(suiteDuDepot({ ...etat, dejaInvite: true, maintenant: au(PREAVIS_JOURS) })).toBe(
      "PREAVISER",
    );
  });

  it("n'invite pas à trente jours : le préavis invite aussi", () => {
    expect(
      suiteDuDepot({ echeance, dejaInvite: false, purgeAnnoncee: false, maintenant: au(10) }),
    ).toBe("PREAVISER");
  });

  it("ne réannonce pas une purge déjà annoncée", () => {
    expect(
      suiteDuDepot({ echeance, dejaInvite: true, purgeAnnoncee: true, maintenant: au(-5) }),
    ).toBe("RIEN");
  });

  it("prolonge de six mois depuis l'échéance, jamais depuis la réponse", () => {
    expect(PROLONGATION_MOIS).toBe(6);
    // Confirmer tôt ne fait rien perdre.
    expect(echeanceProlongee(echeance, au(50)).toISOString()).toBe("2027-07-31T10:00:00.000Z");
    // Pendant le préavis, une échéance passée repart d'aujourd'hui.
    const apres = new Date(echeance.getTime() + jours(10));
    expect(echeanceProlongee(echeance, apres).getTime()).toBeGreaterThan(apres.getTime());
  });

  /**
   * Ouverte en permanence, la confirmation ferait de six mois une unité
   * qu'on empile : dix clics le jour du dépôt vaudraient cinq ans.
   */
  it("ne s'ouvre qu'avec l'invitation", () => {
    expect(confirmationOuverte(echeance, au(INVITATION_AVANT_JOURS + 1))).toBe(false);
    expect(confirmationOuverte(echeance, au(INVITATION_AVANT_JOURS))).toBe(true);
    expect(debutDeLInvitation(echeance)).toEqual(au(INVITATION_AVANT_JOURS));
  });

  it("l'écran dit la même échéance, et le bouton suit la fenêtre", () => {
    const dossier = {
      retentionUntil: null,
      submittedAt: DEPOT,
      updatedAt: DEPOT,
      purgeDueAt: null,
      purgedAt: null,
    };
    const tot = conservationDuDepot(dossier, au(90));
    expect(tot.jusquAu).toBe("2027-01-31");
    expect(tot.confirmable).toBe(false);
    expect(tot.confirmableLe).toBe("2026-12-02");
    expect(conservationDuDepot(dossier, au(20)).confirmable).toBe(true);
    // Purgé : plus rien à confirmer.
    const purge = conservationDuDepot({ ...dossier, purgedAt: au(-40) }, au(-40));
    expect(purge.confirmable).toBe(false);
    expect(purge.purgeeLe).not.toBeNull();
  });
});

describe("dossiers suspendus — avertissement à onze mois, purge à douze", () => {
  const suspenduLe = new Date("2026-03-31T09:00:00Z");

  it("ne dit rien avant onze mois, avertit à onze, une seule fois", () => {
    expect(suiteDeLaSuspension(suspenduLe, false, new Date("2027-02-27T00:00:00Z"))).toBe("RIEN");
    // Le 31 mars plus onze mois : le 28 février, pas le 3 mars.
    expect(suiteDeLaSuspension(suspenduLe, false, new Date("2027-02-28T09:00:00Z"))).toBe(
      "AVERTIR",
    );
    expect(suiteDeLaSuspension(suspenduLe, true, new Date("2027-03-15T00:00:00Z"))).toBe("RIEN");
  });

  it("purge à douze mois, et jamais moins de trente jours après l'avertissement", () => {
    const averti = new Date("2027-02-28T09:00:00Z");
    expect(echeanceDeLaSuspension(suspenduLe, averti).toISOString()).toBe(
      "2027-03-31T09:00:00.000Z",
    );
    // Une pause vieille de deux ans, découverte par la première passe.
    const tard = new Date("2028-04-01T00:00:00Z");
    expect(echeanceDeLaSuspension(suspenduLe, tard).getTime()).toBe(
      tard.getTime() + jours(PREAVIS_JOURS),
    );
  });
});

describe("ce qu'on écrit", () => {
  const purgeLe = new Date("2027-01-31T10:00:00Z");
  const textes = [
    invitationDuDepot("Pays-Bas", purgeLe),
    preavisDuDepot("Pays-Bas", purgeLe),
    avertissementDeSuspension("Pays-Bas", purgeLe),
  ];

  it("chaque annonce porte la date, au jour de Cotonou", () => {
    for (const t of textes) expect(t.corps).toContain("31 janvier 2027");
    // 23 h 30 UTC le 31 est déjà le 1er à Cotonou.
    expect(preavisDuDepot("Pays-Bas", new Date("2027-01-31T23:30:00Z")).objet).toContain(
      "1er février 2027",
    );
  });

  it("dit le geste qui arrête la purge, et ce qui reste après elle", () => {
    expect(textes[0]!.corps).toContain("confirme-le depuis ton dossier");
    expect(textes[1]!.corps).toContain("la suppression sera annulée");
    expect(textes[2]!.corps).toContain("choisis de conserver ta version ou d'appliquer la nouvelle");
    expect(textes[0]!.corps).toContain("restent consultables");
    expect(textes[1]!.corps).toContain("restent consultables");
    expect(textes[2]!.corps).toContain("te seront redemandées à la reprise");
  });

  it("ne promet rien, et ne note rien", () => {
    for (const t of textes) {
      for (const texte of [t.titre, t.objet, t.corps]) {
        expect(verifierTexte(texte, INTERDITS_PARTOUT)).toEqual([]);
        expect(verifierTexte(texte, INTERDITS_INTERFACE_CANDIDAT)).toEqual([]);
      }
    }
  });
});

describe("C-11a — ce que la déclaration de dépôt dit", () => {
  it("seul un dossier prêt se déclare, les autres lisent leur raison", async () => {
    const { etatDuDepot } = await import("@/domain/dossiers/depot");
    expect(etatDuDepot("PRET").declarable).toBe(true);
    for (const statut of ["BROUILLON", "ACTIF", "EN_PAUSE", "SOUMIS", "CLOTURE"] as const) {
      const etat = etatDuDepot(statut);
      expect(etat.declarable, statut).toBe(false);
      expect(etat.corps.length, statut).toBeGreaterThan(40);
    }
  });

  it("annonce la conservation depuis les mêmes constantes, sans rien promettre", async () => {
    const { EFFETS_DEPOT, MENTION_DECLARATION, etatDuDepot } = await import("@/domain/dossiers/depot");
    expect(EFFETS_DEPOT.join(" ")).toContain(`${CONSERVATION_SOUMIS_MOIS} mois`);
    expect(EFFETS_DEPOT.join(" ")).toContain(`${PROLONGATION_MOIS} mois de plus`);
    const textes = [
      ...EFFETS_DEPOT,
      MENTION_DECLARATION,
      ...(["PRET", "ACTIF", "EN_PAUSE", "SOUMIS", "CLOTURE"] as const).map(
        (s) => `${etatDuDepot(s).titre} ${etatDuDepot(s).corps}`,
      ),
    ];
    for (const texte of textes) {
      expect(verifierTexte(texte, INTERDITS_PARTOUT)).toEqual([]);
      expect(verifierTexte(texte, INTERDITS_INTERFACE_CANDIDAT)).toEqual([]);
    }
  });
});
