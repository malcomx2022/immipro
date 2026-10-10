import type PgBoss from "pg-boss";
import { db } from "@/lib/db";
import {
  ETATS_A_TRANSFERER,
  MENTION_DU_TRANSFERT,
  VERSION_DU_SCHEMA_PGBOSS_10,
  transfertDe,
  type TacheDePgBoss10,
} from "@/domain/exploitation/bascule-des-files";

/**
 * Repose dans le schéma neuf ce qui attendait dans celui de pg-boss 10 —
 * S.166. La règle est dans `domain/exploitation/bascule-des-files.ts`.
 *
 * Le processus web et le worker démarrent tous deux leurs files ; le
 * premier qui passe transfère, sous un verrou consultatif, et le second
 * ne trouve plus rien. Une interruption entre l'envoi et la marque est
 * sans effet : l'envoi est refusé la seconde fois (même identifiant), et
 * la marque se pose alors.
 */
export async function transfererLesTachesDePgBoss10(
  instance: Pick<PgBoss, "send">,
  files: readonly string[],
  journal: (ligne: string) => void = (ligne) => console.log(ligne),
  maintenant: Date = new Date(),
): Promise<{ transferees: number; dejaPresentes: number }> {
  const [schema] = await db.$queryRaw<{ present: boolean }[]>`
    SELECT to_regclass('pgboss.version') IS NOT NULL AS present`;
  if (!schema?.present) return { transferees: 0, dejaPresentes: 0 };

  const [version] = await db.$queryRaw<{ version: number }[]>`
    SELECT version::int AS version FROM pgboss.version LIMIT 1`;
  // Un schéma `pgboss` qui ne serait plus celui de la version 10 n'est pas
  // le nôtre à vider.
  if (!version || version.version > VERSION_DU_SCHEMA_PGBOSS_10) return { transferees: 0, dejaPresentes: 0 };

  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('immipro.transfert-pgboss10'))`;
      const taches = await tx.$queryRaw<TacheDePgBoss10[]>`
        SELECT id::text AS id, name, data, state::text AS state, priority,
               start_after AS "startAfter", singleton_key AS "singletonKey"
          FROM pgboss.job
         WHERE name = ANY(${[...files]}::text[])
           AND state::text = ANY(${[...ETATS_A_TRANSFERER]}::text[])
         ORDER BY created_on`;

      let transferees = 0;
      let dejaPresentes = 0;
      for (const tache of taches) {
        const { file, donnees, options } = transfertDe(tache, maintenant);
        const id = await instance.send(file, donnees, options);
        if (id === null) dejaPresentes++;
        else transferees++;
        await tx.$executeRaw`
          UPDATE pgboss.job
             SET state = 'cancelled', completed_on = now(),
                 output = ${JSON.stringify(MENTION_DU_TRANSFERT)}::jsonb
           WHERE name = ${tache.name} AND id = ${tache.id}::uuid
             AND state::text = ANY(${[...ETATS_A_TRANSFERER]}::text[])`;
      }
      if (taches.length > 0) {
        journal(
          `[files] pg-boss 10 → schéma neuf : ${transferees} tâche(s) reposée(s), ${dejaPresentes} déjà présente(s).`,
        );
      }
      return { transferees, dejaPresentes };
    },
    { maxWait: 30_000, timeout: 120_000 },
  );
}
