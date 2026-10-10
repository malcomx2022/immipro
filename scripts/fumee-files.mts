/**
 * La montée des files, de pg-boss 10 à pg-boss 11 — S.166, M19 étape 5.
 *
 * pg-boss 11 ne sait pas migrer une base de pg-boss 10 : il travaille
 * dans un schéma neuf (`taches`), et ce qui attendait dans l'ancien
 * (`pgboss`) y est reposé au démarrage. La règle est dans
 * `src/domain/exploitation/bascule-des-files.ts`.
 *
 * La base de départ est construite par le vrai pg-boss 10.4.2 — le paquet
 * `pg-boss-10`, dépendance de développement réservée à cette fumée — avec
 * une tâche dans chaque état qui compte. Puis :
 *
 * - pg-boss 11 seul, sur le schéma de la version 10, refuse de démarrer
 *   (la reproduction) ;
 * - `getQueue()` démarre pg-boss 11 dans `taches` et reprend ce qui
 *   attendait, sous le même identifiant, départ différé compris ; rien de
 *   ce qui était terminé ne revient ;
 * - l'ancien schéma garde sa version et ses plannings ; les tâches
 *   reprises y sont annulées, avec la mention du transfert ;
 * - deux transferts concurrents ne reposent rien deux fois ;
 * - les tâches reprises sont traitées par un worker de la version 11 ;
 * - la supervision lit les échecs des deux schémas ;
 * - un retour arrière vers pg-boss 10 redémarre sur son schéma intact et
 *   ne rejoue pas ce qui a été transféré.
 *
 *     DATABASE_URL=postgresql://…/postgres npm run smoke:files
 */
import { Client } from "pg";

const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL absente — le script a besoin d'un serveur, pas d'une base précise.");
  process.exit(1);
}

const nomBase = `immipro_files_${process.pid}`;
const administration = new URL(source);
administration.pathname = "/postgres";
administration.searchParams.delete("schema");
const cible = new URL(source);
cible.pathname = `/${nomBase}`;
cible.searchParams.delete("schema");

const echecs: string[] = [];
const verifier = (condition: boolean, message: string): void => {
  console.log(condition ? `  ✓ ${message}` : `  ✗ ${message}`);
  if (!condition) echecs.push(message);
};

async function sur(url: URL, texte: string, valeurs: unknown[] = []) {
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    return await client.query(texte, valeurs);
  } finally {
    await client.end();
  }
}

