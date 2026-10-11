// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { generateKeyPairSync } from "node:crypto";
import { once } from "node:events";
import { environnementDuBanc } from "../scripts/recette/environnement";
import { ProcessusDuBanc, verifierPortDisponible } from "../scripts/recette/processus";
import { etatDesFonctions } from "@/domain/ia/fournisseurs";
import { lExtracteur } from "@/server/dossiers/extracteur";
import { leRedacteur, laCritique } from "@/server/redaction/service";
import { environnementNormalise } from "@/server/paiement/secrets";

const serveurs: Server[] = [];
const groupes: ProcessusDuBanc[] = [];
const ecouter = async (serveur: Server) => {
  serveurs.push(serveur);
  await new Promise<void>((ok) => serveur.listen(0, "127.0.0.1", ok));
  return (serveur.address() as AddressInfo).port;
};
const groupe = (surEchec?: (erreur: Error) => void) => {
  const g = new ProcessusDuBanc(surEchec);
  groupes.push(g);
  return g;
};
afterEach(async () => {
  await Promise.all(groupes.splice(0).map((g) => g.arreter(100)));
  await Promise.all(
    serveurs.splice(0).map(
      (s) =>
        new Promise<void>((ok) => {
          s.closeAllConnections();
          s.close(() => ok());
        }),
    ),
  );
});

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const complet = {
  ANTHROPIC_API_KEY: "cle-synthetique",
  AI_OPENAI_API_KEY: "cle-compatible-synthetique",
  AI_OPENAI_URL:
    "https://europe-west4-aiplatform.googleapis.com/v1/projects/essai/locations/europe-west4/endpoints/openapi",
  AI_OPENAI_MODEL: "modele-synthetique",
  AI_OPENAI_AUTH: "compte_de_service_google",
  AI_OPENAI_COMPTE_DE_SERVICE: JSON.stringify({
    type: "service_account",
    client_email: "banc@essai.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    token_uri: "https://oauth2.googleapis.com/token",
  }),
  AI_PIECES_SOUS_TRAITANT_AUTORISE: "openai_compatible",
  AI_OPENAI_PDF: "image_url",
};

