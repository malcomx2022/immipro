import { describe, expect, it } from "vitest";
import { estLienCourant, etatDuLien, NAVIGATION_CANDIDAT } from "@/domain/navigation/courant";
import { NAVIGATION_ADMIN } from "@/domain/backoffice/navigation";

/**
 * La page courante d'une navigation — revue du 07/10/2026, M12 (D-17).
 */
describe("etatDuLien", () => {
  it("« page » sur l'adresse même, barre finale et requête ignorées", () => {
    expect(etatDuLien("/profil", "/profil")).toBe("page");
    expect(etatDuLien("/profil/", "/profil")).toBe("page");
    expect(etatDuLien("/profil?onglet=facturation", "/profil")).toBe("page");
  });

  it("« true » sur une sous-page, jamais sur un simple préfixe de mot", () => {
    expect(etatDuLien("/guides/canada", "/guides")).toBe("true");
    expect(etatDuLien("/guidesX", "/guides")).toBeUndefined();
  });

  it("l'accueil n'est courant que sur lui-même", () => {
    expect(etatDuLien("/", "/")).toBe("page");
    expect(etatDuLien("/tarifs", "/")).toBeUndefined();
  });

  it("sans chemin connu, rien n'est courant", () => {
    expect(etatDuLien(null, "/profil")).toBeUndefined();
    expect(estLienCourant(null, "/profil")).toBe(false);
  });
});

describe("D-17 : les sections de l'espace candidat", () => {
  const entree = (chemin: string) =>
    NAVIGATION_CANDIDAT.filter((e) => estLienCourant(chemin, e.href, e.sections)).map((e) => e.libelle);

  it.each([
    ["/tableau-de-bord", "Dossiers"],
    ["/dossiers/nl-4471", "Dossiers"],
    ["/dossiers/nl-4471/pieces/p1", "Dossiers"],
    ["/dossiers/nouveau", "Dossiers"],
    ["/fiches/pays-bas", "Dossiers"],
    ["/services", "Dossiers"],
    ["/consultants", "Dossiers"],
    ["/consultants/c1/rendez-vous", "Dossiers"],
    ["/comparateur", "Destinations"],
    ["/notifications", "Alertes"],
    ["/profil", "Profil"],
  ])("%s allume « %s », et lui seul", (chemin, libelle) => {
    expect(entree(chemin)).toEqual([libelle]);
  });

  it("le dossier n'est pas « la page » du tableau de bord : on est dans la section", () => {
    const dossiers = NAVIGATION_CANDIDAT[0]!;
    expect(etatDuLien("/dossiers/nl-4471", dossiers.href, dossiers.sections)).toBe("true");
    expect(etatDuLien("/tableau-de-bord", dossiers.href, dossiers.sections)).toBe("page");
  });

  it("au back-office, la fiche d'une règle reste dans la veille", () => {
    const allumees = NAVIGATION_ADMIN.filter((e) => estLienCourant("/regles/r-1", e.href, e.sections));
    expect(allumees.map((e) => e.libelle)).toEqual(["Veille réglementaire"]);
  });
});
