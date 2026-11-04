/**
 * Compare les jetons mesurés par le banc aux jetons facturés — S.213.
 *
 *     npm run banc:ia:comparer -- \
 *       --facture releve-facture-2026-10-28.json \
 *       --appels docs/revue/preuves-l5-vertex-2026-10-16/passage-2026-10-28-L01-R03/appels.json,…
 *
 * Le relevé de facture est écrit à la main depuis la facturation par SKU
 * de la console (la métrique par minute ne fait pas foi pour les jetons) :
 *
 *     { "periode": "2026-10-28", "projet": "projetanatt",
 *       "entree": 21986, "sortie": 3201,
 *       "source": "Facturation, SKU Gemini 3.8 Flash, relevé le 29/10" }
 *
 * Aucun réseau, aucune écriture. Code de sortie 2 si un écart dépasse 5 %
 * ou si un appel n'a pas de mesure connue.
 */
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { z } from "zod";
import { comparerALaFacture, SEUIL_ECART_FACTURE, type AppelMesure } from "@/domain/banc-ia/facture";

const { values: options } = parseArgs({
  options: { facture: { type: "string" }, appels: { type: "string" } },
});

const arreter = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const entier = z.number().int().nonnegative();
const Releve = z.object({
  periode: z.string().min(1),
  projet: z.string().min(1),
  entree: entier,
  sortie: entier,
  source: z.string().min(10),
});
const Appels = z.array(
  z.object({
    cas: z.string(),
    fonction: z.string(),
    mesure: z.object({
      etat: z.string(),
      jetonsEntree: z.number().nullable(),
      jetonsSortie: z.number().nullable(),
    }),
  }),
);

if (!options.facture || !options.appels) {
  arreter("Usage : --facture <relevé.json> --appels <appels.json>[,<appels.json>…]");
}
const releve = Releve.safeParse(JSON.parse(await readFile(options.facture!, "utf8")));
if (!releve.success) {
  arreter(`Relevé de facture refusé : il faut periode, projet, entree, sortie (entiers) et source. ${releve.error.message}`);
}
const appels: AppelMesure[] = [];
for (const fichier of options.appels!.split(",").map((f) => f.trim()).filter(Boolean)) {
  const lus = Appels.safeParse(JSON.parse(await readFile(fichier, "utf8")));
  if (!lus.success) arreter(`${fichier} n'a pas la forme d'un appels.json du banc.`);
  appels.push(...lus.data!);
}

const r = comparerALaFacture(appels, releve.data!);
console.log(`Période ${releve.data!.periode}, projet ${releve.data!.projet} — ${releve.data!.source}`);
console.log(`${r.appelsComptes} appel(s) mesuré(s) ; seuil ${SEUIL_ECART_FACTURE * 100} %.`);
for (const l of r.lignes) {
  const relatif = l.ecartRelatif === null ? "—" : `${(l.ecartRelatif * 100).toFixed(1)} %`;
  console.log(`  ${l.grandeur.padEnd(6)} mesuré ${l.mesure} · facturé ${l.facture} · écart ${l.ecart} (${relatif})${l.signale ? "  ⚠" : ""}`);
}
for (const c of r.constats) console.log(`⚠ ${c}`);
if (!r.aRapprocher) console.log("Écarts sous le seuil : mesure et facture concordent.");
process.exitCode = r.aRapprocher ? 2 : 0;
