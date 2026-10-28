/**
 * Consigne le rapprochement d'un appel Vertex resté sans mesure (S.201).
 *
 *     npm run banc:ia:rapprocher -- \
 *       --campagne-vertex docs/revue/preuves-l5-vertex-2026-10-16/campagne.json \
 *       --appel L06/extraction --constat NON_FACTUREE \
 *       --source "Console projetanatt, journal des requêtes du 28/10…"
 *
 *     # requête facturée : la mesure relevée dans la console
 *     … --constat FACTUREE --entree 1136 --sortie 35 --source "…"
 *
 * Aucun réseau. Lève seulement `MESURE_A_RAPPROCHER` ; la réserve prudente
 * reste comptée. Une mesure au-delà d'une borne garde la campagne arrêtée.
 */
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { lireCampagneVertex } from "@/domain/banc-ia/campagne-vertex";
import { BudgetVertex } from "./budget-vertex";

const { values: options } = parseArgs({
  options: {
    "campagne-vertex": { type: "string" },
    appel: { type: "string" },
    constat: { type: "string" },
    entree: { type: "string" },
    sortie: { type: "string" },
    source: { type: "string" },
  },
});

const arreter = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const nombre = (brut: string | undefined): number | null =>
  brut === undefined
    ? null
    : /^\d+$/u.test(brut)
      ? Number(brut)
      : arreter(`Nombre de jetons illisible : ${brut}`);

if (!options["campagne-vertex"] || !options.appel || !options.source)
  arreter("--campagne-vertex, --appel et --source sont obligatoires.");
if (options.constat !== "NON_FACTUREE" && options.constat !== "FACTUREE")
  arreter("--constat vaut NON_FACTUREE ou FACTUREE.");

const campagne = lireCampagneVertex(
  JSON.parse(await readFile(options["campagne-vertex"]!, "utf8")),
);
const racine = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
try {
  const etat = await BudgetVertex.rapprocher(
    path.join(racine, ".qualification-vertex", campagne.id),
    campagne,
    {
      appel: options.appel!,
      constat: options.constat as "NON_FACTUREE" | "FACTUREE",
      jetonsEntree: nombre(options.entree),
      jetonsSortie: nombre(options.sortie),
      source: options.source!,
    },
  );
  console.log(
    etat.blocage
      ? `Rapprochement consigné ; campagne toujours arrêtée : ${etat.blocage}.`
      : "Rapprochement consigné ; la campagne peut reprendre.",
  );
  console.log(
    `Réserve prudente : ${(etat.reserveMicrosXof / 1_000_000).toFixed(2)} XOF pour ${etat.appelsReserves} invocations.`,
  );
} catch (e) {
  arreter((e as Error).message);
}
