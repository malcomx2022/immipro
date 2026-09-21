import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DEPENDANCES, type Dependance } from "@/domain/exploitation/dependances";
import { observer } from "@/server/exploitation/capacites";
import {
  ANCIENS_NOMS,
  CLES,
  CLES_SORTANTES,
  RETRAIT_DES_ANCIENS_NOMS,
  SECRETS_ENTRANTS,
  environnementNormalise,
  oublierLesAvertissements,
} from "@/server/paiement/secrets";

/**
 * « Le fichier d'exemple et le code ne parlaient pas de la même clé. »
 *
 * `.env.example` portait `FEDAPAY_SECRET_KEY`, le code demandait
 * `FEDAPAY_API_KEY`, et personne ne lisait la première. Un exploitant qui
 * remplissait le fichier obtenait une installation déclarée non
 * configurée, sans rien pour lui dire laquelle des deux graphies valait.
 */

const EXEMPLE = readFileSync(".env.example", "utf8");
const REGISTRE = "src/domain/exploitation/dependances.ts";

/** Les noms déclarés dans `.env.example`, valeur exclue. */
const declarees = new Set(
  EXEMPLE.split("\n")
    .map((l) => /^([A-Z0-9_]+)=/u.exec(l.trim())?.[1])
    .filter((n): n is string => n !== undefined),
);

function fichiers(dir: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) fichiers(p, acc);
    else if (/\.tsx?$/u.test(nom)) acc.push(p.replace(/\\/gu, "/"));
  }
  return acc;
}

const SOURCES = fichiers("src");
const lire = (f: string) => readFileSync(f, "utf8");

describe("une seule nomenclature pour les secrets de paiement", () => {
  /**
   * `<FOURNISSEUR>_<USAGE>`, et l'usage dit le sens : `_API_KEY` sort,
   * `_WEBHOOK_SECRET` entre, `_ENVIRONMENT` ne fait ni l'un ni l'autre.
   */
  it("toute variable de paiement suit la nomenclature", () => {
    const paiement = [...declarees].filter((n) => /^(FEDAPAY|STRIPE)_/u.test(n));
    expect(paiement.sort()).toEqual([
      "FEDAPAY_API_KEY",
      "FEDAPAY_ENVIRONMENT",
      "FEDAPAY_WEBHOOK_SECRET",
      "STRIPE_API_KEY",
      "STRIPE_WEBHOOK_SECRET",
    ]);
    for (const nom of paiement) {
      expect(nom, nom).toMatch(/^(FEDAPAY|STRIPE)_(API_KEY|WEBHOOK_SECRET|ENVIRONMENT)$/u);
    }
  });

  it("les deux usages ne se confondent pas", () => {
    expect(CLES_SORTANTES).toEqual(["FEDAPAY_API_KEY", "STRIPE_API_KEY"]);
    expect(SECRETS_ENTRANTS).toEqual(["FEDAPAY_WEBHOOK_SECRET", "STRIPE_WEBHOOK_SECRET"]);
    // Aucune clé ne sert dans les deux sens : ce serait dire que le secret
    // qui nous authentifie chez le fournisseur est celui qui authentifie ce
    // qu'il nous envoie.
    expect(CLES_SORTANTES.filter((c) => SECRETS_ENTRANTS.includes(c))).toEqual([]);
  });

  /** Un seul module les nomme ; ailleurs, on passe par lui. */
  it("le fournisseur FedaPay porte aussi son espace, qui n'est pas un secret", () => {
    expect(CLES.FEDAPAY.environnement).toBe("FEDAPAY_ENVIRONMENT");
    expect(declarees.has(CLES.FEDAPAY.environnement)).toBe(true);
  });
});

