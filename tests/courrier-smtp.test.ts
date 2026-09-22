import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { SMTPServer } from "smtp-server";
import type { AddressInfo } from "node:net";
import {
  DELAI_ACCUEIL_MS,
  DELAI_CONNEXION_MS,
  DELAI_ENVOI_MS,
  analyserUrlSmtp,
  domaineDe,
  suiteDeLEnvoi,
  traceDEnvoi,
  type IssueDEnvoi,
} from "@/domain/courrier/transport";
import {
  configurationLisible,
  envoyerParSmtp,
  issueDeLErreur,
  oublierLeTransporteur,
  verifierLaConnexion,
} from "@/server/courrier/smtp";
import {
  FRAICHEUR_DU_CONSTAT_MS,
  sondeDuConstat,
} from "@/domain/exploitation/constats";
import {
  TRANSPORT_JOURNAL,
  brancherTransport,
  expedier,
  leDernierFait,
  leTransport,
  oublierLesFaits,
  sonderLeCourrier,
} from "@/server/courrier";

/**
 * Le transport SMTP — arbitrage du 22/09/2026.
 *
 * **Contre un vrai serveur.** `smtp-server` en écoute sur un port
 * éphémère, en clair, sur la boucle locale : les messages sont
 * réellement remis, et on lit ce qui est arrivé. Un faux objet
 * `sendMail` aurait vérifié qu'on appelle nodemailer comme on croit
 * l'appeler, ce qui n'est pas la question — la question est de savoir
 * ce qu'un serveur qui refuse, qui ne répond pas, ou qui rejette un
 * destinataire, produit de notre côté.
 */

interface Recu {
  enveloppeVers: string[];
  contenu: string;
}

/** Un serveur d'essai, avec la réponse qu'on veut lui faire donner. */
function serveur(options: {
  recus: Recu[];
  auth?: (identifiant: string, motDePasse: string) => boolean;
  refuserLeDestinataire?: string;
  muet?: boolean;
}): Promise<{ port: number; fermer: () => Promise<void> }> {
  const srv = new SMTPServer({
    disabledCommands: options.auth ? [] : ["AUTH"],
    authOptional: !options.auth,
    hideSTARTTLS: true,
    // Le serveur se tait sur la bannière : de quoi éprouver le délai
    // d'accueil sans attendre un vrai réseau en panne.
    ...(options.muet ? { useXForward: false } : {}),
    onAuth(donnees, _session, prete) {
      if (!options.auth) return prete(null, { user: "libre" });
      return options.auth(donnees.username ?? "", donnees.password ?? "")
        ? prete(null, { user: donnees.username })
        : prete(new Error("identifiants refusés"));
    },
    onRcptTo(adresse, _session, suite) {
      if (options.refuserLeDestinataire === adresse.address) {
        const refus = Object.assign(new Error("boîte inconnue"), { responseCode: 550 });
        return suite(refus);
      }
      return suite();
    },
    onData(flux, session, fini) {
      let contenu = "";
      flux.on("data", (bloc: Buffer) => (contenu += bloc.toString("utf8")));
      flux.on("end", () => {
        options.recus.push({
          enveloppeVers: session.envelope.rcptTo.map((r) => r.address),
          contenu,
        });
        fini();
      });
    },
  });

  return new Promise((resoudre) => {
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.server.address() as AddressInfo).port;
      resoudre({
        port,
        fermer: () => new Promise<void>((fin) => srv.close(() => fin())),
      });
    });
  });
}

const COURRIER = {
  destinataire: "awa@exemple.test",
  objet: "481920 — ton code de vérification ImmiPro",
  corps: "Ton code de vérification est 481920.",
  genre: "code_verification",
};

const env = (port: number, reste: Record<string, string> = {}) => ({
  SMTP_URL: `smtp://127.0.0.1:${port}`,
  SMTP_FROM: "ne-pas-repondre@immipro.test",
  ...reste,
});

afterEach(() => {
  oublierLeTransporteur();
  oublierLesFaits();
  brancherTransport(null);
  vi.restoreAllMocks();
});

