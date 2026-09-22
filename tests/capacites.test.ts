import { afterEach, describe, expect, it } from "vitest";
import {
  DEPENDANCES,
  capacite,
  constater,
  etatDesCapacites,
  type Dependance,
  type Observation,
} from "@/domain/exploitation/dependances";
import {
  POINTS,
  constaterLesDependances,
  observer,
  sonderLesSignatures,
  type PointDeBranchement,
} from "@/server/exploitation/capacites";
import {
  TRANSPORT_JOURNAL,
  brancherTransport,
  envoyerCodeDeVerification,
  oublierLesFaits,
} from "@/server/courrier";
import { NON_BRANCHE as BALAYEUR_NON_BRANCHE, leBalayeur } from "@/server/securite/antivirus";
import { remboursementBranche } from "@/server/paiement/remboursement";
import { remboursementFedaPay } from "@/server/paiement/fedapay";
import { lExtracteur } from "@/server/dossiers/extracteur";
import { laCritique, leRedacteur } from "@/server/redaction/service";
import { FRAICHEUR_DU_CONSTAT_MS } from "@/domain/exploitation/constats";

/**
 * « Une variable renseignée ne vaut pas un service. »
 *
 * L'état de service lisait `process.env`. Cinq des six points de
 * branchement rendent `null` quoi qu'il y ait dans le `.env` : une
 * installation entièrement configurée répondait « ok » sans qu'aucun code
 * de vérification ne parte et sans qu'aucune pièce ne soit balayée.
 */

/** Un environnement de démonstration : tout est rempli, rien n'est branché. */
const TOUT_RENSEIGNE = {
  APP_URL: "https://exemple.test",
  SMTP_URL: "smtp://exemple",
  SMTP_FROM: "ne-pas-repondre@exemple.test",
  FEDAPAY_WEBHOOK_SECRET: "secret-fedapay",
  STRIPE_WEBHOOK_SECRET: "secret-stripe",
  ANTIVIRUS_URL: "http://exemple",
  ANTHROPIC_API_KEY: "clé",
  FEDAPAY_API_KEY: "clé",
  STRIPE_API_KEY: "clé",
};

const par = (cle: string): Dependance => DEPENDANCES.find((d) => d.cle === cle)!;
const observation = (o: Partial<Observation> = {}): Observation => ({
  adaptateur: true,
  configuree: true,
  sonde: "CONCLUANTE",
  ...o,
});

describe("les six capacités, et ce qui les distingue", () => {
  const bloquante = par("messagerie");
  const facultative = par("extraction");

  it("sans adaptateur, une variable renseignée ne change rien", () => {
    expect(capacite(bloquante, observation({ adaptateur: false }))).toBe(
      "IMPLEMENTATION_ABSENTE",
    );
    // Même avec une sonde qu'on prétendrait concluante : il n'y a rien à
    // sonder, et la première question reste la première.
    expect(
      capacite(bloquante, observation({ adaptateur: false, sonde: "CONCLUANTE" })),
    ).toBe("IMPLEMENTATION_ABSENTE");
  });

  it("adaptateur sans configuration", () => {
    expect(capacite(bloquante, observation({ configuree: false }))).toBe("NON_CONFIGUREE");
  });

  it("configurée mais jamais vérifiée n'est pas opérationnelle", () => {
    expect(capacite(bloquante, observation({ sonde: "ABSENTE" }))).toBe(
      "CONFIGUREE_NON_VERIFIEE",
    );
  });

  it("opérationnelle demande les trois", () => {
    expect(capacite(bloquante, observation())).toBe("OPERATIONNELLE");
  });

  /**
   * La même panne ne porte pas le même nom selon ce qu'il y a derrière.
   * Un service facultatif qui tombe laisse un repli ; un service attendu
   * qui tombe ne laisse rien.
   */
  it("une sonde en échec : dégradée si facultative, en panne si attendue", () => {
    expect(capacite(facultative, observation({ sonde: "ECHOUEE" }))).toBe("DEGRADEE");
    expect(capacite(bloquante, observation({ sonde: "ECHOUEE" }))).toBe("EN_PANNE");
  });
});

