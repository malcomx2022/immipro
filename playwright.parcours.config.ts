import { defineConfig } from "@playwright/test";

/**
 * Recette L6 — parcours candidat et back-office authentifiés, sur la vraie
 * application, le vrai worker et une base PostgreSQL jetable, avec les seuls
 * fournisseurs scriptés du banc `--parcours` (IA et checkout sur la boucle
 * locale). Aucun prestataire réel : cette recette ne qualifie ni L5 ni un
 * encaissement. Six profils, comme les photographies (S.179).
 */

// Le banc recrée sa base : refuser un serveur distant avant son lancement.
let serveurLocal = false;
try {
  serveurLocal = ["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(process.env.DATABASE_URL ?? "").hostname,
  );
} catch {
  /* configuration absente */
}
if (!serveurLocal)
  throw new Error(
    "DATABASE_URL doit désigner un serveur PostgreSQL de recette sur la boucle locale.",
  );

export default defineConfig({
  testDir: "./tests/parcours",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Chaque geste attend ses effets réels : antivirus, worker, lecture scriptée ;
  // les exécuteurs de la porte sont plus lents que le poste de développement.
  timeout: 180_000,
  outputDir: "test-results/parcours",
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report-parcours", open: "never" }],
  ],
  use: {
    // Un geste qui n'aboutit pas en trente secondes est un échec lisible,
    // jamais une attente jusqu'au délai du scénario.
    actionTimeout: 30_000,
    baseURL: "https://localhost:3163",
    // Certificat éphémère des deux relais locaux de recette, jamais en production.
    ignoreHTTPSErrors: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: ["chromium", "firefox", "webkit"].flatMap((browserName) =>
    [390, 1440].map((width) => ({
      name: `${browserName}-${width}`,
      use: {
        browserName: browserName as "chromium" | "firefox" | "webkit",
        viewport: { width, height: width === 390 ? 844 : 1000 },
        ...(browserName === "chromium" && process.env.CHROMIUM_EXECUTABLE_PATH
          ? { launchOptions: { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } }
          : {}),
      },
    })),
  ),
  webServer: [
    {
      command:
        "mkdir -p .recette && npm run recette:banc -- --port 3162 --base immipro_recette_parcours --parcours --stockage-public https://localhost:3164 > .recette/parcours-banc.log 2>&1",
      url: "http://localhost:3162",
      timeout: 120_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    },
    {
      command: "node tests/photographies/https-local.mjs",
      env: {
        PORT_HTTPS: "3163",
        PORT_AMONT: "3162",
        PORT_STOCKAGE_HTTPS: "3164",
        BANC_LOG: ".recette/parcours-banc.log",
      },
      url: "https://localhost:3163",
      ignoreHTTPSErrors: true,
      timeout: 15_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
  ],
});
