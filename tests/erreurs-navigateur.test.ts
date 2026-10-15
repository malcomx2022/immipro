import { describe, expect, it } from "vitest";
import { trierErreurs, type RequeteAnnulee } from "./parcours/erreurs-navigateur";

const url = "https://localhost:3163/dossiers?_rsc=synthetique";
const erreur = {
  message: `Fetch API cannot load ${url} due to access control checks.`,
  instant: 1_000,
};
const annulation: RequeteAnnulee = {
  url,
  cause: "cancelled",
  prechargement: true,
  navigation: true,
  instant: 1_010,
};

describe("Recette : aucune erreur d'accès masquée sans preuve d'annulation", () => {
  it.each([
    erreur.message,
    "/localhost:3163/dossiers?_rsc=synthetique due to access control checks.",
  ])("corrèle le préchargement annulé, message complet ou tronqué : %s", (message) => {
    expect(trierErreurs("webkit", [{ ...erreur, message }], [annulation])).toEqual({
      erreursJS: [],
      prechargementsAnnules: [message],
    });
  });
  it.each([
    { cause: "Blocked by CORS policy" },
    { cause: "SSL error" },
    { cause: "" },
    { prechargement: false },
    { navigation: false },
    { instant: 5_000 },
    { url: "https://localhost:3163/autre?_rsc=synthetique" },
  ])("conserve l'erreur lorsque la preuve diffère : %j", (difference) => {
    expect(trierErreurs("webkit", [erreur], [{ ...annulation, ...difference }]).erreursJS).toEqual([
      erreur.message,
    ]);
    const tronquee = {
      ...erreur,
      message: "/localhost:3163/dossiers?_rsc=synthetique due to access control checks.",
    };
    expect(
      trierErreurs("webkit", [tronquee], [{ ...annulation, ...difference }]).erreursJS,
    ).toEqual([tronquee.message]);
  });
  it("ne dispense aucun autre moteur ni une requête active", () => {
    expect(trierErreurs("firefox", [erreur], [annulation]).erreursJS).toEqual([erreur.message]);
    expect(trierErreurs("webkit", [erreur], []).erreursJS).toEqual([erreur.message]);
  });
  it("conserve toute autre erreur JavaScript", () => {
    const autre = { message: "Erreur de rendu", instant: 1_000 };
    expect(trierErreurs("webkit", [autre], [annulation]).erreursJS).toEqual([autre.message]);
  });
});
