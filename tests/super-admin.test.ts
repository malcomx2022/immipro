import { describe, expect, it } from "vitest";
import {
  LIBELLE_ROLE,
  ROLES,
  SUPER_ADMINS_MINIMUM,
  couvre,
  estInterne,
  peutChangerLesRoles,
  peutCreerUnCompteInterne,
  rolesAuMoins,
} from "@/domain/comptes/hierarchie";
import { lireLaDemande, verdictDuChangement, type CompteCible } from "@/domain/comptes/role";
import {
  BORNES_NOM_INTERNE,
  confirmationJuste,
  lireLaCreation,
  verdictDeSuspension,
  type CibleDeSuspension,
} from "@/domain/comptes/gestion-interne";
import { actionsPour, suspensionReservee, type Compte } from "@/domain/backoffice/comptes";

/**
 * Rôle SUPER_ADMIN — S.210. Domaine pur : hiérarchie, changement de rôle,
 * seuil des deux super-administrateurs, création interne, suspension.
 */

describe("la hiérarchie SUPER_ADMIN ⊃ ADMIN ⊃ VEILLEUR", () => {
  it("chaque rôle couvre ceux qu'il domine, et pas au-delà", () => {
    expect(couvre("SUPER_ADMIN", "ADMIN")).toBe(true);
    expect(couvre("SUPER_ADMIN", "VEILLEUR")).toBe(true);
    expect(couvre("ADMIN", "VEILLEUR")).toBe(true);
    expect(couvre("ADMIN", "SUPER_ADMIN")).toBe(false);
    expect(couvre("VEILLEUR", "ADMIN")).toBe(false);
    expect(couvre("CANDIDAT", "VEILLEUR")).toBe(false);
  });

  it("tout compte a un espace candidat, le candidat n'entre pas au back-office", () => {
    for (const r of ROLES) expect(couvre(r, "CANDIDAT")).toBe(true);
    expect(estInterne("CANDIDAT")).toBe(false);
    expect(estInterne("VEILLEUR")).toBe(true);
  });

  it("les listes admises sont dérivées, du plus bas au plus haut", () => {
    expect(rolesAuMoins("VEILLEUR")).toEqual(["VEILLEUR", "ADMIN", "SUPER_ADMIN"]);
    expect(rolesAuMoins("ADMIN")).toEqual(["ADMIN", "SUPER_ADMIN"]);
    expect(rolesAuMoins("SUPER_ADMIN")).toEqual(["SUPER_ADMIN"]);
  });

  it("seul le sommet change un rôle ou crée un compte interne — un ADMIN ne peut plus", () => {
    expect(peutChangerLesRoles("SUPER_ADMIN")).toBe(true);
    expect(peutChangerLesRoles("ADMIN")).toBe(false);
    expect(peutChangerLesRoles("VEILLEUR")).toBe(false);
    expect(peutCreerUnCompteInterne("ADMIN")).toBe(false);
    expect(peutCreerUnCompteInterne("SUPER_ADMIN")).toBe(true);
  });

  it("chaque rôle a son intitulé français", () => {
    for (const r of ROLES) expect(LIBELLE_ROLE[r].length).toBeGreaterThan(0);
  });

  it("le schéma Prisma porte la valeur, et la migration l'ajoute sans rien réécrire", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    expect(readFileSync("prisma/schema.prisma", "utf8")).toMatch(/enum Role \{[^}]*SUPER_ADMIN[^}]*\}/u);
    const dossier = readdirSync("prisma/migrations").find((d) => d.endsWith("_super_admin_et_profil"));
    expect(dossier).toBeDefined();
    const sql = readFileSync(`prisma/migrations/${dossier}/migration.sql`, "utf8");
    expect(sql).toMatch(/ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN'/u);
    expect(sql).not.toMatch(/\b(DROP|UPDATE|DELETE)\b/u);
  });
});

describe("la commande de la console accepte SUPER_ADMIN, motif et auteur obligatoires", () => {
  const base = ["--email", "awa@exemple.com", "--role", "super_admin", "--par", "Awa Koffi"];

  it("lit le rôle SUPER_ADMIN", () => {
    const lu = lireLaDemande([...base, "--motif", "Premier super-administrateur"]);
    expect(lu).toMatchObject({ ok: true, demande: { role: "SUPER_ADMIN" } });
  });

  it("refuse un motif de 9 caractères, accepte 10", () => {
    expect(lireLaDemande([...base, "--motif", "x".repeat(9)]).ok).toBe(false);
    expect(lireLaDemande([...base, "--motif", "x".repeat(10)]).ok).toBe(true);
  });

  it("refuse sans --par", () => {
    const lu = lireLaDemande(["--email", "awa@exemple.com", "--role", "SUPER_ADMIN", "--motif", "x".repeat(10)]);
    expect(lu.ok).toBe(false);
  });
});

