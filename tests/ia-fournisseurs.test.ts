import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import {
  FOURNISSEURS,
  adresseDeBase,
  deviseCommune,
  etatDesFonctions,
  fournisseurChoisi,
  fournisseurDeLUsage,
  fournisseursATarifer,
  litLesPdf,
  manqueDuFournisseur,
  modeleDu,
  piecesAutoriseesChez,
  tarifDu,
} from "@/domain/ia/fournisseurs";
import {
  EXTRACTEUR_NON_BRANCHE,
  configurationCompatible,
  extractionConfiguree,
  lExtracteur,
} from "@/server/dossiers/extracteur";
import { CRITIQUE_NON_BRANCHEE, REDACTEUR_NON_BRANCHE } from "@/server/redaction/adaptateur";
import { laCritique, leRedacteur } from "@/server/redaction/service";
import { redactionConfiguree } from "@/server/redaction/redacteur";
import {
  causeDuStatut,
  critiqueCompatible,
  lireDesOctetsCompatible,
  redacteurCompatible,
  type ConfigurationCompatible,
} from "@/server/ia/openai-compatible";

/**
 * Plusieurs fournisseurs d'IA, au choix de l'exploitant — S.94.
 *
 * Trois étages : ce que le domaine décide sans réseau (choix, garde des
 * pièces, tarifs), ce que les résolveurs en font, et l'adaptateur
 * compatible OpenAI face à un **vrai serveur HTTP** sur la boucle locale —
 * rien ne sort de la machine, aucun jeton n'est facturé.
 */

const COMPATIBLE = {
  AI_OPENAI_URL: "https://api.exemple.test/v1",
  AI_OPENAI_API_KEY: "cle-essai",
  AI_OPENAI_MODEL: "modele-essai",
};

