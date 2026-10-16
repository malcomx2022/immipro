import { describe, expect, it } from "vitest";
import { trierErreurs } from "./parcours/erreurs-navigateur";

const origine = "https://localhost:3163";
const url = `${origine}/dossiers?_rsc=synthetique`;
const complete = {
  message: `Fetch API cannot load ${url} due to access control checks.`,
  instant: 1_000,
};
const tronquee = {
  message: "/localhost:3163/dossiers?_rsc=synthetique due to access control checks.",
  instant: 1_000,
};
const navigation = [1_010];

describe("Recette : aucune erreur d'accès masquée sans préchargement Next interrompu par une navigation", () => {
  it.each([complete, tronquee])(
    "classe un préchargement de l'application interrompu par une navigation : %j",
    (erreur) => {
      expect(trierErreurs("webkit", origine, [erreur], navigation)).toEqual({
        erreursJS: [],
        prechargementsAnnules: [erreur.message],
      });
    },
  );
  it("porte du 15/10 : le préchargement interrompu n'a laissé aucune trace réseau, la navigation suffit", () => {
    // Deux liens vers la même page, un seul événement `requestfailed` : le
    // second préchargement n'était visible que par son message d'erreur.
    const sansTrace = {
      message: "/localhost:3163/paiement/pack?_rsc=qhpdL45C1tHPHIWG due to access control checks.",
      instant: 1_792_102_105_170,
    };
    expect(trierErreurs("webkit", origine, [sansTrace], [1_792_102_105_173]).erreursJS).toEqual([]);
  });
  it.each([
    [
      "autre origine : une vraie erreur CORS",
      `Fetch API cannot load https://cdn.exemple.test/dossiers?_rsc=x${" due to access control checks."}`,
    ],
    [
      "autre origine, forme tronquée",
      "/cdn.exemple.test/dossiers?_rsc=x due to access control checks.",
    ],
    [
      "sans paramètre _rsc : pas un préchargement Next",
      `Fetch API cannot load ${origine}/api/comptes due to access control checks.`,
    ],
    ["schéma relatif ambigu", "//localhost:3163/dossiers?_rsc=x due to access control checks."],
    [
      "texte qui n'est pas une URL",
      "Fetch API cannot load n'importe quoi due to access control checks.",
    ],
  ])("reste bloquante — %s", (_motif, message) => {
    expect(
      trierErreurs("webkit", origine, [{ message, instant: 1_000 }], navigation).erreursJS,
    ).toEqual([message]);
  });
  it.each([[[]], [[4_000]], [[-1_500]]])(
    "reste bloquante sans navigation principale dans les deux secondes : %j",
    (navigations) => {
      expect(trierErreurs("webkit", origine, [complete, tronquee], navigations).erreursJS).toEqual([
        complete.message,
        tronquee.message,
      ]);
    },
  );
  it("admet la navigation juste avant comme juste après l'erreur", () => {
    expect(trierErreurs("webkit", origine, [complete], [-900]).erreursJS).toEqual([]);
    expect(trierErreurs("webkit", origine, [complete], [2_900]).erreursJS).toEqual([]);
    expect(trierErreurs("webkit", origine, [complete], [3_100]).erreursJS).toEqual([
      complete.message,
    ]);
  });
  it("ne dispense aucun autre moteur", () => {
    expect(trierErreurs("firefox", origine, [complete], navigation).erreursJS).toEqual([
      complete.message,
    ]);
    expect(trierErreurs("chromium", origine, [tronquee], navigation).erreursJS).toEqual([
      tronquee.message,
    ]);
  });
  it("conserve toute autre erreur JavaScript, même pendant une navigation", () => {
    const autre = { message: "Erreur de rendu", instant: 1_000 };
    expect(trierErreurs("webkit", origine, [autre, complete], navigation)).toEqual({
      erreursJS: [autre.message],
      prechargementsAnnules: [complete.message],
    });
  });
});
