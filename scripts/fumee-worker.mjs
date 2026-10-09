/**
 * Test de fumée du worker de production.
 *
 * ── Ce qu'il vérifie, et pourquoi pas autrement ───────────────────────
 *
 * Le défaut corrigé ici ne se voyait dans aucun test : `npm run check`
 * était vert pendant que le service `worker` bouclait sur
 * `Cannot find module '/app/dist/worker.js'`. Chercher un nom de fichier
 * dans une source n'aurait rien changé — le fichier était bien *nommé*
 * partout, il n'était simplement jamais *produit*.
 *
 * Ce script exécute donc réellement la commande que
 * `docker-compose.prod.yml` donne au service, dans une arborescence qui
 * ne contient **que** ce que l'image finale copie. Trois façons de le
 * faire échouer, et il les distingue :
 *
 * | Si le worker était…            | Ce qu'on observerait              |
 * |---|---|
 * | absent ou mal nommé            | `Cannot find module`              |
 * | amputé d'une dépendance        | `MODULE_NOT_FOUND` au démarrage   |
 * | une fonction morte ou un stub  | sortie 0, sans tentative de connexion |
 *
 * Le succès, lui, ne peut pas être feint : sans PostgreSQL, le worker
 * doit échouer **sur la connexion** et rendre un code non nul. Un
 * artefact qui s'arrêterait proprement sans rien tenter passerait pour
 * bon à l'œil nu ; ici il échoue.
 *
 * ── Trois modes ──────────────────────────────────────────────────────
 *
 *     node scripts/fumee-worker.mjs             arborescence isolée
 *     node scripts/fumee-worker.mjs --base      + démarrage sur PostgreSQL
 *     node scripts/fumee-worker.mjs --image     image Docker réelle
 *     node scripts/fumee-worker.mjs --image=<tag>   image déjà construite
 *
 * Le premier tourne partout, y compris en intégration continue, sans
 * démon Docker. Les deux derniers exécutent les commandes que le fichier
 * de déploiement déclare **dans une image** : c'est le seul moyen de
 * prouver le `COPY` du Dockerfile, et il demande un démon. La forme avec
 * étiquette prend une image déjà construite, celle que le déploiement
 * s'apprête à pousser, plutôt que d'en refaire une autre.
 *
 * ── Pourquoi un mode avec base ───────────────────────────────────────
 *
 * Empaqueter le worker a révélé la panne suivante, que la première
 * masquait : pg-boss 10 refuse de travailler ou de planifier sur une
 * file qui n'existe pas en base, et le worker s'arrêtait aussitôt sur
 * « Queue paiement.reconciliation not found ». Sans base, ce mode-là est
 * invisible — le worker échoue de toute façon sur la connexion.
 *
 * `--base` crée donc une base jetable, vierge, et démarre le paquet
 * dessus **deux fois** : la première prouve que les files sont créées, la
 * seconde qu'un redémarrage n'y touche pas. Aucune base existante n'est
 * modifiée.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RACINE = process.cwd();
const COMPOSE = join(RACINE, "docker-compose.prod.yml");
/** Le battement du worker (M15) : `src/server/jobs/battement.ts`. */
const BATTEMENT = "/tmp/worker-battement";
/** La version de la CLI Prisma que l'image doit porter : celle du verrou racine (M15). */
const PRISMA_ATTENDU = JSON.parse(readFileSync(join(RACINE, "package-lock.json"), "utf8")).packages[
  "node_modules/prisma"
].version;

/** Port fermé : la connexion doit être refusée tout de suite. */
const URL_SANS_BASE = "postgresql://fumee:fumee@127.0.0.1:59999/fumee";

const echecs = [];
const verifier = (condition, message) => {
  if (condition) console.log(`  ✓ ${message}`);
  else {
    console.log(`  ✗ ${message}`);
    echecs.push(message);
  }
};

/**
 * La commande vient du fichier de déploiement, jamais d'une constante
 * recopiée ici : c'est ce qui empêche le test et la production de
 * diverger le jour où l'un des deux change.
 */
