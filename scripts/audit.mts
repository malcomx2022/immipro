#!/usr/bin/env tsx
/**
 * Porte de l'audit des dépendances — revue du 07/10/2026, audit.
 *
 * Lit `npm audit --omit=dev` (ce qui part en production) et le juge au
 * regard de `audit-exceptions.json` : toute vulnérabilité élevée ou
 * critique sans exception motivée fait échouer la porte. Le jugement vit
 * dans `src/domain/exploitation/audit.ts`.
 *
 *     npm run check:audit        le registre npm doit être joignable
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  jugerLAudit,
  LIBELLE_DE_GRAVITE,
  type Avis,
  type ExceptionDAudit,
  type Gravite,
  type RapportDAudit,
} from "../src/domain/exploitation/audit";

const ligne = (a: Avis) =>
  `${a.paquet} ${a.plage} — ${LIBELLE_DE_GRAVITE[a.gravite as Gravite] ?? a.gravite} — ${a.id} : ${a.titre}`;

const audit = spawnSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8" });
let rapport: (RapportDAudit & { error?: { summary?: string } }) | null = null;
try {
  rapport = JSON.parse(audit.stdout);
} catch {
  rapport = null;
}
if (!rapport || rapport.error) {
  const cause = rapport?.error?.summary ?? audit.stderr?.trim().split("\n").at(-1) ?? "réponse illisible";
  console.error(
    `L'audit n'a pas pu lire le registre npm (${cause}). Vérifier l'accès réseau et relancer : une porte qui ne voit rien ne laisse rien passer.`,
  );
  process.exit(1);
}

const fichier = JSON.parse(readFileSync("audit-exceptions.json", "utf8")) as {
  exceptions?: ExceptionDAudit[];
};
const verdict = jugerLAudit(rapport, fichier.exceptions ?? []);

for (const a of verdict.affiches) console.log(`  · ${ligne(a)}`);
for (const a of verdict.toleres) console.log(`  ~ ${ligne(a)} (acceptée, audit-exceptions.json)`);
for (const a of verdict.bloquants) console.log(`  ✗ ${ligne(a)}`);
for (const f of verdict.fautes) console.log(`  ✗ ${f}`);

if (verdict.bloquants.length > 0) {
  console.log(
    `\n${verdict.bloquants.length} vulnérabilité(s) élevée(s) ou critique(s) sans exception. Mettre la dépendance à jour ; si c'est impossible, motiver l'acceptation dans audit-exceptions.json.`,
  );
}
const echec = verdict.bloquants.length > 0 || verdict.fautes.length > 0;
if (!echec) {
  console.log(
    `\nAucune vulnérabilité élevée ou critique sans motif (${verdict.toleres.length} acceptée(s), ${verdict.affiches.length} modérée(s) ou moindre(s) affichée(s)).`,
  );
}
process.exit(echec ? 1 : 0);