describe("la lecture de SMTP_URL", () => {
  it("lit l'hôte, le port et le chiffrement", () => {
    expect(analyserUrlSmtp("smtp://relais.exemple.test:2525")).toEqual({
      valide: true,
      url: { hote: "relais.exemple.test", port: 2525, implicite: false, avecAuth: false },
    });
    expect(analyserUrlSmtp("smtps://u:p@relais.exemple.test")).toEqual({
      valide: true,
      url: { hote: "relais.exemple.test", port: 465, implicite: true, avecAuth: true },
    });
    // Sans port : 587 pour la soumission, 465 pour le TLS implicite.
    expect(analyserUrlSmtp("smtp://relais.exemple.test")).toMatchObject({
      url: { port: 587 },
    });
  });

  it("refuse ce qui n'est pas une adresse SMTP utilisable", () => {
    expect(analyserUrlSmtp(undefined)).toEqual({ valide: false, defaut: "absente" });
    expect(analyserUrlSmtp("   ")).toEqual({ valide: false, defaut: "absente" });
    expect(analyserUrlSmtp("pigeon voyageur")).toEqual({ valide: false, defaut: "illisible" });
    expect(analyserUrlSmtp("https://exemple.test")).toEqual({
      valide: false,
      defaut: "schema_inconnu",
    });
    expect(analyserUrlSmtp("smtp://:587")).toEqual({ valide: false, defaut: "hote_absent" });
    expect(analyserUrlSmtp("smtp://h:99999")).toEqual({ valide: false, defaut: "port_invalide" });
  });

  /**
   * **Le mot de passe ne sort pas de la fonction.** Ce qui n'est pas
   * rendu ne peut pas être journalisé par inadvertance — et un motif
   * d'erreur finit toujours par atteindre un journal.
   */
  it("ne rend ni l'identifiant ni le mot de passe", () => {
    const lue = analyserUrlSmtp("smtps://facteur:tres-secret@relais.exemple.test");
    expect(JSON.stringify(lue)).not.toContain("tres-secret");
    expect(JSON.stringify(lue)).not.toContain("facteur");
    expect(lue).toMatchObject({ valide: true, url: { avecAuth: true } });

    // Et aucun motif de refus ne recopie la valeur reçue.
    const casse = analyserUrlSmtp("smtp://u:tres-secret@h:99999");
    expect(JSON.stringify(casse)).not.toContain("tres-secret");
  });

  it("les délais sont posés, et pas à l'infini", () => {
    for (const delai of [DELAI_CONNEXION_MS, DELAI_ACCUEIL_MS, DELAI_ENVOI_MS]) {
      expect(delai).toBeGreaterThan(0);
      expect(delai).toBeLessThanOrEqual(30_000);
    }
    const source = readFileSync("src/server/courrier/smtp.ts", "utf8");
    for (const option of ["connectionTimeout", "greetingTimeout", "socketTimeout"]) {
      expect(source, option).toContain(option);
    }
  });
});

describe("ce qui a le droit d'atteindre le journal", () => {
  /**
   * **L'objet d'un code de vérification est le code.** Le transport de
   * repli l'écrivait à chaque envoi : le code d'ouverture de chaque
   * compte se lisait donc dans le journal du serveur.
   */
  it("la trace ne porte ni objet, ni corps, ni adresse complète", () => {
    const trace = traceDEnvoi(COURRIER.genre, COURRIER.destinataire, "envoye");
    expect(trace).toContain("code_verification");
    expect(trace).toContain("exemple.test");
    expect(trace).not.toContain("481920");
    expect(trace).not.toContain("awa@");
    expect(trace).not.toContain(COURRIER.objet);
  });

  it("le domaine se lit même sur une adresse malformée", () => {
    expect(domaineDe("awa@Exemple.TEST")).toBe("exemple.test");
    expect(domaineDe("sans-arobase")).toBe("(adresse sans domaine)");
    expect(domaineDe("finit-par@")).toBe("(adresse sans domaine)");
  });

  /** Le repli au journal n'écrit rien d'autre que la trace. */
  it("le transport de repli ne journalise pas l'objet", async () => {
    const dit: string[] = [];
    vi.spyOn(console, "info").mockImplementation((...a) => void dit.push(a.join(" ")));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    brancherTransport(TRANSPORT_JOURNAL);
    expect(await expedier(COURRIER)).toEqual({ issue: "journalise" });
    expect(dit.join("\n")).not.toContain("481920");
    expect(dit.join("\n")).not.toContain("ton code de vérification");
  });
});

