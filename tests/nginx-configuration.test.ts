import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

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

/**
 * Dérive de la configuration nginx — revue du 07/10/2026, M16 (D-29 :
 * `immipro.app`, `www` redirigé, un certificat par webroot).
 */
const lireSans = (f: string) =>
  readFileSync(f, "utf8")
    .split("\n")
    .map((ligne) => ligne.replace(/#.*$/u, ""))
    .join("\n");
const SITE = lireSans("nginx/immipro.conf");
const STOCKAGE = lireSans("nginx/stockage.conf");
/** Les blocs `server { … }`, chacun avec ses `location` imbriquées. */
const serveurs = (texte: string): string[] => {
  const blocs: string[] = [];
  for (const m of texte.matchAll(/server\s*\{/gu)) {
    let profondeur = 0;
    for (let i = m.index! + m[0].length - 1; i < texte.length; i += 1) {
      if (texte[i] === "{") profondeur += 1;
      if (texte[i] === "}" && --profondeur === 0) {
        blocs.push(texte.slice(m.index!, i + 1));
        break;
      }
    }
  }
  return blocs;
};
const corpsDesLocations = (texte: string) => [...texte.matchAll(/location[^{]*\{([^}]*)\}/gu)].map((m) => m[1]!);

describe("une seule origine, des certificats renouvelables", () => {
  it("www redirige en 301 vers le domaine nu, en http comme en https", () => {
    const www = serveurs(SITE).find((s) => /server_name www\.immipro\.app;/u.test(s))!;
    expect(www).toMatch(/return 301 https:\/\/immipro\.app\$request_uri;/u);
    expect(www).not.toContain("proxy_pass");
    const http = serveurs(SITE).find((s) => /listen 80;/u.test(s))!;
    expect(http).toMatch(/return 301 https:\/\/immipro\.app\$request_uri;/u);
  });

  it("le port 80 de chaque domaine sert le défi webroot de certbot", () => {
    for (const texte of [SITE, STOCKAGE]) {
      const http = serveurs(texte).find((s) => /listen 80;/u.test(s))!;
      expect(http).toMatch(/location \/\.well-known\/acme-challenge\/ \{\s*root \/var\/www\/certbot;/u);
    }
  });

  it("un certificat pour les trois noms", () => {
    const chemins = new Set(
      [...`${SITE}${STOCKAGE}`.matchAll(/ssl_certificate\s+(\S+);/gu)].map((m) => m[1]),
    );
    expect([...chemins]).toEqual(["/etc/letsencrypt/live/immipro.app/fullchain.pem"]);
  });
});

describe("les en-têtes, à un seul endroit", () => {
  it("HSTS sur chaque serveur https, et aucune location ne pose d'add_header", () => {
    for (const texte of [SITE, STOCKAGE]) {
      for (const s of serveurs(texte).filter((b) => /listen 443/u.test(b))) {
        expect(s).toContain('add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;');
      }
      // Un `add_header` dans une location efface ceux du serveur, HSTS compris.
      for (const corps of corpsDesLocations(texte)) expect(corps).not.toContain("add_header");
    }
  });

  it("les en-têtes de l'application sont ceux de Next, pas de nginx", () => {
    for (const entete of ["X-Frame-Options", "X-Content-Type-Options", "Content-Security-Policy"]) {
      expect(SITE).not.toContain(entete);
    }
    expect(SITE).not.toMatch(/proxy_cache_valid/u);
  });

  it("l'état de service ne remplit pas le journal", () => {
    expect(SITE).toMatch(/location = \/api\/health \{\s*access_log off;/u);
  });
});

describe("chaque location de l'API correspond à une route réelle", () => {
  it("aucune location /api/ ne vise une route qui n'existe pas", () => {
    const prefixes = [...SITE.matchAll(/location\s+(?:=\s+)?(\/api\/[^\s{]*)/gu)].map((m) => m[1]!);
    expect(prefixes.length).toBeGreaterThan(0);
    for (const p of prefixes) {
      const dossier = `src/app${p.replace(/\/$/u, "")}`;
      expect(existsSync(dossier), p).toBe(true);
    }
    // La regex des comptes, une par une.
    for (const route of ["comptes", "comptes/session", "comptes/mot-de-passe"]) {
      expect(existsSync(`src/app/api/${route}/route.ts`), route).toBe(true);
    }
    expect(SITE).not.toContain("/api/documents/upload");
  });

  it("chaque zone de limitation déclarée sert", () => {
    for (const [, zone] of SITE.matchAll(/limit_req_zone \S+ zone=(\w+):/gu)) {
      expect(SITE, zone).toMatch(new RegExp(`limit_req zone=${zone}\\b`, "u"));
    }
  });
});

describe("le vhost du stockage", () => {
  it("ne pose rien qui casserait l'aperçu de B-05 en cadre", () => {
    expect(STOCKAGE).not.toContain("X-Frame-Options");
    expect(STOCKAGE).not.toContain("frame-ancestors");
  });

  it("transmet l'hôte (signature SigV4) et relaie vers le port du compose", () => {
    expect(STOCKAGE).toContain("proxy_set_header Host $host;");
    const port = /"127\.0\.0\.1:(\d+):\d+"/u.exec(readFileSync("docker-compose.prod.yml", "utf8"))![1];
    expect(STOCKAGE).toContain(`proxy_pass http://127.0.0.1:${port};`);
  });

  it("lire, déposer, le préliminaire CORS ; rien d'autre, et en flux", () => {
    expect(STOCKAGE).toMatch(/limit_except GET PUT OPTIONS \{\s*deny all;\s*\}/u);
    expect(STOCKAGE).toContain("proxy_request_buffering off;");
    const max = Number(/client_max_body_size (\d+)m;/u.exec(STOCKAGE)![1]);
    // `TAILLE_MAXI_MO` vaut dix : une pièce entière passe.
    expect(max).toBeGreaterThan(10);
  });
});

describe("la syntaxe est éprouvée en CI", () => {
  it("validation.yml lance nginx -t sur ces fichiers", () => {
    expect(readFileSync(".github/workflows/validation.yml", "utf8")).toContain("scripts/verifier-nginx.sh");
  });
});
