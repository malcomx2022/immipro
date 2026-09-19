import { describe, expect, it, beforeEach } from "vitest";
import {
  ECHECS,
  INTERROMPENT_UNE_SAISIE,
  echec,
  pourCandidat,
  pourOperateur,
  type CodeEchec,
} from "@/server/http/echecs";
import { decider, REGLES, cleDAppel, consommer, reinitialiser } from "@/server/http/limites";
import { signatureValide, lireEntete, TOLERANCE_SECONDES } from "@/server/paiement/signature";
import { createHmac } from "node:crypto";
import { effetDeLaNotification, aExpirer, aReconcilier } from "@/server/paiement/cycle";

/**
 * Socle de l'API. Ce qui est vérifié ici ne l'est nulle part ailleurs : ce
 * sont des décisions pures, prises une fois pour trente-cinq routes.
 */

describe("contrat d'échec — DOC-12 §16", () => {
  const codes = Object.keys(ECHECS) as CodeEchec[];

  it.each(codes)("%s nomme le fait et propose une suite (règles 1 et 4)", (code) => {
    const e = ECHECS[code];
    expect(e.titre.length).toBeGreaterThan(0);
    expect(e.action.length).toBeGreaterThan(0);
    // Règle 1 : le titre nomme le fait, pas le sentiment.
    expect(e.titre).not.toMatch(/oups|désolé|erreur est survenue|quelque chose/iu);
  });

  it.each(INTERROMPENT_UNE_SAISIE)("%s dit ce qui est conservé (règle 2)", (code) => {
    expect(ECHECS[code].conserve).toBeTruthy();
  });

  it("aucun message n'est un constat nu", () => {
    const nus = /^(document\s+)?(non\s+conforme|invalide|illisible|refus[ée]e?|ko)\.?$/iu;
    for (const code of codes) {
      expect(nus.test(ECHECS[code].corps)).toBe(false);
    }
  });

  it("le tutoiement est tenu là où la phrase s'adresse au candidat (règle 5)", () => {
    const vouvoiement = /\bvous\b|\bvotre\b|\bvos\b/iu;
    for (const code of codes) {
      expect(`${ECHECS[code].corps} ${ECHECS[code].conserve ?? ""}`).not.toMatch(vouvoiement);
    }
  });

  it("un écran candidat ne reçoit ni code, ni service, ni trace (règle 3)", () => {
    const e = echec("service_indisponible", {
      diagnostic: { service: "fedapay", statutAmont: 503, survenuA: "2026-09-19T09:18:00Z" },
    });
    const candidat = pourCandidat(e);

    expect(JSON.stringify(candidat)).not.toContain("fedapay");
    expect(JSON.stringify(candidat)).not.toContain("503");
    expect(candidat).not.toHaveProperty("code");
    expect(candidat).not.toHaveProperty("diagnostic");
  });

  it("le back-office reçoit le code et l'horodatage — l'exception B-02", () => {
    const e = echec("service_indisponible", {
      diagnostic: { service: "regles", statutAmont: 503, survenuA: "2026-09-19T09:18:00Z" },
    });
    const operateur = pourOperateur(e);

    expect(operateur.code).toBe("service_indisponible");
    expect(operateur.diagnostic?.service).toBe("regles");
    expect(operateur.diagnostic?.statutAmont).toBe(503);
  });

  it("le ton distingue l'échec de l'attente et de la limite (règle 7)", () => {
    expect(ECHECS.quota_epuise.ton).toBe("limite");
    expect(ECHECS.trop_de_requetes.ton).toBe("attente");
    expect(ECHECS.corps_illisible.ton).toBe("echec");
  });
});

describe("limitation de débit", () => {
  beforeEach(reinitialiser);

  it("laisse passer jusqu'au quota, puis refuse", () => {
    const regle = { appels: 3, fenetreSecondes: 60 };
    let historique: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const r = decider(historique, 1_000 + i, regle);
      historique = r.historique;
      expect(r.verdict.autorise).toBe(true);
    }
    expect(decider(historique, 1_003, regle).verdict.autorise).toBe(false);
  });

  it("la fenêtre glisse : un appel sorti de la fenêtre rouvre une place", () => {
    const regle = { appels: 2, fenetreSecondes: 10 };
    const historique = [0, 5_000];
    // À 11 s, l'appel de 0 est sorti de la fenêtre de 10 s.
    expect(decider(historique, 11_000, regle).verdict.autorise).toBe(true);
  });

  it("le délai de reprise est annoncé, pas deviné", () => {
    const regle = { appels: 1, fenetreSecondes: 60 };
    const { historique } = decider([], 0, regle);
    const refus = decider(historique, 10_000, regle);
    expect(refus.verdict.autorise).toBe(false);
    expect(refus.verdict.reprendDans).toBeGreaterThan(0);
    expect(refus.verdict.reprendDans).toBeLessThanOrEqual(60);
  });

  it("l'écran d'attente tient sa cadence : cent relevés sur cinq minutes passent", () => {
    // $-03 relève toutes les trois secondes pendant cinq minutes.
    for (let i = 0; i < 100; i += 1) {
      const verdict = consommer("paiements.statut|u1", "attente", i * 3_000);
      expect(verdict.autorise).toBe(true);
    }
  });

  it("la même cadence est refusée sur une route sensible", () => {
    let dernier = { autorise: true };
    for (let i = 0; i < 100; i += 1) {
      dernier = consommer("paiements.creation|u1", "sensible", i * 3_000);
    }
    expect(dernier.autorise).toBe(false);
  });

  it("deux comptes ne partagent pas le compteur, deux anonymes derrière une adresse si", () => {
    expect(cleDAppel("r", "u1", "1.2.3.4")).not.toBe(cleDAppel("r", "u2", "1.2.3.4"));
    expect(cleDAppel("r", null, "1.2.3.4")).toBe(cleDAppel("r", null, "1.2.3.4"));
  });

  it("le régime de lecture est plus large que le régime sensible", () => {
    expect(REGLES.lecture.appels).toBeGreaterThan(REGLES.sensible.appels);
  });
});

