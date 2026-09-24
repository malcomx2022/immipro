import { describe, expect, it } from "vitest";
import {
  MENTION_REDACTION_RESERVEE,
  PACKS_REDACTION_ASSISTEE,
  redactionAssisteeOuverte,
} from "@/domain/payments/droits";
import { RECHARGE_ANALYSES } from "@/domain/payments/pricing";
import {
  etatDeLaPiece,
  messageDEtat,
  obstacleALEnregistrement,
  type Version,
} from "@/domain/redaction/versions";
import {
  ACTION_RELECTURE,
  etatDeLaRelecture,
  resumeSelonLEtat,
} from "@/domain/redaction/relecture";
import { CONSERVE_DU_CANDIDAT, ECHECS, INTERROMPENT_UNE_SAISIE } from "@/server/http/echecs";
import {
  INTERDITS_INTERFACE_CANDIDAT,
  INTERDITS_PARTOUT,
  verifierTexte,
} from "@/domain/copy/vocabulaire-interdit";

/**
 * Arbitrage S.80 — la rédaction assistée est un droit des packs Dossier et
 * Dossier Pro, lu sur la couverture du dossier.
 *
 * La frontière porte sur l'intervention du service, pas sur le droit
 * d'écrire : ce qui est refusé ne doit jamais rien retirer de ce que le
 * candidat a écrit.
 */

const couverture = (packCode: string, retiree = false) => ({ packCode, retiree });

describe("le droit se lit sur la couverture du dossier", () => {
  it("Dossier et Dossier Pro l'ouvrent, Essentiel non", () => {
    expect([...PACKS_REDACTION_ASSISTEE].sort()).toEqual(["dossier", "pro"]);
    expect(redactionAssisteeOuverte([])).toBe(false);
    expect(redactionAssisteeOuverte([couverture("essentiel")])).toBe(false);
    expect(redactionAssisteeOuverte([couverture("dossier")])).toBe(true);
    expect(redactionAssisteeOuverte([couverture("pro")])).toBe(true);
  });

  it("une recharge n'ouvre rien, et une couverture remboursée ne compte plus", () => {
    expect(redactionAssisteeOuverte([couverture(RECHARGE_ANALYSES.code)])).toBe(false);
    expect(redactionAssisteeOuverte([couverture("dossier", true)])).toBe(false);
    expect(redactionAssisteeOuverte([couverture("essentiel"), couverture("dossier")])).toBe(true);
  });
});

describe("sans le droit, le candidat écrit toujours", () => {
  const texte: Version = {
    rang: 1,
    paragraphes: [{ texte: "Mon texte." }],
    enregistreeLe: "2026-09-20T08:00:00Z",
    motif: "Texte réécrit par toi",
  } as unknown as Version;

  it("l'éditeur ne demande ni minimum de réponses ni service, et ouvre l'écriture", () => {
    for (const reponses of [0, 1, 8]) {
      expect(
        etatDeLaPiece({ versions: [], reponses, redactionDisponible: true, redactionAssistee: false }),
      ).toBe("MISE_EN_FORME_RESERVEE");
    }
    const message = messageDEtat("MISE_EN_FORME_RESERVEE", 4)!;
    expect(message.corps).toContain("restent à toi");
    expect(message.corps).toContain("écrire ta pièce toi-même");
    expect(message.action).toBe("Voir les packs");
  });

  it("un texte déjà écrit reste un texte : rien ne se perd au refus", () => {
    expect(
      etatDeLaPiece({ versions: [texte], reponses: 0, redactionDisponible: true, redactionAssistee: false }),
    ).toBe("REDIGEE");
  });

  it("la première version s'enregistre sans version précédente", () => {
    expect(obstacleALEnregistrement("", undefined)).toContain("Écris ta pièce ici");
    expect(obstacleALEnregistrement("Mon texte.", undefined)).toBeNull();
  });

  it("la relecture n'offre pas l'analyse, et ne dit pas le service absent", () => {
    const etat = etatDeLaRelecture({
      remarques: null,
      texteExistant: true,
      recoupementsEffectues: true,
      analysePossible: true,
      redactionAssistee: false,
    });
    expect(etat).toBe("RESERVEE_AU_PACK");
    expect(ACTION_RELECTURE[etat]).toBe("Voir les packs");
    const resume = resumeSelonLEtat(etat, [], true);
    expect(resume).toContain("rien ne diverge");
    expect(resume).toContain("Dossier et Dossier Pro");
    expect(resume).not.toContain("pas branché");
  });

  it("une analyse déjà faite reste affichée : un droit retiré ne reprend pas ce qui a été lu", () => {
    expect(
      etatDeLaRelecture({ remarques: [], texteExistant: true, redactionAssistee: false }),
    ).toBe("RELUE_SANS_REMARQUE");
  });
});

describe("le refus", () => {
  it("dit ce qui reste avant ce qui l'ouvre, et ne bloque rien", () => {
    const e = ECHECS.redaction_non_couverte;
    expect(e.statut).toBe(403);
    expect(e.conserve).toContain("ta pièce");
    expect(CONSERVE_DU_CANDIDAT).toContain("redaction_non_couverte");
    expect(INTERROMPENT_UNE_SAISIE).toContain("redaction_non_couverte");
  });

  it("ne promet rien, et ne note rien", () => {
    const textes = [
      MENTION_REDACTION_RESERVEE,
      ECHECS.redaction_non_couverte.titre,
      ECHECS.redaction_non_couverte.corps,
      messageDEtat("MISE_EN_FORME_RESERVEE", 3)!.corps,
      resumeSelonLEtat("RESERVEE_AU_PACK", [], false),
    ];
    for (const t of textes) {
      expect(verifierTexte(t, INTERDITS_PARTOUT)).toEqual([]);
      expect(verifierTexte(t, INTERDITS_INTERFACE_CANDIDAT)).toEqual([]);
    }
  });
});