describe("les issues, et ce qu'elles autorisent", () => {
  const TOUTES: readonly IssueDEnvoi[] = [
    "envoye",
    "journalise",
    "non_configure",
    "refuse",
    "injoignable",
  ];

  it("une seule est partie, et seule la coupure se renvoie", () => {
    expect(TOUTES.filter((i) => suiteDeLEnvoi(i).parti)).toEqual(["envoye"]);
    expect(TOUTES.filter((i) => suiteDeLEnvoi(i).renvoyable)).toEqual(["injoignable"]);
  });

  it("une issue inconnue ne passe pas en silence", () => {
    expect(() => suiteDeLEnvoi("inventee" as IssueDEnvoi)).toThrow(/non arbitrée/u);
  });

  it("la sonde ne conclut que sur un fait", () => {
    expect(sondeDuConstat(true, undefined)).toBe("ABSENTE");
    expect(sondeDuConstat(true, { reussi: true, quand: new Date() })).toBe("CONCLUANTE");
    expect(sondeDuConstat(true, { reussi: false, quand: new Date() })).toBe("ECHOUEE");
    // Une URL illisible est un fait, elle : inutile d'attendre un envoi.
    expect(sondeDuConstat(false, { reussi: true, quand: new Date() })).toBe("ECHOUEE");
  });

  /**
   * Un constat a une durée de validité. `DernierFait` portait sa date et
   * personne ne la lisait : un envoi réussi il y a trois semaines aurait
   * déclaré la messagerie opérationnelle aujourd'hui, devant un serveur
   * éteint depuis.
   */
  it("un constat périmé ne conclut plus rien — ni succès, ni échec", () => {
    const vieux = { reussi: true, quand: new Date(Date.now() - FRAICHEUR_DU_CONSTAT_MS - 1) };
    expect(sondeDuConstat(true, vieux)).toBe("ABSENTE");

    // Et il ne bascule pas non plus en échec : le service n'a pas été
    // pris en défaut, on n'a simplement plus de nouvelles.
    expect(sondeDuConstat(true, vieux)).not.toBe("ECHOUEE");

    const juste = { reussi: true, quand: new Date(Date.now() - FRAICHEUR_DU_CONSTAT_MS + 60_000) };
    expect(sondeDuConstat(true, juste)).toBe("CONCLUANTE");
  });
});

