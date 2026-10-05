import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  auteurConsole,
  lireLaDemande,
  verdictDuChangement,
  type CompteCible,
} from "@/domain/comptes/role";
import { acteurLisible, origineDe } from "@/domain/backoffice/acteur";

/**
 * Changer un rôle depuis la console du serveur — S.115.
 */
const ARGS = ["--email", "Awa@Exemple.com", "--role", "admin", "--par", "Awa Koffi", "--motif", "Responsable de la revue désigné le 03/10"];

describe("la ligne de commande", () => {
  it("lit l'adresse, le rôle, l'auteur et le motif", () => {
    expect(lireLaDemande(ARGS)).toEqual({
      ok: true,
      demande: { email: "awa@exemple.com", role: "ADMIN", par: "Awa Koffi", motif: "Responsable de la revue désigné le 03/10" },
    });
  });

  it("refuse sans motif, sans auteur ou avec un rôle inconnu, en disant quoi corriger", () => {
    const lu = lireLaDemande(["--email", "pas-une-adresse", "--role", "SUPERADMIN", "--motif", "court"]);
    expect(lu.ok).toBe(false);
    if (!lu.ok) {
      expect(lu.erreurs.join("\n")).toMatch(/--email/u);
      expect(lu.erreurs.join("\n")).toMatch(/--role : CANDIDAT, VEILLEUR, ADMIN \(reçu : « SUPERADMIN »\)/u);
      expect(lu.erreurs.join("\n")).toMatch(/--par/u);
      expect(lu.erreurs.join("\n")).toMatch(/--motif/u);
    }
  });
});

describe("ce qui est permis", () => {
  const candidat: CompteCible = { role: "CANDIDAT", emailVerifie: true, suspendu: false, supprime: false };

  it("donne un rôle à une adresse vérifiée", () => {
    expect(verdictDuChangement(candidat, "ADMIN", 0)).toEqual({ permis: true });
  });

  it("refuse une adresse non vérifiée, un compte suspendu ou supprimé", () => {
    expect(verdictDuChangement({ ...candidat, emailVerifie: false }, "ADMIN", 1).permis).toBe(false);
    expect(verdictDuChangement({ ...candidat, suspendu: true }, "VEILLEUR", 1).permis).toBe(false);
    expect(verdictDuChangement({ ...candidat, supprime: true }, "ADMIN", 1).permis).toBe(false);
  });

  it("ne retire pas le dernier administrateur", () => {
    const admin: CompteCible = { ...candidat, role: "ADMIN" };
    const v = verdictDuChangement(admin, "CANDIDAT", 1);
    expect(v.permis).toBe(false);
    if (!v.permis) expect(v.raison).toMatch(/dernier administrateur/u);
    expect(verdictDuChangement(admin, "CANDIDAT", 2)).toEqual({ permis: true });
  });

  it("ne change rien quand le rôle est déjà le bon", () => {
    const v = verdictDuChangement(candidat, "CANDIDAT", 1);
    expect(v).toMatchObject({ permis: false, inchange: true });
  });

  it("retirer un rôle élevé à un compte suspendu reste possible", () => {
    expect(verdictDuChangement({ ...candidat, role: "VEILLEUR", suspendu: true }, "CANDIDAT", 1)).toEqual({ permis: true });
  });
});

describe("la trace au journal", () => {
  it("nomme la console et la personne déclarée", () => {
    const auteur = auteurConsole("  Awa   Koffi ");
    expect(auteur).toBe("console:Awa Koffi");
    expect(origineDe(auteur)).toBe("console du serveur");
    expect(acteurLisible(auteur, null)).toEqual({ genre: "PROCESSUS", libelle: auteur, identifiant: auteur });
  });

  it("le changement et sa ligne de journal s'écrivent dans la même transaction", () => {
    const serveur = readFileSync("src/server/comptes/role.ts", "utf8");
    expect(serveur).toMatch(/db\.\$transaction\(/u);
    expect(serveur).toMatch(/journaliser\(\s*\{[\s\S]*?\},\s*tx,\s*\)/u);
    expect(serveur).toMatch(/action: "compte\.role"/u);
  });

  it("la commande est livrée dans l'image de production", () => {
    expect(readFileSync("scripts/build-worker.mjs", "utf8")).toMatch(/outfile: "dist\/changer-role\.mjs"/u);
  });
});
