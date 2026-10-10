import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Le script de déploiement, exécuté pour de bon — revue du 07/10/2026, E9.
 *
 * `scripts/deployer.sh` tourne ici dans un dossier jetable, avec de faux
 * `docker`, `curl` et `gpg` en tête du PATH. Le faux `docker` journalise
 * chaque appel avec le tag qu'il reçoit, et tient le tag « en service » au
 * dernier `up -d`. Le faux `curl` répond selon ce tag : un tag « malade »
 * rend un 503 sans base. Ce qui se vérifie : l'ordre des étapes, ce qui
 * bouge et ce qui ne bouge pas quand une étape échoue, et le retour arrière.
 */
const SCRIPT = resolve("scripts/deployer.sh");

const FAUX_DOCKER = `#!/usr/bin/env bash
etat="$FAUX_ETAT"
printf 'TAG=%s %s\\n' "\${TAG:-}" "$*" >> "$etat/appels"
[[ "$1" == "image" ]] && exit 0
if [[ "$1" == "inspect" ]]; then
  case "$*" in
    *id-clamav*) echo "\${FAUX_SANTE_CLAMAV:-healthy}" ;;
    *id-antivirus*) echo "\${FAUX_SANTE_PASSERELLE:-healthy}" ;;
  esac
  exit 0
fi
shift # compose
args=" $* "
case "$args" in
  *" config "*) exit 0 ;;
  *" pull "*) [[ "\${FAUX_PULL_ECHOUE:-}" == 1 ]] && exit 1; exit 0 ;;
  *"migrate status"*)
    if [[ "\${FAUX_MIGRATION_EN_ATTENTE:-}" == 1 ]]; then
      echo "Following migration have not yet been applied:"; exit 1
    fi
    echo "Database schema is up to date!"; exit 0 ;;
  *"migrate deploy"*) exit "\${FAUX_MIGRATION_ECHOUE:-0}" ;;
  *"verifier-garde-fous"*) exit "\${FAUX_GARDES_ECHOUENT:-0}" ;;
  *" exec "*) echo "contenu-du-dump"; exit 0 ;;
  *" up "*) printf '%s' "$TAG" > "$etat/en-service"; exit 0 ;;
  *" restart "*) exit 0 ;;
  *" logs "*) echo "worker-1  | worker démarré"; exit 0 ;;
  *" ps -q clamav "*) [[ -n "\${FAUX_SANTE_CLAMAV:-}" ]] && echo id-clamav; exit 0 ;;
  *" ps -q antivirus "*) [[ -n "\${FAUX_SANTE_PASSERELLE:-}" ]] && echo id-antivirus; exit 0 ;;
esac
exit 0
`;

const FAUX_CURL = `#!/usr/bin/env bash
etat="$FAUX_ETAT"
sortie=/dev/null
while [[ $# -gt 0 ]]; do
  [[ "$1" == "-o" ]] && { sortie="$2"; shift; }
  shift
done
if [[ ! -s "$etat/en-service" ]]; then printf '000'; exit 7; fi
tag=$(<"$etat/en-service")
if [[ " \${FAUX_TAGS_MALADES:-} " == *" $tag "* ]]; then
  printf '{"status":"indisponible","db":"down"}' > "$sortie"; printf '503'
elif [[ "\${FAUX_INAPTE:-}" == 1 || " \${FAUX_TAGS_INAPTES:-} " == *" $tag "* ]]; then
  printf '{"status":"indisponible","aptitude":"INAPTE","db":"up"}' > "$sortie"; printf '503'
else
  printf '{"status":"ok","aptitude":"OPERATIONNELLE","db":"up"}' > "$sortie"; printf '200'
fi
`;

const FAUX_GPG = `#!/usr/bin/env bash
cat
`;

let racine: string;
let dossier: string;
let etat: string;
let outils: string;

beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), "deployer-"));
  dossier = join(racine, "srv");
  etat = join(racine, "etat");
  outils = join(racine, "bin");
  for (const d of [dossier, etat, outils]) mkdirSync(d, { recursive: true });
  for (const [nom, contenu] of [
    ["docker", FAUX_DOCKER],
    ["curl", FAUX_CURL],
    ["gpg", FAUX_GPG],
  ] as const) {
    writeFileSync(join(outils, nom), contenu);
    chmodSync(join(outils, nom), 0o755);
  }
  writeFileSync(join(dossier, "docker-compose.prod.yml"), "# compose en service\n");
  writeFileSync(join(dossier, ".env"), "AUTRE=valeur\nTAG=aaaaaaa\nGH_OWNER=malcomx2022\n");
  mkdirSync(join(dossier, ".deploiement"));
  writeFileSync(join(dossier, ".deploiement", "tag-courant"), "aaaaaaa\n");
  writeFileSync(join(etat, "en-service"), "aaaaaaa");
});

