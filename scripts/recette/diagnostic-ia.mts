/**
 * Revue du 11/10/2026 : contrats IA non couverts par la porte habituelle.
 * Serveurs HTTP sur la boucle locale, octets et clé synthétiques ; aucun
 * fournisseur externe. Les assertions portent sur le comportement voulu.
 * Un code 1 signifie que des anomalies du chantier restent reproduites.
 *
 * npx tsx scripts/recette/diagnostic-ia.mts
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { generateKeyPairSync } from "node:crypto";
import { environnementDuBanc } from "./environnement";
import {
  lireDesOctetsCompatible,
  critiqueCompatible,
  type ConfigurationCompatible,
} from "../../src/server/ia/openai-compatible";
import { etatDesFonctions } from "../../src/domain/ia/fournisseurs";

type Resultat = {
  id: string;
  controle: string;
  attendu: unknown;
  observe: unknown;
  conforme: boolean;
};
const resultats: Resultat[] = [];
const constater = (
  id: string,
  controle: string,
  attendu: unknown,
  observe: unknown,
  conforme: boolean,
) => {
  resultats.push({ id, controle, attendu, observe, conforme });
};
const ecouter = (s: Server) =>
  new Promise<number>((ok) => {
    s.listen(0, "127.0.0.1", () => ok((s.address() as AddressInfo).port));
  });
const fermer = (s: Server) => new Promise<void>((ok, non) => s.close((e) => (e ? non(e) : ok())));
const contenuLu = JSON.stringify({
  piece_identifiee: "passeport",
  obstacle: null,
  champs: { expiration: "2031-04-30" },
});
const completion = (
  texte: string,
  usage: unknown = { prompt_tokens: 120, completion_tokens: 30 },
) => ({
  choices: [{ finish_reason: "stop", message: { content: texte } }],
  ...(usage === undefined ? {} : { usage }),
});
const demande = {
  codeAttendu: "passeport",
  intituleAttendu: "Passeport",
  codesDeLaChecklist: ["passeport"],
  champs: [{ code: "expiration", nature: "date" as const, exigence: "validité" }],
};
let charge: unknown = completion(contenuLu);
let redirection = false;
let octetsRecusAilleurs = false;
let appelsAilleurs = 0;
const autre = createServer((req, res) => {
  const morceaux: Buffer[] = [];
  req.on("data", (b: Buffer) => morceaux.push(b));
  req.on("end", () => {
    appelsAilleurs++;
    octetsRecusAilleurs = Buffer.concat(morceaux)
      .toString()
      .includes(Buffer.from("piece-synthetique").toString("base64"));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(completion(contenuLu)));
  });
});
const portAutre = await ecouter(autre);
const service = createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    if (redirection) {
      res.writeHead(307, { Location: `http://127.0.0.1:${portAutre}/v1/chat/completions` });
      res.end();
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(charge));
    }
  });
});
const port = await ecouter(service);
const config: ConfigurationCompatible = {
  base: new URL(`http://127.0.0.1:${port}/v1`),
  authentification: { mode: "cle", cle: "cle-synthetique-revue" },
  modele: "modele-synthetique",
  pdf: null,
};
const lire = () =>
  lireDesOctetsCompatible(config, "image/png", Buffer.from("piece-synthetique"), demande);
try {
  const normale = await lire();
  constater(
    "CTRL-01",
    "Lecture normale avec mesure",
    "LUE, 120/30",
    { etat: normale.etat, entree: normale.jetonsEntree, sortie: normale.jetonsSortie },
    normale.etat === "LUE" && normale.jetonsEntree === 120 && normale.jetonsSortie === 30,
  );

  charge = { choices: [{ finish_reason: "stop", message: { content: contenuLu } }] };
  const absente = await lire();
  constater(
    "DIA-01",
    "Une mesure absente ne devient pas une lecture gratuite mesurée",
    "absence signalée, pas LUE à 0/0",
    { etat: absente.etat, entree: absente.jetonsEntree, sortie: absente.jetonsSortie },
    !(absente.etat === "LUE" && absente.jetonsEntree === 0 && absente.jetonsSortie === 0),
  );

  charge = completion(contenuLu, { prompt_tokens: -12, completion_tokens: 1.5 });
  const invalide = await lire();
  constater(
    "DIA-02",
    "Les compteurs transmis au grand livre sont des entiers positifs ou nuls",
    "pas LUE avec jetons négatifs/fractionnaires",
    { etat: invalide.etat, entree: invalide.jetonsEntree, sortie: invalide.jetonsSortie },
    invalide.etat !== "LUE" ||
      [invalide.jetonsEntree, invalide.jetonsSortie].every((n) => Number.isInteger(n) && n >= 0),
  );

  charge = { choices: [], usage: { prompt_tokens: 120, completion_tokens: 30 } };
  const horsEnveloppe = await lire();
  constater(
    "DIA-03",
    "Une enveloppe inexploitable garde les jetons réellement annoncés",
    "NON_LUE, 120/30",
    {
      etat: horsEnveloppe.etat,
      entree: horsEnveloppe.jetonsEntree,
      sortie: horsEnveloppe.jetonsSortie,
    },
    horsEnveloppe.etat === "NON_LUE" &&
      horsEnveloppe.jetonsEntree === 120 &&
      horsEnveloppe.jetonsSortie === 30,
  );

  redirection = true;
  await lire();
  constater(
    "DIA-04",
    "La pièce ne suit pas une redirection vers une autre origine",
    "0 appel à l’autre origine",
    { appelsAilleurs, octetsRecusAilleurs },
    appelsAilleurs === 0,
  );
  redirection = false;

  charge = completion(
    JSON.stringify({
      remarques: [
        {
          genre: "INCOHERENCE",
          titre: "Deux valeurs diffèrent",
          corps: "Comparer les deux valeurs.",
          ecarts: null,
        },
      ],
    }),
  );
  const matiere = {
    piece: "Lettre de motivation",
    objet: "Présenter le parcours",
    pays: "Pays-Bas",
    reponses: {},
    questions: [],
  };
  const critique = await critiqueCompatible(config)("Un texte synthétique à relire.", matiere);
  constater(
    "DIA-05",
    "Une liste entièrement mal formée ne devient pas un avis sans remarque",
    "SANS_AVIS",
    {
      etat: critique.etat,
      remarques: critique.etat === "RELUE" ? critique.remarques.length : null,
    },
    critique.etat === "SANS_AVIS",
  );

  charge = completion(JSON.stringify({ remarques: [] }));
  const vide = await critiqueCompatible(config)("Un texte synthétique à relire.", matiere);
  constater(
    "CTRL-02",
    "Une véritable liste vide reste un résultat",
    "RELUE, 0 remarque",
    { etat: vide.etat, remarques: vide.etat === "RELUE" ? vide.remarques.length : null },
    vide.etat === "RELUE" && vide.remarques.length === 0,
  );

  // Appelle la construction réellement utilisée par le banc, sans le
  // démarrer et sans faire d’échange OAuth. La clé est générée ici.
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const env: Record<string, string> = {
    AI_FOURNISSEUR_EXTRACTION: "openai_compatible",
    AI_FOURNISSEUR_REDACTION: "openai_compatible",
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
    AI_OPENAI_PDF: "image_url",
    AI_PIECES_SOUS_TRAITANT_AUTORISE: "openai_compatible",
  };
  const branchees = etatDesFonctions(environnementDuBanc(env))
    .filter((f) => f.branche)
    .map((f) => f.fonction);
  constater(
    "DIA-06",
    "Le banc sans fournisseur neutralise aussi l’authentification Vertex",
    [],
    branchees,
    branchees.length === 0,
  );
} finally {
  await Promise.all([fermer(service), fermer(autre)]);
}
console.log(
  JSON.stringify(
    {
      base: "reproduire sur le commit indiqué dans le rapport REV11",
      simulation: true,
      resultats,
      echecs: resultats.filter((r) => !r.conforme).length,
    },
    null,
    2,
  ),
);
process.exitCode = resultats.some((r) => !r.conforme) ? 1 : 0;
