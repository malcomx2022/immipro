import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ETATS_A_TRANSFERER,
  SCHEMA_DES_FILES,
  SCHEMA_PGBOSS_10,
  aTransferer,
  transfertDe,
  type TacheDePgBoss10,
} from "@/domain/exploitation/bascule-des-files";
import { FILES, JOBS } from "@/lib/queue";

/**
 * La bascule des files de pg-boss 10 vers pg-boss 11 — S.166.
 *
 * pg-boss 11 ne migre pas une base de la version 10 ; il travaille dans
 * un schéma neuf, et ce qui attendait dans l'ancien y est reposé. La base
 * réelle s'éprouve dans `npm run smoke:files`.
 */
const tache = (partiel: Partial<TacheDePgBoss10> = {}): TacheDePgBoss10 => ({
  id: "0b8e3f6c-3b1a-4c2e-9f1d-6a7b8c9d0e1f",
  name: JOBS.BALAYAGE_PIECE,
  data: { versionId: "v1" },
  state: "created",
  priority: 0,
  startAfter: new Date("2026-10-10T10:00:00Z"),
  singletonKey: null,
  ...partiel,
});
const maintenant = new Date("2026-10-10T12:00:00Z");

describe("ce qui se transfère", () => {
  it("ce qui attendait encore : créée, en reprise, prise par un worker arrêté", () => {
    expect([...ETATS_A_TRANSFERER]).toEqual(["created", "retry", "active"]);
    for (const state of ETATS_A_TRANSFERER) expect(aTransferer(tache({ state }), FILES)).toBe(true);
  });

  it("jamais ce qui est terminé, échoué ou annulé — une analyse refaite coûterait une lecture", () => {
    for (const state of ["completed", "failed", "cancelled"]) {
      expect(aTransferer(tache({ state }), FILES)).toBe(false);
    }
  });

  it("seulement les files de l'application, pas les files internes de pg-boss", () => {
    expect(aTransferer(tache({ name: "__pgboss__send-it" }), FILES)).toBe(false);
  });
});

describe("ce que la tâche devient", () => {
  it("le même identifiant, les mêmes données : rejouer ne repose rien deux fois", () => {
    const t = transfertDe(tache(), maintenant);
    expect(t.file).toBe(JOBS.BALAYAGE_PIECE);
    expect(t.donnees).toEqual({ versionId: "v1" });
    expect(t.options).toEqual({ id: "0b8e3f6c-3b1a-4c2e-9f1d-6a7b8c9d0e1f" });
  });

  it("un départ différé encore à venir est gardé ; un départ passé ne retarde rien", () => {
    const plusTard = new Date("2026-10-10T14:00:00Z");
    expect(transfertDe(tache({ startAfter: plusTard }), maintenant).options.startAfter).toEqual(plusTard);
    expect(transfertDe(tache(), maintenant).options.startAfter).toBeUndefined();
  });

  it("la priorité et la clé d'unicité suivent ; des données absentes deviennent un objet vide", () => {
    const t = transfertDe(tache({ priority: 5, singletonKey: "k", data: null }), maintenant);
    expect(t.options).toMatchObject({ priority: 5, singletonKey: "k" });
    expect(t.donnees).toEqual({});
  });
});

describe("le branchement", () => {
  const queue = readFileSync("src/lib/queue.ts", "utf8");

  it("pg-boss 11 tourne dans son propre schéma, jamais dans celui de la version 10", () => {
    expect(SCHEMA_DES_FILES).not.toBe(SCHEMA_PGBOSS_10);
    expect(queue).toMatch(/new PgBoss\(\{ connectionString: process\.env\.DATABASE_URL!, schema: SCHEMA_DES_FILES \}\)/u);
  });

  it("le transfert suit la déclaration des files : sans file, pas d'envoi", () => {
    expect(queue.indexOf("await declarerLesFiles(instance);")).toBeLessThan(
      queue.indexOf("await transfererLesTachesDePgBoss10(instance, FILES);"),
    );
  });

  it("la fumée de montée fait partie de la porte", () => {
    const porte = readFileSync(".github/workflows/validation.yml", "utf8");
    expect(porte).toMatch(/run: npm run smoke:files/u);
  });
});