afterEach(() => rmSync(racine, { recursive: true, force: true }));

function deployer(tag: string, env: Record<string, string> = {}) {
  const r = spawnSync("bash", [SCRIPT, tag, "malcomx2022"], {
    encoding: "utf8",
    env: {
      PATH: `${outils}:${process.env.PATH}`,
      HOME: racine,
      IMMIPRO_DOSSIER: dossier,
      IMMIPRO_SONDE_ESSAIS: "2",
      IMMIPRO_SONDE_PAUSE: "0",
      FAUX_ETAT: etat,
      ...env,
    } as unknown as NodeJS.ProcessEnv,
  });
  return { code: r.status, sortie: `${r.stdout}${r.stderr}` };
}

const appels = () =>
  existsSync(join(etat, "appels")) ? readFileSync(join(etat, "appels"), "utf8").trim().split("\n") : [];
const enService = () => readFileSync(join(etat, "en-service"), "utf8");
const lire = (f: string) => readFileSync(join(dossier, f), "utf8");
const ups = () => appels().filter((a) => / up -d/u.test(a));

describe("un déploiement qui se passe bien", () => {
  it("tire, migre, vérifie les garde-fous, bascule, sonde, puis retient le tag", () => {
    const r = deployer("bbbbbbb");
    expect(r.code, r.sortie).toBe(0);
    const etapes = appels().map((a) =>
      /pull/u.test(a) ? "pull"
      : /migrate status/u.test(a) ? "statut"
      : /migrate deploy/u.test(a) ? "migrer"
      : /verifier-garde-fous/u.test(a) ? "garde-fous"
      : / up -d/u.test(a) ? "up"
      : /image prune/u.test(a) ? "prune"
      : null,
    ).filter(Boolean);
    expect(etapes).toEqual(["pull", "statut", "migrer", "garde-fous", "up", "prune"]);
    // Tout se joue avec la nouvelle image.
    for (const a of appels().filter((x) => !/image prune|logs/u.test(x))) expect(a).toMatch(/^TAG=bbbbbbb /u);
    expect(lire(".deploiement/tag-courant").trim()).toBe("bbbbbbb");
    expect(lire(".env")).toBe("AUTRE=valeur\nTAG=bbbbbbb\nGH_OWNER=malcomx2022\n");
    expect(lire(".deploiement/journal")).toMatch(/bbbbbbb depuis aaaaaaa/u);
  });

  it("le compose reçu est installé, et le précédent gardé", () => {
    mkdirSync(join(dossier, ".deploiement", "arrivee"));
    writeFileSync(join(dossier, ".deploiement", "arrivee", "docker-compose.prod.yml"), "# compose reçu\n");
    expect(deployer("bbbbbbb").code).toBe(0);
    expect(lire("docker-compose.prod.yml")).toBe("# compose reçu\n");
    expect(lire(".deploiement/docker-compose.prod.yml.precedent")).toBe("# compose en service\n");
    // Le compose reçu sert dès le tirage, avec le dossier du projet.
    expect(appels().find((a) => / pull /u.test(a))).toMatch(
      /--project-directory \. -f \.deploiement\/arrivee\/docker-compose\.prod\.yml pull/u,
    );
  });

  it("une instance inapte avant (503 sans panne) n'empêche pas la bascule", () => {
    const r = deployer("bbbbbbb", { FAUX_INAPTE: "1" });
    expect(r.code, r.sortie).toBe(0);
    expect(enService()).toBe("bbbbbbb");
  });
});

