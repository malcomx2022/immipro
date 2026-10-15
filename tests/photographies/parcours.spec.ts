import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { PHOTOS } from "../../src/lib/photographies";
import { preparerContenus } from "./fixtures";

test.beforeAll(preparerContenus);

const pages: [string, string | null][] = [
  ["/", "accueil"],
  ["/comment-ca-marche", "preparation"],
  ["/destinations", null],
  ["/destinations/pays-bas", "pays-bas"],
  ["/destinations/suisse", "suisse"],
  ["/guides", null],
  ["/guides/pays-bas", "pays-bas"],
  ["/guides/suisse", "suisse"],
  ["/articles", null],
  ["/articles/releve-bancaire-quatre-mois", "preparation"],
  ["/articles/relire-ses-documents", "accompagnement"],
];

for (const [route, principale] of pages) {
  test(`rendu et médias livrés : ${route}`, async ({ page, viewport }, info) => {
    const erreurs: string[] = [];
    const echecs: string[] = [];
    page.on("pageerror", (e) => erreurs.push(e.message));
    page.on("response", (r) => {
      if (r.url().includes("/photos/") && !r.ok()) echecs.push(`${r.status()} ${r.url()}`);
    });
    await page.addInitScript(() => {
      const cible = window as Window & {
        mesurePhotos?: { lcp: number | null; cls: number | null };
      };
      cible.mesurePhotos = { lcp: null, cls: null };
      if (PerformanceObserver.supportedEntryTypes.includes("largest-contentful-paint")) {
        new PerformanceObserver((l) => {
          cible.mesurePhotos!.lcp = l.getEntries().at(-1)!.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
      }
      if (PerformanceObserver.supportedEntryTypes.includes("layout-shift")) {
        cible.mesurePhotos.cls = 0;
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) {
            const v = e as PerformanceEntry & { hadRecentInput: boolean; value: number };
            if (!v.hadRecentInput) cible.mesurePhotos!.cls! += v.value;
          }
        }).observe({ type: "layout-shift", buffered: true });
      }
    });
    const reponse = await page.goto(route, { waitUntil: "networkidle" });
    expect(reponse?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const initial = await page.evaluate(() => ({
      navigateur: (window as Window & { mesurePhotos?: { lcp: number | null; cls: number | null } })
        .mesurePhotos,
      ressources: performance.getEntriesByType("resource").map((v) => {
        const r = v as PerformanceResourceTiming;
        return {
          chemin: new URL(r.name).pathname,
          transfere: r.transferSize,
          encode: r.encodedBodySize,
        };
      }),
    }));
    if (initial.navigateur?.cls !== null && initial.navigateur?.cls !== undefined)
      expect(initial.navigateur.cls).toBeLessThanOrEqual(0.1);
    const photos = page.locator("picture[data-photo]");
    expect(await photos.count()).toBeGreaterThan(0);
    for (const img of await photos.locator("img").all()) {
      await img.scrollIntoViewIfNeeded();
      await expect(img).toHaveJSProperty("complete", true);
      expect(await img.evaluate((e) => (e as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      const src = await img.evaluate((e) => (e as HTMLImageElement).currentSrc);
      expect(new URL(src).origin).toBe(new URL(page.url()).origin);
      expect(src).toMatch(/\/photos\/[a-z-]+-(mobile|bureau|vignette)\.webp$/u);
      const dimensions = src.endsWith("-vignette.webp")
        ? [320, 213]
        : src.endsWith("-mobile.webp")
          ? [780, 520]
          : [1536, 1024];
      expect(
        await img.evaluate((e) => [
          (e as HTMLImageElement).naturalWidth,
          (e as HTMLImageElement).naturalHeight,
        ]),
      ).toEqual(dimensions);
    }
    if (principale) {
      const img = page.locator(`picture[data-photo="${principale}"] img`).first();
      expect(await img.evaluate((e) => (e as HTMLImageElement).currentSrc)).toContain(
        `-${viewport!.width < 768 ? "mobile" : "bureau"}.webp`,
      );
    }
    if (route.startsWith("/destinations/")) {
      await expect(page.getByText(/^Source officielle/u).first()).toBeVisible();
      const date = page.getByText(/^Vérifiée le/u).first();
      await expect(date).toBeVisible();
      const d = (await date.boundingBox())!;
      const p = (await page.locator("picture[data-photo]").first().boundingBox())!;
      expect(d.y + d.height).toBeLessThan(p.y);
    }
    if (route.startsWith("/guides/") || route.startsWith("/articles/")) {
      await expect(page.getByText(/^Information vérifiée le/u).first()).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport!.width);
    expect(erreurs).toEqual([]);
    expect(echecs).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    if (info.project.name.startsWith("chromium"))
      await page.screenshot({ path: info.outputPath("rendu.png"), fullPage: true });
    const mesures = await page.evaluate(() => ({
      navigateur: (window as Window & { mesurePhotos?: unknown }).mesurePhotos,
      ressources: performance.getEntriesByType("resource").map((v) => {
        const r = v as PerformanceResourceTiming;
        return {
          chemin: new URL(r.name).pathname,
          transfere: r.transferSize,
          encode: r.encodedBodySize,
        };
      }),
    }));
    const relevé = info.outputPath("mesures.json");
    writeFileSync(relevé, JSON.stringify({ initial, apresDefilement: mesures }, null, 2));
    await info.attach("mesures", { path: relevé, contentType: "application/json" });
  });
}

test("l'accueil préserve le simulateur, son stockage et le bouton au clavier", async ({
  page,
  viewport,
}) => {
  const requetes: string[] = [];
  page.on("request", (r) => requetes.push(r.url()));
  await page.goto("/", { waitUntil: "networkidle" });
  const bouton = page.getByRole("button", { name: "Voir mes destinations", exact: true });
  const image = page.locator('picture[data-photo="accueil"]');
  if (viewport!.width === 390) {
    const b = (await bouton.boundingBox())!;
    const p = (await image.boundingBox())!;
    expect(b.y + b.height).toBeLessThan(p.y);
    expect(b.y + b.height).toBeLessThan(viewport!.height);
    expect(requetes.some((r) => r.includes("accueil-bureau.webp"))).toBe(false);
  } else {
    const b = (await bouton.boundingBox())!;
    const p = (await image.boundingBox())!;
    expect(p.x).toBeGreaterThan(b.x + b.width);
  }
  await page.getByRole("button", { name: /Objectif/u }).click();
  await page.getByRole("button", { name: "Étudier", exact: true }).click();
  await bouton.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/simulateur$/u);
  await expect(page.getByRole("radio", { name: /^Étudier/u })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("un article sans association reste lisible, un contenu retiré ou brouillon reste absent", async ({
  page,
}) => {
  const r = await page.goto("/articles/photo-sans-association");
  expect(r?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("sans photographie");
  await expect(page.locator("picture[data-photo]")).toHaveCount(0);
  for (const route of ["/articles/preparer-ses-pieces", "/guides/recette-brouillon"]) {
    expect((await page.goto(route))?.status()).toBe(404);
    await expect(page.locator("picture[data-photo]")).toHaveCount(0);
  }
});

test("les écrans de travail conservent leurs illustrations, les actifs ont les dimensions attendues", async ({
  page,
  request,
}) => {
  for (const route of ["/tarifs", "/simulateur", "/connexion", "/inscription", "/verification"]) {
    await page.goto(route);
    await expect(page.locator("picture[data-photo]")).toHaveCount(0);
  }
  for (const photo of Object.values(PHOTOS)) {
    for (const format of ["bureau", "mobile", "vignette"] as const) {
      const r = await request.get(photo[format]);
      expect(r.status()).toBe(200);
      expect(r.headers()["content-type"]).toContain("image/webp");
      expect((await r.body()).byteLength).toBeLessThan(format === "vignette" ? 24_000 : 120_000);
      const dimensions = await page.evaluate(
        (src) =>
          new Promise<number[]>((ok, non) => {
            const i = new Image();
            i.onload = () => ok([i.naturalWidth, i.naturalHeight]);
            i.onerror = () => non(new Error("Décodage de l'image locale refusé"));
            i.src = src;
          }),
        photo[format],
      );
      expect(dimensions).toEqual(
        format === "vignette" ? [320, 213] : format === "mobile" ? [780, 520] : [1536, 1024],
      );
    }
  }
});
