import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AIDE_DATE_DEPOT,
  EFFETS_DEPOT,
  QUESTION_DATE_DEPOT,
  correctionDuDepot,
  echeanceNormale,
  refusDeLaDateDeDepot,
} from "@/domain/dossiers/depot";
import {
  JALONS_DE_SUIVI,
  jalonsUtiles,
  prochaineRelance,
  relanceDeSuivi,
  relanceDuJour,
} from "@/domain/dossiers/suivi-depot";
import { INTERDITS_PARTOUT, verifierTexte } from "@/domain/copy/vocabulaire-interdit";

/**
 * La date réelle du dépôt — arbitrage S.89.
 *
 * Ce qui se décide sans base : la validation de la date, les relances
 * J+30 et J+60 sans rafale, et ce qu'une correction recalcule. Ce qui
 * demande une base — les deux dates stockées, la déclaration tardive, la
 * correction auditée, l'export — s'éprouve dans `scripts/fumee-depot.mts`.
 */

describe("la question posée au candidat", () => {
  it("est celle de l'arbitrage, mot pour mot", () => {
    expect(QUESTION_DATE_DEPOT).toBe("Quand as-tu déposé ta demande ?");
    expect(AIDE_DATE_DEPOT).toBe(
      "Indique la date où tu as remis ou envoyé la demande à l'autorité ou à son prestataire.",
    );
  });

  it("l'écran dit que la conservation part de la date du dépôt, et annonce les relances", () => {
    const effets = EFFETS_DEPOT.join(" ");
    expect(effets).toContain("après la date de ton dépôt");
    expect(effets).not.toContain("après cette déclaration");
    expect(effets).toContain("Trente puis soixante jours après ton dépôt");
  });
});

describe("la date saisie", () => {
  const AUJOURDHUI = "2026-09-25";
  const OUVERT = "2026-06-01";

  it("accepte aujourd'hui, et une date ancienne sans limite de retard", () => {
    expect(refusDeLaDateDeDepot(AUJOURDHUI, AUJOURDHUI, OUVERT)).toBeNull();
    expect(refusDeLaDateDeDepot(OUVERT, AUJOURDHUI, OUVERT)).toBeNull();
    // Deux ans après l'ouverture, un dépôt ancien déclaré tard reste valable.
    expect(refusDeLaDateDeDepot("2026-06-02", "2028-06-02", OUVERT)).toBeNull();
  });

  it("refuse le futur, en disant jusqu'où l'on peut aller", () => {
    const refus = refusDeLaDateDeDepot("2026-09-26", AUJOURDHUI, OUVERT);
    expect(refus).toContain("n'est pas encore arrivé");
    expect(refus).toContain("25 septembre 2026");
  });

  it("refuse une date antérieure à l'ouverture du dossier", () => {
    expect(refusDeLaDateDeDepot("2026-05-31", AUJOURDHUI, OUVERT)).toContain(
      "le dépôt ne peut pas le précéder",
    );
  });

  it("refuse une date illisible ou inexistante", () => {
    expect(refusDeLaDateDeDepot("", AUJOURDHUI, OUVERT)).toContain("n'est pas lisible");
    expect(refusDeLaDateDeDepot("2026-02-30", AUJOURDHUI, OUVERT)).toContain("n'est pas lisible");
    expect(refusDeLaDateDeDepot("25/09/2026", AUJOURDHUI, OUVERT)).toContain("n'est pas lisible");
  });

  it("ne compare rien à readyAt : la fonction ne le connaît même pas", () => {
    expect(refusDeLaDateDeDepot.length).toBe(3);
  });
});

