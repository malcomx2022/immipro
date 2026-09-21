import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  consultable,
  MENTION_EN_QUARANTAINE,
  mentionApercu,
  refusAuControle,
  transmissibleALAnalyse,
  type EtatBalayage,
} from "@/domain/dossiers/quarantaine";
import { antivirusConfigure, NON_BRANCHE, VARIABLES } from "@/server/securite/antivirus";
import { ECHECS } from "@/server/http/echecs";

/**
 * I.D, tranché le 20/09/2026 — quarantaine, balayage, promotion.
 *
 * Ce que ces tests tiennent n'est pas « le balayage marche » : il n'y a pas
 * de moteur à faire marcher. C'est que son absence ne se traduit jamais en
 * acceptation, et que les trois sorties fermées par la décision le restent.
 */

const ETATS: EtatBalayage[] = ["EN_QUARANTAINE", "SAINE", "INFECTEE"];
const lire = (f: string) => readFileSync(f, "utf8");

describe("un seul état ouvre les portes", () => {
  it("seule une pièce saine est consultable et analysable", () => {
    for (const etat of ETATS) {
      expect(consultable(etat), etat).toBe(etat === "SAINE");
      expect(transmissibleALAnalyse(etat), etat).toBe(etat === "SAINE");
    }
  });

});

describe("l'absence de balayeur ne se traduit jamais en acceptation", () => {
  it("le balayeur non branché rend l'absence", async () => {
    await expect(NON_BRANCHE("dossiers/x/passeport.pdf")).resolves.toBeNull();
  });

  it("une variable vide ne vaut pas un moteur", () => {
    expect(antivirusConfigure({ ANTIVIRUS_URL: "http://av" })).toBe(true);
    expect(antivirusConfigure({ ANTIVIRUS_URL: "   " })).toBe(false);
    expect(antivirusConfigure({})).toBe(false);
    expect(VARIABLES).toContain("ANTIVIRUS_URL");
  });

  /**
   * Le job lève plutôt que de décider. Une exception est la seule façon de
   * dire à une file de jobs « reviens plus tard » ; un retour silencieux
   * laisserait la pièce en quarantaine sans que rien ne la reprenne.
   */
  it("le job laisse la pièce en attente et se fait réessayer", () => {
    const balayage = lire("src/server/jobs/balayage.ts");
    expect(balayage).toMatch(/if \(!verdict\) throw new BalayageIndisponible/u);
    expect(balayage).toMatch(/class BalayageIndisponible extends Error/u);
    // La promotion n'a lieu que sur un verdict, jamais sur son absence.
    const avantPromotion = balayage.slice(0, balayage.indexOf("await promouvoir("));
    expect(avantPromotion).toContain("if (!verdict)");
  });

  /** Le dépôt refuse, plutôt que d'accepter un fichier qu'il ne promouvra pas. */
  it("sans moteur, le dépôt se refuse avec un message qui dit quoi faire", () => {
    const refus = ECHECS.televersement_indisponible;
    expect(refus.statut).toBe(503);
    expect(refus.titre).not.toMatch(/erreur|échec technique/iu);
    // Règle 2 de DOC-12 §16 : le corps dit ce qui est conservé.
    expect(refus.conserve).toBeTruthy();
    expect(refus.action).toBeTruthy();
    expect(refus.conserve).toMatch(/déjà déposées ne changent pas/u);
  });
});

