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
  constaterLesDependances,
  observer,
  sonderLesSignatures,
  type PointDeBranchement,
} from "@/server/exploitation/capacites";
import { TRANSPORT_JOURNAL, brancherTransport, envoyerCodeDeVerification } from "@/server/courrier";
import { NON_BRANCHE as BALAYEUR_NON_BRANCHE, leBalayeur } from "@/server/securite/antivirus";
import { remboursementBranche } from "@/server/paiement/remboursement";
import { remboursementFedaPay } from "@/server/paiement/fedapay";
import { lExtracteur } from "@/server/jobs/analyse";
import { laCritique, leRedacteur } from "@/server/redaction/service";

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
      messagerie: "IMPLEMENTATION_ABSENTE",
      // Le seul adaptateur écrit : la vérification de signature existe, et
      // sa sonde conclut avec ces secrets-là.
      paiements: "OPERATIONNELLE",
      /*
        Le second adaptateur écrit, et le premier dont la capacité
        plafonne : les clés sont là, l'ouvreur existe, et aucune sonde ne
        peut l'éprouver sans ouvrir une vraie session chez le
        fournisseur. « Configurée, non vérifiée » — donc pas prête.
      */
      ouverture_paiement: "CONFIGUREE_NON_VERIFIEE",
      antivirus: "IMPLEMENTATION_ABSENTE",
      remboursement: "IMPLEMENTATION_ABSENTE",
      extraction: "IMPLEMENTATION_ABSENTE",
      redaction: "IMPLEMENTATION_ABSENTE",
    });
    expect(etat.bloquantes).toEqual([
      "messagerie",
      "ouverture_paiement",
      "antivirus",
      "remboursement",
    ]);
  });

  /**
   * `IMPLEMENTATION_ABSENTE` n'est pas une étiquette : les fonctions que
   * l'appelant obtient ne savent effectivement rien rendre. Les deux
   * assertions ensemble ne peuvent pas être satisfaites par une
   * déclaration — un adaptateur réel ne rendrait pas `null`.
   */
  it("et les fonctions que l'appelant obtient ne rendent rien", async () => {
    expect(await leBalayeur()("pieces/essai.pdf")).toBeNull();
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
    expect(await lExtracteur()("pieces/essai.pdf", "PASSEPORT")).toBeNull();
    const matiere = {
      type: "LETTRE_MOTIVATION",
      objet: "Expliquer le projet d'études",
      pays: "NL",
      reponses: {},
      questions: [],
    };
    expect(await leRedacteur()(matiere)).toBeNull();
    expect(await laCritique()("un texte déjà écrit", matiere)).toBeNull();
  });

  /**
   * Et la réciproque, qui est la garantie réelle : ce que l'état annonce
   * suit **la fonction que l'appelant exécutera**, pas une déclaration.
   * On branche un transport pour de bon, et l'état change d'avis — puis on
   * le débranche, et il revient.
   */
  it("brancher un vrai transport suffit à changer ce que l'état annonce", async () => {
    const messagerie = par("messagerie");
    expect(observer(messagerie, TOUT_RENSEIGNE).adaptateur).toBe(false);

    const partis: string[] = [];
    brancherTransport(async (courrier) => void partis.push(courrier.destinataire));

    expect(observer(messagerie, TOUT_RENSEIGNE).adaptateur).toBe(true);
    expect(capacite(messagerie, observer(messagerie, TOUT_RENSEIGNE))).toBe(
      // Branché et configuré, mais aucune sonde ne sait encore éprouver un
      // envoi sans en envoyer un : l'honnêteté s'arrête là.
      "CONFIGUREE_NON_VERIFIEE",
    );

    // Et c'est bien ce transport-là que les courriers empruntent.
    await envoyerCodeDeVerification("candidate@exemple.test", "123456");
    expect(partis).toEqual(["candidate@exemple.test"]);

    brancherTransport(TRANSPORT_JOURNAL);
    expect(observer(messagerie, TOUT_RENSEIGNE).adaptateur).toBe(false);
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
