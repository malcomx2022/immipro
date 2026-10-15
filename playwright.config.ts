import { defineConfig } from "@playwright/test";

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
  testDir: "./tests/photographies",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  outputDir: "test-results/photographies",
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: "https://localhost:3173",
    // Certificat éphémère du seul proxy local de recette, jamais en production.
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
        "mkdir -p .recette && npm run recette:banc -- --port 3172 --base immipro_recette_photos > .recette/photos-banc.log 2>&1",
      url: "http://localhost:3172",
      timeout: 120_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    },
    {
      command: "node tests/photographies/https-local.mjs",
      url: "https://localhost:3173",
      ignoreHTTPSErrors: true,
      timeout: 15_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
  ],
});