describe("changer un rôle depuis le back-office", () => {
  const verifie: CompteCible = { id: "cible", role: "CANDIDAT", emailVerifie: true, suspendu: false, supprime: false };
  const sommet = { id: "sommet", role: "SUPER_ADMIN" as const };

  it.each(["ADMIN", "VEILLEUR", "CANDIDAT"] as const)("un acteur %s ne change aucun rôle", (role) => {
    const v = verdictDuChangement(verifie, "VEILLEUR", 3, { superAdminsActifs: 2, acteur: { id: "x", role } });
    expect(v.permis).toBe(false);
    if (!v.permis) expect(v.raison).toMatch(/Seul un super-administrateur/u);
  });

  it("un super-administrateur nomme un administrateur", () => {
    expect(verdictDuChangement(verifie, "ADMIN", 1, { superAdminsActifs: 1, acteur: sommet })).toEqual({ permis: true });
  });

  it("personne ne s'élève lui-même", () => {
    const soi: CompteCible = { ...verifie, id: sommet.id, role: "ADMIN" };
    const v = verdictDuChangement(soi, "SUPER_ADMIN", 2, { superAdminsActifs: 1, acteur: sommet });
    expect(v.permis).toBe(false);
    if (!v.permis) expect(v.raison).toMatch(/ne s'élève pas lui-même/u);
  });

  it("un super-administrateur compte comme administrateur pour le dernier administrateur", () => {
    const seul: CompteCible = { ...verifie, role: "SUPER_ADMIN" };
    const v = verdictDuChangement(seul, "CANDIDAT", 1, { superAdminsActifs: 2, acteur: sommet });
    expect(v.permis).toBe(false);
    if (!v.permis) expect(v.raison).toMatch(/dernier administrateur/u);
    // Rétrogradé en ADMIN, il reste administrateur : la borne ne joue pas.
    expect(verdictDuChangement(seul, "ADMIN", 1, { superAdminsActifs: 2, acteur: sommet })).toEqual({ permis: true });
  });
});

describe(`le seuil des ${SUPER_ADMINS_MINIMUM} super-administrateurs actifs`, () => {
  const sommet = { id: "sommet", role: "SUPER_ADMIN" as const };
  const soi: CompteCible = { id: "sommet", role: "SUPER_ADMIN", emailVerifie: true, suspendu: false, supprime: false };
  const autre: CompteCible = { ...soi, id: "autre" };

  it("seul actif, il ne se rétrograde pas lui-même", () => {
    const v = verdictDuChangement(soi, "ADMIN", 5, { superAdminsActifs: 1, acteur: sommet });
    expect(v.permis).toBe(false);
    if (!v.permis) expect(v.raison).toMatch(/seul super-administrateur actif/u);
  });

  it("à deux, il peut se retirer", () => {
    expect(verdictDuChangement(soi, "ADMIN", 5, { superAdminsActifs: 2, acteur: sommet })).toEqual({ permis: true });
  });

  it("sous le seuil, la rétrogradation d'autrui est refusée avec un message explicite", () => {
    const v = verdictDuChangement(autre, "VEILLEUR", 5, { superAdminsActifs: 1 });
    expect(v.permis).toBe(false);
    if (!v.permis) expect(v.raison).toMatch(/il en faut au moins 2/u);
    expect(verdictDuChangement(autre, "VEILLEUR", 5, { superAdminsActifs: 2 })).toEqual({ permis: true });
  });

  it("un appelant qui n'a pas compté ne retire pas le sommet", () => {
    expect(verdictDuChangement(autre, "ADMIN", 5).permis).toBe(false);
  });

  it("un super-administrateur suspendu n'est pas actif : le retirer ne baisse pas le seuil", () => {
    expect(verdictDuChangement({ ...autre, suspendu: true }, "CANDIDAT", 5, { superAdminsActifs: 1 })).toEqual({
      permis: true,
    });
  });
});

describe("créer un compte interne — bornes exactes", () => {
  const valide = {
    email: " Kofi.Mensah@ImmiPro.app ",
    prenom: "Kofi",
    nom: "Mensah",
    role: "VEILLEUR",
    motif: "Renfort de la veille Pays-Bas",
  };

  it("normalise l'adresse et accepte un veilleur ou un administrateur", () => {
    expect(lireLaCreation(valide)).toMatchObject({ ok: true, creation: { email: "kofi.mensah@immipro.app" } });
    expect(lireLaCreation({ ...valide, role: "ADMIN" }).ok).toBe(true);
  });

  it("ne donne jamais SUPER_ADMIN à la création, ni CANDIDAT", () => {
    const sommet = lireLaCreation({ ...valide, role: "SUPER_ADMIN" });
    expect(sommet.ok).toBe(false);
    if (!sommet.ok) expect(sommet.champs.role).toMatch(/ne se donne pas à la création/u);
    expect(lireLaCreation({ ...valide, role: "CANDIDAT" }).ok).toBe(false);
  });

  it(`prénom et nom : ${BORNES_NOM_INTERNE.min} à ${BORNES_NOM_INTERNE.max} caractères`, () => {
    expect(lireLaCreation({ ...valide, prenom: "" }).ok).toBe(false);
    expect(lireLaCreation({ ...valide, prenom: "K" }).ok).toBe(true);
    expect(lireLaCreation({ ...valide, nom: "x".repeat(80) }).ok).toBe(true);
    expect(lireLaCreation({ ...valide, nom: "x".repeat(81) }).ok).toBe(false);
  });

  it("motif : 9 caractères refusés, 10 acceptés, 501 refusés", () => {
    expect(lireLaCreation({ ...valide, motif: "x".repeat(9) }).ok).toBe(false);
    expect(lireLaCreation({ ...valide, motif: "x".repeat(10) }).ok).toBe(true);
    expect(lireLaCreation({ ...valide, motif: "x".repeat(501) }).ok).toBe(false);
  });

  it("refuse une adresse invalide en nommant le champ", () => {
    const lu = lireLaCreation({ ...valide, email: "kofi@" });
    expect(lu.ok).toBe(false);
    if (!lu.ok) expect(Object.keys(lu.champs)).toEqual(["email"]);
  });
});

describe("la double confirmation", () => {
  it("exige l'adresse exacte, casse et blancs ignorés", () => {
    expect(confirmationJuste(" AWA@exemple.com ", "awa@exemple.com")).toBe(true);
    expect(confirmationJuste("awa@exemple.co", "awa@exemple.com")).toBe(false);
    expect(confirmationJuste("", "")).toBe(false);
  });
});

describe("suspendre un compte", () => {
  const candidat: CibleDeSuspension = { id: "c", role: "CANDIDAT", suspendu: false, supprime: false };
  const admin = { id: "a", role: "ADMIN" as const };
  const sommet = { id: "s", role: "SUPER_ADMIN" as const };

  it("un administrateur suspend un candidat, comme avant (WF-15)", () => {
    expect(verdictDeSuspension(admin, candidat, true, 1)).toEqual({ permis: true });
  });

  it("un veilleur ne suspend personne", () => {
    expect(verdictDeSuspension({ id: "v", role: "VEILLEUR" }, candidat, true, 1).permis).toBe(false);
  });

  it.each(["VEILLEUR", "ADMIN", "SUPER_ADMIN"] as const)(
    "un administrateur ne suspend ni ne rétablit un compte %s",
    (role) => {
      expect(verdictDeSuspension(admin, { ...candidat, role }, true, 3).permis).toBe(false);
      expect(verdictDeSuspension(admin, { ...candidat, role, suspendu: true }, false, 3).permis).toBe(false);
    },
  );

  it("un super-administrateur suspend un administrateur", () => {
    expect(verdictDeSuspension(sommet, { ...candidat, role: "ADMIN" }, true, 1)).toEqual({ permis: true });
  });

  it("personne ne se suspend soi-même", () => {
    expect(verdictDeSuspension(sommet, { ...candidat, id: "s", role: "SUPER_ADMIN" }, true, 3).permis).toBe(false);
  });

  it("le dernier super-administrateur actif ne se suspend pas ; à deux, si", () => {
    const autre: CibleDeSuspension = { id: "o", role: "SUPER_ADMIN", suspendu: false, supprime: false };
    expect(verdictDeSuspension(sommet, autre, true, 1).permis).toBe(false);
    expect(verdictDeSuspension(sommet, autre, true, 2)).toEqual({ permis: true });
    // Rétablir n'est jamais borné : c'est rendre un sommet, pas en retirer.
    expect(verdictDeSuspension(sommet, { ...autre, suspendu: true }, false, 1)).toEqual({ permis: true });
  });
});

describe("B-03 n'offre que les gestes que la route accepte", () => {
  const compte = (role: Compte["role"], id = "cible"): Compte => ({
    id,
    nom: "Awa Koffi",
    email: "awa@exemple.com",
    inscritLe: "2026-10-01T00:00:00.000Z",
    dossiers: 0,
    pack: "aucun",
    consentements: [],
    analysesUtilisees: 0,
    analysesTotal: 0,
    statut: "ACTIF",
    role,
  });
  const cles = (c: Compte, acteur: { id: string; role: "ADMIN" | "SUPER_ADMIN" }) =>
    actionsPour(c, acteur).map((a) => a.cle);

  it("un administrateur suspend un candidat, pas un compte interne", () => {
    expect(cles(compte("CANDIDAT"), { id: "a", role: "ADMIN" })).toContain("suspendre");
    expect(cles(compte("VEILLEUR"), { id: "a", role: "ADMIN" })).not.toContain("suspendre");
    expect(suspensionReservee(compte("VEILLEUR"), { id: "a", role: "ADMIN" })).toMatch(/super-administrateur/u);
  });

  it("un super-administrateur suspend un compte interne, jamais le sien", () => {
    expect(cles(compte("ADMIN"), { id: "s", role: "SUPER_ADMIN" })).toContain("suspendre");
    expect(cles(compte("SUPER_ADMIN", "s"), { id: "s", role: "SUPER_ADMIN" })).not.toContain("suspendre");
  });

  it("sans acteur, la liste par statut reste celle de WF-15", () => {
    expect(actionsPour(compte("ADMIN")).map((a) => a.cle)).toContain("suspendre");
  });
});