describe("l'aptitude n'acquitte une bloquante que sur `OPERATIONNELLE`", () => {
  const toutes = (o: Observation) => DEPENDANCES.map((d) => constater(d, o));

  it("tout opérationnel : prête", () => {
    expect(etatDesCapacites(toutes(observation())).aptitude).toBe("PRETE");
  });

  /**
   * Le cœur de la correction. « Configurée » était l'état que produisait
   * une variable factice, et c'est l'état qui passait pour prêt.
   */
  it("une bloquante configurée mais non vérifiée rend inapte", () => {
    const constats = DEPENDANCES.map((d) =>
      constater(d, observation({ sonde: d.cle === "messagerie" ? "ABSENTE" : "CONCLUANTE" })),
    );
    const etat = etatDesCapacites(constats);
    expect(etat.aptitude).toBe("INAPTE");
    expect(etat.bloquantes).toEqual(["messagerie"]);
  });

  it("une facultative seule non opérationnelle : pilote", () => {
    const constats = DEPENDANCES.map((d) =>
      constater(
        d,
        d.statut === "FACULTATIVE_PILOTE"
          ? observation({ adaptateur: false })
          : observation(),
      ),
    );
    const etat = etatDesCapacites(constats);
    expect(etat.aptitude).toBe("PILOTE");
    expect(etat.manquantes).toEqual(["extraction", "redaction"]);
    expect(etat.bloquantes).toEqual([]);
  });

  it("une dégradation facultative laisse le pilote debout", () => {
    const constats = DEPENDANCES.map((d) =>
      constater(d, observation({ sonde: d.cle === "extraction" ? "ECHOUEE" : "CONCLUANTE" })),
    );
    expect(constats.find((c) => c.cle === "extraction")!.capacite).toBe("DEGRADEE");
    expect(etatDesCapacites(constats).aptitude).toBe("PILOTE");
  });
});

/* ------------------------------------------------------------------ *
 * Les points de branchement réels, tels que l'appelant les exécutera.
 * ------------------------------------------------------------------ */

