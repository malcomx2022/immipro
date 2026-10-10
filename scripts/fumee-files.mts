/**
 * La montée des files — S.166 (pg-boss 10 → 11), S.168 (11 → 12), M19
 * étape 5.
 *
 * La production a vécu deux bascules, et la fumée les rejoue dans l'ordre
 * sur une base jetable, chaque état écrit par la vraie version :
 *
 * - **pg-boss 10.4.2** (`pg-boss-10`) a laissé le schéma `pgboss`
 *   (version 24). pg-boss 11 ne sait pas le migrer : S.166 l'a laissé
 *   intact, et ce qui y attendait est transféré dans le schéma neuf
 *   `taches` (règle : `src/domain/exploitation/bascule-des-files.ts`).
 * - **pg-boss 11.1.2** (`pg-boss-11`) a ensuite écrit `taches` (version
 *   26) : files, plannings, tâches en attente.
 * - **pg-boss 12**, celui de l'application, migre `taches` sur place.
 *   Ses migrations partent de la version 25 : rien ne se perd.
 *
 * Elle éprouve :
 * - pg-boss 12 seul sur `pgboss` refuse, sans le modifier (la raison du
 *   schéma neuf de S.166 tient toujours) ;
 * - `getQueue()` migre `taches`, garde les tâches de la version 11 sous
 *   leur identifiant, départ différé compris, garde les plannings, et
 *   transfère ce qui attendait encore dans `pgboss` ;
 * - deux transferts concurrents ne reposent rien deux fois ;
 * - un worker de la version 12 traite ce qui attendait ;
 * - la supervision lit les échecs des deux schémas ;
 * - retour arrière vers l'image S.166 : pg-boss 11 redémarre sur `taches`
 *   migré, traite, planifie et fait sa maintenance sans erreur ;
 * - retour arrière vers l'image d'avant S.166 : pg-boss 10 redémarre sur
 *   `pgboss` et ne rejoue pas ce qui a été transféré.
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

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

console.log(`Montée des files sur une base jetable (${nomBase})`);
await sur(administration, `DROP DATABASE IF EXISTS ${nomBase} WITH (FORCE)`);
await sur(administration, `CREATE DATABASE ${nomBase}`);
process.env.DATABASE_URL = cible.toString();

const { default: PgBoss10 } = await import("pg-boss-10");
const { default: PgBoss11 } = await import("pg-boss-11");
const { PgBoss: PgBoss12 } = await import("pg-boss");
const { JOBS, FILES, declarerLesFiles, getQueue } = await import("../src/lib/queue");
const { transfererLesTachesDePgBoss10 } = await import("../src/lib/transfert-des-files");
const { sonderLesTachesEnEchec } = await import("../src/server/exploitation/taches");
const { db } = await import("../src/lib/db");

const etat = async (schema: string, id: string) =>
  (await sur(cible, `SELECT state::text AS state, output, start_after FROM ${schema}.job WHERE id = $1`, [id]))
    .rows[0] as { state: string; output: Record<string, unknown> | null; start_after: Date } | undefined;
const version = async (schema: string) =>
  (await sur(cible, `SELECT version::int AS v FROM ${schema}.version`)).rows[0]?.v as number | undefined;

let code = 0;
try {
  // ── 1. pg-boss 10, avant S.166 ─────────────────────────────────────
  console.log("\n1. Le schéma « pgboss », écrit par pg-boss 10.4.2");
  const v10 = new PgBoss10(cible.toString());
  await v10.start();
  await declarerLesFiles(v10 as never);
  const v10Attente = (await v10.send(JOBS.BALAYAGE_PIECE, { versionId: "v10-attente" }))!;
  const v10Termine = (await v10.send(JOBS.BALAYAGE_PIECE, { versionId: "v10-termine" }))!;
  await sur(cible, "UPDATE pgboss.job SET state = 'completed', completed_on = now() WHERE id = $1", [v10Termine]);
  const v10Echouee = (await v10.send(JOBS.ANALYSE_DOCUMENT, { versionId: "v10-echouee" }))!;
  await sur(cible, "UPDATE pgboss.job SET state = 'failed', completed_on = now() WHERE id = $1", [v10Echouee]);
  await v10.schedule(JOBS.RECONCILIATION_PAIEMENT, "*/15 * * * *");
  await v10.stop({ graceful: false, wait: true });
  verifier((await version("pgboss")) === 24, "pg-boss 10 a posé son schéma (version 24)");

  // ── 2. pg-boss 11, l'image S.166 ───────────────────────────────────
  console.log("\n2. Le schéma « taches », écrit par pg-boss 11.1.2 (image S.166)");
  const v11 = new PgBoss11({ connectionString: cible.toString(), schema: "taches" });
  await v11.start();
  await declarerLesFiles(v11 as never);
  const plusTard = new Date(Date.now() + 2 * 3_600_000);
  const cree = (await v11.send(JOBS.BALAYAGE_PIECE, { versionId: "v11-cree" }))!;
  const differe = (await v11.sendAfter(JOBS.ANALYSE_DOCUMENT, { versionId: "v11-differe" }, {}, plusTard))!;
  const enReprise = (await v11.send(JOBS.DIVERGENCE_REGLEMENTAIRE, { nouvelleId: "r-reprise" }))!;
  await sur(cible, "UPDATE taches.job SET state = 'retry', retry_count = 1 WHERE id = $1", [enReprise]);
  for (const [file, cron] of [
    [JOBS.RECONCILIATION_PAIEMENT, "*/15 * * * *"],
    [JOBS.SONDE_SERVICES, "0 * * * *"],
  ] as const) {
    await v11.schedule(file, cron);
  }
  await v11.stop({ graceful: false, wait: true });
  verifier((await version("taches")) === 26, "pg-boss 11 a posé son schéma (version 26)");

  // ── 3. La raison du schéma neuf tient toujours ────────────────────
  console.log("\n3. pg-boss 12 seul, sur le schéma de la version 10");
  let refus = "";
  const seul = new PgBoss12(cible.toString());
  seul.on("error", () => undefined);
  try {
    await seul.start();
    await seul.stop({ graceful: false });
  } catch (erreur) {
    refus = (erreur as Error).message;
  }
  verifier(refus !== "", `il refuse de démarrer (${refus.slice(0, 80) || "il a démarré"})`);
  verifier((await version("pgboss")) === 24, "et laisse « pgboss » en version 24");

  // ── 4. La montée, par le code de l'application ───────────────────
  console.log("\n4. La montée : getQueue() (pg-boss 12)");
  const boss = await getQueue();
  const v12 = await version("taches");
  verifier(v12 !== undefined && v12 > 26, `« taches » est migré sur place (version ${v12})`);
  for (const [id, quoi] of [
    [cree, "créée"],
    [differe, "différée"],
    [enReprise, "en reprise"],
  ] as const) {
    verifier((await etat("taches", id)) !== undefined, `la tâche ${quoi} de pg-boss 11 est toujours là, sous son identifiant`);
  }
  const depart = (await etat("taches", differe))?.start_after;
  verifier(
    depart !== undefined && Math.abs(depart.getTime() - plusTard.getTime()) < 1000,
    "le départ différé est gardé",
  );
  const plannings = (await boss.getSchedules()).map((p) => p.name).sort();
  verifier(
    plannings.includes(JOBS.RECONCILIATION_PAIEMENT) && plannings.includes(JOBS.SONDE_SERVICES),
    `les plannings de pg-boss 11 sont gardés (${plannings.join(", ")})`,
  );
  verifier((await etat("taches", v10Attente)) !== undefined, "la tâche restée dans « pgboss » est transférée");
  verifier(
    (await etat("pgboss", v10Attente))?.output?.transfereVers === "taches",
    "et marquée transférée dans l'ancien schéma",
  );
  verifier(
    (await etat("taches", v10Termine)) === undefined && (await etat("taches", v10Echouee)) === undefined,
    "rien de terminé ou d'échoué ne revient",
  );

  // ── 5. Rejouer, et deux processus à la fois ──────────────────────
  console.log("\n5. Rejouer, et deux processus à la fois");
  const tardive = await (async () => {
    // L'ancien processus web de l'image d'avant S.166 a encore posté.
    const encore = new PgBoss10(cible.toString());
    await encore.start();
    const id = (await encore.send(JOBS.BALAYAGE_PIECE, { versionId: "v10-tardive" }))!;
    await encore.stop({ graceful: false, wait: true });
    return id;
  })();
  const second = new PgBoss12({ connectionString: cible.toString(), schema: "taches" });
  await second.start();
  const [un, deux] = await Promise.all([
    transfererLesTachesDePgBoss10(boss, FILES, () => undefined),
    transfererLesTachesDePgBoss10(second, FILES, () => undefined),
  ]);
  verifier(
    un.transferees + deux.transferees === 1 && un.dejaPresentes + deux.dejaPresentes === 0,
    `la tâche tardive est reprise une fois, pas deux (${JSON.stringify([un, deux])})`,
  );
  verifier(
    (await sur(cible, "SELECT count(*)::int AS n FROM taches.job WHERE id = $1", [tardive])).rows[0].n === 1,
    "une seule copie dans « taches »",
  );
  verifier((await transfererLesTachesDePgBoss10(boss, FILES, () => undefined)).transferees === 0, "un redémarrage ne reprend plus rien");
  await second.stop({ graceful: false });

  // ── 6. Le worker de la version 12 traite ce qui attendait ────────
  console.log("\n6. Un worker de pg-boss 12 traite ce qui attendait");
  const vus = new Set<string>();
  await boss.work(JOBS.BALAYAGE_PIECE, { pollingIntervalSeconds: 0.5 }, async (taches) => {
    for (const t of taches) vus.add(t.id);
  });
  const limite = Date.now() + 15_000;
  while (Date.now() < limite && !(vus.has(cree) && vus.has(v10Attente) && vus.has(tardive))) await attendre(250);
  await boss.offWork(JOBS.BALAYAGE_PIECE);
  verifier(vus.has(cree), "la tâche de pg-boss 11 est traitée");
  verifier(vus.has(v10Attente) && vus.has(tardive), "les tâches transférées de pg-boss 10 sont traitées");
  verifier((await etat("taches", cree))?.state === "completed", "et terminées dans « taches »");

  // ── 7. La supervision lit les deux schémas ───────────────────────
  console.log("\n7. La supervision des tâches en échec");
  const echecNeuf = (await boss.send(JOBS.DIVERGENCE_REGLEMENTAIRE, { nouvelleId: "r-echec" }))!;
  await sur(cible, "UPDATE taches.job SET state = 'failed', completed_on = now() WHERE id = $1", [echecNeuf]);
  const supervision = await sonderLesTachesEnEchec();
  verifier(
    supervision.lisible &&
      supervision.parFile[JOBS.ANALYSE_DOCUMENT] === 1 &&
      supervision.parFile[JOBS.DIVERGENCE_REGLEMENTAIRE] === 1,
    `l'échec de « pgboss » et celui de « taches » se lisent (${JSON.stringify(supervision.parFile)})`,
  );
  await boss.stop({ graceful: false });

  // ── 8. Retour arrière vers l'image S.166 ─────────────────────────
  console.log("\n8. Retour arrière : l'image S.166 (pg-boss 11) sur « taches » migré");
  const alertes: string[] = [];
  const retour11 = new PgBoss11({
    connectionString: cible.toString(),
    schema: "taches",
    superviseIntervalSeconds: 1,
    maintenanceIntervalSeconds: 1,
    cronMonitorIntervalSeconds: 1,
    cronWorkerIntervalSeconds: 1,
    queueCacheIntervalSeconds: 1,
  });
  retour11.on("error", (e: Error) => alertes.push(e.message));
  await retour11.start();
  verifier(true, "pg-boss 11 redémarre");
  const vus11 = new Set<string>();
  await retour11.work(JOBS.BALAYAGE_PIECE, { pollingIntervalSeconds: 0.5 }, async (taches: { id: string }[]) => {
    for (const t of taches) vus11.add(t.id);
  });
  const apres = (await retour11.send(JOBS.BALAYAGE_PIECE, { versionId: "v11-retour" }))!;
  const limite11 = Date.now() + 8_000;
  while (Date.now() < limite11 && !vus11.has(apres)) await attendre(250);
  await attendre(3_000); // laisser passer maintenance et surveillance des plannings
  verifier(typeof apres === "string" && vus11.has(apres), "il poste et traite comme avant");
  verifier(alertes.length === 0, `sa maintenance tourne sans erreur (${alertes.join(" | ") || "aucune"})`);
  await retour11.stop({ graceful: false, wait: true });

  // ── 9. Retour arrière vers l'image d'avant S.166 ─────────────────
  console.log("\n9. Retour arrière : l'image d'avant S.166 (pg-boss 10) sur « pgboss »");
  const retour10 = new PgBoss10(cible.toString());
  await retour10.start();
  const rejouees = await retour10.fetch(JOBS.BALAYAGE_PIECE, { batchSize: 10 });
  verifier(rejouees.length === 0, `il ne rejoue pas ce qui a été transféré (${rejouees.length})`);
  verifier(typeof (await retour10.send(JOBS.BALAYAGE_PIECE, { versionId: "v10-retour" })) === "string", "et il poste comme avant");
  await retour10.stop({ graceful: false, wait: true });
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