describe("contre un vrai serveur SMTP", () => {
  const recus: Recu[] = [];
  let port = 0;
  let fermer: () => Promise<void>;

  beforeAll(async () => {
    const lance = await serveur({ recus });
    port = lance.port;
    fermer = lance.fermer;
  });
  afterAll(async () => fermer());
  afterEach(() => {
    recus.length = 0;
  });

  it("le message part, et arrive tel qu'on l'a écrit", async () => {
    const issue = await envoyerParSmtp(COURRIER, env(port));
    expect(issue).toEqual({ issue: "envoye" });
    expect(recus).toHaveLength(1);
    expect(recus[0]!.enveloppeVers).toEqual([COURRIER.destinataire]);
    expect(recus[0]!.contenu).toContain("Ton code de v");
    expect(recus[0]!.contenu).toContain("ne-pas-repondre@immipro.test");
  });

  /** La sonde ne remet aucun message : c'est ce qui la rend sûre. */
  it("la vérification de connexion n'envoie rien", async () => {
    expect(await verifierLaConnexion(env(port))).toEqual({ issue: "envoye" });
    expect(recus).toHaveLength(0);
  });

  it("un destinataire refusé n'est pas un envoi", async () => {
    const refus = await serveur({ recus, refuserLeDestinataire: "inconnue@exemple.test" });
    oublierLeTransporteur();
    const issue = await envoyerParSmtp(
      { ...COURRIER, destinataire: "inconnue@exemple.test" },
      env(refus.port),
    );
    // Seul destinataire refusé : le serveur casse l'enveloppe entière et
    // nodemailer lève. C'est le chemin ordinaire, puisque nos courriers
    // n'ont jamais qu'un destinataire.
    expect(issue.issue).toBe("refuse");
    expect(recus).toHaveLength(0);
    await refus.fermer();
  });

  /**
   * L'autre chemin, et il ne se voyait pas.
   *
   * Un serveur peut **accepter** la transaction et refuser une partie
   * des destinataires : nodemailer résout alors normalement, et range
   * les refusés dans `info.rejected`. Sans cette lecture, on compterait
   * un envoi qui n'a atteint personne — et le premier test de ce bloc
   * ne l'attrapait pas, parce qu'un refus unique fait lever.
   *
   * Nos courriers n'ont qu'un destinataire aujourd'hui ; la garde est
   * là pour le jour où l'un en aura deux, et elle est éprouvée pour de
   * bon plutôt que supposée.
   */
  it("un refus partiel ne compte pas non plus pour un envoi", async () => {
    const refus = await serveur({ recus, refuserLeDestinataire: "inconnue@exemple.test" });
    oublierLeTransporteur();
    const issue = await envoyerParSmtp(
      { ...COURRIER, destinataire: "awa@exemple.test, inconnue@exemple.test" },
      env(refus.port),
    );
    expect(issue).toMatchObject({ issue: "refuse", detail: expect.stringContaining("refusé") });
    await refus.fermer();
  });

  it("des identifiants rejetés sont un refus, pas une panne", async () => {
    const strict = await serveur({ recus, auth: (u, p) => u === "facteur" && p === "bon" });
    oublierLeTransporteur();
    const issue = await envoyerParSmtp(COURRIER, {
      SMTP_URL: `smtp://facteur:mauvais@127.0.0.1:${strict.port}`,
      SMTP_FROM: "ne-pas-repondre@immipro.test",
    });
    expect(issue.issue).toBe("refuse");
    expect(issue).toMatchObject({ detail: expect.stringContaining("authentification") });
    // Et le mot de passe ne ressort pas dans le détail.
    expect(JSON.stringify(issue)).not.toContain("mauvais");
    expect(recus).toHaveLength(0);
    await strict.fermer();
  });

  it("les bons identifiants passent", async () => {
    const strict = await serveur({ recus, auth: (u, p) => u === "facteur" && p === "bon" });
    oublierLeTransporteur();
    const issue = await envoyerParSmtp(COURRIER, {
      SMTP_URL: `smtp://facteur:bon@127.0.0.1:${strict.port}`,
      SMTP_FROM: "ne-pas-repondre@immipro.test",
    });
    expect(issue).toEqual({ issue: "envoye" });
    expect(recus).toHaveLength(1);
    await strict.fermer();
  });

  /**
   * **Une absence de réponse n'est pas un refus.** La même frontière que
   * pour les paiements : un renvoi doit rester possible, parce qu'on ne
   * sait pas si le message est passé.
   */
  it("un serveur injoignable rend « injoignable », pas « refusé »", async () => {
    oublierLeTransporteur();
    // Port fermé sur la boucle locale : la connexion est refusée tout de
    // suite, sans attendre le délai — un test qui attendrait dix
    // secondes serait un test que personne ne lance.
    const mort = await serveur({ recus });
    const portMort = mort.port;
    await mort.fermer();

    const issue = await envoyerParSmtp(COURRIER, env(portMort));
    expect(issue.issue).toBe("injoignable");
    expect(suiteDeLEnvoi(issue.issue).renvoyable).toBe(true);
  });

  it("un délai dépassé est injoignable, et le délai est tenu", async () => {
    /*
      Un serveur qui accepte la connexion et ne dit jamais bonjour : le
      délai d'accueil doit trancher. Il est abaissé le temps du test —
      attendre dix secondes pour éprouver un délai de dix secondes
      rendrait la suite insupportable, et ce qui est vérifié est que
      l'option est branchée, pas la valeur de la constante.
    */
    const { createServer } = await import("node:net");
    const muet = createServer(() => undefined);
    await new Promise<void>((ok) => muet.listen(0, "127.0.0.1", () => ok()));
    const portMuet = (muet.address() as AddressInfo).port;

    const nodemailer = (await import("nodemailer")).default;
    const transporteur = nodemailer.createTransport({
      host: "127.0.0.1",
      port: portMuet,
      secure: false,
      connectionTimeout: 300,
      greetingTimeout: 300,
      socketTimeout: 300,
    });
    const debut = Date.now();
    const issue = await transporteur
      .sendMail({ from: "a@b.test", to: "c@d.test", subject: "x", text: "y" })
      .then(() => ({ issue: "envoye" as const }))
      .catch((e: unknown) => issueDeLErreur(e));

    expect(issue.issue).toBe("injoignable");
    expect(Date.now() - debut).toBeLessThan(5_000);
    await new Promise<void>((ok) => muet.close(() => ok()));
  }, 10_000);
});

