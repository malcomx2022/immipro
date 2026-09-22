import { describe, expect, it } from "vitest";
import type PgBoss from "pg-boss";
import { declarerLesFiles, FILES, JOBS, poster, REPRISES } from "@/lib/queue";
import { TENTATIVES_AVANT_INCIDENT } from "@/domain/securite/balayage";

/**
 * pg-boss 10 ne crée plus une file au premier `send`. Deux conséquences se
 * sont payées cher et ne se voient qu'à l'exécution : le worker refuse de
 * planifier sur une file inconnue, et le producteur, lui, ne refuse rien —
 * il rend `null` et perd le job.
 *
 * Le démarrage réel sur PostgreSQL est vérifié par
 * `npm run smoke:worker -- --base`. Ici, ce qui se teste sans base : que la
 * liste déclarée couvre bien toutes les files, et qu'un job perdu lève.
 */
describe("déclaration des files", () => {
  it("couvre toutes les files nommées, sans exception", () => {
    // Une file ajoutée à JOBS et oubliée ici échouerait au premier `send`,
    // en production, sans bruit.
    expect([...FILES].sort()).toEqual(Object.values(JOBS).sort());
  });

  it("déclare chaque file auprès de pg-boss", async () => {
    const declarees: string[] = [];
    const faux = {
      createQueue: async (nom: string) => void declarees.push(nom),
      updateQueue: async () => {},
    };
    await declarerLesFiles(faux as unknown as PgBoss);
    expect(declarees).toEqual([...FILES]);
  });

  /**
   * La politique de reprise du balayage — I.D, 22/09/2026.
   *
   * Sans elle, pg-boss n'essaie qu'une fois : un moteur antivirus
   * redémarré pendant un dépôt laissait la pièce en quarantaine pour de
   * bon, et personne ne revenait la chercher.
   */
  it("le balayage est repris, et l'incident se lit avant l'épuisement", async () => {
    const options = new Map<string, PgBoss.Queue | undefined>();
    const misesAJour = new Map<string, PgBoss.Queue | undefined>();
    const faux = {
      createQueue: async (nom: string, o?: PgBoss.Queue) => void options.set(nom, o),
      updateQueue: async (nom: string, o?: PgBoss.Queue) => void misesAJour.set(nom, o),
    };
    await declarerLesFiles(faux as unknown as PgBoss);

    const balayage = options.get(JOBS.BALAYAGE_PIECE);
    expect(balayage?.retryLimit).toBeGreaterThan(1);
    expect(balayage?.retryBackoff).toBe(true);
    // Le seuil d'incident est franchi **avant** que les reprises soient
    // épuisées : être prévenu pendant qu'on peut encore agir.
    expect(balayage!.retryLimit!).toBeGreaterThan(TENTATIVES_AVANT_INCIDENT);

    /*
      `createQueue` est idempotente : sur une file qui existe déjà elle
      sort sans rien changer. Sans `updateQueue`, la politique ne
      s'appliquerait qu'aux installations neuves — un correctif qui a
      l'air déployé et ne l'est pas.
    */
    expect(misesAJour.get(JOBS.BALAYAGE_PIECE)?.retryLimit).toBe(balayage?.retryLimit);
  });

  /** Les autres files n'en portent pas : leur échec n'est pas attendu. */
  it("la reprise ne s'étend pas aux files qu'elle ne concerne pas", () => {
    expect(Object.keys(REPRISES)).toEqual([JOBS.BALAYAGE_PIECE]);
  });
});

describe("poster un job", () => {
  it("rend l'identifiant quand le job est accepté", async () => {
    const faux = { send: async () => "07c1f1a0-0000-4000-8000-000000000000" };
    await expect(poster(faux as unknown as PgBoss, JOBS.BALAYAGE_PIECE, { a: 1 })).resolves.toBe(
      "07c1f1a0-0000-4000-8000-000000000000",
    );
  });

  it("lève quand la file refuse le job au lieu de le laisser disparaître", async () => {
    // C'est le comportement de pg-boss sur une file inconnue : `null`, pas
    // d'erreur. Sans ce garde-fou, le dépôt d'une pièce répondrait « en
    // cours d'analyse » pour un fichier que personne ne balaiera.
    const faux = { send: async () => null };
    await expect(
      poster(faux as unknown as PgBoss, JOBS.BALAYAGE_PIECE, { a: 1 }),
    ).rejects.toThrow(/document\.balayage/u);
  });
});