describe("le domaine choisit, et ne devine rien", () => {
  it("sans configuration, Anthropic sert les deux fonctions, comme en V1", () => {
    expect(fournisseurChoisi({}, "extraction")).toEqual({ connu: true, fournisseur: "anthropic" });
    expect(fournisseurChoisi({}, "redaction")).toEqual({ connu: true, fournisseur: "anthropic" });
    expect(modeleDu({}, "anthropic")).toBe(FOURNISSEURS.anthropic.modele.defaut);
  });

  it("une valeur inconnue n'est jamais remplacée en silence par le défaut", () => {
    expect(fournisseurChoisi({ AI_FOURNISSEUR_EXTRACTION: "openai" }, "extraction")).toEqual({
      connu: false,
      valeur: "openai",
    });
    const etat = etatDesFonctions({ AI_FOURNISSEUR_EXTRACTION: "openai", ANTHROPIC_API_KEY: "k" });
    expect(etat[0]).toMatchObject({ branche: false, fournisseur: "openai" });
    expect(etat[0]!.raison).toMatch(/n'est pas un fournisseur connu : écrire anthropic ou openai_compatible/u);
  });

  it("le fournisseur compatible n'a aucun modèle par défaut, et exige une adresse https", () => {
    expect(modeleDu({}, "openai_compatible")).toBeNull();
    expect(manqueDuFournisseur({}, "openai_compatible")).toMatch(/AI_OPENAI_URL, AI_OPENAI_API_KEY, AI_OPENAI_MODEL/u);
    expect(manqueDuFournisseur({ ...COMPATIBLE, AI_OPENAI_URL: "http://api.exemple.test/v1" }, "openai_compatible")).toMatch(/https/u);
    expect(manqueDuFournisseur(COMPATIBLE, "openai_compatible")).toBeNull();
    expect(adresseDeBase("http://127.0.0.1:8080/v1")).not.toBeNull();
    expect(adresseDeBase("ftp://exemple.test")).toBeNull();
  });

  it("aucune pièce ne part chez un autre sous-traitant sans autorisation écrite", () => {
    expect(piecesAutoriseesChez({}, "anthropic")).toBe(true);
    expect(piecesAutoriseesChez({}, "openai_compatible")).toBe(false);
    expect(piecesAutoriseesChez({ AI_PIECES_SOUS_TRAITANT_AUTORISE: "anthropic" }, "openai_compatible")).toBe(false);
    expect(piecesAutoriseesChez({ AI_PIECES_SOUS_TRAITANT_AUTORISE: "openai_compatible" }, "openai_compatible")).toBe(true);
  });

  it("l'écran dit pourquoi la lecture n'est pas branchée chez un fournisseur non autorisé", () => {
    const [lecture, redaction] = etatDesFonctions({
      ...COMPATIBLE,
      AI_FOURNISSEUR_EXTRACTION: "openai_compatible",
      AI_FOURNISSEUR_REDACTION: "openai_compatible",
    });
    expect(lecture).toMatchObject({ branche: false, modele: "modele-essai" });
    expect(lecture!.raison).toMatch(/AI_PIECES_SOUS_TRAITANT_AUTORISE=openai_compatible/u);
    // La rédaction ne reçoit aucune pièce : pas de garde de sous-traitance.
    expect(redaction).toMatchObject({ branche: true, raison: null });
  });

  it("le PDF n'est lu par le fournisseur compatible que sur déclaration", () => {
    expect(litLesPdf({}, "anthropic")).toBe(true);
    expect(litLesPdf({}, "openai_compatible")).toBe(false);
    expect(litLesPdf({ AI_OPENAI_PDF: "oui" }, "openai_compatible")).toBe(true);
  });

  it("chaque fournisseur a son tarif, et jamais celui d'un autre", () => {
    const env = {
      AI_TARIF_ENTREE_PAR_MILLION: "3",
      AI_TARIF_SORTIE_PAR_MILLION: "15",
      AI_TARIF_DEVISE: "USD",
    };
    // Le tarif historique reste celui d'Anthropic : rien à renommer.
    expect(tarifDu(env, "anthropic")).toEqual({ entreeParMillion: 3, sortieParMillion: 15, devise: "USD" });
    expect(tarifDu(env, "openai_compatible")).toBeNull();
    const deux = {
      ...env,
      AI_TARIF_OPENAI_COMPATIBLE_ENTREE_PAR_MILLION: "1",
      AI_TARIF_OPENAI_COMPATIBLE_SORTIE_PAR_MILLION: "2",
      AI_TARIF_OPENAI_COMPATIBLE_DEVISE: "USD",
    };
    expect(deviseCommune(deux, ["anthropic", "openai_compatible"])).toBe("USD");
    // Deux devises ne s'additionnent pas ; un tarif absent non plus.
    expect(deviseCommune({ ...deux, AI_TARIF_OPENAI_COMPATIBLE_DEVISE: "EUR" }, ["anthropic", "openai_compatible"])).toBeNull();
    expect(deviseCommune(env, ["anthropic", "openai_compatible"])).toBeNull();
    expect(fournisseursATarifer({}, [])).toEqual(["anthropic"]);
  });

  it("l'historique se lit sans être réécrit : une ligne sans fournisseur est d'Anthropic", () => {
    expect(fournisseurDeLUsage(null)).toBe("anthropic");
    expect(fournisseurDeLUsage("openai_compatible")).toBe("openai_compatible");
  });
});

describe("les résolveurs suivent la configuration", () => {
  const demande = {
    codeAttendu: "passeport",
    intituleAttendu: "Passeport",
    codesDeLaChecklist: ["passeport"],
    champs: [],
  };

  it("un empêchement, quel qu'il soit, rend la même fonction non branchée", async () => {
    expect(lExtracteur({})).toBe(EXTRACTEUR_NON_BRANCHE);
    expect(lExtracteur({ AI_FOURNISSEUR_EXTRACTION: "inconnu", ANTHROPIC_API_KEY: "k" })).toBe(EXTRACTEUR_NON_BRANCHE);
    expect(lExtracteur({ ...COMPATIBLE, AI_FOURNISSEUR_EXTRACTION: "openai_compatible" })).toBe(EXTRACTEUR_NON_BRANCHE);
    // Et elle nomme la cause sans parler d'une clé qui n'est peut-être pas en cause.
    const lue = await EXTRACTEUR_NON_BRANCHE({ objectKey: "x", mimeType: "image/png" }, demande);
    expect(lue).toMatchObject({ etat: "NON_LUE", cause: "non_configure" });
    expect(lue.etat === "NON_LUE" && lue.detail).toMatch(/Coûts IA/u);
  });

  it("autorisée, la lecture part chez le fournisseur choisi", () => {
    const env = {
      ...COMPATIBLE,
      AI_FOURNISSEUR_EXTRACTION: "openai_compatible",
      AI_PIECES_SOUS_TRAITANT_AUTORISE: "openai_compatible",
    };
    expect(lExtracteur(env)).not.toBe(EXTRACTEUR_NON_BRANCHE);
    expect(extractionConfiguree(env)).toBe(true);
    expect(configurationCompatible(env)).toMatchObject({ cle: "cle-essai", modele: "modele-essai", pdf: false });
  });

  it("la rédaction suit AI_FOURNISSEUR_REDACTION, Anthropic par défaut", () => {
    expect(leRedacteur({})).toBe(REDACTEUR_NON_BRANCHE);
    expect(laCritique({})).toBe(CRITIQUE_NON_BRANCHEE);
    expect(redactionConfiguree({ ANTHROPIC_API_KEY: "k" })).toBe(true);
    const env = { ...COMPATIBLE, AI_FOURNISSEUR_REDACTION: "openai_compatible" };
    expect(redactionConfiguree(env)).toBe(true);
    expect(leRedacteur(env)).not.toBe(REDACTEUR_NON_BRANCHE);
    expect(laCritique(env)).not.toBe(CRITIQUE_NON_BRANCHEE);
    // Choisi mais incomplet : non configuré, et jamais Anthropic à sa place.
    expect(redactionConfiguree({ ANTHROPIC_API_KEY: "k", AI_FOURNISSEUR_REDACTION: "openai_compatible" })).toBe(false);
  });
});

describe("la classification d'un statut HTTP", () => {
  it.each([
    [401, "non_configure"],
    [403, "non_configure"],
    [404, "non_configure"],
    [429, "service_sature"],
    [503, "service_sature"],
    [500, "injoignable"],
    [408, "injoignable"],
    [400, "reponse_illisible"],
    [422, "reponse_illisible"],
  ])("classe %i en %s", (statut, cause) => {
    expect(causeDuStatut(statut).cause).toBe(cause);
  });
});

// ── L'adaptateur, face à un vrai serveur ─────────────────────────────────

interface Recu {
  chemin: string;
  autorisation: string | undefined;
  corps: Record<string, unknown>;
}

let serveur: Server;
let base: URL;
const recus: Recu[] = [];
let prochaine: { statut: number; corps: unknown } = { statut: 200, corps: {} };

const lireCorps = (req: IncomingMessage): Promise<string> =>
  new Promise((ok) => {
    let texte = "";
    req.on("data", (m) => (texte += m));
    req.on("end", () => ok(texte));
  });

beforeAll(async () => {
  serveur = createServer(async (req, res) => {
    const corps = JSON.parse((await lireCorps(req)) || "{}") as Record<string, unknown>;
    recus.push({ chemin: req.url ?? "", autorisation: req.headers.authorization, corps });
    res.writeHead(prochaine.statut, { "Content-Type": "application/json" });
    res.end(JSON.stringify(prochaine.corps));
  });
  await new Promise<void>((ok) => serveur.listen(0, "127.0.0.1", ok));
  base = new URL(`http://127.0.0.1:${(serveur.address() as AddressInfo).port}/v1`);
});
afterAll(() => new Promise<void>((ok) => serveur.close(() => ok())));

const config = (pdf = false): ConfigurationCompatible => ({ base, cle: "cle-secrete-essai", modele: "modele-essai", pdf });
const completion = (contenu: string, fin = "stop", extra: Record<string, unknown> = {}) => ({
  choices: [{ finish_reason: fin, message: { content: contenu, ...extra } }],
  usage: { prompt_tokens: 120, completion_tokens: 30 },
});
const repondre = (corps: unknown, statut = 200) => {
  prochaine = { statut, corps };
  recus.length = 0;
};

const DEMANDE = {
  codeAttendu: "passeport",
  intituleAttendu: "Passeport",
  codesDeLaChecklist: ["passeport"],
  champs: [{ code: "date_expiration", nature: "date" as const, exigence: "valide six mois" }],
};

describe("la lecture d'une pièce chez un fournisseur compatible", () => {
  it("envoie les octets de l'image, le schéma, la clé en en-tête, et lit la réponse", async () => {
    repondre(completion(JSON.stringify({ piece_identifiee: "passeport", obstacle: null, champs: { date_expiration: "2031-04-30" } })));
    const lue = await lireDesOctetsCompatible(config(), "image/png", Buffer.from("octets-image"), DEMANDE);

    expect(lue).toMatchObject({
      etat: "LUE",
      pieceIdentifiee: "passeport",
      bruts: { date_expiration: "2031-04-30" },
      jetonsEntree: 120,
      jetonsSortie: 30,
      appel: { fournisseur: "openai_compatible", modele: "modele-essai" },
    });
    const [recu] = recus;
    expect(recu!.chemin).toBe("/v1/chat/completions");
    expect(recu!.autorisation).toBe("Bearer cle-secrete-essai");
    expect(recu!.corps).toMatchObject({ model: "modele-essai", response_format: { type: "json_schema" } });
    const contenu = JSON.stringify(recu!.corps.messages);
    expect(contenu).toContain(`data:image/png;base64,${Buffer.from("octets-image").toString("base64")}`);
    // La clé ne ressort dans rien de ce que l'adaptateur rend.
    expect(JSON.stringify(lue)).not.toContain("cle-secrete-essai");
  });

  it("un PDF non déclaré lisible ne part pas : revue humaine, sans appel ni jeton", async () => {
    repondre(completion("{}"));
    const lue = await lireDesOctetsCompatible(config(false), "application/pdf", Buffer.from("%PDF"), DEMANDE);
    expect(lue).toMatchObject({ etat: "NON_LUE", cause: "type_non_lisible", jetonsEntree: 0 });
    expect(recus).toHaveLength(0);
  });

  it("déclaré lisible, le PDF part comme fichier", async () => {
    repondre(completion(JSON.stringify({ piece_identifiee: "passeport", obstacle: null, champs: { date_expiration: null } })));
    await lireDesOctetsCompatible(config(true), "application/pdf", Buffer.from("%PDF"), DEMANDE);
    expect(JSON.stringify(recus[0]!.corps.messages)).toContain('"type":"file"');
  });

  it.each([
    [401, "non_configure"],
    [429, "service_sature"],
    [500, "injoignable"],
    [400, "reponse_illisible"],
  ])("une réponse %i devient %s, sans jeton compté", async (statut, cause) => {
    repondre({ error: { message: "écho de la demande" } }, statut);
    const lue = await lireDesOctetsCompatible(config(), "image/jpeg", Buffer.from("x"), DEMANDE);
    expect(lue).toMatchObject({ etat: "NON_LUE", cause, jetonsEntree: 0, jetonsSortie: 0 });
    // Le corps de l'erreur n'est pas recopié : il peut contenir un écho de la pièce.
    expect(JSON.stringify(lue)).not.toContain("écho");
  });

  it("une réponse hors schéma, coupée, refusée ou signalant un obstacle n'est jamais une lecture", async () => {
    repondre(completion("pas du json"));
    expect(await lireDesOctetsCompatible(config(), "image/png", Buffer.from("x"), DEMANDE)).toMatchObject({ etat: "NON_LUE", cause: "reponse_illisible", jetonsEntree: 120 });
    repondre(completion("{", "length"));
    expect(await lireDesOctetsCompatible(config(), "image/png", Buffer.from("x"), DEMANDE)).toMatchObject({ etat: "NON_LUE", cause: "reponse_illisible" });
    repondre(completion("", "stop", { refusal: "je ne peux pas" }));
    expect(await lireDesOctetsCompatible(config(), "image/png", Buffer.from("x"), DEMANDE)).toMatchObject({ etat: "NON_LUE", cause: "refus" });
    repondre(completion(JSON.stringify({ piece_identifiee: null, obstacle: "scan_illisible", champs: {} })));
    expect(await lireDesOctetsCompatible(config(), "image/png", Buffer.from("x"), DEMANDE)).toMatchObject({ etat: "NON_LUE", cause: "scan_illisible" });
  });

  it("un serveur injoignable se dit injoignable", async () => {
    const mort: ConfigurationCompatible = { ...config(), base: new URL("http://127.0.0.1:9/v1") };
    expect(await lireDesOctetsCompatible(mort, "image/png", Buffer.from("x"), DEMANDE)).toMatchObject({ etat: "NON_LUE", cause: "injoignable" });
  });
});

describe("la rédaction et la relecture chez un fournisseur compatible", () => {
  const matiere = {
    piece: "Lettre de motivation",
    objet: "Expliquer le projet d'études",
    pays: "les Pays-Bas",
    reponses: { 0: "Je veux étudier l'ingénierie de l'eau à Delft." },
    questions: [{ rang: 0, section: "Projet", intitule: "Quel est ton projet ?" }],
  };

  it("un texte suffisant devient une version, avec son fournisseur", async () => {
    repondre(completion("Madame, Monsieur, ".padEnd(260, "texte ")));
    const r = await redacteurCompatible(config())(matiere);
    expect(r).toMatchObject({ etat: "ECRITE", appel: { fournisseur: "openai_compatible" } });
  });

  it("un texte coupé ou trop court ne devient pas une version", async () => {
    repondre(completion("Madame, Monsieur, ".padEnd(260, "texte "), "length"));
    expect(await redacteurCompatible(config())(matiere)).toMatchObject({ etat: "SANS_TEXTE", cause: "reponse_illisible" });
    repondre(completion("Trop court."));
    expect(await redacteurCompatible(config())(matiere)).toMatchObject({ etat: "SANS_TEXTE", cause: "reponse_illisible" });
  });

  it("sans réponse de l'entretien, aucun appel ne part", async () => {
    repondre(completion("x"));
    expect(await redacteurCompatible(config())({ ...matiere, reponses: {} })).toMatchObject({ etat: "SANS_TEXTE", jetonsEntree: 0 });
    expect(recus).toHaveLength(0);
  });

  it("la relecture lit les remarques au schéma du domaine", async () => {
    repondre(completion(JSON.stringify({ remarques: [{ genre: "FORME", titre: "Phrase longue", corps: "Coupe la deuxième phrase en deux.", ecarts: null }] })));
    expect(await laCritiqueEssai()).toMatchObject({ etat: "RELUE", remarques: [{ genre: "FORME" }] });
    repondre({ error: {} }, 429);
    expect(await laCritiqueEssai()).toMatchObject({ etat: "SANS_AVIS", cause: "service_sature" });
  });

  const laCritiqueEssai = () => critiqueCompatible(config())("Un texte à relire.", matiere);
});

describe("chaque SDK reste dans son adaptateur", () => {
  function fichiers(dir: string, acc: string[] = []): string[] {
    for (const nom of readdirSync(dir)) {
      const p = join(dir, nom);
      if (statSync(p).isDirectory()) fichiers(p, acc);
      else if (/\.tsx?$/u.test(nom)) acc.push(p.replace(/\\/gu, "/"));
    }
    return acc;
  }

  /**
   * Le SDK Anthropic n'est importé que par ses adaptateurs. Un écran, une
   * route ou le domaine qui l'importerait lierait de nouveau le produit à
   * un fournisseur, et le choix par configuration deviendrait un leurre.
   */
  it("le SDK Anthropic n'est importé que par les adaptateurs Anthropic", () => {
    const autorises = [
      "src/lib/ai.ts",
      "src/server/ia/appel.ts",
      "src/server/dossiers/extracteur.ts",
      "src/server/redaction/adaptateur.ts",
    ];
    const importeurs = fichiers("src").filter((f) => /from "@anthropic-ai\/sdk"/u.test(readFileSync(f, "utf8")));
    expect(importeurs.sort()).toEqual(autorises.sort());
  });

  it("le domaine ne connaît aucun SDK", () => {
    for (const f of fichiers("src/domain")) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/from "@anthropic-ai|from "openai"/u);
    }
  });
});