describe("Isolation du banc (REV-IA-04)", () => {
  it.each([
    ["Anthropic", "anthropic", "cle"],
    ["compatible avec clé", "openai_compatible", "cle"],
    ["Vertex avec compte de service", "openai_compatible", "compte_de_service_google"],
  ])(
    "neutralise %s même quand le parent branche réellement les deux fonctions",
    (_, fournisseur, auth) => {
      const parent = {
        ...complet,
        AI_FOURNISSEUR_EXTRACTION: fournisseur,
        AI_FOURNISSEUR_REDACTION: fournisseur,
        AI_OPENAI_AUTH: auth,
      };
      expect(etatDesFonctions(parent).every((f) => f.branche)).toBe(true);
      expect(etatDesFonctions(environnementDuBanc(parent)).some((f) => f.branche)).toBe(false);
      expect(parent.AI_OPENAI_COMPTE_DE_SERVICE).toBe(complet.AI_OPENAI_COMPTE_DE_SERVICE);
    },
  );

  it("n'hérite ni d'un nouvel identifiant, ni d'un chargeur Node, et garde proxy/CA", () => {
    const env = environnementDuBanc({
      AI_FUTUR_SECRET: "secret-synthetique",
      GOOGLE_APPLICATION_CREDENTIALS: "/synthetique.json",
      NODE_OPTIONS: "--env-file=production.env",
      DATABASE_URL: "ne-pas-utiliser",
      SMTP_URL: "ne-pas-utiliser",
      MINIO_ROOT_PASSWORD: "ne-pas-utiliser",
      HTTPS_PROXY: "http://proxy.test",
      NODE_EXTRA_CA_CERTS: "/certificat.test",
      PATH: "/bin",
    });
    for (const cle of [
      "AI_FUTUR_SECRET",
      "GOOGLE_APPLICATION_CREDENTIALS",
      "NODE_OPTIONS",
      "DATABASE_URL",
      "SMTP_URL",
      "MINIO_ROOT_PASSWORD",
    ])
      expect(env[cle]).toBeUndefined();
    expect(env.HTTPS_PROXY).toBe("http://proxy.test");
    expect(env.NODE_EXTRA_CA_CERTS).toBe("/certificat.test");
    expect(env.PATH).toBe("/bin");
  });

  it("ne réactive pas le paiement via les anciens noms S.169", () => {
    const env = environnementNormalise(
      environnementDuBanc({
        FEDAPAY_SECRET_KEY: "ancienne-cle",
        STRIPE_SECRET_KEY: "ancienne-cle",
        STRIPE_API_KEY: "nouvelle-cle",
      }),
    );
    expect(env.FEDAPAY_API_KEY).toBe("");
    expect(env.STRIPE_API_KEY).toBe("");
  });

  it("les adaptateurs réels ne font aucun appel au piège HTTP", async () => {
    let appels = 0;
    const port = await ecouter(
      createServer((req, res) => {
        appels++;
        req.resume();
        res.writeHead(500);
        res.end();
      }),
    );
    const env = environnementDuBanc({
      ...complet,
      AI_FOURNISSEUR_EXTRACTION: "openai_compatible",
      AI_FOURNISSEUR_REDACTION: "openai_compatible",
      AI_OPENAI_AUTH: "cle",
      AI_OPENAI_URL: `http://127.0.0.1:${port}/v1`,
    });
    const matiere = {
      piece: "Lettre",
      objet: "Projet",
      pays: "Pays-Bas",
      reponses: {},
      questions: [],
    };
    const lecture = await lExtracteur(env)(
      { objectKey: "synthetique.pdf", mimeType: "application/pdf" },
      {
        codeAttendu: "passeport",
        intituleAttendu: "Passeport",
        codesDeLaChecklist: ["passeport"],
        champs: [],
      },
    );
    const redaction = await leRedacteur(env)(matiere);
    const critique = await laCritique(env)("Texte synthétique", matiere);
    expect([
      lecture.etat === "NON_LUE" ? lecture.cause : null,
      redaction.etat,
      critique.etat,
    ]).toEqual(["non_configure", "SANS_TEXTE", "SANS_AVIS"]);
    expect([lecture.appel, redaction.appel, critique.appel]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(appels).toBe(0);
  });
});

describe("Démarrage et supervision (REV-BANC-01)", () => {
  it.each([0, -1, 65536, 3100.5, NaN])("refuse le port invalide %s", async (port) => {
    await expect(verifierPortDisponible(port)).rejects.toThrow("--port");
  });

  it("refuse un port occupé puis accepte le même port libéré", async () => {
    const s = createServer();
    const port = await ecouter(s);
    await expect(verifierPortDisponible(port)).rejects.toThrow("indisponible");
    await new Promise<void>((ok) => s.close(() => ok()));
    await expect(verifierPortDisponible(port)).resolves.toBeUndefined();
  });

  it("une santé publique 200 d'une autre instance ne valide pas le démarrage", async () => {
    const port = await ecouter(
      createServer((_, res) => res.end(JSON.stringify({ status: "pilote", db: "up" }))),
    );
    await expect(
      groupe().attendrePret({
        url: `http://127.0.0.1:${port}`,
        jeton: "nouveau",
        delaiMs: 150,
        intervalleMs: 10,
      }),
    ).rejects.toThrow("délai");
  });

  it("exige le détail authentifié de cette passe et attend la disponibilité de la base", async () => {
    let appels = 0;
    let header = "";
    const port = await ecouter(
      createServer((req, res) => {
        header = req.headers.authorization ?? "";
        appels++;
        res.writeHead(appels === 1 ? 503 : 200);
        res.end(JSON.stringify({ db: appels === 1 ? "down" : "up", dependances: {} }));
      }),
    );
    await groupe().attendrePret({
      url: `http://127.0.0.1:${port}`,
      jeton: "jeton-de-cette-passe",
      delaiMs: 1000,
      intervalleMs: 10,
    });
    expect(appels).toBe(2);
    expect(header).toBe("Bearer jeton-de-cette-passe");
  });

  it("borne un serveur qui ne termine jamais sa réponse", async () => {
    const port = await ecouter(createServer(() => undefined));
    const debut = Date.now();
    await expect(
      groupe().attendrePret({
        url: `http://127.0.0.1:${port}`,
        jeton: "essai",
        delaiMs: 150,
        intervalleMs: 10,
      }),
    ).rejects.toThrow("délai");
    expect(Date.now() - debut).toBeLessThan(1500);
  });

  it("tolère seulement le paiement explicitement absent dans le banc", async () => {
    const port = await ecouter(
      createServer((_, res) => {
        res.writeHead(503);
        res.end(JSON.stringify({ db: "up", dependances: {}, bloquantes: ["ouverture_paiement"] }));
      }),
    );
    await groupe().attendrePret({
      url: `http://127.0.0.1:${port}`,
      jeton: "essai",
      bloquantesPermises: ["ouverture_paiement"],
      delaiMs: 1000,
    });
  });

  it("ne tolère pas une panne antivirus en plus du paiement absent", async () => {
    const port = await ecouter(
      createServer((_, res) => {
        res.writeHead(503);
        res.end(
          JSON.stringify({
            db: "up",
            dependances: {},
            bloquantes: ["ouverture_paiement", "antivirus"],
          }),
        );
      }),
    );
    await expect(
      groupe().attendrePret({
        url: `http://127.0.0.1:${port}`,
        jeton: "essai",
        bloquantesPermises: ["ouverture_paiement"],
        delaiMs: 150,
        intervalleMs: 10,
      }),
    ).rejects.toThrow("délai");
  });

  it("une commande introuvable échoue sans attendre la minute", async () => {
    const g = groupe();
    g.lancer("app", "/immipro-commande-inexistante", [], {});
    await expect(g.attendrePret({ url: "http://127.0.0.1:1", jeton: "essai" })).rejects.toThrow(
      "app",
    );
  });

  it("un enfant qui échoue interrompt le démarrage et son compagnon est arrêté", async () => {
    const g = groupe();
    const compagnon = g.lancer(
      "worker",
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      {},
    );
    g.lancer("app", process.execPath, ["-e", "process.exit(7)"], {});
    await expect(g.attendrePret({ url: "http://127.0.0.1:1", jeton: "essai" })).rejects.toThrow(
      "code 7",
    );
    await g.arreter();
    expect(compagnon.signalCode).toBe("SIGTERM");
  });

  it("surveille aussi le worker après l'annonce de disponibilité", async () => {
    const erreurs: Error[] = [];
    const g = groupe((e) => erreurs.push(e));
    const port = await ecouter(
      createServer((_, res) => res.end(JSON.stringify({ db: "up", dependances: {} }))),
    );
    const enfant = g.lancer("worker", process.execPath, ["-e", "setInterval(() => {}, 1000)"], {});
    await g.attendrePret({ url: `http://127.0.0.1:${port}`, jeton: "essai" });
    const sorti = once(enfant, "exit");
    enfant.kill("SIGTERM");
    await sorti;
    expect(erreurs).toHaveLength(1);
    expect(erreurs[0]!.message).toContain("worker");
  });

  it("force l'arrêt d'un enfant qui ignore SIGTERM, sans double arrêt", async () => {
    const erreurs: Error[] = [];
    const g = groupe((e) => erreurs.push(e));
    const enfant = g.lancer(
      "worker",
      process.execPath,
      ["-e", "process.on('SIGTERM', () => {}); console.log('prêt'); setInterval(() => {}, 1000)"],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    await once(enfant.stdout!, "data");
    const premier = g.arreter(50);
    expect(g.arreter()).toBe(premier);
    await premier;
    expect(enfant.signalCode).toBe("SIGKILL");
    expect(erreurs).toEqual([]);
  });
});