function commandeDuService(nom) {
  const yml = readFileSync(COMPOSE, "utf8");
  const bloc = yml.split(new RegExp(`^  ${nom}:$`, "mu"))[1];
  if (!bloc) throw new Error(`Service « ${nom} » absent de ${COMPOSE}`);
  const ligne = bloc.split(/^  \S/mu)[0].match(/^\s*command:\s*\[(.+)\]\s*$/mu);
  return ligne
    ? ligne[1].split(",").map((m) => m.trim().replace(/^["']|["']$/gu, ""))
    : null;
}

function analyser(resultat, contexte) {
  const sortie = `${resultat.stdout ?? ""}${resultat.stderr ?? ""}`;
  verifier(
    !/Cannot find module|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND/u.test(sortie),
    `${contexte} : aucun module manquant au démarrage`,
  );
  verifier(
    resultat.status !== 0,
    `${contexte} : sortie non nulle sans PostgreSQL (obtenu ${resultat.status})`,
  );
  verifier(
    /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|connect/u.test(sortie),
    `${contexte} : l'échec porte sur la connexion, le code a donc bien démarré`,
  );
  verifier(
    !sortie.includes("worker démarré"),
    `${contexte} : aucun démarrage annoncé sans base`,
  );
  if (echecs.length > 0) console.log(`\n--- sortie observée ---\n${sortie.trim()}\n`);
}

// ── 1. Le déploiement décrit bien deux services distincts ─────────────

console.log("docker-compose.prod.yml");
const commandeWorker = commandeDuService("worker");
const commandeApp = commandeDuService("app");
verifier(Array.isArray(commandeWorker), "le service worker déclare une commande");
verifier(
  commandeApp === null,
  "le service app garde la commande de l'image, il ne lance pas le worker",
);
verifier(
  JSON.stringify(commandeApp) !== JSON.stringify(commandeWorker),
  "les deux services ne partagent pas la même commande",
);
if (!commandeWorker) process.exit(1);

// ── 2. Le build produit ce que la commande nomme ──────────────────────

const argImage = process.argv.find((a) => a === "--image" || a.startsWith("--image="));
const imageFournie = argImage?.startsWith("--image=") ? argImage.slice("--image=".length) : null;

const artefact = commandeWorker[commandeWorker.length - 1];

/*
  Quand une image est fournie, l'artefact à éprouver est celui qu'elle
  contient : le recompiler ici ne dirait rien de plus, et masquerait au
  contraire une image dont le contenu diffère de la source. Le paquet est
  compilé et exécuté dans le job de validation, qui précède.
*/
if (!imageFournie) {
  console.log(`\nCompilation → ${artefact}`);
  /*
    L'artefact est effacé avant d'être reconstruit. Sans cela, le test
    passait au vert sur un paquet resté d'une exécution précédente : il
    vérifiait qu'un fichier existe, pas qu'un build le produit — et c'est
    exactement le genre de vérification que la panne d'origine aurait
    traversée.
  */
  rmSync(join(RACINE, "dist"), { recursive: true, force: true });
  verifier(!existsSync(join(RACINE, artefact)), `${artefact} est bien absent avant le build`);
  execFileSync("node", ["scripts/build-worker.mjs"], { cwd: RACINE, stdio: "inherit" });
  verifier(existsSync(join(RACINE, artefact)), `${artefact} existe après le build`);
}

// ── 3. Exécution dans une arborescence réduite à l'essentiel ──────────

if (!argImage) {
  console.log("\nExécution en arborescence isolée");
  const bac = mkdtempSync(join(tmpdir(), "fumee-worker-"));
  try {
    mkdirSync(join(bac, "dist"), { recursive: true });
    cpSync(join(RACINE, artefact), join(bac, artefact));
    /*
      Seulement les deux dépendances que le paquet laisse dehors. Copier
      tout `node_modules` rendrait le test complaisant : il passerait
      alors même si l'image finale n'embarquait rien.
    */
    for (const paquet of ["@prisma", ".prisma"]) {
      const source = join(RACINE, "node_modules", paquet);
      if (!existsSync(source)) {
        console.log(`  ✗ node_modules/${paquet} absent — lancer « npx prisma generate »`);
        process.exit(1);
      }
      cpSync(source, join(bac, "node_modules", paquet), { recursive: true });
    }

    analyser(
      spawnSync(commandeWorker[0], commandeWorker.slice(1), {
        cwd: bac,
        env: { ...process.env, DATABASE_URL: URL_SANS_BASE, NODE_ENV: "production" },
        encoding: "utf8",
        timeout: 60_000,
      }),
      "arborescence isolée",
    );
  } finally {
    rmSync(bac, { recursive: true, force: true });
  }
} else {
  // ── 3 bis. Les commandes du déploiement, dans l'image produite ──────
  /*
    `--image=<tag>` prend une image déjà construite au lieu d'en construire
    une. En intégration continue, c'est ce qui permet de vérifier **celle
    qui sera poussée** — la même empreinte, pas une reconstruction qui
    pourrait différer.
  */
  let tag = imageFournie;
  if (tag) {
    console.log(`\nImage fournie : ${tag}`);
  } else {
    tag = "immipro-fumee:worker";
    console.log("\nConstruction de l'image et exécution dedans");
    execFileSync("docker", ["build", "-t", tag, "."], { cwd: RACINE, stdio: "inherit" });
  }

  analyser(
    spawnSync(
      "docker",
      [
        "run", "--rm", "--network", "none",
        "-e", `DATABASE_URL=${URL_SANS_BASE}`,
        tag,
        ...commandeWorker,
      ],
      { encoding: "utf8", timeout: 600_000 },
    ),
    `image ${tag} · worker`,
  );

  /*
    Le service `app` ne déclare pas de commande : c'est celle de l'image qui
    s'applique. Elle n'a jamais été vérifiée contre l'image non plus — et
    c'est exactement par là que le worker était tombé. Un serveur web qui
    démarre reste debout : on le lance, on attend, on regarde s'il est
    encore là.
  */
  /*
    M15 : la CLI Prisma de l'image est celle du verrou, et les sondes du
    compose trouvent leurs outils dans l'image. Une sonde dont la commande
    n'existe pas dans le conteneur le déclare malade pour toujours.
  */
  console.log("\nOutils de l'image (M15)");
  const cli = spawnSync("docker", ["run", "--rm", "--network", "none", "--entrypoint", "prisma", tag, "--version"], {
    encoding: "utf8",
    timeout: 120_000,
  });
  const versionCli = /^prisma\s*:\s*(\S+)/mu.exec(cli.stdout ?? "")?.[1] ?? "absente";
  verifier(versionCli === PRISMA_ATTENDU, `CLI Prisma de l'image : ${versionCli} (verrou : ${PRISMA_ATTENDU})`);

  /*
    Les commandes Prisma du déploiement, telles que `deployer.sh` les écrit,
    rejouées dans l'image sans réseau (09/10/2026). Vérifier `prisma
    --version` ne suffisait pas : le script appelait `npx prisma`, que npx
    ne résout pas par le PATH. Il téléchargeait l'étiquette `latest` du
    registre — une préversion de Prisma 8 sans `migrate` — et chaque
    déploiement s'arrêtait à l'étape 2. Sans réseau, une commande qui
    n'atteint pas la CLI de l'image échoue ici, sur le registre ; celle qui
    l'atteint échoue plus loin, sur la base absente (P1001).
  */
  const deployer = readFileSync(join(RACINE, "scripts/deployer.sh"), "utf8");
  const commandesPrisma = [...deployer.matchAll(/run --rm -T app ((?:npx )?prisma migrate (?:status|deploy))\b/gu)].map(
    (m) => m[1],
  );
  verifier(commandesPrisma.length === 2, `deployer.sh appelle Prisma deux fois (${commandesPrisma.length})`);
  for (const commande of commandesPrisma) {
    const [programme, ...args] = commande.split(" ");
    const r = spawnSync(
      "docker",
      ["run", "--rm", "--network", "none", "-e", `DATABASE_URL=${URL_SANS_BASE}`, "--entrypoint", programme, tag, ...args],
      { encoding: "utf8", timeout: 120_000 },
    );
    const sortie = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    verifier(
      /P1001/u.test(sortie) && !/registry\.npmjs\.org|UNKNOWN_COMMAND/u.test(sortie),
      `déploiement · « ${commande} » atteint la CLI de l'image (${/P1001/u.test(sortie) ? "base absente, attendu" : sortie.trim().split("\n").at(-1)})`,
    );
  }
  /*
    Le diagnostic des données antérieures (RF-4, S.149) se lance depuis
    l'image, comme celui d'un paiement : il doit y être, et y démarrer.
    Sans base joignable, il le dit et s'arrête — un module absent dirait
    « Cannot find module », que cette vérification attraperait.
  */
  {
    const r = spawnSync(
      "docker",
      ["run", "--rm", "--network", "none", "-e", `DATABASE_URL=${URL_SANS_BASE}`, "--entrypoint", "node", tag, "dist/diagnostic-donnees.mjs"],
      { encoding: "utf8", timeout: 120_000 },
    );
    const sortie = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    verifier(
      /Le diagnostic n'a pas abouti/u.test(sortie) && !/Cannot find module/u.test(sortie),
      `exploitation · « node dist/diagnostic-donnees.mjs » démarre dans l'image (${/Le diagnostic n'a pas abouti/u.test(sortie) ? "base absente, attendu" : sortie.trim().split("\n").at(-1)})`,
    );
  }
  const sonde = (commande) =>
    spawnSync("docker", ["run", "--rm", "--network", "none", "--entrypoint", "sh", tag, "-c", commande], {
      encoding: "utf8",
      timeout: 60_000,
    }).status;
  const sondeDuWorker = 'test $(( $(date +%s) - $(stat -c %Y /tmp/worker-battement) )) -lt 90';
  verifier(sonde("command -v wget >/dev/null") === 0, "wget est dans l'image (sonde du service app)");
  verifier(
    sonde(`touch /tmp/worker-battement && ${sondeDuWorker}`) === 0,
    "sonde du worker : un battement frais est sain",
  );
  verifier(
    sonde(`touch -t 202001010000 /tmp/worker-battement && ${sondeDuWorker}`) !== 0,
    "sonde du worker : un battement vieux est malade",
  );

  console.log("\nCommande par défaut de l'image (service app)");
  /*
    Sans `--rm` : un conteneur qui s'arrête tout de suite serait effacé
    avant qu'on puisse constater son arrêt, et le test conclurait à une
    absence de conteneur plutôt qu'à un démarrage raté. Il est retiré plus
    bas, dans tous les cas.
  */
  const lancement = spawnSync(
    "docker",
    ["run", "--detach", "--network", "none", tag],
    { encoding: "utf8", timeout: 120_000 },
  );
  const conteneur = (lancement.stdout ?? "").trim();
  verifier(lancement.status === 0 && conteneur !== "", "l'image démarre sa commande par défaut");
  if (conteneur) {
    try {
      // Assez pour qu'un module manquant ou une erreur de démarrage ait eu
      // le temps de tuer le processus ; trop court pour peser en CI.
      await new Promise((suite) => setTimeout(suite, 12_000));
      const etat = spawnSync(
        "docker",
        ["inspect", "-f", "{{.State.Running}}", conteneur],
        { encoding: "utf8" },
      );
      const journal = spawnSync("docker", ["logs", conteneur], { encoding: "utf8" });
      const sortie = `${journal.stdout ?? ""}${journal.stderr ?? ""}`;
      verifier(
        !/Cannot find module|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND/u.test(sortie),
        "service app : aucun module manquant au démarrage",
      );
      verifier(
        (etat.stdout ?? "").trim() === "true",
        "service app : le serveur tient debout au lieu de s'arrêter",
      );
      if ((etat.stdout ?? "").trim() !== "true") {
        console.log(`\n--- journal du conteneur ---\n${sortie.trim()}\n`);
      }
    } finally {
      spawnSync("docker", ["rm", "--force", conteneur], { encoding: "utf8" });
    }
  }
}

// ── 3 ter. La passerelle antivirus (S.96) ────────────────────────────
/*
  Troisième commande du déploiement, même image, même piège : un artefact
  absent ou un module manquant ferait boucler le conteneur `antivirus`, et
  chaque pièce resterait en quarantaine sans que rien ne dise pourquoi.
  Sans démon en face, la passerelle doit **tenir debout** et répondre 503
  sur `/sante` — c'est son état normal pendant le premier chargement des
  signatures.
*/
const commandePasserelle = commandeDuService("antivirus");
console.log("\nPasserelle antivirus (service antivirus)");
verifier(Array.isArray(commandePasserelle), "le service antivirus déclare une commande");

if (commandePasserelle && !argImage) {
  const artefactPasserelle = commandePasserelle[commandePasserelle.length - 1];
  verifier(existsSync(join(RACINE, artefactPasserelle)), `${artefactPasserelle} existe après le build`);
  const bac = mkdtempSync(join(tmpdir(), "fumee-passerelle-"));
  try {
    // L'artefact seul, sans aucun `node_modules` : la passerelle n'en a pas besoin.
    mkdirSync(join(bac, "dist"), { recursive: true });
    cpSync(join(RACINE, artefactPasserelle), join(bac, artefactPasserelle));
    const port = 18_000 + (process.pid % 1_000);
    const enfant = spawn(commandePasserelle[0], commandePasserelle.slice(1), {
      cwd: bac,
      env: { ...process.env, CLAMD_HOST: "127.0.0.1", CLAMD_PORT: "1", PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let sortie = "";
    enfant.stdout.on("data", (m) => (sortie += m));
    enfant.stderr.on("data", (m) => (sortie += m));
    let arretee = false;
    enfant.on("exit", () => (arretee = true));

    const limite = Date.now() + 15_000;
    while (Date.now() < limite && !arretee && !sortie.includes("écoute sur")) {
      await new Promise((suite) => setTimeout(suite, 100));
    }
    verifier(!/Cannot find module|MODULE_NOT_FOUND/u.test(sortie), "passerelle : aucun module manquant");
    verifier(!arretee && sortie.includes("écoute sur"), "passerelle : elle écoute sans démon en face");
    if (!arretee) {
      const sante = await fetch(`http://127.0.0.1:${port}/sante`).catch(() => null);
      verifier(sante?.status === 503, `passerelle : /sante dit le démon absent (${sante?.status ?? "aucune réponse"})`);
      enfant.kill("SIGTERM");
      await new Promise((suite) => enfant.once("exit", suite));
    } else {
      console.log(`\n--- sortie observée ---\n${sortie.trim()}\n`);
    }
  } finally {
    rmSync(bac, { recursive: true, force: true });
  }
} else if (commandePasserelle) {
  const tagPasserelle = imageFournie ?? "immipro-fumee:worker";
  const lancement = spawnSync(
    "docker",
    ["run", "--detach", "--network", "none", "-e", "CLAMD_HOST=127.0.0.1", "-e", "CLAMD_PORT=1", tagPasserelle, ...commandePasserelle],
    { encoding: "utf8", timeout: 120_000 },
  );
  const conteneur = (lancement.stdout ?? "").trim();
  verifier(lancement.status === 0 && conteneur !== "", "passerelle : l'image démarre sa commande");
  if (conteneur) {
    try {
      await new Promise((suite) => setTimeout(suite, 5_000));
      const etat = spawnSync("docker", ["inspect", "-f", "{{.State.Running}}", conteneur], { encoding: "utf8" });
      const journal = spawnSync("docker", ["logs", conteneur], { encoding: "utf8" });
      const sortie = `${journal.stdout ?? ""}${journal.stderr ?? ""}`;
      verifier(!/Cannot find module|MODULE_NOT_FOUND/u.test(sortie), "passerelle : aucun module manquant dans l'image");
      verifier((etat.stdout ?? "").trim() === "true", "passerelle : elle tient debout dans l'image");
      if ((etat.stdout ?? "").trim() !== "true") console.log(`\n--- journal du conteneur ---\n${sortie.trim()}\n`);
    } finally {
      spawnSync("docker", ["rm", "--force", conteneur], { encoding: "utf8" });
    }
  }
}

// ── 4. Démarrage réel sur PostgreSQL, base jetable ───────────────────

if (process.argv.includes("--base")) {
  const { default: PgBoss } = await import("pg-boss");
  const { Client } = await import("pg");

  const source = process.env.DATABASE_URL;
  if (!source) {
    console.log("\n  ✗ --base demande DATABASE_URL (un serveur, pas une base précise)");
    process.exit(1);
  }

  /*
    Une base jetable plutôt que celle du poste : pg-boss range ses files
    dans un schéma fixe, on ne peut pas l'isoler autrement, et un test de
    fumée n'a pas à effacer les jobs en attente de qui le lance.
  */
  const nomBase = `immipro_fumee_${process.pid}`;
  const administration = new URL(source);
  administration.pathname = "/postgres";
  const cible = new URL(source);
  cible.pathname = `/${nomBase}`;

  const executer = async (url, texte) => {
    const client = new Client({ connectionString: url.toString() });
    await client.connect();
    try {
      return await client.query(texte);
    } finally {
      await client.end();
    }
  };

  const journal = join(mkdtempSync(join(tmpdir(), "fumee-base-")), "worker.log");

  const demarrerLeWorker = async (tour) => {
    const fd = openSync(journal, "w");
    const enfant = spawn(commandeWorker[0], commandeWorker.slice(1), {
      cwd: RACINE,
      stdio: ["ignore", fd, fd],
      env: { ...process.env, DATABASE_URL: cible.toString(), NODE_ENV: "production" },
    });
    closeSync(fd);

    let arrete = false;
    enfant.on("exit", () => {
      arrete = true;
    });

    const lire = () => (existsSync(journal) ? readFileSync(journal, "utf8") : "");
    const depart = Date.now();
    const limite = depart + 90_000;
    while (Date.now() < limite && !arrete && !lire().includes("worker démarré")) {
      await new Promise((suite) => setTimeout(suite, 200));
    }
    const sortie = lire();

    // Le premier battement suit le démarrage : la sonde du compose
    // (`docker-compose.prod.yml`) lit ce fichier, il doit être frais.
    const frais = () => existsSync(BATTEMENT) && statSync(BATTEMENT).mtimeMs >= depart - 1000;
    const limiteBattement = Date.now() + 60_000;
    while (!arrete && Date.now() < limiteBattement && !frais()) {
      await new Promise((suite) => setTimeout(suite, 200));
    }
    verifier(frais(), `${tour} : le worker bat (${BATTEMENT} réécrit après le démarrage)`);

    let codeDeSortie = null;
    if (!arrete) {
      enfant.kill("SIGTERM");
      codeDeSortie = await new Promise((suite) => enfant.once("exit", (code) => suite(code)));
      // Revue M9 : un arrêt demandé se termine proprement, et le dit.
      verifier(codeDeSortie === 0, `${tour} : SIGTERM, le worker sort en 0 (${codeDeSortie})`);
      verifier(lire().includes("worker arrêté"), `${tour} : il annonce son arrêt`);
    }

    verifier(sortie.includes("worker démarré"), `${tour} : le worker annonce son démarrage`);
    verifier(
      !/Queue .* not found/u.test(sortie),
      `${tour} : aucune file manquante`,
    );
    if (!sortie.includes("worker démarré")) {
      console.log(`\n--- sortie observée ---\n${sortie.trim()}\n`);
    }
  };

  const etat = async () => {
    // Les files internes de pg-boss ne nous regardent pas.
    const files = await executer(
      cible,
      "select name from pgboss.queue where name not like '\\_\\_pgboss\\_\\_%' order by name",
    );
    const plans = await executer(cible, "select name, cron from pgboss.schedule order by name");
    return {
      files: files.rows.map((l) => l.name),
      plans: plans.rows.map((l) => `${l.name} → ${l.cron}`),
    };
  };

  console.log(`\nDémarrage sur une base jetable (${nomBase})`);
  await executer(administration, `DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
  await executer(administration, `CREATE DATABASE ${nomBase}`);

  try {
    await demarrerLeWorker("base vierge");
    const premier = await etat();
    verifier(premier.files.length > 0, `les files sont créées (${premier.files.length})`);
    verifier(
      premier.plans.length > 0,
      `les cadences sont enregistrées (${premier.plans.join(", ") || "aucune"})`,
    );

    await demarrerLeWorker("redémarrage");
    const second = await etat();
    verifier(
      JSON.stringify(second.files) === JSON.stringify(premier.files),
      "un redémarrage ne change pas les files",
    );
    verifier(
      JSON.stringify(second.plans) === JSON.stringify(premier.plans),
      "un redémarrage ne duplique pas les cadences",
    );

    /*
      Le point décisif pour WF-06 et WF-11 : `send` ne lève pas quand la
      file est inconnue, il rend `null` et le job disparaît. Poster ici,
      worker arrêté, vérifie que chaque file déclarée accepte réellement
      un job — c'est ce qui manquait au dépôt d'une pièce.
    */
    const producteur = new PgBoss(cible.toString());
    await producteur.start();
    try {
      for (const nom of second.files) {
        const id = await producteur.send(nom, { fumee: true });
        verifier(id !== null, `un producteur peut poster sur « ${nom} »`);
      }
    } finally {
      await producteur.stop({ graceful: false });
    }
  } finally {
    await executer(administration, `DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
  }
}

console.log(
  echecs.length === 0
    ? "\nLe worker de production démarre depuis l'artefact construit."
    : `\n${echecs.length} vérification(s) en échec.`,
);
process.exit(echecs.length === 0 ? 0 : 1);