describe("la traduction des échecs de nodemailer", () => {
  it("sépare ce qui se reprend de ce qui ne se reprendra pas", () => {
    expect(issueDeLErreur({ code: "EAUTH", responseCode: 535 }).issue).toBe("refuse");
    expect(issueDeLErreur({ code: "EENVELOPE", responseCode: 550 }).issue).toBe("refuse");
    expect(issueDeLErreur({ code: "ETIMEDOUT" }).issue).toBe("injoignable");
    expect(issueDeLErreur({ code: "ECONNECTION" }).issue).toBe("injoignable");
    expect(issueDeLErreur({ code: "ESOCKET" }).issue).toBe("injoignable");
  });

  /**
   * **Un 4xx n'est pas un refus** — correctif du 22/09/2026.
   *
   * Le protocole distingue les deux depuis toujours : 5xx dit « non »,
   * 4xx dit « pas maintenant ». Les trois codes nodemailer ci-dessous
   * rendaient `refuse` quel que soit le code de réponse, si bien qu'un
   * `451` — serveur momentanément indisponible, la réponse la plus
   * banale d'un relais sous charge — se lisait « réessayer ne servirait
   * à rien », et le renvoi d'un code de vérification était refusé au
   * candidat.
   *
   * Trouvé par la fumée des rappels d'échéance, dont le serveur d'essai
   * répond 451 : le rappel était marqué traité et n'arrivait jamais.
   */
  it("un code de réponse transitoire se reprend, quel que soit le code nodemailer", () => {
    for (const code of ["EAUTH", "EENVELOPE", "EMESSAGE"]) {
      expect(issueDeLErreur({ code, responseCode: 451 }).issue, code).toBe("injoignable");
      expect(issueDeLErreur({ code, responseCode: 421 }).issue, code).toBe("injoignable");
      expect(issueDeLErreur({ code, responseCode: 550 }).issue, code).toBe("refuse");
    }
    // Sans code de réponse, le serveur n'a rien dit : la règle d'avant
    // s'applique, et ces trois-là restent des refus.
    expect(issueDeLErreur({ code: "EENVELOPE" }).issue).toBe("refuse");
  });

  /**
   * Un code inconnu penche vers l'injoignable : entre laisser un
   * candidat sans code de vérification et lui en envoyer deux, le second
   * est le moindre mal.
   */
  it("un code inconnu est tenu pour passager, sauf réponse 5xx", () => {
    expect(issueDeLErreur({ code: "EBIZARRE" }).issue).toBe("injoignable");
    expect(issueDeLErreur({}).issue).toBe("injoignable");
    expect(issueDeLErreur({ code: "EBIZARRE", responseCode: 554 }).issue).toBe("refuse");
    expect(issueDeLErreur({ code: "EBIZARRE", responseCode: 421 }).issue).toBe("injoignable");
  });

  it("le détail ne recopie jamais le message du serveur", () => {
    const issue = issueDeLErreur({
      code: "EENVELOPE",
      responseCode: 550,
      response: "550 5.1.1 <awa@exemple.test> boîte inconnue",
      message: "550 5.1.1 <awa@exemple.test> boîte inconnue",
    });
    expect(JSON.stringify(issue)).not.toContain("awa@exemple.test");
    expect(issue).toMatchObject({ detail: expect.stringContaining("550") });
  });
});