describe("un `.env` complet devant des points de branchement vides", () => {
  afterEach(() => {
    brancherTransport(TRANSPORT_JOURNAL);
  });

  /**
   * Le test qui aurait dû exister. Toutes les variables sont renseignées,
   * et l'application n'est pas prête pour autant — parce qu'elle ne sait
   * réellement rien faire de ce que ces variables annoncent.
   */
  it("ne rend pas l'application prête", () => {
    const constats = constaterLesDependances(TOUT_RENSEIGNE);
    const etat = etatDesCapacites(constats);

    expect(etat.aptitude).toBe("INAPTE");
    expect(Object.fromEntries(constats.map((c) => [c.cle, c.capacite]))).toEqual({
      /*
        Depuis le 22/09/2026, l'adaptateur SMTP est écrit : la messagerie
        n'est plus une implémentation absente. Elle n'est pas
        opérationnelle pour autant — personne n'a encore parlé à un
        serveur —, et l'instance reste inapte. C'est la même règle,
        appliquée à un module qui a commencé à se brancher.
      */
      messagerie: "CONFIGUREE_NON_VERIFIEE",
      // Le seul adaptateur écrit : la vérification de signature existe, et
      // sa sonde conclut avec ces secrets-là.
      paiements: "OPERATIONNELLE",
      /*
        Les clés sont là, l'ouvreur existe, et aucune sonde ne peut
        l'éprouver sans ouvrir une vraie session chez le fournisseur.
        Ce n'est pas « pas encore vérifiée » : c'est **non vérifiable**,
        et la distinction est la correction du 22/09/2026 — la première
        se répare, la seconde jamais.
      */
      ouverture_paiement: "NON_VERIFIABLE",
      /*
        L'antivirus se lisait ici `IMPLEMENTATION_ABSENTE` avec une
        `ANTIVIRUS_URL` valide, et c'était faux : le résolveur était
        appelé sans argument, donc il lisait `process.env` pendant que
        le reste de l'observation lisait l'environnement passé. Il reçoit
        maintenant le même environnement que les deux autres mesures.

        L'adaptateur est donc vu, et la capacité dit ce qu'il en est —
        configurée, et personne n'a encore présenté EICAR au moteur.
      */
      antivirus: "CONFIGUREE_NON_VERIFIEE",
      remboursement: "IMPLEMENTATION_ABSENTE",
      /*
        L'extraction est branchée depuis le 22/09/2026 : avec une clé,
        l'adaptateur existe. Elle s'arrête à « configurée, non vérifiée »
        et pas plus loin — le point ne déclare aucune sonde, parce que la
        seule qui prouverait quelque chose serait un appel facturé sur une
        pièce qu'il faudrait inventer. Une capacité facultative
        non vérifiée ne rend pas l'instance inapte ; elle la laisse en
        pilote, ce que la ligne suivante vérifie.
      */
      extraction: "CONFIGUREE_NON_VERIFIEE",
      redaction: "IMPLEMENTATION_ABSENTE",
    });
    /*
      Trois bloquantes réparables, et une réserve. La distinction est
      neuve : l'ouverture de paiement ne deviendra jamais opérationnelle,
      puisqu'aucune sonde ne peut l'éprouver sans ouvrir une session
      facturée. La ranger parmi les bloquantes rendait l'instance inapte
      pour toujours.
    */
    expect(etat.bloquantes).toEqual(["messagerie", "antivirus", "remboursement"]);
    expect(etat.reserves).toEqual(["ouverture_paiement"]);
  });

  /**
   * **Le 503 qui ne pouvait pas s'éteindre.**
   *
   * Avant cette correction, `ouverture_paiement` plafonnait par
   * construction et comptait parmi les bloquantes : aucune configuration,
   * aucun adaptateur, aucune sonde n'aurait pu sortir l'instance
   * d'`INAPTE`. `/api/health` répondait 503 en permanence.
   *
   * Ce test le tient par l'autre bout : une installation dont **tout ce
   * qui est réparable** est opérationnel n'est plus inapte, alors même
   * qu'une réserve subsiste. Sans la distinction, il serait rouge.
   */
  it("une réserve seule n'inapte pas l'instance, et ne la déclare pas prête", () => {
    const reserve = par("ouverture_paiement");
    const constats = [
      constater(reserve, { adaptateur: true, configuree: true, sonde: "IMPOSSIBLE" }),
      constater(par("paiements"), { adaptateur: true, configuree: true, sonde: "CONCLUANTE" }),
    ];
    const etat = etatDesCapacites(constats);

    expect(etat.aptitude).not.toBe("INAPTE");
    expect(etat.bloquantes).toEqual([]);
    expect(etat.reserves).toEqual(["ouverture_paiement"]);
    // Elle n'est pas prête pour autant : une preuve manque, et cela se lit.
    expect(etat.aptitude).toBe("PILOTE");
    expect(etat.manquantes).toContain("ouverture_paiement");
  });

  /**
   * L'inverse, qui est la raison d'être de la prudence d'origine : une
   * bloquante réparable inapte toujours, et la réserve n'y change rien.
   */
  it("une bloquante réparable inapte, réserve ou pas", () => {
    const etat = etatDesCapacites([
      constater(par("ouverture_paiement"), {
        adaptateur: true,
        configuree: true,
        sonde: "IMPOSSIBLE",
      }),
      constater(par("messagerie"), { adaptateur: true, configuree: false, sonde: "ABSENTE" }),
    ]);
    expect(etat.aptitude).toBe("INAPTE");
    expect(etat.bloquantes).toEqual(["messagerie"]);
    expect(etat.reserves).toEqual(["ouverture_paiement"]);
  });

  /**
   * « Aucune sonde n'a tourné » et « aucune sonde ne peut exister » ne se
   * confondent plus. La première se répare — la messagerie conclut dès
   * qu'un courrier part —, la seconde jamais.
   */
  it("une sonde qui n'a pas encore tourné n'est pas une réserve", () => {
    const etat = etatDesCapacites([
      constater(par("messagerie"), { adaptateur: true, configuree: true, sonde: "ABSENTE" }),
    ]);
    expect(etat.aptitude).toBe("INAPTE");
    expect(etat.bloquantes).toEqual(["messagerie"]);
    expect(etat.reserves).toEqual([]);
  });

  /**
   * `IMPLEMENTATION_ABSENTE` n'est pas une étiquette : les fonctions que
   * l'appelant obtient ne savent effectivement rien rendre. Les deux
   * assertions ensemble ne peuvent pas être satisfaites par une
   * déclaration — un adaptateur réel ne rendrait pas `null`.
   */
  it("et les fonctions que l'appelant obtient ne rendent rien", async () => {
    /*
      Le balayeur a désormais un adaptateur HTTP, et il n'est pas branché
      pour autant : sans `ANTIVIRUS_URL` utilisable, le résolveur rend
      `NON_BRANCHE`, qui rend l'indisponibilité — **jamais** « saine ».
      C'est la seule réponse qui ne laisserait rien entrer.
    */
    const sansMoteur = await leBalayeur({})("pieces/essai.pdf");
    expect(sansMoteur).toMatchObject({ etat: "INDISPONIBLE", cause: "non_configure" });
    expect(sansMoteur.etat).not.toBe("SAINE");
    /*
      Le remboursement a désormais un adaptateur écrit pour Stripe, et
      aucun pour FedaPay : la capacité se lit non branchée tant que les
      deux rails n'y sont pas. Ce que l'appelant obtient sur le rail
      manquant ne rembourse rien, et le dit — c'est la même mesure, sur
      un module qui a commencé à se brancher.
    */
    expect(remboursementBranche()).toBe(false);
    expect(
      await remboursementFedaPay().demander({
        reference: "IMP-0001",
        providerTxId: "fedapay:1",
        montant: 1000,
        devise: "XOF",
        cle: "IMP-0001",
      }),
    ).toMatchObject({ issue: "non_configure" });
    /*
      L'extraction est branchée, mais sans clé elle ne rend pas une
      lecture vide : elle nomme la cause. Un objet vide se serait
      confondu avec « rien n'a été trouvé sur la pièce », qui est un
      constat sur le fichier et non sur l'installation.
    */
    expect(
      await lExtracteur({})(
        { objectKey: "pieces/essai.pdf", mimeType: "application/pdf" },
        {
          codeAttendu: "passeport",
          intituleAttendu: "Passeport",
          codesDeLaChecklist: ["passeport"],
          champs: [],
        },
      ),
    ).toMatchObject({ etat: "NON_LUE", cause: "non_configure" });
    const matiere = {
      type: "LETTRE_MOTIVATION",
      objet: "Expliquer le projet d'études",
      pays: "NL",
      reponses: {},
      questions: [],
    };
    /*
      La rédaction est branchée depuis le 22/09/2026, et sans clé elle ne
      rend pas un texte vide ni une liste de remarques vide : elle nomme
      la cause. Le second point vaut d'être dit — `remarques: []` se lit
      « relu, rien à reprendre », et c'est exactement l'avis rassurant
      qu'un service absent ne doit jamais produire.
    */
    expect(await leRedacteur({})(matiere)).toMatchObject({
      etat: "SANS_TEXTE",
      cause: "non_configure",
    });
    expect(await laCritique({})("un texte déjà écrit", matiere)).toMatchObject({
      etat: "SANS_AVIS",
      cause: "non_configure",
    });
  });

  /**
   * Et la réciproque, qui est la garantie réelle : ce que l'état annonce
   * suit **ce qui s'est réellement passé**, pas une déclaration.
   *
   * L'adaptateur SMTP est écrit depuis le 22/09/2026 : la question n'est
   * plus « existe-t-il ? » mais « a-t-il déjà parlé à un serveur ? ».
   * Une `SMTP_URL` qui s'analyse ne suffit pas — c'est précisément le
   * raccourci que cet arbitrage interdit.
   */
  it("la messagerie ne devient opérationnelle que sur un fait, pas sur une URL", async () => {
    const messagerie = par("messagerie");
    oublierLesFaits();

    // Adaptateur écrit et configuration présente : l'état s'arrête là,
    // parce que personne n'a encore parlé à un serveur.
    const lu = observer(messagerie, TOUT_RENSEIGNE);
    expect(lu.adaptateur).toBe(true);
    expect(lu.configuree).toBe(true);
    expect(lu.sonde).toBe("ABSENTE");
    expect(capacite(messagerie, lu)).toBe("CONFIGUREE_NON_VERIFIEE");

    // Un envoi réel qui aboutit établit le fait, et l'état suit.
    const partis: string[] = [];
    brancherTransport(async (courrier) => {
      partis.push(courrier.destinataire);
      return { issue: "envoye" };
    });
    await envoyerCodeDeVerification("candidate@exemple.test", "123456");
    expect(partis).toEqual(["candidate@exemple.test"]);
    expect(capacite(messagerie, observer(messagerie, TOUT_RENSEIGNE))).toBe("OPERATIONNELLE");

    // Un envoi réel qui échoue l'établit tout autant, dans l'autre sens.
    brancherTransport(async () => ({ issue: "injoignable", detail: "ETIMEDOUT" }));
    await envoyerCodeDeVerification("candidate@exemple.test", "123456");
    expect(capacite(messagerie, observer(messagerie, TOUT_RENSEIGNE))).toBe("EN_PANNE");

    /*
      Le repli au journal, lui, n'établit rien : il n'a parlé à personne.
      Le compter comme un succès ferait déclarer opérationnelle une
      installation muette — le défaut que tout ce module corrige.
    */
    oublierLesFaits();
    brancherTransport(TRANSPORT_JOURNAL);
    await envoyerCodeDeVerification("candidate@exemple.test", "123456");
    expect(observer(messagerie, TOUT_RENSEIGNE).sonde).toBe("ABSENTE");

    brancherTransport(null);
    oublierLesFaits();
  });

  /** Une URL renseignée mais illisible est un fait, elle aussi. */
  it("une SMTP_URL illisible se voit tout de suite, sans attendre un candidat", () => {
    oublierLesFaits();
    brancherTransport(null);
    const messagerie = par("messagerie");
    const casse = { ...TOUT_RENSEIGNE, SMTP_URL: "pigeon voyageur" };
    expect(observer(messagerie, casse).sonde).toBe("ECHOUEE");
    expect(capacite(messagerie, observer(messagerie, casse))).toBe("EN_PANNE");
  });

  it("sans variables, l'adaptateur reste absent — ce n'est pas la configuration qui manque", () => {
    const constats = constaterLesDependances({});
    expect(constats.find((c) => c.cle === "antivirus")!.capacite).toBe(
      "IMPLEMENTATION_ABSENTE",
    );
    // Le paiement, lui, a ses adaptateurs : là, c'est bien la configuration.
    expect(constats.find((c) => c.cle === "paiements")!.capacite).toBe("NON_CONFIGUREE");
    expect(constats.find((c) => c.cle === "ouverture_paiement")!.capacite).toBe(
      "NON_CONFIGUREE",
    );
  });
});