describe("les relances J+30 et J+60 depuis la date réelle", () => {
  const suivi = (deposeLe: string, declareLe: string, aujourdhui: string, envoyes: number[] = []) =>
    relanceDuJour({ deposeLe, declareLe, aujourdhui, envoyes });

  it("se comptent depuis la date réelle, pas depuis la déclaration", () => {
    // Déposé le 1er septembre, déclaré le 20 : la relance tombe le 1er octobre.
    expect(suivi("2026-09-01", "2026-09-20", "2026-09-30")).toBeNull();
    expect(suivi("2026-09-01", "2026-09-20", "2026-10-01")).toBe(30);
    expect(suivi("2026-09-01", "2026-09-20", "2026-10-31", [30])).toBe(60);
  });

  it("une relance déjà dépassée le jour de la déclaration ne part jamais", () => {
    // Déposé il y a 45 jours : J+30 est derrière, seul J+60 reste utile.
    expect(jalonsUtiles({ deposeLe: "2026-08-01", declareLe: "2026-09-15" })).toEqual([60]);
    expect(suivi("2026-08-01", "2026-09-15", "2026-09-15")).toBeNull();
    expect(suivi("2026-08-01", "2026-09-15", "2026-09-30")).toBe(60);
    // Déposé il y a 90 jours : aucune relance, et aucune rafale.
    expect(jalonsUtiles({ deposeLe: "2026-06-15", declareLe: "2026-09-15" })).toEqual([]);
    expect(suivi("2026-06-15", "2026-09-15", "2026-12-31")).toBeNull();
  });

  it("un jalon qui tombe le jour de la déclaration n'est pas dépassé", () => {
    expect(jalonsUtiles({ deposeLe: "2026-08-16", declareLe: "2026-09-15" })).toEqual([30, 60]);
    expect(suivi("2026-08-16", "2026-09-15", "2026-09-15")).toBe(30);
  });

  it("un rattrapage n'envoie que le plus récent jalon échu", () => {
    // Worker arrêté du 20 septembre au 5 novembre : J+30 et J+60 sont échus.
    expect(suivi("2026-09-01", "2026-09-01", "2026-11-05")).toBe(60);
    // Et J+30 ne part plus après J+60.
    expect(suivi("2026-09-01", "2026-09-01", "2026-11-06", [60])).toBeNull();
  });

  it("une passe rejouée n'envoie pas deux fois le même jalon", () => {
    expect(suivi("2026-09-01", "2026-09-01", "2026-10-01", [30])).toBeNull();
  });

  it("la prochaine question se planifie, une seule", () => {
    expect(
      prochaineRelance({ deposeLe: "2026-08-01", declareLe: "2026-09-15", envoyes: [], aujourdhui: "2026-09-15" }),
    ).toEqual({ jalon: 60, le: "2026-09-30" });
    expect(
      prochaineRelance({ deposeLe: "2026-09-01", declareLe: "2026-09-01", envoyes: [30, 60], aujourdhui: "2026-11-01" }),
    ).toBeNull();
    expect(JALONS_DE_SUIVI).toEqual([30, 60]);
  });

  it("le texte demande, dit où répondre, et ne suppose rien de l'issue", () => {
    const trente = relanceDeSuivi(30, "Pays-Bas", "2026-09-01");
    expect(trente.corps).toContain("Tu as déposé ta demande le 1er septembre 2026.");
    expect(trente.corps).toContain("« Clôturer »");
    expect(trente.corps).toContain("tu n'as rien à faire");
    const soixante = relanceDeSuivi(60, "Pays-Bas", "2026-09-01");
    expect(soixante.corps).toContain("conservation de tes pièces");
    for (const t of [trente, soixante]) {
      expect(verifierTexte(`${t.objet} ${t.corps}`, INTERDITS_PARTOUT)).toEqual([]);
      expect(t.corps).not.toMatch(/refus|accept|délai habituel|bientôt/iu);
    }
  });
});

describe("la correction d'une date déjà déclarée", () => {
  const jour = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  it("l'échéance normale est douze mois après la date réelle", () => {
    expect(echeanceNormale("2026-01-31").toISOString().slice(0, 10)).toBe("2027-01-31");
  });

  it("recalcule l'échéance depuis la nouvelle date", () => {
    const r = correctionDuDepot({
      deposeLe: "2026-09-01",
      retentionUntil: echeanceNormale("2026-09-01"),
      purgeDueAt: null,
      nouvelle: "2026-08-15",
    });
    expect(r.retentionUntil).toEqual(jour("2027-08-15"));
    expect(r.purgeDueAt).toBeNull();
  });

  it("ne raccourcit jamais une prolongation obtenue", () => {
    const prolongee = jour("2028-03-01");
    const r = correctionDuDepot({
      deposeLe: "2026-09-01",
      retentionUntil: prolongee,
      purgeDueAt: null,
      nouvelle: "2026-08-15",
    });
    expect(r.retentionUntil).toEqual(prolongee);
  });

  it("ne rapproche jamais une purge déjà annoncée", () => {
    const annoncee = jour("2027-10-01");
    const r = correctionDuDepot({
      deposeLe: "2026-09-01",
      retentionUntil: echeanceNormale("2026-09-01"),
      purgeDueAt: annoncee,
      nouvelle: "2026-06-01",
    });
    // L'échéance recule à juin 2027, la purge reste au jour annoncé.
    expect(r.retentionUntil).toEqual(jour("2027-06-01"));
    expect(r.purgeDueAt).toEqual(annoncee);
  });

  it("une échéance repoussée au-delà de la purge annoncée fait tomber l'annonce", () => {
    const r = correctionDuDepot({
      deposeLe: "2026-01-01",
      retentionUntil: echeanceNormale("2026-01-01"),
      purgeDueAt: jour("2027-01-15"),
      nouvelle: "2026-03-01",
    });
    expect(r.retentionUntil).toEqual(jour("2027-03-01"));
    // La passe de conservation refera l'annonce, avec ses trente jours.
    expect(r.purgeDueAt).toBeNull();
  });
});

