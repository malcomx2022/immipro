import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { TANT_QU_AUCUN_CONTRAT, TERMES_DU_CONTRAT } from "@/domain/partenaires/contrat";

/**
 * K.D — aucun partenaire activé avant la signature d'un contrat réel.
 * Tranché le 20/09/2026.
 *
 * Les trois interdits tiennent déjà, et par trois mécanismes différents :
 * une requête, un refus au démarrage, une absence d'appelant. Ce fichier
 * les tient, parce qu'aucun des trois ne se voit en relisant l'écran — et
 * que le jour où l'un cède, le produit proposera un prestataire sans
 * contrat, avec un taux inventé.
 */

const lire = (f: string) => readFileSync(f, "utf8");

function fichiers(dir: string, filtre: RegExp, acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) fichiers(p, filtre, acc);
    else if (filtre.test(nom)) acc.push(p.replace(/\\/gu, "/"));
  }
  return acc;
}

describe("un partenaire sans activation n'existe pour personne", () => {
  const lecture = lire("src/server/lecture/partenaires.ts");

  /**
   * Le filtre est dans la requête, pas dans l'affichage — INV-4, même
   * esprit. Un partenaire non activé qui arriverait jusqu'à l'écran pour y
   * être masqué serait déjà sorti de la base, et une erreur d'affichage
   * suffirait à le montrer.
   */
  it("l'activation du pays est une condition de la requête", () => {
    expect(lecture).toMatch(
      /activations: \{ some: \{ countryCode: pays, revokedAt: null \} \}/u,
    );
  });

  /**
   * Et l'offre se rattache à une pièce que le dossier demande **encore**.
   *
   * La lecture ne lisait pas l'état des pièces : elle prenait `code` et
   * `label`, et proposait un prestataire payant pour une assurance maladie
   * déjà déposée, lue et acceptée — sous « ton dossier demande une pièce ».
   * Une ligne de suivi était écrite avec, si bien que « redirection
   * tracée » se mesurait sur une offre qui n'avait pas lieu d'être.
   *
   * L'en-tête de ce module l'énonce pourtant : « chaque offre se rattache à
   * une pièce que le dossier demande, et le dit. Une liste sans motif
   * serait un annuaire publicitaire. »
   */
  it("l'état de la pièce est lu, et la question n'a qu'une définition", () => {
    expect(lecture).toMatch(/documents: \{ select: \{[^}]*status: true/u);
    expect(lecture).toContain("estEncoreDemandee(piece.status)");
  });

  /**
   * Les trois lectures serveur qui posent « cette pièce est-elle encore
   * demandée ? » passent par la même fonction. Écrite trois fois, elle
   * finirait par répondre trois choses — c'est le défaut que le
   * rattachement des conditions a déjà coûté deux fois au produit.
   */
  it("aucune lecture ne recompare l'état à la main", () => {
    for (const fichier of ["src/server/lecture/partenaires.ts", "src/server/lecture/dossiers.ts"]) {
      expect(lire(fichier), fichier).not.toMatch(/status\s*!==\s*"CONFORME"/u);
    }
  });

  /**
   * Et la maille est le pays, pas le partenaire : un accord signé pour les
   * Pays-Bas n'autorise rien en Suisse. Une activation révoquée ne compte
   * plus, ce qui est la sortie prévue quand un contrat s'arrête.
   */
  it("la maille est le pays, et une révocation ferme la porte", () => {
    const modele = /model PartnerActivation \{[\s\S]*?\n\}/u.exec(lire("prisma/schema.prisma"))![0];
    expect(modele).toMatch(/@@unique\(\[partnerId, countryCode\]\)/u);
    expect(modele).toMatch(/revokedAt\s+DateTime\?/u);
    // Ce qui a été vérifié est écrit : une activation sans motif ne se relit pas.
    expect(modele).toMatch(/basis\s+String\n/u);
    expect(modele).toMatch(/verifiedBy\s+String\n/u);
  });
});

describe("le jeu de démonstration n'est pas un partenaire réel", () => {
  it("il refuse de s'écrire en production", () => {
    const seed = lire("prisma/seed/demonstration.ts");
    expect(seed).toMatch(/process\.env\.NODE_ENV === "production"/u);
    expect(seed).toMatch(/throw new Error/u);
  });

  /**
   * Et il ne s'invite pas dans un démarrage ordinaire : c'est une commande
   * à part, qu'on lance sciemment.
   */
  it("il ne se déclenche pas tout seul", () => {
    const paquet = JSON.parse(lire("package.json")) as { scripts: Record<string, string> };
    expect(paquet.scripts["seed:demo"]).toContain("demonstration");
    for (const script of ["build", "start", "postinstall"]) {
      expect(paquet.scripts[script] ?? "", script).not.toContain("seed:demo");
    }
  });
});

describe("l'aboutissement reste dormant", () => {
  /**
   * La règle de calcul est écrite — c'est elle qui est difficile, pas le
   * branchement — mais rien ne l'appelle. Le jour où quelqu'un la branche,
   * ce test tombe et l'oblige à lire K.D : il faut d'abord un contrat, son
   * activation, et un fait générateur qui vient de l'accord, pas du code.
   */
  it("aucun appelant, et le test le dira le jour où il y en aura un", () => {
    const DEFINITION = "src/server/acces/partenaires.ts";
    const appelants = fichiers("src", /\.tsx?$/u)
      .filter((f) => f !== DEFINITION)
      .filter((f) => /enregistrerLAboutissement\s*\(/u.test(lire(f)));
    expect(appelants).toEqual([]);
  });

  /**
   * Le taux appliqué est celui recopié sur la proposition, jamais le taux
   * courant : ce qui a été annoncé au candidat le jour où il a cliqué est
   * ce qui sera facturé (RG-13.3). Aucune valeur par défaut ne s'y
   * substitue — K.D interdit d'en inventer une.
   */
  it("le taux vient de la proposition, et aucun défaut ne le remplace", () => {
    const acces = lire("src/server/acces/partenaires.ts");
    expect(acces).toMatch(/commissionDue\(montant, ligne\.commissionBps\)/u);
    expect(acces).not.toMatch(/commissionBps\s*\?\?|TAUX_PAR_DEFAUT|\?\?\s*\d{3,}/u);
    const modele = /model Partner \{[\s\S]*?\n\}/u.exec(lire("prisma/schema.prisma"))![0];
    // Pas de taux par défaut au schéma non plus : il se saisit ou rien.
    expect(modele).toMatch(/commissionBps Int\n/u);
    expect(modele).not.toMatch(/commissionBps Int\s+@default/u);
  });
});

describe("ce que le premier contrat devra fixer", () => {
  it("les huit points y sont, et aucun n'est une valeur", () => {
    expect(TERMES_DU_CONTRAT).toHaveLength(8);
    for (const terme of TERMES_DU_CONTRAT) {
      expect(terme.length, terme).toBeGreaterThan(20);
    }
    const tout = TERMES_DU_CONTRAT.join(" ");
    for (const attendu of [
      "genre de prestation",
      "destinations couvertes",
      "commission",
      "devise",
      "fait générateur",
      "remboursements",
      "rapprochement",
      "entrée en vigueur",
    ]) {
      expect(tout, attendu).toContain(attendu);
    }
  });

  /**
   * Le registre énumère ce qu'un contrat doit fixer ; il ne fixe rien.
   * Un taux d'exemple écrit ici deviendrait, par copie, le taux appliqué —
   * c'est la même faute que le brouillon de mention légale de Q.A.
   */
  it("il n'avance aucun chiffre", () => {
    const source = lire("src/domain/partenaires/contrat.ts");
    expect(source).not.toMatch(/\b\d+\s*%|\b\d{3,}\s*(bps|points)/u);
  });

  it("les trois interdits sont nommés, et chacun dit par quoi il tient", () => {
    expect(TANT_QU_AUCUN_CONTRAT).toHaveLength(3);
    for (const phrase of TANT_QU_AUCUN_CONTRAT) {
      expect(phrase.length, phrase).toBeGreaterThan(60);
    }
  });
});
