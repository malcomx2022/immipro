import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { sansCommentaires } from "@/domain/copy/source";
import { fichierCsv } from "@/domain/format/csv";
import {
  COLONNES_APPELS,
  JOURS_MAXIMUM,
  MODELE_NON_CONSIGNE,
  SANS_DOSSIER,
  exportDesAppels,
  nomDesAppels,
  obstacleALaPeriode,
  type AppelIA,
} from "@/domain/backoffice/appels-ia";
import type { TarifIA } from "@/domain/backoffice/couts";
import {
  phraseDuRapprochement,
  resumerLeRapprochement,
} from "@/domain/backoffice/reconciliation";

/**
 * S.122 — les deux commandes rétablies : l'export du détail des appels IA
 * (B-07) et « Lancer le rapprochement » (B-04).
 */

const TARIF: TarifIA = { entreeParMillion: 3, sortieParMillion: 15, devise: "EUR" };
const APPEL = (surcharge: Partial<AppelIA> = {}): AppelIA => ({
  horodatage: "2026-09-15T09:30:00.000Z",
  fournisseur: "anthropic",
  modele: "modele-essai",
  jetonsEntree: 1_000_000,
  jetonsSortie: 100_000,
  dossierId: "dossier-1",
  ...surcharge,
});
const PERIODE = { du: "2026-09-01", au: "2026-09-30" };
const tousTarifes = () => TARIF;
const aucunTarif = () => null;

describe("B-07 — la période de l'export est bornée, jamais tronquée", () => {
  it("accepte une période ordinaire, d'un jour comme d'un an", () => {
    expect(obstacleALaPeriode(PERIODE)).toBeNull();
    expect(obstacleALaPeriode({ du: "2026-09-15", au: "2026-09-15" })).toBeNull();
    expect(obstacleALaPeriode({ du: "2025-10-07", au: "2026-10-07" })).toBeNull();
  });

  it("refuse une période inversée, en disant quoi faire", () => {
    const obstacle = obstacleALaPeriode({ du: "2026-09-30", au: "2026-09-01" });
    expect(obstacle).toContain("inversez");
  });

  it("refuse une période trop longue, avec le maximum et la suite", () => {
    const obstacle = obstacleALaPeriode({ du: "2025-01-01", au: "2026-09-30" });
    expect(obstacle).toContain(String(JOURS_MAXIMUM));
    expect(obstacle).toMatch(/plus courte|plusieurs fois/u);
  });

  it("refuse un jour qui n'existe pas au calendrier", () => {
    expect(obstacleALaPeriode({ du: "2026-02-30", au: "2026-03-05" })).toMatch(/AAAA-MM-JJ/u);
    expect(obstacleALaPeriode({ du: "", au: "2026-03-05" })).toMatch(/AAAA-MM-JJ/u);
  });
});

