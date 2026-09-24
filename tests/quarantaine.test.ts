import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ATTENTE_ORDINAIRE_MS,
  MENTION_ATTENTE_PROLONGEE,
  consultable,
  mentionDeLAttente,
  MENTION_EN_QUARANTAINE,
  mentionApercu,
  refusAuControle,
  transmissibleALAnalyse,
  type EtatBalayage,
} from "@/domain/dossiers/quarantaine";
import { antivirusConfigure, NON_BRANCHE, VARIABLES } from "@/server/securite/antivirus";
import {
  ATTENTE_AU_CONTROLE,
  REPOS_AVANT_REPRISE_MINUTES,
  TENTATIVES_AVANT_INCIDENT,
  quiPeutAgir,
  reprendreAuControle,
  seReprendSeule,
  suiteDeLIndisponibilite,
  type CauseDIndisponibilite,
  type Verdict,
} from "@/domain/securite/balayage";
import { ECHECS } from "@/server/http/echecs";
import { JOBS, REPRISES } from "@/lib/queue";
import { sansCommentaires } from "@/domain/copy/source";

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

/* ------------------------------------------------------------------ *
 * Ce que la sonde a fini par commander.
 * ------------------------------------------------------------------ */

describe("un moteur pris en défaut ferme le dépôt, et pas seulement l'état", () => {
  /**
   * La sonde EICAR voyait déjà un moteur qui répond sans détecter, et le
   * disait à l'état de service. Personne n'en tirait de conséquence : le
   * dépôt ne consultait qu'`antivirusConfigure`, si bien que les
   * fichiers continuaient d'être acceptés **et promus** par un moteur
   * qui ne lit rien. Une sonde dont rien ne dépend est un affichage.
   *
   * La route lit maintenant le constat. Ce test tient le branchement —
   * la règle elle-même est éprouvée dans
   * `tests/constats-de-service.test.ts`, et la chaîne complète dans
   * `scripts/fumee-balayage.mts`.
   */
  it("la route de dépôt consulte le constat, pas seulement la configuration", () => {
    const route = lire("src/app/api/dossiers/[id]/pieces/[pieceId]/depot/route.ts");
    expect(route).toMatch(/moteurPrisEnDefaut\(\(await lireLesConstats\(\)\)\.antivirus\)/u);
    // Et les deux refus mènent au même message, qui dit ce qui manque.
    expect(route.match(/televersement_indisponible/gu)?.length).toBeGreaterThanOrEqual(2);
  });

  /** Le message reste actionnable, et ne nomme aucune menace. */
  it("le refus dit ce qui est conservé et quoi faire", () => {
    const refus = ECHECS.televersement_indisponible;
    expect(refus.statut).toBe(503);
    expect(refus.conserve).toMatch(/déjà déposées ne changent pas/u);
    expect(refus.action).toBeTruthy();
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

/* ------------------------------------------------------------------ *
 * « Dans quelques instants », pendant trois jours.
 * ------------------------------------------------------------------ */

describe("ce que le candidat lit d'une attente au contrôle", () => {
  const MAINTENANT = new Date("2026-09-22T12:00:00Z");
  const ilYA = (ms: number) => new Date(MAINTENANT.getTime() - ms);

  /** Le cas de tous les jours : quelques secondes, et c'est vrai. */
  it("une pièce qui vient d'arriver lit le message ordinaire", () => {
    expect(mentionDeLAttente({ depuis: ilYA(5_000) }, MAINTENANT)).toBe(MENTION_EN_QUARANTAINE);
  });

  /**
   * **Le défaut corrigé.** Le message promettait « quelques instants »
   * quelle que soit l'ancienneté, sur une pièce dont le contrôle pouvait
   * ne jamais aboutir. Une promesse de durée qui ne tient pas est pire
   * qu'une absence de promesse : elle empêche de s'inquiéter à temps.
   */
  it("une attente qui dure cesse de promettre une durée", () => {
    const prolongee = mentionDeLAttente({ depuis: ilYA(ATTENTE_ORDINAIRE_MS + 1000) }, MAINTENANT);
    expect(prolongee).toBe(MENTION_ATTENTE_PROLONGEE);
    expect(prolongee).not.toMatch(/quelques instants/u);
    // Elle ne demande rien pour autant : il n'y a rien à demander.
    expect(prolongee).toMatch(/tu n'as rien à faire/u);
  });

  /**
   * Une cause connue l'emporte sur la durée : elle dit ce qui se passe,
   * et parfois quoi faire. C'est plus qu'un délai.
   */
  it("un fichier trop lourd dit quoi faire, et ne fait pas attendre", () => {
    const message = mentionDeLAttente(
      { depuis: ilYA(60_000), cause: "trop_volumineux" },
      MAINTENANT,
    );
    expect(message).toMatch(/trop lourd/u);
    expect(message).toMatch(/Dépose une version plus légère/u);
    // Surtout pas : ni promesse de durée, ni « rien à faire ».
    expect(message).not.toMatch(/quelques instants|rien à faire/u);
  });

  it("un fichier qui n'est pas arrivé se redépose", () => {
    const message = mentionDeLAttente({ depuis: ilYA(60_000), cause: "objet_absent" }, MAINTENANT);
    expect(message).toMatch(/dépose-le à nouveau/iu);
    expect(message).not.toMatch(/rien à faire/u);
  });

  /**
   * Une panne de notre côté ne se répare pas en redéposant. Demander un
   * geste ici ferait tourner quelqu'un en rond sur un problème qui n'est
   * pas le sien.
   */
  it("une panne de la plateforme ne demande rien au candidat", () => {
    for (const cause of ["injoignable", "delai_depasse", "reponse_illisible", "non_configure"] as const) {
      const message = mentionDeLAttente({ depuis: ilYA(60_000), cause }, MAINTENANT);
      expect(message, cause).toMatch(/tu n'as rien à faire/u);
      expect(message, cause).toMatch(/conservé/u);
      expect(message, cause).not.toMatch(/[Dd]épose/u);
    }
  });

  /** Aucun message ne nomme la panne, le moteur, ni un code. */
  it("aucun message ne nomme ce qui ne regarde pas le candidat", () => {
    for (const cause of Object.keys(ATTENTE_AU_CONTROLE) as CauseDIndisponibilite[]) {
      const message = ATTENTE_AU_CONTROLE[cause];
      expect(message, cause).not.toMatch(/antivirus|virus|moteur|EICAR|500|quarantaine/iu);
      // RG-06.3 : un message d'échec est actionnable, donc il dit ce qui
      // se passe et ce qui est attendu — jamais un constat sec.
      expect(message.length, cause).toBeGreaterThan(60);
    }
  });

  /**
   * **Le garde-fou de la table.** `quiPeutAgir` classe chaque cause ;
   * ce test vérifie que le message correspondant en tient compte. Sans
   * lui, la fonction ne serait qu'un commentaire exécutable — une
   * distinction écrite dont rien ne dépendrait —, et une cause ajoutée
   * un jour pourrait dire « dépose à nouveau » sur une panne de notre
   * côté, ou « tu n'as rien à faire » sur un fichier que le candidat
   * pourrait remplacer en une minute.
   */
  it("chaque message dit un geste, ou n'en demande aucun, selon qui peut agir", () => {
    for (const cause of Object.keys(ATTENTE_AU_CONTROLE) as CauseDIndisponibilite[]) {
      const message = ATTENTE_AU_CONTROLE[cause];
      if (quiPeutAgir(cause) === "candidat") {
        expect(message, cause).toMatch(/[Dd]épose/u);
        expect(message, cause).not.toMatch(/rien à faire/u);
      } else {
        expect(message, cause).toMatch(/tu n'as rien à faire/u);
        expect(message, cause).not.toMatch(/[Dd]épose/u);
      }
    }
  });

  /**
   * Les deux questions ne se recouvrent pas : la file demande « faut-il
   * rejouer ? », le candidat demande « ai-je quelque chose à faire ? ».
   * Un délai dépassé se rejoue et ne demande rien ; un fichier trop
   * lourd ne se rejoue pas et demande un geste.
   */
  it("rejouer et agir sont deux questions distinctes", () => {
    expect(seReprendSeule("delai_depasse")).toBe(true);
    expect(quiPeutAgir("delai_depasse")).toBe("plateforme");

    expect(seReprendSeule("trop_volumineux")).toBe(false);
    expect(quiPeutAgir("trop_volumineux")).toBe("candidat");

    // Et une cause qui ne se reprend pas seule n'appelle pas forcément
    // un geste : une réponse hors contrat est notre affaire.
    expect(seReprendSeule("reponse_illisible")).toBe(false);
    expect(quiPeutAgir("reponse_illisible")).toBe("plateforme");
  });

  /** Sans rien savoir de l'attente, on ne fabrique pas d'inquiétude. */
  it("sans information, le message ordinaire tient", () => {
    expect(mentionDeLAttente(undefined, MAINTENANT)).toBe(MENTION_EN_QUARANTAINE);
    expect(mentionApercu("EN_QUARANTAINE")).toBe(MENTION_EN_QUARANTAINE);
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

/**
 * Ce que quatre messages promettaient — I.D, RG-06.3.
 *
 * `quiPeutAgir` range chaque cause d'indisponibilité du côté du candidat
 * ou du côté de la plateforme, et les messages de `ATTENTE_AU_CONTROLE`
 * suivent ce partage : ceux qui demandent un geste le disent en premier,
 * les autres disent « tu n'as rien à faire ».
 *
 * Personne ne tenait la seconde moitié. `BALAYAGE_PIECE` n'était postée
 * que par la confirmation du dépôt, une fois ; `non_configure` et
 * `reponse_illisible` ne consommaient aucune reprise de la file, et les
 * deux autres les épuisaient en une dizaine de minutes. Passé cela, le
 * fichier restait en quarantaine et l'incident se lisait dans l'état de
 * service sans être traité — une visibilité, pas une reprise.
 *
 * Les garde-fous ci-dessous sont les deux réciproques : ce qui promet
 * une reprise est repris, et ce qui demande un geste ne l'est pas. Les
 * énumérer à la main ici les aurait figés à quatre ; une cause nouvelle
 * arrive avec son message, et c'est le message qui doit décider.
 */
describe("Ce qui dit « tu n'as rien à faire » est repris", () => {
  const CAUSES = Object.keys(ATTENTE_AU_CONTROLE) as CauseDIndisponibilite[];
  const jamais = new Date("2026-01-01T00:00:00Z");
  const apresLeRepos = new Date(
    jamais.getTime() + (REPOS_AVANT_REPRISE_MINUTES + 1) * 60 * 1000,
  );

  it("chaque message sans geste attendu annonce bien une reprise", () => {
    // La promesse et la reprise sortent du même partage : si un message
    // cessait de promettre, ou si la reprise cessait de le tenir, cet
    // essai le dirait — et non une relecture des quatre phrases.
    const promettent = CAUSES.filter((c) => quiPeutAgir(c) === "plateforme");
    expect(promettent.length).toBeGreaterThan(0);
    for (const cause of promettent) {
      expect(ATTENTE_AU_CONTROLE[cause]).toMatch(/tu n'as rien à faire/u);
      expect(
        reprendreAuControle({ cause, derniereTentative: jamais, maintenant: apresLeRepos }),
      ).toBe(true);
    }
  });

  it("et ce qui demande un geste au candidat n'est jamais rejoué par-dessus", () => {
    // Rejouer ferait mentir la consigne qu'il vient de lire : un fichier
    // trop lourd ne rétrécit pas, un objet absent ne revient pas.
    const siennes = CAUSES.filter((c) => quiPeutAgir(c) === "candidat");
    expect(siennes.length).toBeGreaterThan(0);
    for (const cause of siennes) {
      expect(ATTENTE_AU_CONTROLE[cause]).not.toMatch(/tu n'as rien à faire/u);
      expect(
        reprendreAuControle({ cause, derniereTentative: jamais, maintenant: apresLeRepos }),
      ).toBe(false);
    }
  });

  it("une version sans cause se reprend : rien n'a conclu, rien n'a été demandé", () => {
    // Un ouvrier tué avant la première tentative laisse exactement cela.
    expect(
      reprendreAuControle({ cause: null, derniereTentative: null, maintenant: apresLeRepos }),
    ).toBe(true);
  });

  it("le repos couvre les reprises de la file, sans les doubler", () => {
    /*
      Reprendre pendant que pg-boss rejoue encore ferait balayer deux
      fois le même fichier. Le repos est donc plus long que les six
      reprises réunies — dix secondes, doublées à chaque fois.
      La borne se calcule depuis la politique, et non recopiée : les
      deux bougeraient sinon séparément.
      */
    const politique = REPRISES[JOBS.BALAYAGE_PIECE]!;
    const limite = politique.retryLimit ?? 0;
    const delai = politique.retryDelay ?? 0;
    const cumul = Array.from({ length: limite }, (_, i) => delai * 2 ** i).reduce(
      (a, b) => a + b,
      0,
    );
    expect(REPOS_AVANT_REPRISE_MINUTES * 60).toBeGreaterThan(cumul);
  });

  it("et la passe est branchée : une file déclarée, travaillée et planifiée", () => {
    /*
      Une passe écrite et non branchée est le défaut lui-même, d'un cran
      déplacé : `RAPPEL_ECHEANCIER` a vécu ainsi, déclarée sans écrivain.
      Les trois preuves se lisent dans le source de l'ouvrier.
      */
    const ouvrier = sansCommentaires(readFileSync("src/server/jobs/worker.ts", "utf8"));
    expect(JOBS.REPRISE_QUARANTAINE).toBeTruthy();
    expect(ouvrier).toMatch(/work\(JOBS\.REPRISE_QUARANTAINE/u);
    expect(ouvrier).toMatch(/schedule\(JOBS\.REPRISE_QUARANTAINE/u);
  });
});
