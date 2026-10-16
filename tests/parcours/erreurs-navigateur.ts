import type { Page } from "@playwright/test";

export interface ErreurNavigateur {
  message: string;
  instant: number;
}
/** Une requête de préchargement Next observée sur le réseau, avec son issue. */
export interface Prechargement {
  url: string;
  instant: number;
  issue: "terminee" | "echouee" | "sans issue";
  cause: string;
  statut: number | null;
}

const SUFFIXE = " due to access control checks.";
const PREFIXE = "Fetch API cannot load ";
const FENETRE_MS = 2_000;

/**
 * L'URL que WebKit désigne dans son message, ou `null` si le message n'a pas
 * la forme d'un échec de chargement. WebKit/Playwright livre tantôt l'URL
 * complète, tantôt sa forme tronquée `/hôte/chemin?requête` (sans `https:`) ;
 * la forme tronquée n'est complétée qu'avec le schéma de l'origine attendue,
 * jamais devinée au-delà.
 */
function urlDuMessage(message: string, origine: URL): URL | null {
  if (!message.endsWith(SUFFIXE)) return null;
  let texte = message.slice(0, -SUFFIXE.length);
  if (texte.startsWith(PREFIXE)) texte = texte.slice(PREFIXE.length);
  if (texte.startsWith("//") || texte.includes(" ")) return null;
  if (texte.startsWith("/")) texte = `${origine.protocol}/${texte}`;
  try {
    return new URL(texte);
  } catch {
    return null;
  }
}

/**
 * WebKit remonte comme erreur de page un préchargement Next (`_rsc`) que la
 * navigation suivante interrompt ; Chromium et Firefox le voient comme une
 * requête annulée. WebKit n'émet pas d'événement réseau pour chacun de ces
 * préchargements interrompus (porte du 15/10 : un sur deux à 390 px, aucun
 * des treize à 1 440 px) ; la preuve exigée est donc celle que le navigateur
 * fournit toujours : le message désigne l'origine même de l'application et
 * un préchargement Next, et une navigation principale a eu lieu dans les
 * deux secondes. Une erreur vers une autre origine (CORS), sans `_rsc`, hors
 * navigation, d'un autre moteur ou de toute autre forme reste bloquante.
 */
export function trierErreurs(
  moteur: string,
  origine: string,
  erreurs: ErreurNavigateur[],
  navigations: number[],
) {
  const attendue = new URL(origine);
  const annulee = (e: ErreurNavigateur) => {
    if (moteur !== "webkit") return false;
    const cible = urlDuMessage(e.message, attendue);
    if (!cible || cible.origin !== attendue.origin || !cible.searchParams.has("_rsc")) return false;
    return navigations.some((n) => Math.abs(n - e.instant) <= FENETRE_MS);
  };
  return {
    erreursJS: erreurs.filter((e) => !annulee(e)).map((e) => e.message),
    prechargementsAnnules: erreurs.filter(annulee).map((e) => e.message),
  };
}

/** Recueille erreurs, navigations et préchargements, quel que soit leur ordre. */
export function suivreErreurs(page: Page, moteur: string, origine: string) {
  const erreurs: ErreurNavigateur[] = [];
  const navigations: number[] = [];
  const prechargements = new Map<string, Prechargement>();
  const cle = (r: { url(): string }, instant: number) => `${instant}:${r.url()}`;
  const suivis = new WeakMap<object, string>();
  page.on("request", (r) => {
    const instant = Date.now();
    if (r.isNavigationRequest() && r.frame() === page.mainFrame()) navigations.push(instant);
    const h = r.headers();
    if (
      h["next-router-prefetch"] === "1" ||
      h.purpose === "prefetch" ||
      h["sec-purpose"] === "prefetch"
    ) {
      const id = cle(r, instant);
      suivis.set(r, id);
      prechargements.set(id, {
        url: r.url(),
        instant,
        issue: "sans issue",
        cause: "",
        statut: null,
      });
    }
  });
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) navigations.push(Date.now());
  });
  page.on("pageerror", (e) => erreurs.push({ message: e.message, instant: Date.now() }));
  page.on("requestfinished", async (r) => {
    const id = suivis.get(r);
    const p = id ? prechargements.get(id) : undefined;
    if (!p) return;
    p.issue = "terminee";
    p.statut = (await r.response().catch(() => null))?.status() ?? null;
  });
  page.on("requestfailed", (r) => {
    const id = suivis.get(r);
    const p = id ? prechargements.get(id) : undefined;
    if (!p) return;
    p.issue = "echouee";
    p.cause = r.failure()?.errorText ?? "";
  });
  return () => ({
    ...trierErreurs(moteur, origine, erreurs, navigations),
    observationsPrechargements: [...prechargements.values()],
  });
}
