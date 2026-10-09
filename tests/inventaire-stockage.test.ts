import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CLASSES,
  DELAI_DE_CONFIRMATION_HEURES,
  OBJETS_MANQUANTS,
  ORDRE_DES_CLASSES,
  classerLObjet,
  dossierDeLaCle,
  lireLesOptionsDInventaire,
  retentionDuDossier,
  zoneAttendue,
  type ObjetStocke,
} from "@/domain/exploitation/inventaire-stockage";
import { LIMITE_PAR_DEFAUT } from "@/domain/exploitation/diagnostic-donnees";
import { prefixeDeDepot } from "@/domain/dossiers/televersement";
import { INTERDITS_PARTOUT, verifierTexte } from "@/domain/copy/vocabulaire-interdit";
import { sansCommentaires } from "@/domain/copy/source";

/**
 * RF-4, S.151 — l'inventaire du stockage (revue E4). Une liste à faire
 * valider, jamais une suppression : `smoke:purge` le rejoue sur un
 * stockage et une base réels, et vérifie que rien n'a bougé.
 */
const maintenant = new Date("2026-10-09T12:00:00Z");
const objet = (zone: ObjetStocke["zone"], heures = 48): ObjetStocke => ({
  zone,
  cle: "dossiers/d1/passeport/1700000000000-abcdefghijklmnop",
  taille: 10,
  modifieLe: new Date(maintenant.getTime() - heures * 3_600_000),
});

describe("le catalogue des classes", () => {
  it("chaque classe dit sa règle, son responsable et un traitement", () => {
    expect(ORDRE_DES_CLASSES).toHaveLength(Object.keys(CLASSES).length);
    for (const c of [...Object.values(CLASSES), OBJETS_MANQUANTS]) {
      expect(c.regle.length).toBeGreaterThan(3);
      expect(c.traitement.length).toBeGreaterThan(20);
    }
  });

  it("aucun texte ne promet un résultat (INV-2)", () => {
    for (const c of [...Object.values(CLASSES), OBJETS_MANQUANTS]) {
      expect(verifierTexte(`${c.titre} ${c.traitement}`, INTERDITS_PARTOUT)).toEqual([]);
    }
  });

  it("seules l'appartenance démontrée et la rétention échue font un candidat", () => {
    const candidates = ORDRE_DES_CLASSES.filter((c) => CLASSES[c].candidateALaPurge);
    expect(candidates).toEqual(["APRES_PURGE", "DOSSIER_ECHU"]);
    // Un doute ne devient jamais candidat.
    expect(CLASSES.DOSSIER_INCONNU.candidateALaPurge).toBe(false);
    expect(CLASSES.HORS_SCHEMA.candidateALaPurge).toBe(false);
    expect(OBJETS_MANQUANTS.candidateALaPurge).toBe(false);
  });
});

describe("l'appartenance et la rétention", () => {
  it("le dossier se lit au premier segment, celui de toute clé signée", () => {
    expect(dossierDeLaCle(`${prefixeDeDepot("d1", "passeport")}1700000000000-x`)).toBe("d1");
    // Une clé d'avant M1, sous le dossier mais sans le code de la pièce.
    expect(dossierDeLaCle("dossiers/d1/passeport-3.pdf")).toBe("d1");
    expect(dossierDeLaCle("passeport.pdf")).toBeNull();
    expect(dossierDeLaCle("dossiers/d1/")).toBeNull();
  });

  it("la zone attendue suit le balayage", () => {
    expect(zoneAttendue("SAINE")).toBe("CONFIANCE");
    expect(zoneAttendue("EN_QUARANTAINE")).toBe("QUARANTAINE");
    expect(zoneAttendue("INFECTEE")).toBeNull();
  });

  it("purgé, échu ou conservé", () => {
    const hier = new Date(maintenant.getTime() - 86_400_000);
    const demain = new Date(maintenant.getTime() + 86_400_000);
    expect(retentionDuDossier({ purgedAt: hier, purgeDueAt: hier }, maintenant)).toBe("PURGE");
    expect(retentionDuDossier({ purgedAt: null, purgeDueAt: hier }, maintenant)).toBe("ECHU");
    expect(retentionDuDossier({ purgedAt: null, purgeDueAt: demain }, maintenant)).toBe("VIVANT");
    expect(retentionDuDossier({ purgedAt: null, purgeDueAt: null }, maintenant)).toBe("VIVANT");
  });
});

