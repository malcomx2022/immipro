import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * `.env.example` ne décore pas — arbitrage du 22/09/2026.
 *
 * ── Ce qui a été trouvé ─────────────────────────────────────────────
 *
 * `next-auth` était déclaré en dépendance et importé nulle part. Il
 * traînait quatre variables dans `.env.example` — `NEXTAUTH_URL`,
 * `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` —, dont
 * deux portent le mot « secret ». Quelqu'un qui déploie les remplit
 * consciencieusement, et elles ne servent à rien : les sessions sont
 * écrites en base par le dépôt lui-même (I.2), et l'OAuth Google que
 * DOC-11 mentionne n'est pas implémenté.
 *
 * Ce n'est pas un encombrement : c'est la même famille de défaut que le
 * reste de ce dépôt corrige depuis des semaines — un fichier qui affirme
 * quelque chose que le code ne fait pas. Ici, l'affirmation est « cette
 * valeur est lue », et elle est fausse.
 *
 * ── Le garde-fou ────────────────────────────────────────────────────
 *
 * Toute variable déclarée a un lecteur : le code, ou un fichier
 * `docker-compose` — qui en est un, pour de bon, puisqu'il configure les
 * conteneurs. Le reste passe par une liste d'exceptions **nommées et
 * datées**, sur le modèle de `copy-exceptions.json` : une dette qui
 * apparaît dans la diff et se justifie vaut mieux qu'une dette invisible.
 *
 * Le test existant de `secrets-paiement` fait la moitié du chemin — il
 * vérifie que toute variable **exigée par une dépendance** est déclarée.
 * Une variable déclarée que personne n'exige lui échappait, et c'est
 * précisément le cas des quatre ci-dessus.
 */

const lire = (f: string) => readFileSync(f, "utf8");

function fichiers(dir: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) fichiers(p, acc);
    else if (/\.(tsx?|mts|mjs)$/u.test(nom)) acc.push(p.replace(/\\/gu, "/"));
  }
  return acc;
}

/** Le code de l'application, et les scripts d'exploitation. */
const SOURCES = [...fichiers("src"), ...fichiers("scripts")].map(lire).join("\n");

/** Les conteneurs en sont des lecteurs, aussi réels que le code. */
const COMPOSES = ["docker-compose.yml", "docker-compose.prod.yml"].map(lire).join("\n");

const EXEMPLE = lire(".env.example");

const declarees = EXEMPLE.split("\n")
  .map((l) => /^([A-Z0-9_]+)=/u.exec(l.trim())?.[1])
  .filter((n): n is string => n !== undefined);

/**
 * Les variables déclarées que personne ne lit **encore**, avec la raison
 * et la date. Au-delà de quelques entrées, ce n'est plus une exception :
 * c'est que le fichier d'exemple a cessé de décrire le produit.
 */
const SANS_LECTEUR: Readonly<Record<string, string>> = {
  /*
    Les trois `AI_TOKENS_PACK_*` sont sorties le 22/09/2026. Leur motif
    disait « deux sources pour le même nombre : à trancher, en retirant
    l'une des deux ». L'arbitrage est rendu par l'usage — `tokensIA` est
    lue par la règle de cohérence de la grille, et désormais par l'alerte
    de quota de B-07 —, et c'est le doublon dormant qui part. Le garder
    aurait fait modifier un jour la valeur que personne ne lit, en
    croyant agir.
  */
  SMS_PROVIDER_KEY:
    "22/09/2026 — DOC-11 §346 prévoit des rappels par SMS pour les échéances critiques (WF-09 étape 3) ; rien ne les envoie, et l'écran de l'échéancier le dit. La variable marque la place d'une capacité spécifiée, non implémentée : la retirer effacerait la trace de l'écart.",
};

describe("toute variable déclarée est lue quelque part", () => {
  /**
   * **Le test central.** Une variable d'exemple est une instruction
   * donnée à qui déploie : « renseigne ceci ». Si rien ne la lit,
   * l'instruction est fausse — et quand elle porte le mot « secret »,
   * elle fait aussi produire un secret pour rien.
   */
  it("aucune variable n'est une décoration", () => {
    const orphelines = declarees.filter(
      (v) => !SOURCES.includes(v) && !COMPOSES.includes(v) && !(v in SANS_LECTEUR),
    );
    expect(orphelines).toEqual([]);
  });

  /** Et l'inverse : une exception qui a trouvé son lecteur doit sortir. */
  it("aucune exception ne survit à son motif", () => {
    const inutiles = Object.keys(SANS_LECTEUR).filter(
      (v) => SOURCES.includes(v) || COMPOSES.includes(v),
    );
    expect(inutiles).toEqual([]);
  });

  it("chaque exception porte sa date et sa raison", () => {
    for (const [variable, motif] of Object.entries(SANS_LECTEUR)) {
      expect(motif, variable).toMatch(/\d{2}\/\d{2}\/\d{4}/u);
      expect(motif.length, variable).toBeGreaterThan(30);
    }
    // Au-delà de cinq, ce n'est plus une exception, c'est une dérive.
    expect(Object.keys(SANS_LECTEUR).length).toBeLessThanOrEqual(5);
  });
});

describe("next-auth est parti, et ne revient pas par la bande", () => {
  const paquet = JSON.parse(lire("package.json")) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    overrides?: Record<string, string>;
  };

  /**
   * Il était déclaré, jamais importé, et contraignait `nodemailer` à une
   * version portant dix avis de sécurité ouverts par son pair facultatif.
   * Une dépendance qu'on n'utilise pas ne coûte pas rien : elle vote.
   */
  it("il n'est plus une dépendance", () => {
    expect(paquet.dependencies).not.toHaveProperty("next-auth");
    expect(paquet.devDependencies).not.toHaveProperty("next-auth");
  });

  it("et rien ne l'importe, pas même un commentaire de configuration", () => {
    for (const fichier of [...fichiers("src"), ...fichiers("scripts")]) {
      const source = lire(fichier);
      expect(source, fichier).not.toMatch(/from ["']next-auth|require\(["']next-auth/u);
    }
  });

  /**
   * L'`overrides` n'existait que pour desserrer son pair. Le garder
   * figerait `nodemailer` sans que rien ne l'exige — et un jour, cette
   * contrainte sans motif empêcherait une mise à jour de sécurité.
   */
  it("l'overrides qu'il imposait est parti avec lui", () => {
    expect(paquet.overrides ?? {}).not.toHaveProperty("nodemailer");
    expect(paquet.dependencies.nodemailer).toMatch(/\^?(?:1\d|9\.[1-9])/u);
  });

  /** Ses variables ne sont plus proposées à qui déploie. */
  it("ses quatre variables ont quitté `.env.example`", () => {
    for (const v of [
      "NEXTAUTH_URL",
      "NEXTAUTH_SECRET",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
    ]) {
      expect(declarees, v).not.toContain(v);
    }
    // Et la section dit pourquoi elle est vide, plutôt que de disparaître
    // sans laisser de trace de la décision.
    expect(EXEMPLE).toMatch(/Authentification/u);
    expect(EXEMPLE).toMatch(/aucun lecteur/u);
  });
});
