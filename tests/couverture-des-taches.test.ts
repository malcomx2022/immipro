import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { JOBS } from "@/lib/queue";

/**
 * Chaque tâche du worker est éprouvée quelque part — revue du 07/10/2026,
 * M9.
 *
 * Une tâche planifiée tourne la nuit, seule, et son échec ne se voit qu'au
 * matin, s'il se voit. Ces essais tiennent deux promesses :
 * - chaque file de `JOBS` a son `boss.work` : une file déclarée sans
 *   ouvrier accumule des jobs que personne ne prend ;
 * - chaque module de `src/server/jobs/` est importé par un essai, ou par
 *   une fumée que la CI lance. Une exception se nomme, avec sa raison.
 */
const WORKER = readFileSync("src/server/jobs/worker.ts", "utf8");

/** Modules sans essai direct, et pourquoi. Une entrée nouvelle se justifie. */
const SANS_ESSAI_DIRECT: Readonly<Record<string, string>> = {
  "courrier-reserve":
    "partagé par les rappels et les relances après dépôt, et éprouvé par leurs fumées (`smoke:rappels`, `smoke:depot`) au travers d'eux",
};

/** Les fumées que `validation.yml` lance, retrouvées par `package.json`. */
function fumeesLanceesEnCI(): string[] {
  const validation = readFileSync(".github/workflows/validation.yml", "utf8");
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts as Record<string, string>;
  return [...validation.matchAll(/npm run ((?:smoke|sandbox):[\w-]+)/gu)]
    .map((m) => scripts[m[1]!] ?? "")
    .flatMap((commande) => [...commande.matchAll(/scripts\/[\w.-]+\.(?:mts|mjs|ts)/gu)].map((m) => m[0]))
    .filter((f, i, tous) => existsSync(f) && tous.indexOf(f) === i);
}

function essais(dir: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) essais(p, acc);
    else if (/\.test\.tsx?$/u.test(nom)) acc.push(p);
  }
  return acc;
}

describe("chaque file a son ouvrier", () => {
  const ouvertes = new Set(
    [...WORKER.matchAll(/boss\.work(?:<[^>]*>)?\(\s*JOBS\.(\w+)/gu)].map((m) => m[1]!),
  );

  it.each(Object.keys(JOBS))("JOBS.%s est pris par un boss.work", (cle) => {
    expect(ouvertes.has(cle)).toBe(true);
  });
});

describe("chaque tâche est éprouvée", () => {
  const sources = [...essais("tests"), ...fumeesLanceesEnCI()].map((f) => readFileSync(f, "utf8"));
  const modules = readdirSync("src/server/jobs")
    .filter((n) => n.endsWith(".ts") && n !== "worker.ts")
    .map((n) => basename(n, ".ts"));

  it("les fumées de la CI sont bien retrouvées", () => {
    expect(fumeesLanceesEnCI().length).toBeGreaterThanOrEqual(20);
  });

  it.each(modules)("%s est importé par un essai ou une fumée de la CI", (module) => {
    const importe = sources.some((s) => s.includes(`jobs/${module}"`));
    if (module in SANS_ESSAI_DIRECT) {
      // Une exception qui n'en est plus une se retire.
      expect(importe, `${module} est désormais éprouvé : retirer l'exception`).toBe(false);
      return;
    }
    expect(importe).toBe(true);
  });

  it("aucune exception ne vise un module disparu", () => {
    for (const module of Object.keys(SANS_ESSAI_DIRECT)) expect(modules).toContain(module);
  });
});
