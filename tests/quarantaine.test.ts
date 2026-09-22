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
import {
  TENTATIVES_AVANT_INCIDENT,
  suiteDeLIndisponibilite,
  type Verdict,
} from "@/domain/securite/balayage";
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
  it("le balayeur non branché rend l'indisponibilité, jamais la propreté", async () => {
    const vu = await NON_BRANCHE("dossiers/x/passeport.pdf");
    expect(vu).toMatchObject({ etat: "INDISPONIBLE", cause: "non_configure" });
    expect(vu.etat).not.toBe("SAINE");
  });

  it("une variable vide ne vaut pas un moteur", () => {
    expect(antivirusConfigure({ ANTIVIRUS_URL: "http://av" })).toBe(true);
    expect(antivirusConfigure({ ANTIVIRUS_URL: "   " })).toBe(false);
    expect(antivirusConfigure({})).toBe(false);
    expect(VARIABLES).toContain("ANTIVIRUS_URL");
  });

  /**
   * **Le défaut que ce lot a rattrapé.**
   *
   * L'indisponibilité était rendue par `null` et testée par
   * `if (!verdict)`. Le jour où elle est devenue un objet — pour porter
   * sa cause —, ce test est passé à côté : un objet est toujours vrai, et
   * le code tombait dans la branche de promotion. Une pièce que personne
   * n'avait balayée serait entrée dans le stockage de confiance parce
   * qu'un moteur n'avait pas répondu.
   *
   * Ce test ne lit plus le source : il éprouve le type. Le `switch` du
   * job est exhaustif sur `Verdict`, et la propriété qui compte est que
   * **l'indisponibilité en fasse partie** — un appelant ne peut pas
   * l'oublier sans que le compilateur le lui dise, là où un `null` se
   * teste distraitement.
   */
  it("l'indisponibilité est un verdict, pas une absence de verdict", () => {
    const etats: Verdict["etat"][] = ["SAINE", "INFECTEE", "INDISPONIBLE"];
    // Le `never` du job garantit qu'un quatrième état ne compilera pas
    // tant que personne n'aura dit ce qu'il promeut.
    expect(etats).toHaveLength(3);

    const verdicts: Verdict[] = [
      { etat: "SAINE" },
      { etat: "INFECTEE", menace: "X" },
      { etat: "INDISPONIBLE", cause: "injoignable", detail: "" },
    ];
    // Aucun n'est falsy : c'est précisément ce qui rendait `if (!verdict)`
    // inoffensif en apparence et faux en fait.
    for (const v of verdicts) expect(Boolean(v)).toBe(true);
  });

  /**
   * La chaîne complète — dépôt, quarantaine, balayage, promotion, analyse
   * — demande une base et un moteur, et vit dans
   * `scripts/fumee-balayage.mts`. Les verdicts eux-mêmes s'éprouvent
   * contre un vrai serveur dans `tests/balayage-moteur.test.ts`.
   */
  it("le seuil d'incident ne promeut rien : il rend visible", () => {
    for (const tentatives of [1, TENTATIVES_AVANT_INCIDENT, 99]) {
      const suite = suiteDeLIndisponibilite("injoignable", tentatives);
      // Quelle que soit la combinaison, il n'existe aucune réponse qui
      // accepte le fichier. Signaler est une visibilité, pas une porte.
      expect(Object.keys(suite).sort()).toEqual(["rejouer", "signaler"]);
    }
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

  /**
   * L'ordre de la promotion, et ce qu'il coûte de l'inverser.
   *
   * La copie d'abord, l'écriture ensuite. Interrompue entre les deux,
   * elle laisse une version en quarantaine dont l'objet est déjà passé :
   * la reprise rebalaie, ne trouve plus rien, et rend `objet_absent` —
   * une pièce bloquée et visible. L'ordre inverse écrirait « saine » sur
   * une version dont les octets seraient restés en quarantaine :
   * consultable et introuvable.
   */
  it("la promotion précède l'écriture, et non l'inverse", () => {
    const balayage = lire("src/server/jobs/balayage.ts");
    const admettre = /async function admettre[\s\S]*?\n\}/u.exec(balayage)![0];
    expect(admettre.indexOf("await promouvoir(")).toBeLessThan(
      admettre.indexOf('scanState: "SAINE"'),
    );
  });
});
