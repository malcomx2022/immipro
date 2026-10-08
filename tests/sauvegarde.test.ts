import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * La sauvegarde de nuit et la restauration de contrôle, exécutées pour de
 * bon — revue du 07/10/2026, E10 (D-26, D-27).
 *
 * De faux `rclone`, `docker`, `gpg` et `curl` en tête du PATH : `rclone`
 * copie entre des dossiers qui jouent Garage et B2, `gpg` laisse passer le
 * flux, `curl` note les pings. L'archive, l'inventaire et les empreintes
 * sont faits par les vrais `tar`, `find` et `sha256sum`. Le même dossier B2
 * sert ensuite à la restauration de contrôle, dont la base jetable est
 * jouée par le faux `docker`.
 */
const SCRIPTS = resolve("scripts");

const FAUX_RCLONE = `#!/usr/bin/env bash
chemin() { local r="$1"; printf '%s/%s' "$FAUX_DISTANT/\${r%%:*}" "\${r#*:}"; }
echo "rclone $*" >> "$FAUX_ETAT/appels"
case "$1" in
  sync) [[ "\${FAUX_SYNC_ECHOUE:-}" == 1 ]] && exit 1; mkdir -p "$3"; cp -r "$(chemin "$2")/." "$3/" ;;
  copy) d=$(chemin "$3"); mkdir -p "$d"; cp "$2" "$d/" ;;
  copyto) cp "$(chemin "$2")" "$3" ;;
  delete) ;;
  lsf) [[ "\${FAUX_LSF_ECHOUE:-}" == 1 ]] && exit 1
       d=$(chemin "$2"); motif="$4"; [[ -d "$d" ]] || exit 0
       (cd "$d" && for f in $motif; do [[ -e "$f" ]] && echo "$f"; done; true) ;;
  *) exit 2 ;;
esac
`;

const FAUX_GPG = `#!/usr/bin/env bash
if [[ " $* " == *" --decrypt "* ]]; then cat "\${@: -1}"; else cat; fi
`;

const FAUX_CURL = `#!/usr/bin/env bash
echo "\${@: -1}" >> "$FAUX_ETAT/pings"
`;

const FAUX_DOCKER = `#!/usr/bin/env bash
echo "docker $*" >> "$FAUX_ETAT/appels"
args=" $* "
case "$args" in
  *" compose "*"pg_dump"*) echo "contenu-du-dump" ;;
  *" network "*) ;;
  *" run -d "*) ;;
  *" pg_isready "*) ;;
  *" pg_restore "*) cat > "$FAUX_ETAT/restaure" ;;
  *"_prisma_migrations"*) cat "$FAUX_ETAT/migrations-appliquees" ;;
  *"DocumentVersion"*) cat "$FAUX_ETAT/pieces-connues" ;;
  *"verifier-garde-fous"*) exit "\${FAUX_GARDES_ECHOUENT:-0}" ;;
  *" --entrypoint ls "*) cat "$FAUX_ETAT/migrations-image" ;;
  *" rm "*) ;;
esac
`;

let racine: string;
let srv: string;
let etat: string;
let distant: string;
let outils: string;

const sha = (contenu: string) => createHash("sha256").update(contenu).digest("hex");

const PIECES: Record<string, string> = {
  "dossiers/a1/passeport/v1.pdf": "passeport-aline",
  "dossiers/a1/preuve_fonds/v1.pdf": "releve-aline",
};

beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), "sauvegarde-"));
  srv = join(racine, "srv");
  etat = join(racine, "etat");
  distant = join(racine, "distant");
  outils = join(racine, "bin");
  for (const d of [srv, etat, distant, outils, join(srv, ".deploiement")]) mkdirSync(d, { recursive: true });
  for (const [nom, contenu] of [
    ["rclone", FAUX_RCLONE],
    ["gpg", FAUX_GPG],
    ["curl", FAUX_CURL],
    ["docker", FAUX_DOCKER],
  ] as const) {
    writeFileSync(join(outils, nom), contenu);
    chmodSync(join(outils, nom), 0o755);
  }
  // Garage : le seau des pièces saines, et la quarantaine qui ne doit pas partir.
  for (const [cle, contenu] of Object.entries(PIECES)) {
    const f = join(distant, "garage", "immipro-documents", cle);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, contenu);
  }
  mkdirSync(join(distant, "garage", "immipro-quarantaine"), { recursive: true });
  writeFileSync(join(distant, "garage", "immipro-quarantaine", "suspect.pdf"), "x");

  writeFileSync(
    join(srv, ".env.sauvegarde"),
    "BACKUP_GPG_RECIPIENT=exploitation@immipro.test\nSEAU_PIECES=immipro-documents\nSAUVEGARDE_PING_URL=https://hc-ping.test/uuid\n",
  );
  writeFileSync(join(srv, ".deploiement", "tag-courant"), "abc1234\n");
  writeFileSync(join(srv, "docker-compose.prod.yml"), "# compose\n");
  mkdirSync(join(srv, "scripts"));
  for (const s of ["sauvegarde.sh", "backup-postgres.sh", "backup-pieces.sh"]) {
    writeFileSync(join(srv, "scripts", s), readFileSync(join(SCRIPTS, s)));
    chmodSync(join(srv, "scripts", s), 0o755);
  }

  // Ce que la base restaurée dira, et ce que l'image porte.
  writeFileSync(join(etat, "migrations-image"), "20260101_init\n20260102_suite\nmigration_lock.toml\n");
  writeFileSync(join(etat, "migrations-appliquees"), "20260101_init\n20260102_suite\n");
  writeFileSync(
    join(etat, "pieces-connues"),
    Object.entries(PIECES)
      .map(([cle, c]) => `${cle}\t${sha(c)}`)
      .join("\n") + "\n",
  );
});

