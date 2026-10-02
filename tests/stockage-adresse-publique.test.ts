import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MOTIF_ADRESSE,
  REGION_DE_SIGNATURE,
  lireAdressePublique,
} from "@/domain/stockage/adresse-publique";
import { oublierLesClients, presignedGet, presignedPut } from "@/lib/storage";

/**
 * S.98 — les URL présignées sont signées pour l'adresse que joint le
 * navigateur, et non pour celle que joint le serveur.
 *
 * En production, `MINIO_ENDPOINT` vaut `minio`, un nom du réseau Docker.
 * Signées avec lui, les URL de dépôt étaient injoignables : aucune pièce ne
 * pouvait être déposée, et rien ne le voyait, parce qu'en local
 * `localhost:9000` est joignable des deux côtés.
 */

describe("l'adresse publique du stockage", () => {
  it("absente, elle ne s'invente pas", () => {
    expect(lireAdressePublique(undefined)).toBeNull();
    expect(lireAdressePublique("  ")).toBeNull();
  });

  it("https, port implicite ou explicite", () => {
    expect(lireAdressePublique("https://stockage.immipro.app")).toEqual({
      valide: true,
      adresse: { hote: "stockage.immipro.app", port: 443, chiffre: true },
    });
    expect(lireAdressePublique("https://stockage.immipro.app/")).toMatchObject({ valide: true });
    expect(lireAdressePublique("https://s3.exemple.test:8443")).toEqual({
      valide: true,
      adresse: { hote: "s3.exemple.test", port: 8443, chiffre: true },
    });
  });

  it("http seulement sur la boucle locale", () => {
    expect(lireAdressePublique("http://localhost:9000")).toEqual({
      valide: true,
      adresse: { hote: "localhost", port: 9000, chiffre: false },
    });
    expect(lireAdressePublique("http://stockage.immipro.app")).toEqual({
      valide: false,
      defaut: "http_hors_boucle_locale",
    });
  });

  it.each([
    ["pas une adresse", "stockage", "illisible"],
    ["un autre schéma", "ftp://stockage.immipro.app", "schema"],
    ["un chemin", "https://stockage.immipro.app/seau", "chemin_ou_parametres"],
    ["un paramètre", "https://stockage.immipro.app/?x=1", "chemin_ou_parametres"],
    ["des identifiants", "https://cle:secret@stockage.immipro.app", "identifiants"],
  ] as const)("refuse %s", (_cas, brute, defaut) => {
    expect(lireAdressePublique(brute)).toEqual({ valide: false, defaut });
  });

  it("chaque refus a un message qui nomme la variable", () => {
    for (const motif of Object.values(MOTIF_ADRESSE)) expect(motif).toContain("MINIO_PUBLIC_URL");
  });
});

describe("la signature des URL présignées", () => {
  const BASE = {
    MINIO_ENDPOINT: "minio",
    MINIO_PORT: "9000",
    MINIO_USE_SSL: "false",
    MINIO_ROOT_USER: "GKessai",
    MINIO_ROOT_PASSWORD: "secret-d-essai",
    MINIO_BUCKET_DOCUMENTS: "immipro-documents",
    MINIO_BUCKET_QUARANTAINE: "immipro-quarantaine",
  };

  afterEach(() => {
    vi.unstubAllEnvs();
    oublierLesClients();
  });

  const avec = (variables: Record<string, string>) => {
    for (const [cle, valeur] of Object.entries({ ...BASE, ...variables })) vi.stubEnv(cle, valeur);
    oublierLesClients();
  };

  it("le dépôt est signé pour l'adresse publique, en https, sur la quarantaine", async () => {
    avec({ MINIO_PUBLIC_URL: "https://stockage.immipro.app", NODE_ENV: "production" });
    const url = new URL(await presignedPut("dossiers/d1/passeport.pdf"));
    expect(url.protocol).toBe("https:");
    expect(url.host).toBe("stockage.immipro.app");
    expect(url.pathname).toBe("/immipro-quarantaine/dossiers/d1/passeport.pdf");
    expect(url.searchParams.get("X-Amz-Credential")).toContain(`/${REGION_DE_SIGNATURE}/s3/`);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
  });

  it("la lecture est signée pour l'adresse publique, sur le seau de confiance", async () => {
    avec({ MINIO_PUBLIC_URL: "https://stockage.immipro.app", NODE_ENV: "production" });
    const url = new URL(await presignedGet("dossiers/d1/passeport.pdf"));
    expect(url.host).toBe("stockage.immipro.app");
    expect(url.pathname).toBe("/immipro-documents/dossiers/d1/passeport.pdf");
  });

  it("aucun appel réseau : la signature tient devant un hôte qui ne se résout pas", async () => {
    avec({ MINIO_PUBLIC_URL: "https://stockage.invalid", MINIO_ENDPOINT: "minio.invalid" });
    const url = new URL(await presignedPut("dossiers/d1/passeport.pdf"));
    expect(url.host).toBe("stockage.invalid");
  });

  it("jamais l'adresse interne quand une adresse publique existe", async () => {
    avec({ MINIO_PUBLIC_URL: "https://stockage.immipro.app" });
    expect(await presignedPut("k")).not.toContain("minio");
    expect(await presignedGet("k")).not.toContain("minio");
  });

  it("en production, l'absence d'adresse publique coupe le dépôt et nomme la variable", async () => {
    avec({ NODE_ENV: "production" });
    vi.stubEnv("MINIO_PUBLIC_URL", "");
    await expect(async () => presignedPut("k")).rejects.toThrow(/MINIO_PUBLIC_URL/u);
  });

  it("une adresse publique invalide coupe le dépôt avec son motif", async () => {
    avec({ MINIO_PUBLIC_URL: "http://stockage.immipro.app" });
    await expect(async () => presignedPut("k")).rejects.toThrow(MOTIF_ADRESSE.http_hors_boucle_locale);
  });

  it("sur le poste de développement, sans adresse publique, l'adresse interne sert aux deux", async () => {
    avec({ NODE_ENV: "development", MINIO_ENDPOINT: "localhost", MINIO_PUBLIC_URL: "" });
    const url = new URL(await presignedPut("k"));
    expect(url.host).toBe("localhost:9000");
  });
});