describe("la sonde des signatures éprouve ce que la route exécute", () => {
  const paiements = par("paiements");

  it("conclut avec les secrets configurés", () => {
    expect(observer(paiements, TOUT_RENSEIGNE).sonde).toBe("CONCLUANTE");
  });

  it("un secret manquant n'est pas une sonde en échec, c'est une configuration absente", () => {
    const sans = { ...TOUT_RENSEIGNE, STRIPE_WEBHOOK_SECRET: "  " };
    const vu = observer(paiements, sans);
    expect(vu.configuree).toBe(false);
    expect(vu.sonde).toBe("ABSENTE");
    expect(capacite(paiements, vu)).toBe("NON_CONFIGUREE");
  });

  /**
   * Une vérification qui accepte tout accepterait aussi la bonne
   * signature. La sonde pose donc les deux questions — et c'est la sonde
   * elle-même qu'on éprouve ici, posée devant une vérification qui dit
   * toujours oui, puis devant une qui dit toujours non.
   */
  it("la sonde échoue devant une vérification qui accepte tout", () => {
    expect(sonderLesSignatures(TOUT_RENSEIGNE, Date.now(), () => true)).toBe("ECHOUEE");
    expect(sonderLesSignatures(TOUT_RENSEIGNE, Date.now(), () => false)).toBe("ECHOUEE");
    // Et elle conclut devant la vraie, qui distingue les deux cas.
    expect(sonderLesSignatures(TOUT_RENSEIGNE)).toBe("CONCLUANTE");
  });

  it("une sonde en échec fait tomber en panne au lieu de passer", () => {
    const permissif: Record<string, PointDeBranchement> = {
      paiements: { adaptateurEcrit: true, sonde: () => "ECHOUEE" },
    };
    const vu = observer(paiements, TOUT_RENSEIGNE, permissif);
    expect(capacite(paiements, vu)).toBe("EN_PANNE");
    expect(etatDesCapacites([constater(paiements, vu)]).aptitude).toBe("INAPTE");
  });

  /**
   * Aucune sonde ne tourne devant un adaptateur absent ou non configuré.
   * C'est ce qui garantit qu'interroger l'état ne déclenche rien : le jour
   * où une sonde parlera à un fournisseur, elle ne le fera pas à vide.
   */
  it("aucune sonde ne tourne sans adaptateur ni configuration", () => {
    let appels = 0;
    const compte: Record<string, PointDeBranchement> = {
      antivirus: {
        resolveur: () => BALAYEUR_NON_BRANCHE,
        nonBranche: BALAYEUR_NON_BRANCHE,
        sonde: () => {
          appels += 1;
          return "CONCLUANTE";
        },
      },
      remboursement: {
        resolveur: () => () => null,
        nonBranche: null,
        sonde: () => {
          appels += 1;
          return "CONCLUANTE";
        },
      },
    };

    // Adaptateur absent : la sonde n'est pas appelée.
    observer(par("antivirus"), TOUT_RENSEIGNE, compte);
    expect(appels).toBe(0);

    // Adaptateur présent mais configuration absente : pas appelée non plus.
    observer(par("remboursement"), { ...TOUT_RENSEIGNE, STRIPE_API_KEY: "" }, compte);
    expect(appels).toBe(0);

    // Les deux réunis : elle tourne.
    observer(par("remboursement"), TOUT_RENSEIGNE, compte);
    expect(appels).toBe(1);
  });
});