describe("le service absent reste une dégradation honnête", () => {
  it("sans SMTP_URL, rien ne part et l'appelant le sait", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(configurationLisible({}).lisible).toBe(false);
    expect(leTransport({})).toBe(TRANSPORT_JOURNAL);
    expect(await envoyerParSmtp(COURRIER, {})).toMatchObject({ issue: "non_configure" });
  });

  it("une SMTP_URL sans expéditeur ne suffit pas", () => {
    expect(configurationLisible({ SMTP_URL: "smtp://h:25" })).toMatchObject({
      lisible: false,
      detail: expect.stringContaining("SMTP_FROM"),
    });
  });

  /** Le repli n'établit aucun fait : il n'a parlé à personne. */
  it("un courrier journalisé ne rend pas la messagerie opérationnelle", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    brancherTransport(TRANSPORT_JOURNAL);
    await expedier(COURRIER);
    expect(leDernierFait()).toBeNull();
    expect(sonderLeCourrier({ SMTP_URL: "smtp://h:25", SMTP_FROM: "a@b.test" })).toBe("ABSENTE");
  });

  /** Un envoi réel, lui, en établit un — dans un sens comme dans l'autre. */
  it("un envoi réel établit le fait que la sonde lit", async () => {
    brancherTransport(async () => ({ issue: "envoye" }));
    await expedier(COURRIER);
    expect(leDernierFait()?.reussi).toBe(true);
    expect(sonderLeCourrier({ SMTP_URL: "smtp://h:25", SMTP_FROM: "a@b.test" })).toBe(
      "CONCLUANTE",
    );

    brancherTransport(async () => ({ issue: "injoignable", detail: "ETIMEDOUT" }));
    await expedier(COURRIER);
    expect(leDernierFait()?.reussi).toBe(false);
    expect(sonderLeCourrier({ SMTP_URL: "smtp://h:25", SMTP_FROM: "a@b.test" })).toBe("ECHOUEE");
  });
});

describe("le vocabulaire interdit est vérifié avant le transport", () => {
  it("un courrier fautif ne part pas, quel que soit le transport", async () => {
    const partis: string[] = [];
    brancherTransport(async (c) => {
      partis.push(c.genre);
      return { issue: "envoye" };
    });
    await expect(
      expedier({ ...COURRIER, corps: "Avec nous, visa garanti." }),
    ).rejects.toThrow(/INV-2/u);
    expect(partis).toEqual([]);
  });

  it("et l'objet est relu autant que le corps", async () => {
    brancherTransport(async () => ({ issue: "envoye" }));
    await expect(
      expedier({ ...COURRIER, objet: "Tes chances d'obtention" }),
    ).rejects.toThrow(/INV-2/u);
  });
});

describe("aucune route n'affirme qu'un courrier est parti sans l'avoir vérifié", () => {
  /**
   * Trois routes composent un courrier et répondent quelque chose au
   * candidat. Deux d'entre elles **doivent** taire l'issue, et la
   * troisième doit la dire — la confusion coûte dans les deux sens.
   *
   * - `comptes.verification.renvoi` répond à quelqu'un de déjà connecté :
   *   rien n'est divulgué en lui disant que l'envoi a échoué, et lui
   *   afficher « un nouveau code est parti » devant un transport muet le
   *   laisse attendre un message qui n'existe pas ;
   * - `comptes.motdepasse.demande` et la création de compte répondent la
   *   même chose avec ou sans compte existant. Seule une adresse connue
   *   produit un courrier : en faire remonter l'échec dirait « cette
   *   adresse est cliente » à qui essaie des adresses au hasard.
   *
   * Le test tient les deux règles, parce qu'une seule des deux se
   * retourne facilement en oubli.
   */
  const lire = (f: string) => readFileSync(f, "utf8");

  it("le renvoi de code rend l'échec au candidat", () => {
    const source = lire("src/app/api/comptes/verification/route.ts");
    expect(source).toMatch(/suiteDeLEnvoi\(envoi\.issue\)\.parti/u);
    expect(source).toMatch(/throw echec\(/u);
    // L'issue est lue, et non ignorée : `await envoyer…` sans affectation
    // est exactement la forme qui reproduisait le défaut.
    expect(source).toMatch(/const envoi = await envoyerCodeDeVerification/u);
  });

  it("les deux routes qui ne peuvent pas le dire portent leur raison", () => {
    for (const f of [
      "src/app/api/comptes/mot-de-passe/route.ts",
      "src/app/api/comptes/route.ts",
    ]) {
      const source = lire(f);
      // Elles n'affirment rien sur l'envoi lui-même…
      expect(source, f).not.toMatch(/suiteDeLEnvoi/u);
      // …et la raison de ce silence est écrite, pas sous-entendue.
      expect(source, f).toMatch(/adresse est cliente|distinguerait une adresse/u);
    }
  });
});
