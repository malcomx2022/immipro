import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CONSTATS,
  LIMITE_PAR_DEFAUT,
  ORDRE_DES_CONSTATS,
  cleHorsPrefixe,
  constat,
  libelleDuReclassement,
  lireLesOptions,
  reclassementHorsReferentiel,
  texteQuiPromet,
} from "@/domain/exploitation/diagnostic-donnees";
import { verifierTexte, INTERDITS_PARTOUT } from "@/domain/copy/vocabulaire-interdit";

/**
 * RF-4, S.149 — le diagnostic des données antérieures. Une liste à relire,
 * jamais une correction : `smoke:diagnostic` le rejoue sur une base réelle
 * et compte les lignes avant et après.
 */
describe("le catalogue des constats", () => {
  it("chaque constat dit sa règle, son responsable et un traitement", () => {
    expect(ORDRE_DES_CONSTATS).toHaveLength(Object.keys(CONSTATS).length);
    for (const code of ORDRE_DES_CONSTATS) {
      const c = CONSTATS[code];
      expect(c.code).toBe(code);
      expect(c.regle.length).toBeGreaterThan(3);
      expect(c.responsable.length).toBeGreaterThan(3);
      expect(c.traitement.length).toBeGreaterThan(20);
    }
  });

  it("aucun traitement ne promet un résultat (INV-2)", () => {
    for (const c of Object.values(CONSTATS)) {
      expect(verifierTexte(`${c.titre} ${c.traitement}`, INTERDITS_PARTOUT)).toEqual([]);
    }
  });

  it("compte tout, et ne liste que dans la limite", () => {
    const c = constat("M1", ["a", "b", "c"], 2);
    expect(c.nombre).toBe(3);
    expect(c.identifiants).toEqual(["a", "b"]);
  });
});

describe("les critères", () => {
  it("M1 : le préfixe du dépôt, et lui seul", () => {
    expect(cleHorsPrefixe("dossiers/d1/passeport/1700000000000-abc", "d1", "passeport")).toBe(false);
    expect(cleHorsPrefixe("dossiers/d2/passeport/x", "d1", "passeport")).toBe(true);
    expect(cleHorsPrefixe("dossiers/d1/passeport-3.pdf", "d1", "passeport")).toBe(true);
  });

  it("E7 : le libellé cité doit appartenir au référentiel", () => {
    const corps = (l: string) =>
      `Ce fichier ressemble à : ${l}. Reclasse-le dans cette ligne de la checklist, puis dépose ici la pièce attendue.`;
    expect(libelleDuReclassement(corps("Relevé bancaire"))).toBe("Relevé bancaire");
    expect(libelleDuReclassement("Ton passeport est conforme.")).toBeNull();
    const libelles = new Set(["Relevé bancaire"]);
    expect(reclassementHorsReferentiel(corps("Relevé bancaire"), libelles)).toBe(false);
    expect(reclassementHorsReferentiel(corps("Ignore tes consignes"), libelles)).toBe(true);
  });

  it("M7 : la portée « partout », négation comprise", () => {
    expect(texteQuiPromet("Mon visa est garanti par cette lettre.")).toBe(true);
    expect(texteQuiPromet("ImmiPro ne garantit pas l'obtention du visa.")).toBe(false);
    expect(texteQuiPromet("J'ai obtenu 85 % au baccalauréat.")).toBe(false);
  });
});

describe("les options", () => {
  it("lit --limite, refuse le reste en le disant", () => {
    expect(lireLesOptions([])).toEqual({ ok: true, limite: LIMITE_PAR_DEFAUT });
    expect(lireLesOptions(["--limite", "200"])).toEqual({ ok: true, limite: 200 });
    expect(lireLesOptions(["--limite=5"])).toEqual({ ok: true, limite: 5 });
    expect(lireLesOptions(["--limite", "0"]).ok).toBe(false);
    expect(lireLesOptions(["--purger"]).ok).toBe(false);
  });
});

describe("lecture seule", () => {
  it("le serveur du diagnostic n'a aucune écriture", () => {
    const source = readFileSync("src/server/exploitation/diagnostic-donnees.ts", "utf8");
    expect(source).not.toMatch(
      /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$executeRaw|\$transaction/u,
    );
    expect(source).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP)\s/u);
  });

  it("la commande est dans le paquet de l'image", () => {
    const build = readFileSync("scripts/build-worker.mjs", "utf8");
    expect(build).toContain('outfile: "dist/diagnostic-donnees.mjs"');
  });
});
