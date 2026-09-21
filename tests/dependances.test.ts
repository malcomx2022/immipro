import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  DEPENDANCES,
  configuree,
  fileTenue,
  LIBELLE_STATUT,
  messageDeSurveillance,
} from "@/domain/exploitation/dependances";
import { DELAI_CIBLE_HEURES } from "@/domain/backoffice/revue";

/**
 * I.C, tranché le 20/09/2026 — trois dépendances, trois statuts ; puis I.D
 * le même jour, qui en ajoute une quatrième.
 *
 * La décision ne leur donne pas le même poids, et c'est tout son intérêt :
 * traiter une messagerie absente et une extraction IA absente de la même
 * façon reviendrait soit à retarder un pilote pour rien, soit à ouvrir au
 * public un service dont les courriers ne partent pas.
 */

describe("les six dépendances n'ont pas le même statut", () => {
  it("chacune est déclarée avec ce que son absence bloque", () => {
    expect(DEPENDANCES.map((d) => [d.cle, d.statut])).toEqual([
      ["messagerie", "BLOQUANTE_OUVERTURE"],
      ["paiements", "BLOQUANTE_ENCAISSEMENT"],
      // Ouvrir un paiement et le confirmer tombent séparément : les
      // secrets de signature peuvent être en place pendant que la clé
      // sortante manque.
      ["ouverture_paiement", "BLOQUANTE_ENCAISSEMENT"],
      ["antivirus", "BLOQUANTE_TELEVERSEMENT"],
      // Le rail sortant bloque l'encaissement pour la même raison que les
      // secrets de signature : on ne prend pas d'argent qu'on ne sait pas
      // rendre, et K.C ouvre des obligations que rien ne solderait.
      ["remboursement", "BLOQUANTE_ENCAISSEMENT"],
      ["extraction", "FACULTATIVE_PILOTE"],
      // La sixième, trouvée par la revue de septembre 2026 : WF-08 était
      // en lecture seule, et le service qui met en forme les pièces
      // rédigées n'était consigné nulle part. Il partage la clé de
      // l'extraction sans partager son objet — lire un montant et écrire
      // une phrase que le candidat signera ne se ratent pas pareil.
      ["redaction", "FACULTATIVE_PILOTE"],
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
  /**
   * Une dépendance facultative n'est facultative que sous conditions, et
   * les conditions se nomment. Sans elles, « facultative en pilote »
   * voudrait dire « on s'en passe », ce qui n'est pas la même chose.
   */
  it("chaque facultative porte ses conditions", () => {
    const facultatives = DEPENDANCES.filter((d) => d.statut === "FACULTATIVE_PILOTE");
    expect(facultatives.map((d) => d.cle)).toEqual(["extraction", "redaction"]);
    for (const d of facultatives) {
      expect(d.conditions, d.cle).toHaveLength(3);
    }

    const extraction = facultatives.find((d) => d.cle === "extraction")!;
    expect(extraction.conditions!.join(" ")).toMatch(/délai cible/u);
    expect(extraction.conditions!.join(" ")).toMatch(/surveillée/u);

    // La rédaction a les siennes, et elles portent sur ce qui la
    // distingue : un texte proposé reste celui du candidat, il le relit,
    // et l'analyse critique ne juge pas son dossier (INV-1).
    const redaction = facultatives.find((d) => d.cle === "redaction")!;
    expect(redaction.conditions!.join(" ")).toMatch(/relit|relecture/u);
    expect(redaction.conditions!.join(" ")).toMatch(/elle ne juge pas/u);
  });
});

/**
 * L'aptitude ne se lit plus ici. Elle se lisait des variables
 * d'environnement, et c'était le défaut : `SMTP_URL` renseignée devant un
 * module qui journalise sans expédier faisait déclarer la messagerie
 * présente. Ce qu'une variable établit — et rien de plus — se teste en
 * dessous ; ce que les dépendances savent réellement faire se teste dans
 * `capacites.test.ts`.
 */
describe("une variable dit l'intention, pas la capacité", () => {
  it("une variable vide ne vaut pas une variable renseignée", () => {
    const messagerie = DEPENDANCES[0]!;
    expect(configuree(messagerie, { SMTP_URL: "smtp://x" })).toBe(true);
    expect(configuree(messagerie, { SMTP_URL: "   " })).toBe(false);
    expect(configuree(messagerie, {})).toBe(false);
  });

  it("toutes les variables sont exigées, pas seulement la première", () => {
    const paiements = DEPENDANCES.find((d) => d.cle === "paiements")!;
    expect(configuree(paiements, { FEDAPAY_WEBHOOK_SECRET: "s" })).toBe(false);
    expect(
      configuree(paiements, { FEDAPAY_WEBHOOK_SECRET: "s", STRIPE_WEBHOOK_SECRET: "s" }),
    ).toBe(true);
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
    expect(sante).toContain("etatDesCapacites");
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
