import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FICHIER_DU_BATTEMENT } from "@/server/jobs/battement";
import { DELAI_D_ARRET_MS } from "@/server/jobs/arret";

/**
 * L'image et le compose de production — revue du 07/10/2026, M15 et M19
 * étape 0 (D-28, D-30).
 *
 * Node 20 était en fin de vie depuis le 30/04/2026. Aucun service n'avait
 * de limite mémoire ni de rotation des journaux, ni `app`, ni `worker`, ni
 * Garage n'avaient de sonde, et les images suivaient des tags flottants. La
 * CLI Prisma s'installait par `npm install -g prisma@6`, à la version du
 * jour de la construction. Ces essais relisent les fichiers, pour que rien
 * de cela ne revienne sans se voir. `smoke:worker --image` l'éprouve dans
 * l'image construite.
 */
const lire = (f: string) => readFileSync(f, "utf8");
/** Sans les commentaires, qui nomment souvent ce qu'on écarte. */
const actif = (texte: string) =>
  texte
    .split("\n")
    .filter((l) => !/^\s*#/u.test(l))
    .join("\n");
const DOCKERFILE = actif(lire("Dockerfile"));
const COMPOSE = actif(lire("docker-compose.prod.yml"));

/** Le bloc d'un service du compose, découpé comme `scripts/fumee-worker.mjs` le fait. */
function service(nom: string): string {
  const bloc = COMPOSE.split(new RegExp(`^  ${nom}:$`, "mu"))[1];
  if (!bloc) throw new Error(`service « ${nom} » absent`);
  return bloc.split(/^ {2}\S|^\S/mu)[0]!;
}
const SERVICES = [...COMPOSE.split(/^services:$/mu)[1]!.split(/^\S/mu)[0]!.matchAll(/^ {2}([a-z]+):$/gmu)].map(
  (m) => m[1]!,
);

const octets = (limite: string) => {
  const [, n, u] = /^(\d+(?:\.\d+)?)([mg])$/u.exec(limite)!;
  return Number(n) * (u === "g" ? 1024 : 1) * 1024 * 1024;
};

describe("Node 24 partout — D-30, M19 étape 0", () => {
  it("chaque étage du Dockerfile part de Node 24, épinglé par empreinte", () => {
    const etages = [...DOCKERFILE.matchAll(/^FROM (\S+)/gmu)].map((m) => m[1]!);
    expect(etages.length).toBeGreaterThanOrEqual(4);
    for (const image of etages) expect(image).toMatch(/^node:24-alpine@sha256:[0-9a-f]{64}$/u);
  });

  it(".nvmrc, engines, setup-node et la cible esbuild disent la même version", () => {
    expect(lire(".nvmrc").trim()).toBe("24");
    expect(JSON.parse(lire("package.json")).engines.node).toBe(">=24");
    for (const f of [".github/workflows/validation.yml", ".github/workflows/deploy.yml"]) {
      expect(lire(f), f).not.toMatch(/node-version: (?!24\b)\d+/u);
      expect(lire(f), f).toMatch(/node-version: 24/u);
    }
    const cibles = [...lire("scripts/build-worker.mjs").matchAll(/target: "(\w+)"/gu)].map((m) => m[1]);
    expect(new Set(cibles)).toEqual(new Set(["node24"]));
  });
});

describe("la CLI Prisma de l'image — M15", () => {
  it("n'est plus installée globalement à la version du jour", () => {
    expect(DOCKERFILE).not.toMatch(/npm install -g/u);
    expect(DOCKERFILE).toMatch(/COPY docker\/prisma-cli\/package\.json docker\/prisma-cli\/package-lock\.json/u);
  });

  it("a exactement la version du verrou racine", () => {
    const racine = JSON.parse(lire("package-lock.json")).packages["node_modules/prisma"].version;
    const cli = JSON.parse(lire("docker/prisma-cli/package-lock.json")).packages["node_modules/prisma"].version;
    expect(JSON.parse(lire("docker/prisma-cli/package.json")).dependencies.prisma).toBe(racine);
    expect(cli).toBe(racine);
  });
});

describe("Prisma 7 dans l'image — M19 étape 6, S.169", () => {
  it("la CLI trouve l'URL de la base : la configuration est copiée à côté des migrations", () => {
    expect(actif(DOCKERFILE)).toMatch(/COPY --from=builder \S+ \/app\/prisma\.config\.mjs \.\/prisma\.config\.mjs/u);
  });

  it("la configuration n'importe rien : `/app` n'a pas `prisma` dans son node_modules", () => {
    expect(lire("prisma.config.mjs")).not.toMatch(/^\s*import\s/mu);
    expect(lire("prisma/schema.prisma")).not.toMatch(/^\s*url\s*=/mu);
  });

  it("le mysql2 de la CLI est forcé au-delà de l'avis GHSA-3f6p-5ww8-9rcr, ici et dans l'image", () => {
    for (const fichier of ["package.json", "docker/prisma-cli/package.json"]) {
      expect(JSON.parse(lire(fichier)).overrides?.prisma?.mysql2, fichier).toBe("^3.24.5");
    }
  });

  it("chaque paquet ESM de l'image a le `require` de Node : `pg` y est embarqué", () => {
    const blocs = lire("scripts/build-worker.mjs").split("await build({").slice(1);
    const esm = blocs.filter((b) => /format: "esm"/u.test(b.split("});")[0]!));
    expect(esm.length).toBeGreaterThanOrEqual(8);
    for (const bloc of esm) expect(bloc.split("});")[0]).toMatch(/banner: REQUIRE_EN_ESM/u);
  });
});

describe("le compose de production — M15, D-28", () => {
  it("chaque service tourne ses journaux et a une limite mémoire", () => {
    expect(COMPOSE).toMatch(/x-journaux: &journaux\n {2}driver: local\n {2}options:\n {4}max-size: 10m\n {4}max-file: "5"/u);
    for (const nom of SERVICES) {
      expect(service(nom), nom).toMatch(/^ {4}logging: \*journaux$/mu);
      expect(service(nom), nom).toMatch(/^ {4}mem_limit: \d+[mg]$/mu);
    }
  });

  it("les limites tiennent dans un VPS de 8 Go, avec la marge du système", () => {
    const total = SERVICES.reduce(
      (somme, nom) => somme + octets(/^ {4}mem_limit: (\S+)$/mu.exec(service(nom))![1]!),
      0,
    );
    expect(total).toBeLessThanOrEqual(6.5 * 1024 ** 3);
  });

  it("toute image tierce est épinglée par empreinte", () => {
    for (const [, image] of COMPOSE.matchAll(/^ {4}image: (\S+)$/gmu)) {
      if (image!.startsWith("ghcr.io/${GH_OWNER}/immipro:")) continue;
      expect(image).toMatch(/@sha256:[0-9a-f]{64}$/u);
    }
  });

  it("app, worker et Garage ont une sonde, comme postgres et la passerelle", () => {
    for (const nom of ["postgres", "minio", "app", "worker", "antivirus"]) {
      expect(service(nom), nom).toMatch(/^ {4}healthcheck:$/mu);
    }
  });

  it("la sonde de app est une sonde de vie, sans base : pas /api/health", () => {
    expect(service("app")).toMatch(/wget -qO \/dev\/null http:\/\/127\.0\.0\.1:3000\/robots\.txt/u);
    expect(service("app")).not.toMatch(/api\/health/u);
  });

  it("la sonde du worker lit le fichier que le worker réécrit", () => {
    expect(service("worker")).toContain(`stat -c %Y ${FICHIER_DU_BATTEMENT}`);
    // Revue M9 : le délai du compose dépasse celui que le worker s'accorde.
    const grace = Number(/stop_grace_period: (\d+)s/u.exec(service("worker"))![1]);
    expect(grace * 1000).toBeGreaterThan(DELAI_D_ARRET_MS);
  });

  it("le tas de Node reste sous la limite du conteneur", () => {
    for (const nom of ["app", "worker"]) {
      const limite = octets(/^ {4}mem_limit: (\S+)$/mu.exec(service(nom))![1]!);
      const tas = Number(/--max-old-space-size=(\d+)/u.exec(service(nom))![1]) * 1024 * 1024;
      expect(tas, nom).toBeLessThan(limite);
    }
  });
});