describe("les messages disent l'état réel, et le geste attendu", () => {
  it("une quarantaine se dit sans le mot qui inquiète, et sans rien demander", () => {
    expect(mentionApercu("EN_QUARANTAINE")).toBe(MENTION_EN_QUARANTAINE);
    expect(MENTION_EN_QUARANTAINE).toMatch(/tu n'as rien à faire/u);
    expect(MENTION_EN_QUARANTAINE).not.toMatch(/virus|antivirus|malveillant/iu);
  });

  it("une pièce saine n'a rien à expliquer", () => {
    expect(mentionApercu("SAINE")).toBeNull();
  });

  /**
   * RG-06.3 — le message dit le geste attendu, et le bon : reprendre le
   * document à la source produit un fichier neuf, là où renvoyer le même
   * donnerait le même refus.
   */
  it("un fichier écarté dit quoi faire, sans nommer la menace", () => {
    const refus = refusAuControle("Relevé bancaire");
    // La pièce est nommée par son libellé de checklist : la base ne garde
    // pas le nom du fichier, seulement une clé de stockage aléatoire.
    expect(refus.corps).toContain("Relevé bancaire");
    expect(refus.corps).not.toMatch(/[0-9]{10,}|[A-Za-z0-9_-]{16,}/u);
    expect(refus.corps).toMatch(/réexporte|photographie/u);
    expect(refus.corps).toMatch(/n'a pas été conservé/u);
    expect(`${refus.titre} ${refus.corps}`).not.toMatch(/virus|trojan|malware|signature/iu);
    expect(mentionApercu("INFECTEE")).toMatch(/écarté au contrôle/u);
  });
});

describe("la quarantaine est une zone, pas une convention de nommage", () => {
  it("le dépôt signe en quarantaine, la lecture en confiance", () => {
    const stockage = lire("src/lib/storage.ts");
    expect(stockage).toMatch(/presignedPut = \(key: string\) =>\s*connexion\(\)\.presignedPutObject\(quarantaine\(\)/u);
    expect(stockage).toMatch(/presignedGet = \(key: string\) =>\s*connexion\(\)\.presignedGetObject\(confiance\(\)/u);
    // Aucune URL de lecture n'est signée sur la quarantaine : c'est la
    // raison d'être de deux seaux.
    expect(stockage).not.toMatch(/presignedGetObject\(quarantaine\(\)/u);
    expect(stockage).toContain("MINIO_BUCKET_QUARANTAINE");
  });

  it("la promotion copie avant de supprimer", () => {
    const stockage = lire("src/lib/storage.ts");
    const corps = /export async function promouvoir[\s\S]*?\n\}/u.exec(stockage)![0];
    expect(corps.indexOf("copyObject")).toBeLessThan(corps.indexOf("removeObject"));
  });

  it("la clé de dépôt est déclarée au fichier d'exemple, sans valeur secrète", () => {
    const exemple = lire(".env.example");
    expect(exemple).toContain("MINIO_BUCKET_QUARANTAINE=");
    expect(exemple).toMatch(/^ANTIVIRUS_URL=$/mu);
  });
});

describe("le balayage précède l'analyse, et rien ne les inverse", () => {
  it("le worker enchaîne, et n'analyse que ce qui a été promu", () => {
    const worker = lire("src/server/jobs/worker.ts");
    expect(worker).toMatch(/JOBS\.BALAYAGE_PIECE/u);
    // La mise en file suit le verdict du balayage et rien d'autre. Le
    // nom de l'envoyeur peut changer — `poster` refuse aujourd'hui les
    // pertes silencieuses de pg-boss —, la condition non.
    expect(worker).toMatch(
      /if \(suite === "ANALYSE"\) await \w+\((?:boss, )?JOBS\.ANALYSE_DOCUMENT/u,
    );
    expect(worker.indexOf("JOBS.BALAYAGE_PIECE")).toBeLessThan(
      worker.indexOf("await boss.work<{ applicationId: string; documentId: string; versionId: string }>(\n    JOBS.ANALYSE_DOCUMENT"),
    );
  });

  /**
   * Le quota se relit après le balayage et non au dépôt : entre les deux,
   * une autre pièce a pu consommer la dernière analyse (RG-06.5).
   */
  it("le quota est relu au moment où l'analyse partirait", () => {
    const balayage = lire("src/server/jobs/balayage.ts");
    expect(balayage).toMatch(/await solde\(tache\.applicationId\)\) > 0\) return "ANALYSE"/u);
    expect(balayage.indexOf("await promouvoir(")).toBeLessThan(balayage.indexOf("await solde("));
  });
});