describe("une migration en attente", () => {
  it("sans destinataire GPG, rien ne bouge", () => {
    const r = deployer("bbbbbbb", { FAUX_MIGRATION_EN_ATTENTE: "1" });
    expect(r.code).toBe(1);
    expect(r.sortie).toMatch(/BACKUP_GPG_RECIPIENT.*\.env\.sauvegarde.*Rien n'a changé/u);
    expect(appels().some((a) => /migrate deploy/u.test(a))).toBe(false);
    expect(ups()).toEqual([]);
  });

  it("avec un destinataire, la base est sauvegardée, chiffrée, avant de migrer", () => {
    writeFileSync(join(dossier, ".env.sauvegarde"), "BACKUP_GPG_RECIPIENT=exploitation@immipro.test\n");
    const r = deployer("bbbbbbb", { FAUX_MIGRATION_EN_ATTENTE: "1" });
    expect(r.code, r.sortie).toBe(0);
    expect(lire("sauvegardes/avant-bbbbbbb.dump.gpg")).toBe("contenu-du-dump\n");
    const ordre = appels().map((a) => (/ exec /u.test(a) ? "dump" : /migrate deploy/u.test(a) ? "migrer" : null));
    expect(ordre.indexOf("dump")).toBeLessThan(ordre.indexOf("migrer"));
  });
});

describe("ce qui arrête avant la bascule", () => {
  it("un tag absent du registre : arrêt au tirage, rien ne bouge", () => {
    const r = deployer("bbbbbbb", { FAUX_PULL_ECHOUE: "1" });
    expect(r.code).toBe(1);
    expect(r.sortie).toMatch(/n'a pas pu être tirée ; rien n'a changé/u);
    expect(appels().some((a) => / run /u.test(a))).toBe(false);
    expect(enService()).toBe("aaaaaaa");
    expect(lire(".deploiement/tag-courant").trim()).toBe("aaaaaaa");
  });

  it("des garde-fous qui ne tiennent pas : pas de bascule", () => {
    const r = deployer("bbbbbbb", { FAUX_GARDES_ECHOUENT: "1" });
    expect(r.code).toBe(1);
    expect(r.sortie).toMatch(/garde-fous ne tiennent pas.*aaaaaaa tourne toujours/u);
    expect(ups()).toEqual([]);
    expect(lire(".env")).toMatch(/^TAG=aaaaaaa$/mu);
  });

  it("une migration qui échoue : pas de bascule", () => {
    const r = deployer("bbbbbbb", { FAUX_MIGRATION_ECHOUE: "1" });
    expect(r.code).toBe(1);
    expect(appels().some((a) => /verifier-garde-fous/u.test(a))).toBe(false);
    expect(ups()).toEqual([]);
  });

  it("un tag illisible est refusé avant tout appel", () => {
    const r = deployer("latest");
    expect(r.code).toBe(1);
    expect(r.sortie).toMatch(/tag « latest » illisible/u);
    expect(appels()).toEqual([]);
  });
});

describe("une version qui ne répond pas", () => {
  it("relance une fois, puis revient au tag et au compose précédents", () => {
    mkdirSync(join(dossier, ".deploiement", "arrivee"));
    writeFileSync(join(dossier, ".deploiement", "arrivee", "docker-compose.prod.yml"), "# compose reçu\n");
    const r = deployer("bbbbbbb", { FAUX_TAGS_MALADES: "bbbbbbb" });
    expect(r.code).toBe(1);
    expect(r.sortie).toMatch(/bbbbbbb ne répondait pas ; aaaaaaa est revenue en service\. La base reste migrée/u);
    expect(appels().some((a) => /restart app worker/u.test(a))).toBe(true);
    expect(ups().map((a) => a.slice(0, 11))).toEqual(["TAG=bbbbbbb", "TAG=aaaaaaa"]);
    expect(enService()).toBe("aaaaaaa");
    expect(lire("docker-compose.prod.yml")).toBe("# compose en service\n");
    expect(lire(".deploiement/tag-courant").trim()).toBe("aaaaaaa");
    expect(lire(".env")).toMatch(/^TAG=aaaaaaa$/mu);
    expect(lire(".deploiement/journal")).toMatch(/bbbbbbb retour-arriere-vers aaaaaaa/u);
  });

  it("sans tag précédent connu, il le dit au lieu de deviner", () => {
    rmSync(join(dossier, ".deploiement", "tag-courant"));
    writeFileSync(join(dossier, ".env"), "AUTRE=valeur\n");
    rmSync(join(etat, "en-service"));
    const r = deployer("bbbbbbb", { FAUX_TAGS_MALADES: "bbbbbbb" });
    expect(r.code).toBe(1);
    expect(r.sortie).toMatch(/aucun tag précédent n'est connu/u);
  });
});

/**
 * La CLI Prisma de l'image, jamais celle du registre — 09/10/2026.
 *
 * `npx prisma` ne regarde pas le PATH : faute de `prisma` dans le
 * `node_modules` du `standalone`, il téléchargeait l'étiquette `latest`,
 * ce jour-là `8.0.0-rc.22`, qui ne connaît plus `migrate`. Tous les
 * déploiements s'arrêtaient à l'étape 2 sur `CLI.UNKNOWN_COMMAND`. Que la
 * commande atteigne bien la CLI figée se vérifie dans l'image, par
 * `smoke:worker --image`, qui rejoue les lignes de ce script.
 */
describe("la CLI Prisma de l'image", () => {
  it("le script appelle `prisma` par son nom nu, jamais `npx prisma`", () => {
    const lignes = readFileSync(SCRIPT, "utf8").split("\n").filter((l) => !/^\s*#/u.test(l));
    expect(lignes.filter((l) => /\bnpx\b/u.test(l))).toEqual([]);
    const appelsPrisma = lignes.filter((l) => /\bprisma migrate\b/u.test(l));
    expect(appelsPrisma).toHaveLength(2);
    for (const l of appelsPrisma) expect(l).toMatch(/run --rm -T app prisma migrate (status|deploy)\b/u);
  });

  it("les deux appels partent bien vers le conteneur app", () => {
    expect(deployer("bbbbbbb").code).toBe(0);
    const prisma = appels().filter((a) => /prisma/u.test(a));
    expect(prisma.map((a) => a.replace(/^.* run --rm -T app /u, ""))).toEqual([
      "prisma migrate status",
      "prisma migrate deploy",
    ]);
  });
});

/**
 * Le démarrage à froid de l'antivirus — S.161, constat du 09/10/2026.
 *
 * clamd chargeait encore ses signatures quand la sonde s'est épuisée sur
 * un 503 ; seule une relance à la main en est sortie. Le script attend
 * désormais, dans une borne, clamd et la passerelle. Si clamd n'est
 * toujours pas prêt, ce n'est pas la version déployée qui est en cause :
 * pas de retour arrière pour cette seule raison, et le journal le dit.
 */
describe("l'antivirus au démarrage", () => {
  const avecAntivirus = (env: Record<string, string>) =>
    deployer("bbbbbbb", { IMMIPRO_ANTIVIRUS_ATTENTE: "0", IMMIPRO_ANTIVIRUS_PAUSE: "0", ...env });

  it("prêt : il le dit, et la sonde reste celle d'avant", () => {
    const r = avecAntivirus({ FAUX_SANTE_CLAMAV: "healthy", FAUX_SANTE_PASSERELLE: "healthy" });
    expect(r.code).toBe(0);
    expect(r.sortie).toMatch(/antivirus prêt après \d+ s \(clamd : healthy ; passerelle : healthy\)/u);
    expect(lire(".deploiement/journal")).not.toMatch(/antivirus/u);
  });

  it("clamd en chargement et l'instance en 503 : pas de retour arrière, et c'est écrit", () => {
    const r = avecAntivirus({
      FAUX_SANTE_CLAMAV: "starting",
      FAUX_SANTE_PASSERELLE: "unhealthy",
      FAUX_TAGS_INAPTES: "bbbbbbb",
    });
    expect(r.code).toBe(0);
    expect(r.sortie).toMatch(/ATTENTION — clamd n'est pas prêt après 0 s \(état : starting\)/u);
    expect(r.sortie).toMatch(/bbbbbbb est en service \(antivirus pas encore prêt\)/u);
    expect(enService()).toBe("bbbbbbb");
    expect(appels().some((a) => /restart app worker/u.test(a))).toBe(false);
    expect(lire(".deploiement/journal")).toMatch(/bbbbbbb depuis aaaaaaa \(antivirus pas encore prêt\)/u);
  });

  it("clamd en chargement n'excuse pas une base muette : retour arrière", () => {
    const r = avecAntivirus({ FAUX_SANTE_CLAMAV: "starting", FAUX_TAGS_MALADES: "bbbbbbb" });
    expect(r.code).toBe(1);
    expect(r.sortie).toMatch(/aaaaaaa est revenue en service/u);
    expect(enService()).toBe("aaaaaaa");
  });

  it("clamd prêt mais pas la passerelle de la nouvelle image : la sonde reste stricte", () => {
    const r = avecAntivirus({
      FAUX_SANTE_CLAMAV: "healthy",
      FAUX_SANTE_PASSERELLE: "unhealthy",
      FAUX_TAGS_INAPTES: "bbbbbbb",
    });
    expect(r.code).toBe(1);
    expect(r.sortie).toMatch(/la passerelle antivirus n'est pas prête .* elle vient de la version bbbbbbb/u);
    expect(r.sortie).toMatch(/aaaaaaa est revenue en service/u);
  });

  it("sans antivirus dans le compose, rien n'est attendu", () => {
    const r = deployer("bbbbbbb");
    expect(r.code).toBe(0);
    expect(r.sortie).toMatch(/aucun antivirus dans ce compose : rien à attendre/u);
  });
});
