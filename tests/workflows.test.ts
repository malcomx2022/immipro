import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Les workflows GitHub — revue du 07/10/2026, E9 (D-25).
 *
 * Le déploiement passait la clé de production à une action tierce
 * épinglée par un tag flottant, sans empreinte d'hôte. Il migrait et
 * basculait sans garde-fous ni sonde. Aucun workflow ne déclarait ses
 * droits. Ces essais relisent les fichiers comme des textes, pour que
 * l'écart ne revienne pas sans se voir.
 */
const lire = (f: string) => readFileSync(f, "utf8");
const WORKFLOWS = ["ci.yml", "validation.yml", "deploy.yml"].map((f) => `.github/workflows/${f}`);

describe("les actions tierces sont épinglées par empreinte", () => {
  it("chaque `uses:` externe porte un SHA complet et sa version en commentaire", () => {
    for (const f of WORKFLOWS) {
      for (const [, action] of lire(f).matchAll(/^\s*-?\s*uses:\s*(\S+.*)$/gmu)) {
        if (action!.startsWith("./")) continue;
        expect(action, `${f} : ${action}`).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/u);
      }
    }
  });

  it("Dependabot tient les empreintes à jour", () => {
    expect(existsSync(".github/dependabot.yml")).toBe(true);
    expect(lire(".github/dependabot.yml")).toMatch(/package-ecosystem: github-actions/u);
  });
});

describe("chaque workflow déclare ses droits", () => {
  it("ci et validation lisent le dépôt, rien d'autre", () => {
    for (const f of [".github/workflows/ci.yml", ".github/workflows/validation.yml"]) {
      expect(lire(f), f).toMatch(/^permissions:\n\s+contents: read$/mu);
    }
  });

  it("le déploiement n'accorde rien par défaut", () => {
    expect(lire(".github/workflows/deploy.yml")).toMatch(/^permissions: \{\}$/mu);
  });
});

