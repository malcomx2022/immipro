import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import {
  ACCUEIL_CANDIDAT,
  ACCUEIL_INTERNE,
  EN_TETE_CHEMIN,
  destinationApresConnexion,
  suiteInterne,
} from "@/domain/comptes/suite";
import { config, proxy } from "@/proxy";

/**
 * Relevé au contrôle du 02/10/2026 : `/dossiers/nouveau?destination=suisse`
 * sans session renvoyait vers `/connexion` sans `?suite=`, parce que le
 * gabarit `(dossier)` redirigeait avant la page sans connaître l'adresse.
 */
describe("La suite d'une connexion", () => {
  it("garde une adresse interne, requête comprise", () => {
    expect(suiteInterne("/dossiers/nouveau?destination=suisse")).toBe(
      "/dossiers/nouveau?destination=suisse",
    );
    expect(suiteInterne("/tableau-de-bord")).toBe("/tableau-de-bord");
  });

  it.each([
    ["absente", null],
    ["vide", ""],
    ["absolue", "https://ailleurs.test/connexion"],
    ["relative au protocole", "//ailleurs.test"],
    ["barre inverse, lue // par les navigateurs", "/\\ailleurs.test"],
    ["relative sans barre", "dossiers"],
    ["caractère de contrôle", "/dossiers\n"],
    ["la connexion elle-même", "/connexion?suite=/profil"],
    ["l'inscription", "/inscription"],
    ["la vérification", "/verification"],
    ["le mot de passe oublié", "/mot-de-passe"],
  ])("refuse une suite %s", (_cas, valeur) => {
    expect(suiteInterne(valeur)).toBeNull();
  });

  it("ne confond pas un écran du compte avec une adresse qui commence pareil", () => {
    expect(suiteInterne("/connexions-partenaires")).toBe("/connexions-partenaires");
  });
});

describe("Le proxy relève l'adresse demandée", () => {
  const entete = (reponse: Response) => reponse.headers.get(`x-middleware-request-${EN_TETE_CHEMIN}`);

  it("pose le chemin et la requête dans un en-tête de requête", () => {
    const reponse = proxy(new NextRequest("https://immipro.app/dossiers/nouveau?destination=suisse"));
    expect(entete(reponse)).toBe("/dossiers/nouveau?destination=suisse");
  });

  it("écrase une valeur fournie par le client", () => {
    const requete = new NextRequest("https://immipro.app/profil", {
      headers: { [EN_TETE_CHEMIN]: "https://ailleurs.test" },
    });
    expect(entete(proxy(requete))).toBe("/profil");
  });

  it("ne s'applique ni à l'API, ni aux fichiers du build, ni à robots.txt", () => {
    const motif = new RegExp(`^${config.matcher[0]!.replace("/((?!", "/(?!").replace(").*)", ").*")}$`);
    for (const chemin of ["/api/health", "/_next/static/x.js", "/robots.txt", "/sitemap.xml", "/brand/logo.svg"]) {
      expect(motif.test(chemin), chemin).toBe(false);
    }
    for (const chemin of ["/dossiers/nouveau", "/profil", "/"]) {
      expect(motif.test(chemin), chemin).toBe(true);
    }
  });
});

describe("Les trois endroits qui suivent une suite passent par la même règle", () => {
  it.each([
    "src/server/securite/page.ts",
    "src/app/(auth)/verification/Verification.tsx",
  ])("%s emploie suiteInterne", (chemin) => {
    expect(readFileSync(chemin, "utf8")).toContain("suiteInterne(");
  });

  /*
    S.211 : la connexion décide par `destinationApresConnexion`, qui passe
    par `suiteInterne` — vérifié ici dans le source, et plus bas par son
    comportement.
  */
  it("la connexion décide par destinationApresConnexion, qui emploie suiteInterne", () => {
    expect(readFileSync("src/app/(auth)/connexion/Connexion.tsx", "utf8")).toContain(
      "destinationApresConnexion(",
    );
    expect(readFileSync("src/domain/comptes/suite.ts", "utf8")).toMatch(
      /function destinationApresConnexion[\s\S]*?suiteInterne\(suite\)/u,
    );
  });

  it("la garde lit l'en-tête quand on ne lui donne pas de suite", () => {
    const garde = readFileSync("src/server/securite/page.ts", "utf8");
    expect(garde).toContain("get(EN_TETE_CHEMIN)");
  });

  it("la connexion d'un compte non vérifié garde la suite jusqu'à la vérification", () => {
    const connexion = readFileSync("src/domain/comptes/suite.ts", "utf8");
    expect(connexion).toContain("`/verification?suite=${encodeURIComponent(retour)}`");
  });
});

/**
 * S.211 — un compte interne arrive sur le back-office après la connexion.
 * Le tableau de bord candidat ne porte aucun lien vers le back-office.
 */
describe("où aller après la connexion", () => {
  it.each(["VEILLEUR", "ADMIN", "SUPER_ADMIN"])("%s sans suite : le back-office", (role) => {
    expect(destinationApresConnexion(null, true, role)).toBe(ACCUEIL_INTERNE);
    expect(ACCUEIL_INTERNE).toBe("/veille");
  });

  it("un candidat, ou un rôle absent ou inconnu, arrive sur le tableau de bord", () => {
    expect(destinationApresConnexion(null, true, "CANDIDAT")).toBe(ACCUEIL_CANDIDAT);
    expect(destinationApresConnexion(null, true)).toBe(ACCUEIL_CANDIDAT);
    expect(destinationApresConnexion(null, true, "PIRATE")).toBe(ACCUEIL_CANDIDAT);
  });

  it("une suite interne est suivie pour tout rôle ; une suite externe est ignorée", () => {
    expect(destinationApresConnexion("/dossiers/nouveau?destination=suisse", true, "SUPER_ADMIN")).toBe(
      "/dossiers/nouveau?destination=suisse",
    );
    expect(destinationApresConnexion("https://evil.example", true, "ADMIN")).toBe(ACCUEIL_INTERNE);
    expect(destinationApresConnexion("//evil.example", true, "CANDIDAT")).toBe(ACCUEIL_CANDIDAT);
  });

  it("une adresse non vérifiée passe d'abord par la vérification, en gardant la suite", () => {
    expect(destinationApresConnexion(null, false, "ADMIN")).toBe("/verification");
    expect(destinationApresConnexion("/utilisateurs", false, "SUPER_ADMIN")).toBe(
      "/verification?suite=%2Futilisateurs",
    );
  });
});
