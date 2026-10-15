import type { Page } from "@playwright/test";

export interface ErreurNavigateur {
  message: string;
  instant: number;
}
export interface RequeteAnnulee {
  url: string;
  cause: string;
  prechargement: boolean;
  navigation: boolean;
  instant: number;
}

/** Une erreur d'accès seule ne prouve jamais une annulation de navigation. */
export function trierErreurs(
  moteur: string,
  erreurs: ErreurNavigateur[],
  echecs: RequeteAnnulee[],
) {
  const annulee = (e: ErreurNavigateur) => {
    if (moteur !== "webkit") return false;
    const url = /(https?:\/\/\S+) due to access control checks\.$/u.exec(e.message)?.[1];
    if (!url || !new URL(url).searchParams.has("_rsc")) return false;
    return echecs.some(
      (r) =>
        r.url === url &&
        r.prechargement &&
        r.navigation &&
        /cancel(?:led|ed)|abort|interrupted/iu.test(r.cause) &&
        Math.abs(r.instant - e.instant) <= 2_000,
    );
  };
  return {
    erreursJS: erreurs.filter((e) => !annulee(e)).map((e) => e.message),
    prechargementsAnnules: erreurs.filter(annulee).map((e) => e.message),
  };
}

/** Recueille les deux événements, quel que soit leur ordre d'arrivée. */
export function suivreErreurs(page: Page, moteur: string) {
  const erreurs: ErreurNavigateur[] = [];
  const echecs: Omit<RequeteAnnulee, "navigation">[] = [];
  const navigations: number[] = [];
  page.on("request", (r) => {
    if (r.isNavigationRequest() && r.frame() === page.mainFrame()) navigations.push(Date.now());
  });
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) navigations.push(Date.now());
  });
  page.on("pageerror", (e) => erreurs.push({ message: e.message, instant: Date.now() }));
  page.on("requestfailed", (r) => {
    const instant = Date.now();
    const h = r.headers();
    echecs.push({
      url: r.url(),
      cause: r.failure()?.errorText ?? "",
      prechargement:
        h["next-router-prefetch"] === "1" ||
        h.purpose === "prefetch" ||
        h["sec-purpose"] === "prefetch",
      instant,
    });
  });
  return () => {
    const requetes = echecs.map((r) => ({
      ...r, navigation: navigations.some((n) => Math.abs(r.instant - n) <= 2_000),
    }));
    return {
      ...trierErreurs(moteur, erreurs, requetes),
      observationsPrechargements: requetes.filter((r) => r.prechargement),
    };
  };
}