console.log(`Montée des files sur une base jetable (${nomBase})`);
await sur(administration, `DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
await sur(administration, `CREATE DATABASE ${nomBase}`);
process.env.DATABASE_URL = cible.toString();

const { default: PgBoss10 } = await import("pg-boss-10");
const { default: PgBoss11 } = await import("pg-boss");
const { JOBS, FILES, declarerLesFiles, getQueue } = await import("../src/lib/queue");
const { transfererLesTachesDePgBoss10 } = await import("../src/lib/transfert-des-files");
const { sonderLesTachesEnEchec } = await import("../src/server/exploitation/taches");
const { db } = await import("../src/lib/db");

const etat = async (schema: string, id: string) =>
  (await sur(cible, `SELECT state::text AS state, output FROM ${schema}.job WHERE id = $1`, [id])).rows[0] as
    | { state: string; output: Record<string, unknown> | null }
    | undefined;

let code = 0;
try {
  // ── La base de pg-boss 10, telle que la production l'a laissée ─────
  console.log("\nLa base de départ, écrite par pg-boss 10.4.2");
  const v10 = new PgBoss10(cible.toString());
  await v10.start();
  await declarerLesFiles(v10 as never);
  const plusTard = new Date(Date.now() + 2 * 3_600_000);
  const cree = (await v10.send(JOBS.BALAYAGE_PIECE, { versionId: "v-cree" }))!;
  const differe = (await v10.sendAfter(JOBS.ANALYSE_DOCUMENT, { versionId: "v-differe" }, {}, plusTard))!;
  const enReprise = (await v10.send(JOBS.DIVERGENCE_REGLEMENTAIRE, { nouvelleId: "r-reprise" }))!;
  await sur(cible, "UPDATE pgboss.job SET state = 'retry', retry_count = 1 WHERE id = $1", [enReprise]);
  const abandonne = (await v10.send(JOBS.BALAYAGE_PIECE, { versionId: "v-abandonne" }))!;
  const termine = (await v10.send(JOBS.BALAYAGE_PIECE, { versionId: "v-termine" }))!;
  // Un worker arrêté en pleine tâche, puis une tâche menée à son terme.
  await sur(cible, "UPDATE pgboss.job SET state = 'active', started_on = now() WHERE id = $1", [abandonne]);
  await sur(cible, "UPDATE pgboss.job SET state = 'completed', completed_on = now() WHERE id = $1", [termine]);
  const echouee = (await v10.send(JOBS.ANALYSE_DOCUMENT, { versionId: "v-echouee" }))!;
  await sur(cible, "UPDATE pgboss.job SET state = 'failed', completed_on = now() WHERE id = $1", [echouee]);
  await v10.schedule(JOBS.RECONCILIATION_PAIEMENT, "*/15 * * * *");
  await v10.stop({ graceful: false, wait: true });
  const version10 = (await sur(cible, "SELECT version::int AS v FROM pgboss.version")).rows[0].v;
  verifier(version10 === 24, `pg-boss 10 a posé son schéma (version ${version10})`);

  // ── La reproduction : pg-boss 11 seul ne démarre pas ─────────────
  console.log("\nAvant S.166 : pg-boss 11 sur le schéma de la version 10");
  let refus = "";
  const seul = new PgBoss11(cible.toString());
  seul.on("error", () => undefined);
  try {
    await seul.start();
    await seul.stop({ graceful: false, wait: true });
  } catch (erreur) {
    refus = (erreur as Error).message;
  }
  verifier(refus !== "", `il refuse de démarrer (${refus || "il a démarré"})`);
  verifier(
    (await sur(cible, "SELECT version::int AS v FROM pgboss.version")).rows[0].v === 24,
    "et ne laisse rien de modifié : l'ancien schéma reste en version 24",
  );

  // ── La bascule, par le code de l'application ─────────────────────
  console.log("\nLa bascule : getQueue()");
  const boss = await getQueue();
  const version11 = (await sur(cible, "SELECT version::int AS v FROM taches.version")).rows[0].v;
  verifier(version11 >= 26, `pg-boss 11 travaille dans le schéma « taches » (version ${version11})`);
  const filesNeuves = (await sur(cible, "SELECT name FROM taches.queue")).rows.map((l) => l.name as string);
  verifier(FILES.every((f) => filesNeuves.includes(f)), `les ${FILES.length} files y sont déclarées`);

  const neuves = new Map(
    (await sur(cible, "SELECT id::text AS id, name, data, start_after FROM taches.job")).rows.map((l) => [l.id, l]),
  );
  for (const [id, quoi] of [
    [cree, "créée"],
    [differe, "différée"],
    [enReprise, "en reprise"],
    [abandonne, "abandonnée en cours"],
  ] as const) {
    verifier(neuves.has(id), `la tâche ${quoi} est reprise, sous le même identifiant`);
  }
  verifier(
    neuves.get(cree)?.data?.versionId === "v-cree",
    "ses données sont celles de l'ancienne",
  );
  const depart = neuves.get(differe)?.start_after as Date | undefined;
  verifier(
    depart !== undefined && Math.abs(depart.getTime() - plusTard.getTime()) < 1000,
    "le départ différé est gardé : elle ne part pas sur-le-champ",
  );
  verifier(!neuves.has(termine) && !neuves.has(echouee), "rien de ce qui était terminé ou échoué ne revient");

  for (const id of [cree, differe, enReprise, abandonne]) {
    const ancien = await etat("pgboss", id);
    verifier(
      ancien?.state === "cancelled" && ancien.output?.transfereVers === "taches",
      `l'ancienne copie (${id.slice(0, 8)}) est annulée, avec la mention du transfert`,
    );
  }
  verifier((await etat("pgboss", termine))?.state === "completed", "la tâche terminée n'est pas touchée");
  verifier(
    (await sur(cible, "SELECT count(*)::int AS n FROM pgboss.schedule")).rows[0].n === 1,
    "les plannings de l'ancien schéma restent en place, pour un retour arrière",
  );

  // ── Rejouer, et deux processus à la fois ─────────────────────────
  console.log("\nRejouer, et deux processus à la fois");
  const tardive = await (async () => {
    // L'ancien processus web a encore posté pendant le déploiement.
    const encore = new PgBoss10(cible.toString());
    await encore.start();
    const id = (await encore.send(JOBS.BALAYAGE_PIECE, { versionId: "v-tardive" }))!;
    await encore.stop({ graceful: false, wait: true });
    return id;
  })();
  const second = new PgBoss11({ connectionString: cible.toString(), schema: "taches" });
  await second.start();
  const [un, deux] = await Promise.all([
    transfererLesTachesDePgBoss10(boss, FILES, () => undefined),
    transfererLesTachesDePgBoss10(second, FILES, () => undefined),
  ]);
  verifier(
    un.transferees + deux.transferees === 1 && un.dejaPresentes + deux.dejaPresentes === 0,
    `la tâche tardive est reprise une fois, pas deux (${JSON.stringify([un, deux])})`,
  );
  const copies = (await sur(cible, "SELECT count(*)::int AS n FROM taches.job WHERE id = $1", [tardive])).rows[0].n;
  verifier(copies === 1, "une seule copie dans le schéma neuf");
  const rejoue = await transfererLesTachesDePgBoss10(boss, FILES, () => undefined);
  verifier(rejoue.transferees === 0, "un redémarrage ne reprend plus rien");
  await second.stop({ graceful: false, wait: true });

  // ── Les tâches reprises sont traitées ───────────────────────────
  console.log("\nUn worker de la version 11 traite ce qui a été repris");
  const vus = new Set<string>();
  await boss.work(JOBS.BALAYAGE_PIECE, { pollingIntervalSeconds: 0.5 }, async (taches) => {
    for (const t of taches) vus.add(t.id);
  });
  const limite = Date.now() + 15_000;
  while (Date.now() < limite && !(vus.has(cree) && vus.has(abandonne) && vus.has(tardive))) {
    await new Promise((r) => setTimeout(r, 250));
  }
  await boss.offWork(JOBS.BALAYAGE_PIECE);
  verifier(
    vus.has(cree) && vus.has(abandonne) && vus.has(tardive),
    `les balayages repris sont traités (${vus.size})`,
  );
  verifier((await etat("taches", cree))?.state === "completed", "et terminés dans le schéma neuf");

  // ── La supervision lit les deux schémas ─────────────────────────
  console.log("\nLa supervision des tâches en échec");
  const echecNeuf = (await boss.send(JOBS.DIVERGENCE_REGLEMENTAIRE, { nouvelleId: "r-echec" }))!;
  await sur(cible, "UPDATE taches.job SET state = 'failed', completed_on = now() WHERE id = $1", [echecNeuf]);
  const supervision = await sonderLesTachesEnEchec();
  verifier(
    supervision.lisible &&
      supervision.parFile[JOBS.ANALYSE_DOCUMENT] === 1 &&
      supervision.parFile[JOBS.DIVERGENCE_REGLEMENTAIRE] === 1,
    `l'échec d'avant la bascule et celui d'après se lisent (${JSON.stringify(supervision.parFile)})`,
  );

  // ── Le retour arrière ───────────────────────────────────────────
  console.log("\nRetour arrière : l'image précédente, pg-boss 10");
  const retour = new PgBoss10(cible.toString());
  await retour.start();
  const reprises = await retour.fetch(JOBS.BALAYAGE_PIECE, { batchSize: 10 });
  verifier(true, "pg-boss 10 redémarre sur son schéma");
  verifier(reprises.length === 0, `il ne rejoue pas ce qui a été transféré (${reprises.length})`);
  const encore = (await retour.send(JOBS.BALAYAGE_PIECE, { versionId: "v-retour" }))!;
  verifier(typeof encore === "string", "et il poste comme avant");
  await retour.stop({ graceful: false, wait: true });

  await boss.stop({ graceful: false, wait: true });
} catch (erreur) {
  console.error(erreur);
  code = 1;
} finally {
  await db.$disconnect();
  await sur(administration, `DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
}

if (code !== 0 || echecs.length > 0) {
  console.error(`\n${echecs.length} vérification(s) en échec.`);
  process.exit(1);
}
console.log("\nLa montée des files tient.");
process.exit(0);
