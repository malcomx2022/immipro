import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  DEPENDANCES,
  configuree,
  etatDesDependances,
  fileTenue,
  LIBELLE_STATUT,
  messageDeSurveillance,
} from "@/domain/exploitation/dependances";
import { DELAI_CIBLE_HEURES } from "@/domain/backoffice/revue";

/**
 * I.C, tranché le 20/09/2026 — trois dépendances, trois statuts.
 *
 * La décision ne leur donne pas le même poids, et c'est tout son intérêt :
 * traiter une messagerie absente et une extraction IA absente de la même
 * façon reviendrait soit à retarder un pilote pour rien, soit à ouvrir au
 * public un service dont les courriers ne partent pas.
 */

const RIEN = {};
const TOUT = {
  SMTP_URL: "smtp://exemple",
  FEDAPAY_WEBHOOK_SECRET: "s",
  STRIPE_WEBHOOK_SECRET: "s",
  ANTHROPIC_API_KEY: "k",
};

describe("les trois dépendances n'ont pas le même statut", () => {
  it("chacune est déclarée avec ce que son absence bloque", () => {
    expect(DEPENDANCES.map((d) => [d.cle, d.statut])).toEqual([
      ["messagerie", "BLOQUANTE_OUVERTURE"],
      ["paiements", "BLOQUANTE_ENCAISSEMENT"],
      ["extraction", "FACULTATIVE_PILOTE"],
    ]);
    for (const d of DEPENDANCES) {
      expect(LIBELLE_STATUT[d.statut], d.cle).toBeTruthy();
      expect(d.variables.length, d.cle).toBeGreaterThan(0);
    }
  });

  /**
   * La dégradation dit ce que le produit fait à la place — jamais ce que le
   * service aurait fait. C'est la règle qui tient les trois : aucun service
   * absent n'est simulé.
   */
  it("chaque dégradation dit ce qui se passe, sans simuler le service", () => {
    for (const d of DEPENDANCES) {
      expect(d.degradation.length, d.cle).toBeGreaterThan(40);
      expect(d.degradation, d.cle).not.toMatch(/simul|factice|par défaut conforme/iu);
    }
  });

  /** L'exception de l'extraction est conditionnelle, et ses conditions sont écrites. */
  it("la seule facultative porte ses conditions", () => {
    const facultatives = DEPENDANCES.filter((d) => d.statut === "FACULTATIVE_PILOTE");
    expect(facultatives).toHaveLength(1);
    expect(facultatives[0]!.conditions).toHaveLength(3);
    expect(facultatives[0]!.conditions!.join(" ")).toMatch(/délai cible/u);
    expect(facultatives[0]!.conditions!.join(" ")).toMatch(/surveillée/u);
  });
});

describe("l'aptitude se lit des dépendances, pas du nom de l'environnement", () => {
  it("tout branché : prête", () => {
    expect(etatDesDependances(TOUT).aptitude).toBe("PRETE");
  });

  /**
   * Le cas du pilote : l'extraction manque, et rien d'autre. C'est
   * exactement ce que la décision autorise.
   */
  it("seule l'extraction manque : pilote", () => {
    const etat = etatDesDependances({ ...TOUT, ANTHROPIC_API_KEY: "" });
    expect(etat.aptitude).toBe("PILOTE");
    expect(etat.manquantes).toEqual(["extraction"]);
    expect(etat.bloquantes).toEqual([]);
  });

  it("la messagerie manque : inapte à ouvrir", () => {
    const etat = etatDesDependances({ ...TOUT, SMTP_URL: "" });
    expect(etat.aptitude).toBe("INAPTE");
    expect(etat.bloquantes).toEqual(["messagerie"]);
  });

  it("un secret de signature manque : inapte à encaisser", () => {
    expect(etatDesDependances({ ...TOUT, STRIPE_WEBHOOK_SECRET: "  " }).bloquantes).toEqual([
      "paiements",
    ]);
  });

  it("rien n'est branché : les deux bloquantes sont nommées", () => {
    const etat = etatDesDependances(RIEN);
    expect(etat.aptitude).toBe("INAPTE");
    expect(etat.bloquantes).toEqual(["messagerie", "paiements"]);
  });

  it("une variable vide ne vaut pas une variable renseignée", () => {
    const messagerie = DEPENDANCES[0]!;
    expect(configuree(messagerie, { SMTP_URL: "smtp://x" })).toBe(true);
    expect(configuree(messagerie, { SMTP_URL: "   " })).toBe(false);
    expect(configuree(messagerie, {})).toBe(false);
  });
});