describe("B-07 — ce que le fichier des appels contient", () => {
  it("porte exactement les colonnes de B-07, sans compte ni opération", () => {
    expect(COLONNES_APPELS).toEqual([
      "Horodatage (UTC)",
      "Jour (Cotonou)",
      "Fournisseur",
      "Modèle",
      "Jetons d'entrée",
      "Jetons de sortie",
      "Coût",
      "Devise",
      "Dossier",
    ]);
    const colonnes = COLONNES_APPELS.join(" ").toLowerCase();
    expect(colonnes).not.toMatch(/utilisateur|compte|nom|courriel|email|opération/u);
  });

  it("écrit une ligne par appel, au tarif de son fournisseur", () => {
    const lignes = exportDesAppels(PERIODE, [APPEL()], tousTarifes);
    const csv = fichierCsv(lignes);
    // 1 000 000 × 3 + 100 000 × 15 = 3 000 000 + 1 500 000, soit 4,5 EUR.
    expect(csv).toContain("2026-09-15T09:30:00.000Z;2026-09-15;Anthropic (Claude);modele-essai;1000000;100000;4,500000;EUR;dossier-1");
  });

  it("laisse le coût vide sans tarif : un tarif absent n'est pas un coût nul", () => {
    const csv = fichierCsv(exportDesAppels(PERIODE, [APPEL()], aucunTarif));
    expect(csv).toContain(";1000000;100000;;;dossier-1");
    expect(csv).not.toContain("0,000000");
  });

  it("n'applique jamais le tarif d'un fournisseur à un autre", () => {
    const seulAnthropic = (f: string) => (f === "anthropic" ? TARIF : null);
    const csv = fichierCsv(
      exportDesAppels(
        PERIODE,
        [APPEL(), APPEL({ fournisseur: "openai_compatible", dossierId: "dossier-2" })],
        seulAnthropic,
      ),
    );
    expect(csv).toContain("4,500000;EUR;dossier-1");
    expect(csv).toMatch(/;1000000;100000;;;dossier-2/u);
  });

  it("nomme l'historique d'avant S.94 et l'appel sans dossier, sans les inventer", () => {
    const csv = fichierCsv(exportDesAppels(PERIODE, [APPEL({ modele: null, dossierId: null })], tousTarifes));
    expect(csv).toContain(MODELE_NON_CONSIGNE);
    expect(csv).toContain(SANS_DOSSIER);
  });

  it("range l'appel au jour de Cotonou, pas au jour UTC", () => {
    // 23 h 30 UTC le 15 est 0 h 30 le 16 à Cotonou (UTC+1).
    const csv = fichierCsv(exportDesAppels(PERIODE, [APPEL({ horodatage: "2026-09-15T23:30:00.000Z" })], tousTarifes));
    expect(csv).toContain("2026-09-15T23:30:00.000Z;2026-09-16;");
  });

  it("ordonne les appels dans le temps", () => {
    const lignes = exportDesAppels(
      PERIODE,
      [APPEL({ horodatage: "2026-09-20T10:00:00.000Z" }), APPEL({ horodatage: "2026-09-02T10:00:00.000Z" })],
      tousTarifes,
    );
    const csv = fichierCsv(lignes);
    expect(csv.indexOf("2026-09-02T10")).toBeLessThan(csv.indexOf("2026-09-20T10"));
  });

  it("dit son périmètre en en-tête : période, nombre d'appels, jetons", () => {
    const csv = fichierCsv(exportDesAppels(PERIODE, [APPEL(), APPEL()], tousTarifes));
    expect(csv).toContain("Période;du 2026-09-01 au 2026-09-30");
    expect(csv).toContain("Appels;2");
    expect(csv).toContain("Jetons (entrée + sortie);2200000");
    expect(csv).not.toContain("Attestation");
  });

  it("atteste l'absence d'appel sur une période vide, au lieu d'un fichier vide", () => {
    const csv = fichierCsv(exportDesAppels(PERIODE, [], tousTarifes));
    expect(csv).toContain("Attestation;Aucun appel IA enregistré sur cette période.");
    expect(csv).toContain("Appels;0");
  });

  it("neutralise une référence de dossier qui commencerait comme une formule", () => {
    const csv = fichierCsv(exportDesAppels(PERIODE, [APPEL({ dossierId: "=cmd|' /C calc'!A0" })], tousTarifes));
    expect(csv).toContain("'=cmd");
  });

  it("nomme le fichier d'après la période", () => {
    expect(nomDesAppels(PERIODE)).toBe("immipro-appels-ia-2026-09-01_2026-09-30.csv");
    expect(nomDesAppels({ du: "2026-09-15", au: "2026-09-15" })).toBe("immipro-appels-ia-2026-09-15.csv");
  });
});

describe("B-07 — l'export ne sait rien d'un candidat (lecteur et route)", () => {
  const lecture = readFileSync("src/server/lecture/backoffice.ts", "utf8");
  const debut = lecture.indexOf("export async function appelsDeLaPeriode(");
  const fin = lecture.indexOf("\n}\n", debut);
  const lecteur = sansCommentaires(lecture.slice(debut, fin));

  it("ne sélectionne ni le compte ni la nature de l'opération", () => {
    expect(lecteur).toContain("db.aiUsage.findMany");
    expect(lecteur).not.toMatch(/userId|operation|user:|include/u);
  });

  it("ne plafonne pas la lecture", () => {
    expect(lecteur).not.toContain("take");
  });

  it("la route refuse une période invalide avant de lire, et journalise avant de répondre", () => {
    const route = sansCommentaires(readFileSync("src/app/api/admin/couts-ia/export/route.ts", "utf8"));
    expect(route.indexOf("obstacleALaPeriode(")).toBeLessThan(route.indexOf("appelsDeLaPeriode("));
    expect(route.indexOf("await journaliser(")).toBeLessThan(route.indexOf("new Response("));
    expect(route).toContain('action: "couts-ia.export"');
  });
});