describe("le serveur tient ce que le domaine décide", () => {
  const lire = (chemin: string) => readFileSync(chemin, "utf8");

  it("la déclaration exige la date réelle et garde les deux faits", () => {
    const route = lire("src/app/api/dossiers/[id]/depot/route.ts");
    expect(route).toMatch(/deposeLe: z\s*\.string\(\)/u);
    const parcours = lire("src/server/dossiers/parcours.ts");
    expect(parcours).toMatch(/depositedOn: versDateCivile\(deposeLe\),\s*submittedAt: maintenant,/u);
    expect(parcours).toMatch(/retentionUntil: echeanceNormale\(deposeLe\)/u);
  });

  it("updatedAt ne tient lieu d'aucune des deux dates", () => {
    const conservation = lire("src/server/dossiers/conservation.ts");
    expect(conservation).not.toMatch(/dossier\.updatedAt/u);
  });

  it("la correction passe par le journal, avec l'ancienne et la nouvelle valeur", () => {
    const parcours = lire("src/server/dossiers/parcours.ts");
    const bloc = parcours.slice(parcours.indexOf("export async function corrigerLeDepot"));
    expect(bloc).toMatch(/action: "dossier\.depot\.correction"/u);
    expect(bloc.indexOf("await journaliser(")).toBeLessThan(bloc.indexOf("db.application.update("));
    expect(bloc).toMatch(/ancienne,\s*nouvelle: deposeLe/u);
    const route = lire("src/app/api/admin/dossiers/[id]/depot/route.ts");
    expect(route).toMatch(/acces: "admin"/u);
    expect(route).toMatch(/motif: z\s*\.string\(\)\s*\.trim\(\)\s*\.min\(10/u);
  });

  it("l'export distingue la date réelle et la date de déclaration", () => {
    const export_ = lire("src/server/lecture/portabilite.ts");
    expect(export_).toMatch(/dateReelleDuDepot: jour\(a\.depositedOn\)/u);
    expect(export_).toMatch(/depotDeclareDansImmiProLe: iso\(a\.submittedAt\)/u);
  });

  it("le worker planifie les relances toutes les heures", () => {
    const worker = lire("src/server/jobs/worker.ts");
    expect(worker).toContain('boss.schedule(JOBS.SUIVI_DEPOT, "20 * * * *")');
  });
});

describe("la demande de correction du candidat — S.90", () => {
  const base = {
    actuelle: "2026-09-10",
    declareLe: "2026-09-12",
    aujourdhui: "2026-09-25",
    ouvertLe: "2026-06-01",
  };

  it("suit les règles de la correction : bornes, pas après la déclaration, pas identique", async () => {
    const { refusDeLaCorrection } = await import("@/domain/dossiers/depot");
    expect(refusDeLaCorrection({ ...base, nouvelle: "2026-09-01" })).toBeNull();
    expect(refusDeLaCorrection({ ...base, nouvelle: "2026-09-10" })).toContain("est déjà le");
    expect(refusDeLaCorrection({ ...base, nouvelle: "2026-09-15" })).toContain("ne peut pas avoir eu lieu après");
    expect(refusDeLaCorrection({ ...base, nouvelle: "2026-05-01" })).toContain("ne peut pas le précéder");
    expect(refusDeLaCorrection({ ...base, nouvelle: "2026-10-01" })).toContain("pas encore arrivé");
  });

  it("demande d'où vient l'erreur", async () => {
    const { refusDeLExplication } = await import("@/domain/dossiers/depot");
    expect(refusDeLExplication("  trop  ")).toContain("d'où vient l'erreur");
    expect(refusDeLExplication("Le récépissé porte le 1er septembre.")).toBeNull();
  });

  it("dit que la demande attend, et que la date enregistrée reste d'ici là", async () => {
    const { demandeEnAttente, correctionAppliquee, correctionRefusee, AIDE_DEMANDE_DE_CORRECTION } =
      await import("@/domain/dossiers/depot");
    const attente = demandeEnAttente("2026-09-01", "2026-09-25");
    expect(attente).toContain("la date enregistrée reste celle que tu avais déclarée");
    const appliquee = correctionAppliquee("2026-09-01", new Date("2027-09-01T00:00:00Z"));
    expect(appliquee.corps).toContain("1er septembre 2027");
    const refusee = correctionRefusee("2026-09-01", "Le récépissé joint porte le 10 septembre.");
    expect(refusee.corps).toContain("Le récépissé joint porte le 10 septembre.");
    for (const t of [attente, appliquee.corps, refusee.corps, AIDE_DEMANDE_DE_CORRECTION]) {
      expect(verifierTexte(t, INTERDITS_PARTOUT), t).toEqual([]);
    }
  });

  it("le serveur tranche la demande en appliquant la correction, et vérifie la réponse d'un refus", () => {
    const parcours = readFileSync("src/server/dossiers/parcours.ts", "utf8");
    const correction = parcours.slice(parcours.indexOf("export async function corrigerLeDepot"));
    expect(correction).toMatch(/depositCorrectionRequest\.updateMany\(\{\s*where: \{ applicationId: dossier\.id, status: "EN_ATTENTE" \}/u);
    const refus = parcours.slice(parcours.indexOf("export async function refuserLaCorrectionDuDepot"));
    expect(refus).toMatch(/verifierTexte\(reponse, INTERDITS_PARTOUT\)/u);
    expect(refus).toMatch(/action: "dossier\.depot\.correction\.refus"/u);
    const migration = readFileSync(
      "prisma/migrations/20260925180000_demande_de_correction_du_depot/migration.sql",
      "utf8",
    );
    expect(migration).toMatch(/CREATE UNIQUE INDEX "correction_de_depot_une_en_attente"/u);
  });
});