/** Sans les commentaires, qui nomment parfois ce qu'on écarte. */
const actif = (f: string) =>
  lire(f)
    .split("\n")
    .filter((l) => !/^\s*#/u.test(l))
    .join("\n");

describe("le déploiement — D-25, option A", () => {
  const deploy = actif(".github/workflows/deploy.yml");

  it("aucune action tierce ne manipule la clé de production", () => {
    expect(deploy).not.toMatch(/appleboy|ssh-action/u);
  });

  it("l'hôte est vérifié contre une empreinte fournie, jamais découverte", () => {
    expect(deploy).toMatch(/StrictHostKeyChecking yes/u);
    expect(deploy).toMatch(/VPS_KNOWN_HOSTS/u);
    expect(deploy).not.toMatch(/ssh-keyscan|StrictHostKeyChecking (no|accept-new)/u);
  });

  it("le compose et le script sont recopiés, puis le script fait le reste", () => {
    expect(deploy).toMatch(/scp docker-compose\.prod\.yml vps:\/srv\/immipro\/\.deploiement\/arrivee\//u);
    expect(deploy).toMatch(/scp scripts\/deployer\.sh vps:/u);
    // Et les scripts de la sauvegarde de nuit (E10) : le cron lance la version du dépôt.
    expect(deploy).toMatch(/scp scripts\/sauvegarde\.sh scripts\/backup-postgres\.sh scripts\/backup-pieces\.sh vps:/u);
    expect(deploy).toMatch(/\/srv\/immipro\/scripts\/deployer\.sh \$\{\{ needs\.build\.outputs\.tag \}\}/u);
    // Plus de migration ni de bascule improvisées dans le workflow.
    expect(deploy).not.toMatch(/migrate deploy|up -d/u);
  });

  it("les secrets de bac à sable arrivent jusqu'à la porte", () => {
    const validation = lire(".github/workflows/validation.yml");
    expect(validation).toMatch(/STRIPE_SANDBOX_API_KEY: \{ required: false \}/u);
    for (const f of [".github/workflows/ci.yml", ".github/workflows/deploy.yml"]) {
      expect(lire(f), f).toMatch(/STRIPE_SANDBOX_API_KEY: \$\{\{ secrets\.STRIPE_SANDBOX_API_KEY \}\}/u);
      expect(lire(f), f).not.toMatch(/secrets: inherit/u);
    }
  });
});

describe("les scripts shell passent par shellcheck", () => {
  it("la porte le lance sur scripts/*.sh", () => {
    expect(lire(".github/workflows/validation.yml")).toMatch(/run: shellcheck scripts\/\*\.sh/u);
  });

  it("le script de déploiement est exécutable dans le dépôt", () => {
    expect(lire("scripts/deployer.sh").startsWith("#!/usr/bin/env bash\n")).toBe(true);
  });
});

/**
 * Aucun tirage anonyme sur Docker Hub dans la porte ni à la construction
 * (S.160, RF-7). Les 8 et 9/10/2026, `toomanyrequests` a fait tomber la
 * porte avant le premier test, puis le déploiement de S.158. Les images
 * passent par le miroir de Google, épinglées par empreinte : le miroir ne
 * peut rien substituer.
 */
describe("la porte et la construction ne tirent rien de Docker Hub", () => {
  const empreinteDuCompose = (nom: string) =>
    lire("docker-compose.prod.yml").match(new RegExp(`image: ${nom}:\\S+@(sha256:[0-9a-f]{64})`, "u"))?.[1];

  it("le PostgreSQL de la porte vient du miroir, à l'empreinte de la production", () => {
    const image = lire(".github/workflows/validation.yml").match(/^\s+image: (\S+)$/mu)?.[1];
    const empreinte = empreinteDuCompose("postgres");
    expect(empreinte).toBeDefined();
    // Si Dependabot fait monter le PostgreSQL du compose, la porte doit
    // suivre : reporter la nouvelle empreinte dans validation.yml.
    expect(image).toBe(`mirror.gcr.io/library/postgres:16-alpine@${empreinte}`);
  });

  it("nginx -t tourne dans une image du miroir, épinglée", () => {
    expect(lire("scripts/verifier-nginx.sh")).toMatch(
      /NGINX_IMAGE:-mirror\.gcr\.io\/library\/nginx:[\w.-]+@sha256:[0-9a-f]{64}\}/u,
    );
  });

  it("BuildKit vient du miroir et résout docker.io par lui", () => {
    const deploy = lire(".github/workflows/deploy.yml");
    expect(deploy).toMatch(/driver-opts: image=mirror\.gcr\.io\/moby\/buildkit:/u);
    expect(deploy).toMatch(/\[registry\."docker\.io"\]\n\s+mirrors = \["mirror\.gcr\.io"\]/u);
  });
});

describe("un miroir lent ne fige pas la porte", () => {
  // 22/10/2026, #304 : un miroir apt Azure à quelques Ko/s a figé
  // l'étape plus de trente minutes, deux fois ; sans plafond, six heures.
  // 23/10, #312 : le même miroir à 30 Ko/s a épuisé quinze minutes, deux
  // fois. S.192 : tentative bornée, puis reprise sur le miroir officiel.
  const etape = () =>
    lire(".github/workflows/validation.yml").match(
      /- name: Navigateurs de recette photographique\n((?:\s{8,}\S.*\n)+)/u,
    )?.[1] ?? "";

  it("l'installation des navigateurs est plafonnée", () => {
    expect(etape()).toMatch(/npx playwright install --with-deps/u);
    const plafond = Number(etape().match(/timeout-minutes: (\d+)/u)?.[1]);
    expect(plafond).toBeGreaterThan(0);
    expect(plafond).toBeLessThanOrEqual(20);
  });

  it("chaque tentative est bornée et les deux tiennent sous le plafond", () => {
    expect(etape()).toMatch(/timeout --kill-after=30s "\$1" npx playwright install/u);
    const tentatives = [...etape().matchAll(/installer (\d+)m/gu)].map(([, m]) => Number(m));
    expect(tentatives).toHaveLength(2);
    const plafond = Number(etape().match(/timeout-minutes: (\d+)/u)?.[1]);
    // Une demi-minute d'arrêt forcé par tentative, une pour dpkg.
    expect(tentatives.reduce((a, b) => a + b, 0) + 2).toBeLessThanOrEqual(plafond);
  });

  it("la reprise quitte le miroir Azure pour le miroir officiel et répare dpkg", () => {
    const reprise = etape().slice(etape().indexOf("if ! installer"));
    expect(reprise).toMatch(/s\|azure\\\.archive\\\.ubuntu\\\.com\|archive\.ubuntu\.com\|g/u);
    expect(reprise.indexOf("dpkg --configure -a")).toBeGreaterThan(reprise.indexOf("sed -i"));
    expect(reprise.lastIndexOf("installer ")).toBeGreaterThan(reprise.indexOf("dpkg --configure -a"));
  });
});