/* ------------------------------------------------------------------ *
 * La réserve est une exception, et une exception se plafonne.
 * ------------------------------------------------------------------ */

/**
 * `sansSondeSure` acquitte une bloquante sans preuve. C'est justifiable
 * une fois — ouvrir une session chez un fournisseur est un appel facturé
 * au temps —, et c'est une échappatoire dès qu'on s'y habitue : il
 * suffirait de l'écrire pour qu'une dépendance cesse d'inapter.
 *
 * Elle est donc plafonnée, sur le modèle de `copy-exceptions.json` : au
 * delà de deux, ce n'est plus une exception, c'est la façon dont on
 * arrête de sonder. Le plafond est bas exprès — une sonde sûre est
 * presque toujours écrivable, et le lot du balayage l'a montré : on la
 * croyait impossible, EICAR la rend triviale.
 */
describe("aucune sonde sûre : une exception, nommée et plafonnée", () => {
  const sansSonde = Object.entries(POINTS).filter(([, p]) => "sansSondeSure" in p);

  it("chaque exception dit pourquoi, en une phrase qui tient", () => {
    for (const [cle, point] of sansSonde) {
      const raison = (point as { sansSondeSure: string }).sansSondeSure;
      expect(raison, cle).toBeTruthy();
      // Une raison générique — « pas possible », « trop compliqué » — ne
      // se relit pas dans six mois. Celle-ci doit dire ce que la sonde
      // coûterait ou déclencherait.
      expect(raison.length, cle).toBeGreaterThan(30);
      expect(raison, cle).not.toMatch(/^(impossible|non|pas de sonde)\.?$/iu);
    }
  });

  it("elles restent deux au plus", () => {
    expect(sansSonde.map(([cle]) => cle)).toEqual(["ouverture_paiement"]);
    expect(sansSonde.length).toBeLessThanOrEqual(2);
  });

  /**
   * Et elle ne s'étend pas aux facultatives : une facultative non
   * opérationnelle laisse déjà tourner un pilote, elle n'a aucun besoin
   * d'être acquittée. L'y autoriser ne servirait qu'à masquer.
   */
  it("elles ne concernent que des bloquantes", () => {
    for (const [cle] of sansSonde) {
      expect(par(cle).statut, cle).not.toBe("FACULTATIVE_PILOTE");
    }
  });
});

