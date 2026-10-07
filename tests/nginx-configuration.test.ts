import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * La configuration nginx du VPS — revue du 07/10/2026, E1.
 *
 * Ce fichier n'est pas déployé par la CI : il est recopié à la main sur le
 * serveur. Il n'est donc éprouvé nulle part ailleurs qu'ici, par sa lecture.
 */
const conf = readFileSync("nginx/immipro.conf", "utf8");
const sansCommentaires = conf
  .split("\n")
  .map((ligne) => ligne.replace(/#.*$/u, ""))
  .join("\n");

/** Le corps de chaque `location`, sans ses commentaires. */
const locations = [...sansCommentaires.matchAll(/location[^{]*\{([^}]*)\}/gu)].map((m) => m[1]!);

describe("nginx transmet l'adresse qu'il a vue, pas celle que le client écrit", () => {
  it("écrase X-Forwarded-For au lieu d'y ajouter", () => {
    expect(sansCommentaires).not.toContain("$proxy_add_x_forwarded_for");
    expect(sansCommentaires).toMatch(/proxy_set_header X-Forwarded-For \$remote_addr;/u);
  });

  /**
   * Nginx n'hérite des `proxy_set_header` du niveau `server` que dans une
   * `location` qui n'en déclare aucun. Une seule ligne ajoutée dans une
   * `location` la priverait de tous les autres, `Host` compris.
   */
  it("pose les en-têtes une fois, au niveau du serveur, et aucune location n'en redéclare", () => {
    expect(locations.length).toBeGreaterThan(0);
    for (const corps of locations) expect(corps).not.toContain("proxy_set_header");
    for (const entete of ["Host $host", "X-Real-IP $remote_addr", "X-Forwarded-Proto $scheme"]) {
      expect(sansCommentaires).toContain(`proxy_set_header ${entete};`);
    }
  });

  it("limite les routes publiques de comptes, qui existent, et répond 429", () => {
    expect(sansCommentaires).not.toMatch(/location \/api\/auth\//u);
    expect(sansCommentaires).toMatch(/location ~ \^\/api\/comptes\(\/session\|\/mot-de-passe\)\?\$/u);
    expect(sansCommentaires).toContain("limit_req_status 429;");
  });

  it("ne limite pas les webhooks, dont la signature est vérifiée (règle 5)", () => {
    const webhooks = sansCommentaires.match(/location \/api\/webhooks\/ \{([^}]*)\}/u)?.[1] ?? "";
    expect(webhooks).toContain("proxy_pass");
    expect(webhooks).not.toContain("limit_req");
  });
});