describe("le registre des dépendances et `.env.example` disent la même chose", () => {
  /**
   * Le défaut exactement : une dépendance qui exige `FEDAPAY_API_KEY`
   * devant un fichier d'exemple qui propose `FEDAPAY_SECRET_KEY`.
   */
  it("toute variable exigée par une dépendance figure dans `.env.example`", () => {
    const absentes = DEPENDANCES.flatMap((d) =>
      d.variables.filter((v) => !declarees.has(v)).map((v) => `${d.cle} → ${v}`),
    );
    expect(absentes).toEqual([]);
  });

  /**
   * Et la réciproque pour les bloquantes : une variable documentée que
   * personne ne lit est une décoration, et une décoration qui porte le nom
   * d'un secret se remplit consciencieusement pour rien.
   *
   * La vérification passe par le vrai chemin — celui qu'emprunte
   * `/api/health` — plutôt que par une recherche de chaîne : vider la
   * variable doit **changer** ce que l'application observe.
   */
  it("vider une variable bloquante change ce que l'application observe", () => {
    const bloquantes = DEPENDANCES.filter((d) => d.statut !== "FACULTATIVE_PILOTE");
    expect(bloquantes.map((d) => d.cle)).toEqual([
      "messagerie",
      "paiements",
      "ouverture_paiement",
      "antivirus",
      "remboursement",
    ]);

    const toutes = Object.fromEntries(
      DEPENDANCES.flatMap((d) => d.variables).map((v) => [v, "valeur"]),
    );

    for (const dependance of bloquantes) {
      expect(observer(dependance, toutes).configuree, dependance.cle).toBe(true);
      for (const variable of dependance.variables) {
        const sans = { ...toutes, [variable]: "" };
        expect(observer(dependance, sans).configuree, `${dependance.cle} sans ${variable}`).toBe(
          false,
        );
      }
    }
  });

  /**
   * Le même accord, vu de l'autre côté : le module qui lit la
   * configuration et la liste du registre doivent exiger les mêmes
   * variables. Sans cela, l'un des deux dériverait en silence — c'est
   * précisément ce qui s'est produit.
   */
  it("aucune variable exigée par une dépendance n'est ignorée du module", () => {
    for (const dependance of DEPENDANCES) {
      const ailleurs = SOURCES.filter((f) => f !== REGISTRE).map(lire);
      for (const variable of dependance.variables) {
        expect(
          ailleurs.some((source) => source.includes(variable)),
          `${dependance.cle} → ${variable} n'est nommée nulle part hors du registre`,
        ).toBe(true);
      }
    }
  });
});