describe("le classement", () => {
  it("une version en base l'emporte : rattaché dans sa zone, doublon dans l'autre", () => {
    const ctx = (zone: ObjetStocke["zone"]) => ({ zoneDeLaVersion: zone, retention: "PURGE" as const });
    expect(classerLObjet(objet("CONFIANCE"), ctx("CONFIANCE"), maintenant)).toBe("RATTACHE");
    expect(classerLObjet(objet("QUARANTAINE"), ctx("CONFIANCE"), maintenant)).toBe("DOUBLON");
  });

  it("sans version, la rétention du dossier décide", () => {
    const sans = (retention: "PURGE" | "ECHU" | "VIVANT" | null | undefined) => ({
      zoneDeLaVersion: null,
      retention,
    });
    expect(classerLObjet(objet("CONFIANCE"), sans("PURGE"), maintenant)).toBe("APRES_PURGE");
    expect(classerLObjet(objet("QUARANTAINE"), sans("ECHU"), maintenant)).toBe("DOSSIER_ECHU");
    expect(classerLObjet(objet("CONFIANCE"), sans("VIVANT"), maintenant)).toBe("DOSSIER_VIVANT");
    expect(classerLObjet(objet("CONFIANCE"), sans(null), maintenant)).toBe("DOSSIER_INCONNU");
    expect(classerLObjet(objet("CONFIANCE"), sans(undefined), maintenant)).toBe("HORS_SCHEMA");
  });

  it("un dépôt récent en quarantaine attend sa confirmation, pas au-delà", () => {
    const vivant = { zoneDeLaVersion: null, retention: "VIVANT" as const };
    const frais = objet("QUARANTAINE", DELAI_DE_CONFIRMATION_HEURES - 1);
    const ancien = objet("QUARANTAINE", DELAI_DE_CONFIRMATION_HEURES + 1);
    expect(classerLObjet(frais, vivant, maintenant)).toBe("DEPOT_EN_COURS");
    expect(classerLObjet(ancien, vivant, maintenant)).toBe("DOSSIER_VIVANT");
    // La zone de confiance n'a pas de dépôt en cours : rien n'y arrive sans version.
    expect(classerLObjet(objet("CONFIANCE", 1), vivant, maintenant)).toBe("DOSSIER_VIVANT");
  });
});

describe("les options", () => {
  it("lit --limite et --json, refuse le reste en le disant", () => {
    expect(lireLesOptionsDInventaire([])).toEqual({ ok: true, limite: LIMITE_PAR_DEFAUT, json: false });
    expect(lireLesOptionsDInventaire(["--json", "--limite=5"])).toEqual({ ok: true, limite: 5, json: true });
    expect(lireLesOptionsDInventaire(["--limite", "0"]).ok).toBe(false);
    expect(lireLesOptionsDInventaire(["--purger"]).ok).toBe(false);
  });
});

describe("lecture seule", () => {
  it("le serveur de l'inventaire n'écrit ni en base ni dans le stockage", () => {
    const source = sansCommentaires(readFileSync("src/server/exploitation/inventaire-stockage.ts", "utf8"));
    expect(source).not.toMatch(
      /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$executeRaw|\$transaction/u,
    );
    expect(source).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP)\s/u);
    // Du stockage, la liste seule.
    const importStockage = /import \{([^}]*)\} from "@\/lib\/storage";/u.exec(source)?.[1] ?? "";
    expect(importStockage.trim()).toBe("listerLaZone");
  });

  it("la liste d'une zone ne fait que lister", () => {
    const stockage = readFileSync("src/lib/storage.ts", "utf8");
    const corps = stockage.slice(
      stockage.indexOf("export async function* listerLaZone"),
      stockage.indexOf("export async function supprimerPartout"),
    );
    expect(corps).toContain("listObjectsV2(");
    expect(corps).not.toMatch(/remove|copyObject|putObject|presigned/u);
  });

  it("la commande est dans le paquet de l'image", () => {
    const build = readFileSync("scripts/build-worker.mjs", "utf8");
    const entree = build.slice(build.indexOf('outfile: "dist/inventaire-stockage.mjs"'));
    expect(entree.length).toBeGreaterThan(0);
    // Les dépendances CJS de `minio` exigent `require` dans un paquet ESM.
    expect(entree.slice(0, entree.indexOf("});"))).toContain("createRequire");
  });
});