/* ------------------------------------------------------------------ *
 * Les trois mesures d'une observation portent sur le même environnement.
 * ------------------------------------------------------------------ */

describe("le résolveur lit l'environnement observé, pas celui du processus", () => {
  /**
   * Le défaut corrigé le 22/09/2026 : `brancheEcrit` appelait le
   * résolveur **sans argument**, donc il lisait `process.env` pendant
   * que `configuree` et la sonde lisaient l'environnement passé. Les
   * trois mesures d'une même observation ne portaient pas sur la même
   * chose.
   *
   * Tant qu'aucun résolveur ne lisait l'environnement, cela ne se voyait
   * pas. Le balayeur branché l'a rendu visible : une `ANTIVIRUS_URL`
   * valide se lisait « aucun adaptateur ».
   */
  it("une adresse de moteur passée en argument est vue par la mesure d'adaptateur", () => {
    const avec = observer(par("antivirus"), { ANTIVIRUS_URL: "http://antivirus.interne/scan" });
    expect(avec.adaptateur).toBe(true);
    expect(avec.configuree).toBe(true);

    const sans = observer(par("antivirus"), {});
    expect(sans.adaptateur).toBe(false);
  });

  /**
   * Et la mesure suit le même critère que le module : une variable
   * renseignée qui ne désigne aucun moteur ne vaut pas un adaptateur.
   */
  it("une adresse illisible ne vaut ni adaptateur ni configuration", () => {
    const vu = observer(par("antivirus"), { ANTIVIRUS_URL: "à définir" });
    expect(vu.adaptateur).toBe(false);
    expect(vu.configuree).toBe(false);
  });

  /**
   * Le résolveur lit l'environnement **normalisé**, comme les deux
   * autres mesures. Sans cela, un déploiement resté sur une graphie
   * dépréciée se lirait « configuré » — la normalisation fait son
   * travail — et « sans adaptateur » — le résolveur lisant le nom brut.
   * L'exploitant chercherait du code absent là où il fallait renommer
   * une variable.
   */
  it("les trois mesures lisent le même environnement normalisé", () => {
    const vus: Array<Record<string, string | undefined>> = [];
    const points: Record<string, PointDeBranchement> = {
      antivirus: {
        resolveur: (environnement) => {
          vus.push(environnement);
          return "branché";
        },
        nonBranche: "absent",
        configure: (environnement) => {
          vus.push(environnement);
          return true;
        },
        sonde: (environnement) => {
          vus.push(environnement);
          return "CONCLUANTE";
        },
      },
    };
    observer(par("antivirus"), { FEDAPAY_SECRET_KEY: "ancienne" }, points);

    expect(vus).toHaveLength(3);
    // La normalisation a eu lieu une fois, et les trois en profitent.
    for (const vu of vus) expect(vu.FEDAPAY_API_KEY).toBe("ancienne");
    expect(new Set(vus).size).toBe(1);
  });
});