describe("l'ancienne graphie est comprise, datée, et ne dit jamais la valeur", () => {
  afterEach(() => {
    oublierLesAvertissements();
    vi.restoreAllMocks();
  });

  const SECRET = "sk_live_valeur_qui_ne_doit_pas_sortir";

  it("replie l'ancien nom sur le nouveau", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const lu = environnementNormalise({ FEDAPAY_SECRET_KEY: SECRET });
    expect(lu.FEDAPAY_API_KEY).toBe(SECRET);
    // L'ancien nom reste lisible tel quel : on replie, on n'efface pas.
    expect(lu.FEDAPAY_SECRET_KEY).toBe(SECRET);
  });

  /** Le nouveau nom l'emporte : une migration à moitié faite est prévisible. */
  it("le nouveau nom l'emporte quand les deux sont renseignés", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const lu = environnementNormalise({
      FEDAPAY_SECRET_KEY: "ancienne",
      FEDAPAY_API_KEY: "nouvelle",
    });
    expect(lu.FEDAPAY_API_KEY).toBe("nouvelle");
  });

  it("avertit avec le nom et la date, jamais avec la valeur", () => {
    const journal = vi.spyOn(console, "warn").mockImplementation(() => {});
    environnementNormalise({ STRIPE_SECRET_KEY: SECRET });

    expect(journal).toHaveBeenCalledTimes(1);
    const dit = journal.mock.calls.flat().join(" ");
    expect(dit).toContain("STRIPE_SECRET_KEY");
    expect(dit).toContain("STRIPE_API_KEY");
    expect(dit).toContain(RETRAIT_DES_ANCIENS_NOMS);
    // Ni la valeur, ni un fragment, ni sa longueur : un journal se recopie
    // dans un ticket, et un ticket se partage.
    expect(dit).not.toContain(SECRET);
    expect(dit).not.toContain(SECRET.slice(0, 8));
    expect(dit).not.toContain(String(SECRET.length));
  });

  it("n'avertit qu'une fois, et pas du tout quand le nouveau nom est là", () => {
    const journal = vi.spyOn(console, "warn").mockImplementation(() => {});
    environnementNormalise({ STRIPE_SECRET_KEY: SECRET });
    environnementNormalise({ STRIPE_SECRET_KEY: SECRET });
    expect(journal).toHaveBeenCalledTimes(1);

    journal.mockClear();
    environnementNormalise({ FEDAPAY_API_KEY: "nouvelle" });
    expect(journal).not.toHaveBeenCalled();
  });

  /**
   * Une compatibilité sans date devient une seconde convention. Ce test
   * échoue le jour du retrait, et son message dit quoi supprimer.
   */
  it("le retrait est daté, et la date n'est pas passée", () => {
    expect(Object.keys(ANCIENS_NOMS).sort()).toEqual([
      "FEDAPAY_SECRET_KEY",
      "STRIPE_SECRET_KEY",
    ]);
    const retrait = Date.parse(`${RETRAIT_DES_ANCIENS_NOMS}T23:59:59Z`);
    expect(Number.isNaN(retrait)).toBe(false);
    expect(
      Date.now() < retrait,
      `Le ${RETRAIT_DES_ANCIENS_NOMS} est passé. Vider ANCIENS_NOMS dans ` +
        `src/server/paiement/secrets.ts, retirer le bloc « Déprécié » de ` +
        `.env.example, et supprimer ce test avec lui.`,
    ).toBe(true);
  });

  /** Les anciens noms ne sont plus proposés : on migre, on ne choisit pas. */
  it("les anciens noms ne figurent plus dans `.env.example` comme variables", () => {
    for (const ancien of Object.keys(ANCIENS_NOMS)) {
      expect(declarees.has(ancien), ancien).toBe(false);
      // Ils y restent nommés, en commentaire, avec leur date de retrait.
      expect(EXEMPLE).toContain(ancien);
    }
    expect(EXEMPLE).toContain(RETRAIT_DES_ANCIENS_NOMS);
  });
});

describe("aucune valeur de secret ne part au journal", () => {
  const SECRETS = [...CLES_SORTANTES, ...SECRETS_ENTRANTS];

  it("aucun appel à console n'interpole la lecture d'un secret", () => {
    const fautifs: string[] = [];
    for (const fichier of SOURCES) {
      for (const ligne of lire(fichier).split("\n")) {
        if (!/console\.\w+\(/u.test(ligne)) continue;
        for (const secret of SECRETS) {
          if (
            new RegExp(`process\\.env\\.${secret}|process\\.env\\["?${secret}`, "u").test(ligne) ||
            new RegExp(`\\$\\{[^}]*${secret}`, "u").test(ligne)
          ) {
            fautifs.push(`${fichier} → ${ligne.trim()}`);
          }
        }
      }
    }
    expect(fautifs).toEqual([]);
  });

  /**
   * Le seul endroit qui parle d'un secret absent le nomme sans le lire :
   * c'est le cas où la tentation est la plus forte, puisqu'on aimerait
   * savoir ce qui a été reçu.
   */
  it("le refus de signature dit ce qui manque, pas ce qu'il a lu", () => {
    const signature = lire("src/server/paiement/signature.ts");
    const journaux = signature.split("\n").filter((l) => /console\.\w+\(/u.test(l));
    expect(journaux.length).toBeGreaterThan(0);
    for (const ligne of journaux) {
      expect(ligne, ligne.trim()).not.toMatch(/secret\s*[,)]|\$\{secret|corpsBrut|entete/u);
    }
  });
});