describe("B-04 — le compte rendu d'une passe de rapprochement", () => {
  it("partage les transactions examinées entre consultées et sans réponse", () => {
    expect(resumerLeRapprochement({ examinees: 10, indisponibles: 3, rattrapees: 2 })).toEqual({
      consultees: 7,
      appliquees: 2,
      inchangees: 5,
      indisponibles: 3,
    });
  });

  it("ne produit jamais un compte négatif ni supérieur au total", () => {
    const r = resumerLeRapprochement({ examinees: 2, indisponibles: 5, rattrapees: 9 });
    expect(r).toEqual({ consultees: 0, appliquees: 0, inchangees: 0, indisponibles: 2 });
  });

  it("dit quand rien n'attendait", () => {
    const phrase = phraseDuRapprochement(resumerLeRapprochement({ examinees: 0, indisponibles: 0, rattrapees: 0 }));
    expect(phrase).toContain("Aucune transaction n'attendait");
  });

  it("dit qu'une absence de réponse n'a rien prouvé, et quand la passe reviendra", () => {
    const phrase = phraseDuRapprochement(resumerLeRapprochement({ examinees: 4, indisponibles: 4, rattrapees: 0 }));
    expect(phrase).toContain("aucune des 4 transactions");
    expect(phrase).toContain("Rien n'a été modifié");
    expect(phrase).toContain("quinze minutes");
  });

  it("compte consultées, appliquées et inchangées, avec les accords au singulier", () => {
    expect(phraseDuRapprochement(resumerLeRapprochement({ examinees: 1, indisponibles: 0, rattrapees: 1 }))).toBe(
      "1 transaction consultée : 1 état appliqué, 0 inchangée.",
    );
    expect(phraseDuRapprochement(resumerLeRapprochement({ examinees: 5, indisponibles: 1, rattrapees: 2 }))).toBe(
      "4 transactions consultées : 2 états appliqués, 2 inchangées. 1 transaction sans réponse du fournisseur, laissée en l'état.",
    );
  });
});

describe("B-04 — l'action n'a ni sa logique, ni son chemin d'écriture (INV-7)", () => {
  const route = sansCommentaires(readFileSync("src/app/api/admin/paiements/rapprochement/route.ts", "utf8"));
  const reconciliation = sansCommentaires(readFileSync("src/server/jobs/reconciliation.ts", "utf8"));
  const worker = sansCommentaires(readFileSync("src/server/jobs/worker.ts", "utf8"));

  it("appelle la passe du worker, réservée à l'administration et au régime sensible", () => {
    expect(route).toContain("reconcilierSansRecouvrement()");
    expect(route).toContain('acces: "admin"');
    expect(route).toContain('limite: "sensible"');
  });

  it("n'écrit aucun état de paiement elle-même", () => {
    expect(route).not.toMatch(/@\/lib\/db|db\.transaction|status:|appliquerLaNotification/u);
  });

  it("le worker et la route passent par le même verrou, jamais par la passe nue", () => {
    expect(worker).toContain("reconcilierSansRecouvrement()");
    expect(worker).not.toContain("reconcilierLesPaiements");
    expect(reconciliation).toContain("pg_try_advisory_xact_lock");
  });

  it("une passe déjà en cours est refusée avec un échec explicite, pas rejouée", () => {
    expect(route).toContain('echec("rapprochement_en_cours")');
    expect(route).toContain("bilan === null");
  });

  it("est journalisée, résultat compris, et une interruption laisse sa trace", () => {
    expect(route.match(/await journaliser\(/gu)).toHaveLength(2);
    expect(route).toContain('action: "paiement.rapprochement.manuel"');
    expect(route).toContain("details:");
  });

  it("l'écran appelle la route et traite chargement, échec et résultat", () => {
    const ecran = sansCommentaires(readFileSync("src/app/(admin)/paiements/Paiements.tsx", "utf8"));
    expect(ecran).toContain("/api/admin/paiements/rapprochement");
    expect(ecran).toContain("Lancer le rapprochement");
    expect(ecran).toContain("chargement={rapprochementEnCours}");
    expect(ecran).toContain("BlocEchec echec={echecRapprochement}");
    expect(ecran).toContain("compteRendu");
  });
});