/* ------------------------------------------------------------------ *
 * Le constat franchit la frontière des processus, ou il ne sert à rien.
 * ------------------------------------------------------------------ */

/**
 * **Le second 503 permanent, caché derrière le premier.**
 *
 * Deux sondes concluent sur un fait — la messagerie a-t-elle parlé à un
 * serveur, le moteur a-t-il reconnu EICAR. Ce fait était établi par le
 * **worker**, qui est un service séparé en production, et lu par
 * `/api/health`, qui vit dans le processus web. Une variable de module
 * ne traverse pas cette frontière : l'adresse lisait « aucune sonde n'a
 * tourné » indéfiniment, pour deux dépendances bloquantes.
 *
 * Les constats sont donc passés depuis la base, et ces tests les
 * fournissent comme `/api/health` le fait.
 */
describe("les capacités concluent sur les constats qu'on leur donne", () => {
  const TOUT = { ...TOUT_RENSEIGNE };
  const frais = (reussi: boolean) => ({ reussi, quand: new Date() });

  afterEach(() => {
    brancherTransport(TRANSPORT_JOURNAL);
    oublierLesFaits();
  });

  /** Sans constat : ce que le processus web voyait, toujours. */
  it("sans constat, les deux sondes restent sans conclusion", () => {
    const par = Object.fromEntries(
      constaterLesDependances(TOUT, {}).map((c) => [c.cle, c.observation.sonde]),
    );
    expect(par.messagerie).toBe("ABSENTE");
    expect(par.antivirus).toBe("ABSENTE");
  });

  /**
   * Avec les constats du worker, les deux deviennent opérationnelles —
   * ce qui était **impossible** avant ce lot, quelle que soit la
   * configuration et quoi qu'ait fait le worker.
   */
  it("avec les constats du worker, elles concluent", () => {
    const constats = constaterLesDependances(TOUT, {
      messagerie: frais(true),
      antivirus: frais(true),
    });
    const par = Object.fromEntries(constats.map((c) => [c.cle, c.capacite]));
    expect(par.messagerie).toBe("OPERATIONNELLE");
    expect(par.antivirus).toBe("OPERATIONNELLE");
  });

  /**
   * Et un moteur qui a déclaré sain le fichier d'essai se lit **en
   * panne**, pas « non vérifié » : c'est un fait établi, et le plus
   * grave de tous, puisque tout continuerait de passer.
   */
  it("un moteur qui ne détecte rien se lit en panne", () => {
    const constats = constaterLesDependances(TOUT, { antivirus: frais(false) });
    const antivirus = constats.find((c) => c.cle === "antivirus")!;
    expect(antivirus.observation.sonde).toBe("ECHOUEE");
    // Bloquante et attendue : « en panne », pas « dégradée ».
    expect(antivirus.capacite).toBe("EN_PANNE");
  });

  /** Un constat périmé ne conclut plus — l'instance retombe à l'ignorance. */
  it("un constat périmé cesse de porter la capacité", () => {
    const vieux = { reussi: true, quand: new Date(Date.now() - FRAICHEUR_DU_CONSTAT_MS - 1) };
    const constats = constaterLesDependances(TOUT, { messagerie: vieux, antivirus: vieux });
    const par = Object.fromEntries(constats.map((c) => [c.cle, c.capacite]));
    expect(par.messagerie).toBe("CONFIGUREE_NON_VERIFIEE");
    expect(par.antivirus).toBe("CONFIGUREE_NON_VERIFIEE");
  });

  /**
   * Le constat des signatures n'existe pas, et c'est normal : cette
   * sonde-là est entièrement locale — elle signe un corps connu et
   * vérifie la fonction qu'appellent les routes de webhook. Rien à
   * partager entre processus.
   */
  it("la sonde locale conclut sans qu'aucun constat lui soit donné", () => {
    const paiements = constaterLesDependances(TOUT, {}).find((c) => c.cle === "paiements")!;
    expect(paiements.capacite).toBe("OPERATIONNELLE");
  });

  /**
   * L'instant de référence est **passé**, jamais lu en douce : une
   * capacité ne doit pas dépendre de l'horloge au milieu d'un calcul.
   */
  it("la fraîcheur se mesure contre l'instant fourni", () => {
    const constat = { reussi: true, quand: new Date("2026-09-22T06:00:00Z") };
    const lire = (maintenant: Date) =>
      constaterLesDependances(TOUT, { antivirus: constat }, DEPENDANCES, POINTS, maintenant).find(
        (c) => c.cle === "antivirus",
      )!.capacite;

    expect(lire(new Date("2026-09-22T08:00:00Z"))).toBe("OPERATIONNELLE");
    expect(lire(new Date("2026-09-22T10:00:00Z"))).toBe("CONFIGUREE_NON_VERIFIEE");
  });
});
