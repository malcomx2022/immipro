/** Garde de publication : vraie route, acteur et adaptateur injectés.
 * Complète le vrai POST sans prétendre tester ses gardes HTTP. */
import { build } from "esbuild";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { PrismaClient } from "@prisma/client";
import { CAS_AVIS_IA } from "../../tests/fixtures/avis-ia";

export async function recetteGardeDesAvis(
  db: PrismaClient,
  applicationId: string,
  documentId: string,
  userId: string,
): Promise<void> {
  await mkdir(".recette", { recursive: true });
  const temp = await mkdtemp(resolve(".recette/avis-"));
  const anciennes = {
    AI_FOURNISSEUR_REDACTION: process.env.AI_FOURNISSEUR_REDACTION,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  };
  // Le service est injecté ; la vraie vérification de configuration reste
  // exécutée. Ces valeurs synthétiques sont restaurées à la sortie.
  process.env.AI_FOURNISSEUR_REDACTION = "anthropic";
  process.env.ANTHROPIC_API_KEY = "synthetique";
  let module:
    | {
        db: PrismaClient;
        POST: { traiter(c: unknown): Promise<{ relue: boolean; remarques: null; motif: string }> };
        poserAvis(v: unknown): void;
      }
    | undefined;
  const exige = (v: boolean, message: string) => {
    if (!v) throw new Error(message);
    console.log(`✓ garde de publication : ${message}`);
  };
  try {
    const fichier = join(temp, "route.mjs");
    await build({
      stdin: {
        contents:
          'export { POST } from "./src/app/api/dossiers/[id]/redaction/[type]/relecture/route"; export { db } from "./src/lib/db"; export { poserAvis } from "@/server/redaction/service";',
        resolveDir: process.cwd(),
      },
      bundle: true,
      packages: "external",
      platform: "node",
      format: "esm",
      outfile: fichier,
      plugins: [
        {
          name: "contrat-dadaptateur-injecte",
          setup(b) {
            b.onResolve({ filter: /^@\/server\/(http\/route|redaction\/service)$/ }, (args) => ({
              path: args.path,
              namespace: "recette",
            }));
            b.onLoad({ filter: /.*/, namespace: "recette" }, (args) => ({
              loader: "js",
              contents: args.path.endsWith("http/route")
                ? "export const route = definition => definition;"
                : "let avis; export const poserAvis = v => {avis = v}; export const laCritique = () => async () => avis;",
            }));
          },
        },
      ],
    });
    module = await import(pathToFileURL(fichier).href);
    if (!module) throw new Error("Traitement compilé absent.");
    const derniere = await db.documentVersion.findFirstOrThrow({
      where: { documentId },
      orderBy: { rank: "desc" },
    });
    const version = await db.documentVersion.create({
      data: {
        documentId,
        rank: derniere.rank + 1,
        body: derniere.body,
        wordCount: derniere.wordCount,
      },
    });
    for (const nom of ["liste mixte", "promesse dans une valeur"]) {
      const cas = CAS_AVIS_IA.find((c) => c.nom === nom)!;
      module.poserAvis({
        etat: "RELUE",
        remarques: (cas.charge as { remarques: unknown }).remarques,
        jetonsEntree: 120,
        jetonsSortie: 30,
        appel: {
          fournisseur: "openai_compatible",
          modele: "adaptateur-injecte",
          mesure: { etat: "CONNUE", jetonsEntree: 120, jetonsSortie: 30 },
        },
      });
      const avant = await db.analysisCredit.findMany({ where: { applicationId } });
      const ids = new Set(avant.map((l) => l.id));
      const reponse = await module.POST.traiter({
        params: { id: applicationId, type: "lettre-motivation" },
        acteur: { id: userId },
      });
      exige(
        reponse.relue === false &&
          reponse.remarques === null &&
          reponse.motif === (cas.motif ?? "avis_mal_forme"),
        `${nom}, même si l'adaptateur annonce RELUE`,
      );
      const apres = await db.documentVersion.findUniqueOrThrow({
        where: { id: version.id },
        include: { findings: true },
      });
      exige(
        apres.critiquedAt === null && apres.findings.length === 0 && apres.body === version.body,
        `${nom}, aucune publication ni modification du texte`,
      );
      const mouvements = await db.analysisCredit.findMany({ where: { applicationId } });
      const nouveaux = mouvements.filter((l) => !ids.has(l.id));
      exige(
        nouveaux.length === 2 &&
          nouveaux.filter((l) => l.delta === -1 && l.reservedUntil === null).length === 1 &&
          nouveaux.filter((l) => l.delta === 1).length === 1 &&
          mouvements.reduce((n, l) => n + l.delta, 0) === avant.reduce((n, l) => n + l.delta, 0),
        `${nom}, réservation rendue une fois`,
      );
    }
  } finally {
    for (const [cle, valeur] of Object.entries(anciennes)) {
      if (valeur === undefined) delete process.env[cle];
      else process.env[cle] = valeur;
    }
    await module?.db.$disconnect();
    await rm(temp, { recursive: true, force: true });
  }
}