describe("signature de webhook — INV-7, RG-05.3", () => {
  const secret = "secret-de-test";
  const corps = '{"entity":{"id":42,"status":"approved","reference":"IMP-260919-ABC123"}}';
  const maintenant = 1_758_240_000_000;
  const t = Math.floor(maintenant / 1000);
  const signer = (horodatage: number, charge: string) =>
    createHmac("sha256", secret).update(`${horodatage}.${charge}`, "utf8").digest("hex");

  const verifier = (entete: string | null, charge = corps, quand = maintenant) =>
    signatureValide({ entete, corpsBrut: charge, secret, champSignature: "s", maintenant: quand });

  it("accepte une signature juste", () => {
    expect(verifier(`t=${t},s=${signer(t, corps)}`)).toBe(true);
  });

  it("refuse une signature portant sur un autre corps", () => {
    expect(verifier(`t=${t},s=${signer(t, '{"entity":{"id":43}}')}`)).toBe(false);
  });

  it("refuse un rejeu au-delà de la tolérance", () => {
    const vieux = t - TOLERANCE_SECONDES - 1;
    expect(verifier(`t=${vieux},s=${signer(vieux, corps)}`)).toBe(false);
  });

  it("accepte pendant la rotation de secret : plusieurs signatures, une suffit", () => {
    expect(verifier(`t=${t},s=aaaa,s=${signer(t, corps)}`)).toBe(true);
  });

  it("refuse quand le secret n'est pas configuré", () => {
    expect(
      signatureValide({
        entete: `t=${t},s=${signer(t, corps)}`,
        corpsBrut: corps,
        secret: undefined,
        champSignature: "s",
        maintenant,
      }),
    ).toBe(false);
  });

  it("refuse un en-tête absent ou malformé", () => {
    expect(verifier(null)).toBe(false);
    expect(verifier("n'importe quoi")).toBe(false);
    expect(lireEntete("s=abc", "s")).toBeNull();
    expect(lireEntete(`t=${t}`, "s")).toBeNull();
  });
});

describe("cycle de paiement — INV-7", () => {
  it("un rejeu de la même notification ne fait rien", () => {
    expect(effetDeLaNotification("CONFIRMEE", "CONFIRMEE")).toEqual({ type: "rejeu" });
  });

  it("le crédit n'accompagne que l'entrée en CONFIRMEE", () => {
    expect(effetDeLaNotification("EN_ATTENTE", "CONFIRMEE")).toEqual({
      type: "appliquer",
      vers: "CONFIRMEE",
      crediteLePack: true,
    });
    expect(effetDeLaNotification("INITIEE", "EN_ATTENTE")).toEqual({
      type: "appliquer",
      vers: "EN_ATTENTE",
      crediteLePack: false,
    });
  });

  it("une transaction échouée ne revient pas à la vie", () => {
    expect(effetDeLaNotification("ECHOUEE", "CONFIRMEE").type).toBe("refus");
    expect(effetDeLaNotification("EXPIREE", "CONFIRMEE").type).toBe("refus");
  });

  it("seul un remboursement suit une confirmation", () => {
    expect(effetDeLaNotification("CONFIRMEE", "REMBOURSEE").type).toBe("appliquer");
    expect(effetDeLaNotification("CONFIRMEE", "ECHOUEE").type).toBe("refus");
  });

  it("les délais de rattrapage suivent RG-05.4", () => {
    const creee = new Date("2026-09-19T09:00:00Z");
    expect(aReconcilier(creee, new Date("2026-09-19T09:05:00Z"))).toBe(false);
    expect(aReconcilier(creee, new Date("2026-09-19T09:11:00Z"))).toBe(true);
    expect(aExpirer(creee, new Date("2026-09-19T09:30:00Z"))).toBe(false);
    expect(aExpirer(creee, new Date("2026-09-19T10:01:00Z"))).toBe(true);
  });
});

describe("règle 3 appliquée au webhook", () => {
  it("un appelant dont la signature échoue n'apprend pas la forme du secret", () => {
    // Avant la vérification d'origine, l'appelant est quelconque : il reçoit
    // ce que reçoit un écran public, sans code ni service ni horodatage.
    const e = echec("signature_invalide");
    const rendu = JSON.stringify(pourCandidat(e));
    expect(rendu).not.toContain("signature_invalide");
    expect(rendu).not.toContain("diagnostic");
    // Le message reste actionnable pour qui a le secret.
    expect(pourCandidat(e).action).toContain("secret");
  });
});

describe("le public d'une réponse est le plus bas des deux", () => {
  it("un refus de droits ne porte pas de code : celui qui le lit n'est pas opérateur", () => {
    // La route est « opérateur », l'appelant ne l'est pas — sans quoi il ne
    // se ferait pas refuser. C'est lui qui décide de la sérialisation.
    const rendu = JSON.stringify(pourCandidat(echec("droits_insuffisants")));
    expect(rendu).not.toContain("droits_insuffisants");
  });

  it("un échec rendu aux deux publics ne renvoie pas le candidat chez l'opérateur", () => {
    expect(ECHECS.introuvable.action).not.toContain("mes dossiers");
  });
});