afterEach(() => rmSync(racine, { recursive: true, force: true }));

const environnement = (env: Record<string, string>) =>
  ({
    PATH: `${outils}:${process.env.PATH}`,
    HOME: racine,
    IMMIPRO_DOSSIER: srv,
    SAUVEGARDE_TRAVAIL: racine,
    SAUVEGARDE_DESTINATION: "b2:immipro-backups",
    ATTENTE_BASE: "2",
    FAUX_ETAT: etat,
    FAUX_DISTANT: distant,
    ...env,
  }) as unknown as NodeJS.ProcessEnv;

function lancer(script: string, args: string[] = [], env: Record<string, string> = {}) {
  const r = spawnSync("bash", [script, ...args], { encoding: "utf8", env: environnement(env) });
  return { code: r.status, sortie: `${r.stdout}${r.stderr}` };
}
const sauvegarder = (env: Record<string, string> = {}) => lancer(join(srv, "scripts", "sauvegarde.sh"), [], env);
const controler = (args: string[] = [], env: Record<string, string> = {}) =>
  lancer(join(SCRIPTS, "restauration-controle.sh"), args, env);

const dans = (sous: string) => {
  const d = join(distant, "b2", "immipro-backups", sous);
  return existsSync(d) ? readdirSync(d) : [];
};
const pings = () => (existsSync(join(etat, "pings")) ? readFileSync(join(etat, "pings"), "utf8").trim().split("\n") : []);
const appels = () => readFileSync(join(etat, "appels"), "utf8");

