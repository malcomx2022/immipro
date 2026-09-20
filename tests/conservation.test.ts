import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { echeanceEnAnnees, echeanceEnMois } from "@/server/jobs/purge";
import { CONSERVATION_MOIS, MENTION_PORTEE } from "@/domain/notifications/alerte";
import { CONSERVATION_ANNEES, MENTION_IMMUABLE } from "@/domain/backoffice/audit";
import { PURGE_JOURS } from "@/domain/dossiers/cloture";

/**
 * Une durée de conservation annoncée est tenue.
 *
 * Trois durées sont déclarées dans le domaine et affichées à quelqu'un :
 * trente jours pour les pièces d'un dossier clos, six mois pour les
 * alertes, cinq ans pour le journal d'audit. Une seule était appliquée. Les
 * deux autres étaient des phrases, et une base qui garde tout ne les tient
 * pas.
 */

function fichiers(dir: string, acc: string[] = []): string[] {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) fichiers(p, acc);
    else if (nom.endsWith(".ts")) acc.push(p);
  }
  return acc;
}

describe("le point de coupure suit le calendrier, pas une multiplication", () => {
  /**
   * Six mois n'est pas cent quatre-vingts jours : de mars à septembre il y
   * en a cent quatre-vingt-quatre, et de septembre à mars cent
   * quatre-vingt-un. Une durée annoncée en mois se compte en mois, sinon
   * la purge tombe quelques jours à côté de ce qui est écrit.
   */
  it("six mois en arrière depuis le 20 septembre", () => {
    expect(echeanceEnMois(6, new Date("2026-09-20T03:30:00Z")).toISOString()).toBe(
      "2026-03-20T03:30:00.000Z",
    );
  });

  it("cinq ans en arrière, années bissextiles comprises", () => {
    expect(echeanceEnAnnees(5, new Date("2029-02-28T03:30:00Z")).toISOString()).toBe(
      "2024-02-28T03:30:00.000Z",
    );
  });

  it("le passage d'année se fait sans arithmétique à la main", () => {
    expect(echeanceEnMois(6, new Date("2026-02-15T00:00:00Z")).toISOString()).toBe(
      "2025-08-15T00:00:00.000Z",
    );
  });
});

describe("chaque durée déclarée a son exécutant", () => {
  const PURGE = readFileSync("src/server/jobs/purge.ts", "utf8");

  /**
   * Le garde-fou du lot. Une durée de conservation est une phrase tant
   * qu'aucun code d'exécution ne la lit : c'est ce qui était arrivé aux
   * alertes et au journal, déclarés dans le domaine, affichés à quelqu'un,
   * et lus par personne.
   *
   * La lecture cherche dans `src/server`, pas dans le seul job : les trente
   * jours des pièces ne sont pas lus par la purge mais par le calcul de
   * l'échéance à la clôture, et la purge n'y voit qu'une date. Les deux
   * façons d'appliquer une durée sont légitimes ; ne l'appliquer nulle part
   * ne l'est pas.
   */
  it("aucune constante de conservation n'est laissée sans exécutant", () => {
    const declarees = fichiers("src/domain").flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(/^export const ((?:CONSERVATION|PURGE|RETENTION)[A-Z_]*)/gmu)]
        .map((m) => `${f} :: ${m[1]!}`),
    );
    expect(declarees.length).toBeGreaterThanOrEqual(3);

    const serveur = fichiers("src/server")
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    const orphelines = declarees.filter((d) => !serveur.includes(d.split(" :: ")[1]!));
    expect(orphelines).toEqual([]);
  });

  it("les durées lues sont celles que les phrases annoncent", () => {
    // Le nombre affiché et le nombre appliqué sortent de la même constante :
    // raccourcir une conservation change le texte du même coup.
    expect(MENTION_PORTEE).toContain(`${CONSERVATION_MOIS} mois`);
    expect(MENTION_IMMUABLE).toContain(`${CONSERVATION_ANNEES} ans`);
    expect(PURGE_JOURS).toBe(30);
  });

  /**
   * B-06 annonce que rien ne se supprime « depuis l'interface ». Une tâche
   * planifiée n'est pas l'interface — c'est même la seule façon de tenir
   * les deux moitiés de la phrase, l'immuabilité et la durée.
   */
  it("le journal se purge par échéance, et par rien d'autre", () => {
    expect(MENTION_IMMUABLE).toContain("depuis l'interface");
    const routes = fichiers("src/app/api").filter((f) => f.endsWith("route.ts"));
    const suppressions = routes.filter((f) => /auditLog\.delete/u.test(readFileSync(f, "utf8")));
    expect(suppressions).toEqual([]);
    expect(PURGE).toContain("auditLog.deleteMany");
  });

  it("une session échue ne se conserve pas sans motif", () => {
    expect(PURGE).toContain("session.deleteMany");
    expect(PURGE).toContain("expiresAt");
  });
});

describe("le worker passe les trois purges dans la même tâche", () => {
  const WORKER = readFileSync("src/server/jobs/worker.ts", "utf8");

  it("la tâche de rétention appelle les deux lots", () => {
    expect(WORKER).toContain("purgerLesPiecesEchues");
    expect(WORKER).toContain("purgerCeQuiEstEchu");
  });

  it("elle reste quotidienne, comme l'annonce DOC-11", () => {
    expect(WORKER).toMatch(/PURGE_RETENTION, "\d+ \d+ \* \* \*"/u);
  });
});