describe("la file de revue est la condition de l'exception", () => {
  it("tenue tant qu'aucune pièce ne dépasse le délai cible", () => {
    expect(fileTenue({ enAttente: 5, horsDelai: 0 })).toBe(true);
    expect(fileTenue({ enAttente: 5, horsDelai: 1 })).toBe(false);
  });

  it("le message dit le dépassement, pas seulement l'attente", () => {
    expect(messageDeSurveillance({ enAttente: 0, horsDelai: 0 }, 4)).toContain("Aucune pièce");
    expect(messageDeSurveillance({ enAttente: 3, horsDelai: 0 }, 4)).toContain(
      "dans le délai cible de 4 heures",
    );
    expect(messageDeSurveillance({ enAttente: 3, horsDelai: 2 }, 4)).toContain(
      "2 pièces sur 3 au-delà du délai cible",
    );
  });

  /**
   * Un écran de back-office ne surveille que ceux qui l'ouvrent. L'adresse
   * d'état se lit depuis l'extérieur, et c'est ce que « file surveillée »
   * demande.
   */
  it("l'état de service expose la file et son délai", () => {
    const sante = readFileSync("src/app/api/health/route.ts", "utf8");
    expect(sante).toContain("DELAI_CIBLE_HEURES");
    expect(sante).toContain("manualReview.count");
    expect(sante).toContain("etatDesDependances");
    // Une bloquante absente doit se voir de l'extérieur, pas seulement se lire.
    expect(sante).toContain("503");
  });

  it("le délai cible reste celui du back-office, pas un second nombre", () => {
    expect(DELAI_CIBLE_HEURES).toBe(4);
    const domaine = readFileSync("src/domain/exploitation/dependances.ts", "utf8");
    expect(domaine).not.toMatch(/delaiCible\w* = \d/u);
  });
});

/* ------------------------------------------------------------------ *
 * « Aucun service absent ne doit être simulé. »
 * ------------------------------------------------------------------ */

function fichiers(dir: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) fichiers(p, acc);
    else if (/\.tsx?$/u.test(nom)) acc.push(p.replace(/\\/gu, "/"));
  }
  return acc;
}

describe("aucun service absent n'est simulé", () => {
  const lire = (f: string) => readFileSync(f, "utf8");

  /**
   * Le point de branchement de l'extraction est unique, et son défaut ne
   * rend pas un verdict : la pièce part en revue humaine et l'analyse est
   * recréditée. Une valeur par défaut qui déclarerait « conforme » ferait
   * exactement ce que la décision interdit.
   */
  it("une pièce non lue part en revue, elle n'est pas déclarée conforme", () => {
    const analyse = lire("src/server/jobs/analyse.ts");
    expect(analyse).toContain("NON_BRANCHE");
    expect(analyse).toContain("manualReview.create");
  });

  it("un courrier manqué se journalise et remonte à l'appelant", () => {
    const courrier = lire("src/server/courrier.ts");
    expect(courrier).toContain("SMTP_URL");
    expect(courrier).toMatch(/journalis|console\./u);
  });

  /**
   * Sans secret de signature, aucune notification n'est acceptée. C'est le
   * défaut qui protège : accepter faute de secret reviendrait à créditer
   * sur la parole du premier appelant venu.
   */
  it("sans secret, aucune notification de paiement n'est acceptée", () => {
    const signature = lire("src/server/paiement/signature.ts");
    expect(signature).toMatch(/if \(!secret\)[\s\S]{0,200}return false/u);
  });

  it("aucun module ne fabrique la réponse d'un service absent", () => {
    const fautifs = fichiers("src")
      .filter((f) => /\b(faussaire|bouchon|stub|mockProvider|fakeProvider)\b/u.test(lire(f)));
    expect(fautifs).toEqual([]);
  });
});