describe("la sauvegarde de nuit", () => {
  it("expédie la base et les pièces de la même nuit, puis pingue le succès", () => {
    const r = sauvegarder();
    expect(r.code, r.sortie).toBe(0);
    const [base] = dans("postgres");
    const [pieces] = dans("pieces");
    expect(base).toMatch(/^immipro-\d{4}-\d{2}-\d{2}T\d{4}Z-abc1234\.dump\.gpg$/u);
    expect(pieces).toBe(base!.replace(/^immipro-/u, "immipro-pieces-").replace(/\.dump\.gpg$/u, ".tar.gpg"));
    expect(pings()).toEqual(["https://hc-ping.test/uuid/start", "https://hc-ping.test/uuid"]);
    // La conservation détruit pour de bon sur B2.
    expect(appels()).toMatch(/rclone delete --min-age 30d --b2-hard-delete b2:immipro-backups\/postgres\//u);
    expect(appels()).toMatch(/rclone delete --min-age 30d --b2-hard-delete b2:immipro-backups\/pieces\//u);
  });

  it("l'archive porte les pièces saines et leur inventaire, jamais la quarantaine", () => {
    sauvegarder();
    const [pieces] = dans("pieces");
    const archive = join(distant, "b2", "immipro-backups", "pieces", pieces!);
    const liste = spawnSync("tar", ["-tf", archive], { encoding: "utf8" }).stdout;
    expect(liste).toMatch(/^inventaire\.tsv$/mu);
    expect(liste).toMatch(/pieces\/dossiers\/a1\/passeport\/v1\.pdf/u);
    expect(liste).not.toMatch(/suspect|quarantaine/u);
    const inventaire = spawnSync("tar", ["-xOf", archive, "inventaire.tsv"], { encoding: "utf8" }).stdout;
    expect(inventaire).toContain(`dossiers/a1/passeport/v1.pdf\t15\t${sha("passeport-aline")}`);
  });

  it("une étape qui échoue pingue l'échec, et pas le succès", () => {
    const r = sauvegarder({ FAUX_SYNC_ECHOUE: "1" });
    expect(r.code).not.toBe(0);
    expect(pings()).toEqual(["https://hc-ping.test/uuid/start", "https://hc-ping.test/uuid/fail"]);
  });

  it("sans adresse de ping, elle refuse de tourner en silence", () => {
    writeFileSync(join(srv, ".env.sauvegarde"), "BACKUP_GPG_RECIPIENT=x\n");
    const r = sauvegarder();
    expect(r.code).toBe(1);
    expect(r.sortie).toMatch(/SAUVEGARDE_PING_URL manque/u);
    expect(dans("postgres")).toEqual([]);
  });

  it("sans .env.sauvegarde, elle dit quoi créer", () => {
    rmSync(join(srv, ".env.sauvegarde"));
    const r = sauvegarder();
    expect(r.code).toBe(1);
    expect(r.sortie).toMatch(/\.env\.sauvegarde absent/u);
  });
});

describe("la restauration de contrôle", () => {
  it("restaure la nuit la plus récente : garde-fous, migrations, zéro pièce manquante", () => {
    sauvegarder();
    const r = controler();
    expect(r.code, r.sortie).toBe(0);
    expect(r.sortie).toMatch(/pièces : 2 saine\(s\) en base, 0 manquante\(s\), 0 empreinte\(s\) divergente\(s\)/u);
    expect(r.sortie).toMatch(/\| tiennent \| 2\/2 \| 0 \/ 2 \| 0 \| oui \|/u);
    expect(readFileSync(join(etat, "restaure"), "utf8")).toBe("contenu-du-dump\n");
    // La base jetable vit sur un réseau sans sortie, et disparaît.
    expect(appels()).toMatch(/docker network create --internal immipro-controle-/u);
    expect(appels()).toMatch(/docker rm -f immipro-controle-\d+-pg/u);
    // Vérifiée depuis l'image du tag de la nuit.
    expect(appels()).toMatch(/ghcr\.io\/malcomx2022\/immipro:abc1234 node dist\/verifier-garde-fous\.mjs/u);
  });

  it("une pièce que la base connaît et que l'archive n'a pas fait échouer le contrôle", () => {
    sauvegarder();
    writeFileSync(join(etat, "pieces-connues"), `dossiers/a1/perdue/v1.pdf\t${sha("x")}\n`, { flag: "a" });
    const r = controler();
    expect(r.code).toBe(1);
    expect(r.sortie).toMatch(/1 manquante\(s\)/u);
    expect(r.sortie).toMatch(/^ {2}dossiers\/a1\/perdue\/v1\.pdf$/mu);
  });

  it("une empreinte divergente se signale sans faire échouer", () => {
    sauvegarder();
    writeFileSync(
      join(etat, "pieces-connues"),
      `dossiers/a1/passeport/v1.pdf\t${sha("autre chose")}\ndossiers/a1/preuve_fonds/v1.pdf\t${sha("releve-aline")}\n`,
    );
    const r = controler();
    expect(r.code, r.sortie).toBe(0);
    expect(r.sortie).toMatch(/1 empreinte\(s\) divergente\(s\)/u);
  });

  it("une migration de l'image absente de la base fait échouer", () => {
    sauvegarder();
    writeFileSync(join(etat, "migrations-appliquees"), "20260101_init\n");
    const r = controler();
    expect(r.code).toBe(1);
    expect(r.sortie).toMatch(/migrations : 2 attendue\(s\), 1 écart\(s\)/u);
  });

  it("des garde-fous qui ne tiennent pas font échouer", () => {
    sauvegarder();
    const r = controler([], { FAUX_GARDES_ECHOUENT: "1" });
    expect(r.code).toBe(1);
    expect(r.sortie).toMatch(/garde-fous : ÉCHEC/u);
  });

  it("une nuit sans archive des pièces est une sauvegarde incomplète", () => {
    sauvegarder();
    for (const f of dans("pieces")) rmSync(join(distant, "b2", "immipro-backups", "pieces", f));
    const r = controler();
    expect(r.code).toBe(1);
    expect(r.sortie).toMatch(/n'a pas son archive des pièces.*incomplète/u);
  });

  it("un remote illisible le dit, au lieu de s'arrêter en silence", () => {
    sauvegarder();
    const r = controler([], { FAUX_LSF_ECHOUE: "1" });
    expect(r.code).toBe(1);
    expect(r.sortie).toMatch(/b2:immipro-backups ne se lit pas : vérifier le remote rclone/u);
  });

  it("une date sans sauvegarde le dit", () => {
    sauvegarder();
    const r = controler(["2001-01-01"]);
    expect(r.code).toBe(1);
    expect(r.sortie).toMatch(/aucune sauvegarde de la base le 2001-01-01/u);
  });
});
