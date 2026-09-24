import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DELAIS_D_ALERTE,
  FUSEAUX_PROPOSES,
  HEURE_DES_RAPPELS,
  PREFERENCES_PAR_DEFAUT,
  TENTATIVES_MAX,
  canalDepuisLaSonde,
  cleDuRappel,
  etatApresLEnvoi,
  heureDuRappelAtteinte,
  lirePreferences,
  phraseDesRappels,
  repriseEncorePossible,
  suiteDuDernierRappel,
} from "@/domain/dossiers/preferences-rappels";
import {
  MENTION_REGLAGE,
  rappelDuJour,
  type DossierARappeler,
  type EcheanceARappeler,
} from "@/domain/dossiers/rappels";
import { FUSEAU_AFFICHAGE, fuseauReconnu, jourCivilPlus, momentDans } from "@/domain/format/fuseau";
import { suiteDeLEnvoi } from "@/domain/courrier/transport";
import { INTERDITS_PARTOUT, verifierTexte } from "@/domain/copy/vocabulaire-interdit";

/**
 * Les rappels d'échéance réglables — S.87, RG-09.4.
 *
 * Quatre familles de cas que la demande nomme : les changements d'heure,
 * les échéances du jour, les rattrapages et les doubles exécutions. Ce qui
 * demande une base — la clé unique, la reprise d'un courrier — s'éprouve
 * dans `scripts/fumee-rappels.mts`.
 */

/** Le moment où la passe du candidat peut envoyer, pour un instant et un fuseau. */
const peutEnvoyer = (iso: string, fuseau: string) =>
  heureDuRappelAtteinte(momentDans(new Date(iso), fuseau).heure);

describe("les changements d'heure", () => {
  /**
   * Paris passe à l'heure d'été le 29 mars 2026 à 1 h UTC. La veille, huit
   * heures à Paris sont sept heures UTC ; le jour même, six heures. Un
   * cron à sept heures UTC envoyait donc à neuf heures tout l'été.
   */
  it("à Paris, huit heures locales suivent le passage à l'heure d'été", () => {
    expect(peutEnvoyer("2026-03-28T06:59:00Z", "Europe/Paris")).toBe(false);
    expect(peutEnvoyer("2026-03-28T07:00:00Z", "Europe/Paris")).toBe(true);
    expect(peutEnvoyer("2026-03-29T05:59:00Z", "Europe/Paris")).toBe(false);
    expect(peutEnvoyer("2026-03-29T06:00:00Z", "Europe/Paris")).toBe(true);
  });

  it("et le retour à l'heure d'hiver", () => {
    expect(peutEnvoyer("2026-10-24T05:59:00Z", "Europe/Paris")).toBe(false);
    expect(peutEnvoyer("2026-10-24T06:00:00Z", "Europe/Paris")).toBe(true);
    expect(peutEnvoyer("2026-10-25T06:59:00Z", "Europe/Paris")).toBe(false);
    expect(peutEnvoyer("2026-10-25T07:00:00Z", "Europe/Paris")).toBe(true);
  });

  /**
   * La nuit du changement, l'heure de une à deux heures (heure locale) se
   * répète ou disparaît. Le jour civil, lui, ne bouge pas : la clé du
   * rappel reste la même toute la journée, et une passe dans l'heure
   * répétée ne produit pas un second rappel.
   */
  it("la nuit du changement ne fabrique pas un second jour", () => {
    const jours = ["2026-10-25T00:30:00Z", "2026-10-25T01:30:00Z", "2026-10-25T22:59:00Z"].map(
      (iso) => momentDans(new Date(iso), "Europe/Paris").jour,
    );
    expect(new Set(jours)).toEqual(new Set(["2026-10-25"]));
    expect(momentDans(new Date("2026-10-25T23:00:00Z"), "Europe/Paris").jour).toBe("2026-10-26");
  });

  it("à Montréal, le jour local n'est pas le jour UTC", () => {
    // 2 h UTC le 25 septembre : 22 h la veille à Montréal.
    const instant = new Date("2026-09-25T02:00:00Z");
    expect(momentDans(instant, "America/Toronto")).toEqual({ jour: "2026-09-24", heure: 22 });
    expect(cleDuRappel("d1", momentDans(instant, "America/Toronto").jour)).toBe(
      "echeance:d1:2026-09-24",
    );
    // Et le passage à l'heure normale le 1er novembre 2026 : la veille,
    // huit heures sont midi UTC ; le jour même, treize heures.
    expect(peutEnvoyer("2026-10-31T12:00:00Z", "America/Toronto")).toBe(true);
    expect(peutEnvoyer("2026-11-01T12:59:00Z", "America/Toronto")).toBe(false);
    expect(peutEnvoyer("2026-11-01T13:00:00Z", "America/Toronto")).toBe(true);
  });

  it("minuit s'écrit zéro heure, pas vingt-quatre", () => {
    expect(momentDans(new Date("2026-09-24T23:00:00Z"), FUSEAU_AFFICHAGE)).toEqual({
      jour: "2026-09-25",
      heure: 0,
    });
  });

  it("tout fuseau proposé est lisible par le moteur", () => {
    for (const f of FUSEAUX_PROPOSES) expect(fuseauReconnu(f.id), f.id).toBe(true);
    expect(fuseauReconnu("Mars/Olympus")).toBe(false);
  });
});

const echeance = (code: string, date: string, reste: Partial<EcheanceARappeler> = {}) => ({
  code,
  libelle: `Faire ${code}`,
  date,
  faite: false,
  rappeleeLe: null,
  ...reste,
});
const dossier = (
  echeances: EcheanceARappeler[],
  dernierRappelLe: string | null = null,
): DossierARappeler => ({ intitule: "Ton dossier Pays-Bas", echeances, dernierRappelLe });

describe("les échéances du jour", () => {
  const AUJOURDHUI = "2026-09-24";

  it("une échéance du jour est une urgence, et le courrier dit « aujourd'hui »", () => {
    const rappel = rappelDuJour(dossier([echeance("rdv", AUJOURDHUI)]), AUJOURDHUI);
    expect(rappel?.motif).toBe("urgence");
    expect(rappel?.corps).toContain("aujourd'hui");
  });

  /**
   * Le jour du candidat, pas celui du serveur : à 23 h 30 à Montréal le
   * 24, le serveur est déjà au 25 et lirait l'échéance du 24 comme
   * dépassée d'un jour.
   */
  it("le jour de l'échéance se lit dans le fuseau du candidat", () => {
    const { jour } = momentDans(new Date("2026-09-25T03:30:00Z"), "America/Toronto");
    const rappel = rappelDuJour(dossier([echeance("rdv", "2026-09-24")]), jour);
    expect(rappel?.corps).toContain("aujourd'hui");
    expect(rappel?.corps).not.toContain("dépassée");
  });

  it("le délai d'alerte choisi décide de l'urgence", () => {
    const loin = dossier([echeance("rdv", jourCivilPlus(AUJOURDHUI, 10))], jourCivilPlus(AUJOURDHUI, -1));
    expect(rappelDuJour(loin, AUJOURDHUI, 7)).toBeNull();
    expect(rappelDuJour(loin, AUJOURDHUI, 14)?.motif).toBe("urgence");
    const proche = dossier([echeance("rdv", jourCivilPlus(AUJOURDHUI, 5))], jourCivilPlus(AUJOURDHUI, -1));
    expect(rappelDuJour(proche, AUJOURDHUI, 3)).toBeNull();
    expect(rappelDuJour(proche, AUJOURDHUI, 7)?.motif).toBe("urgence");
  });

  it("chaque courrier dit comment régler ou couper ses rappels", () => {
    const rappel = rappelDuJour(dossier([echeance("rdv", AUJOURDHUI)]), AUJOURDHUI);
    expect(rappel?.corps.endsWith(MENTION_REGLAGE)).toBe(true);
  });
});

describe("les rattrapages", () => {
  it("toute heure après huit heures rattrape le rappel du jour", () => {
    for (let h = 0; h < 24; h += 1) {
      expect(heureDuRappelAtteinte(h)).toBe(h >= HEURE_DES_RAPPELS);
    }
  });

  /**
   * Un worker arrêté une journée entière : l'urgence qu'il aurait
   * annoncée la veille n'est pas perdue, elle part le lendemain.
   */
  it("une journée manquée n'efface pas l'urgence", () => {
    const d = dossier([echeance("rdv", "2026-09-29")], "2026-09-20");
    // La passe du 23 (J-6) n'a pas tourné ; celle du 24 (J-5) la voit.
    expect(rappelDuJour(d, "2026-09-24")?.motif).toBe("urgence");
  });

  it("un courrier en attente est repris le même jour, jamais le lendemain", () => {
    expect(repriseEncorePossible(1, "2026-09-24", "2026-09-24")).toBe(true);
    expect(repriseEncorePossible(TENTATIVES_MAX, "2026-09-24", "2026-09-24")).toBe(false);
    expect(repriseEncorePossible(1, "2026-09-24", "2026-09-25")).toBe(false);
  });
});

describe("les doubles exécutions et les courriers", () => {
  it("deux passes le même jour local produisent la même clé", () => {
    const a = momentDans(new Date("2026-09-24T07:05:00Z"), FUSEAU_AFFICHAGE).jour;
    const b = momentDans(new Date("2026-09-24T21:05:00Z"), FUSEAU_AFFICHAGE).jour;
    expect(cleDuRappel("d1", a)).toBe(cleDuRappel("d1", b));
    expect(cleDuRappel("d1", a)).not.toBe(cleDuRappel("d2", a));
  });

  it("un courrier n'est « envoyé » que si le serveur l'a accepté", () => {
    const jour = "2026-09-24";
    expect(etatApresLEnvoi(suiteDeLEnvoi("envoye"), 1, jour, jour)).toBe("ENVOYE");
    expect(etatApresLEnvoi(suiteDeLEnvoi("injoignable"), 1, jour, jour)).toBe("EN_ATTENTE");
    expect(etatApresLEnvoi(suiteDeLEnvoi("injoignable"), TENTATIVES_MAX, jour, jour)).toBe(
      "NON_ENVOYE",
    );
    for (const issue of ["journalise", "non_configure", "refuse"] as const) {
      expect(etatApresLEnvoi(suiteDeLEnvoi(issue), 1, jour, jour), issue).toBe("NON_ENVOYE");
    }
  });

  it("aucun état de courrier ne se dit parti s'il ne l'est pas", () => {
    expect(suiteDuDernierRappel("ENVOYE")).toContain("Parti par email");
    for (const etat of ["EN_ATTENTE", "NON_ENVOYE", null] as const) {
      expect(suiteDuDernierRappel(etat)).not.toMatch(/Parti|envoyé par email/u);
      expect(suiteDuDernierRappel(etat)).toContain("tes alertes");
    }
  });
});

describe("les préférences, et ce que l'écran en dit", () => {
  it("les réglages d'origine sont ceux de RG-09.2", () => {
    expect(PREFERENCES_PAR_DEFAUT).toEqual({
      actifs: true,
      email: true,
      fuseau: FUSEAU_AFFICHAGE,
      joursAvant: 7,
    });
    expect(DELAIS_D_ALERTE).toContain(PREFERENCES_PAR_DEFAUT.joursAvant);
  });

  it("un fuseau illisible ou un délai hors liste retombe sur l'origine", () => {
    expect(
      lirePreferences({
        remindersEnabled: true,
        reminderEmail: false,
        reminderTimeZone: "Mars/Olympus",
        reminderLeadDays: 5,
      }),
    ).toEqual({ actifs: true, email: false, fuseau: FUSEAU_AFFICHAGE, joursAvant: 7 });
  });

  it("seul un constat concluant rend l'email annonçable", () => {
    expect(canalDepuisLaSonde("CONCLUANTE")).toBe("OPERATIONNEL");
    for (const s of ["ECHOUEE", "ABSENTE", "IMPOSSIBLE"] as const) {
      expect(canalDepuisLaSonde(s)).toBe("INDISPONIBLE");
    }
  });

  it("la phrase ne dit « par email » que si le candidat le veut et que l'envoi est prouvé", () => {
    const p = PREFERENCES_PAR_DEFAUT;
    expect(phraseDesRappels(p, "OPERATIONNEL")).toContain("par email");
    expect(phraseDesRappels(p, "INDISPONIBLE")).not.toContain("rappel par email");
    expect(phraseDesRappels({ ...p, email: false }, "OPERATIONNEL")).not.toContain(
      "rappel par email",
    );
    expect(phraseDesRappels({ ...p, actifs: false }, "OPERATIONNEL")).toContain("coupés");
    expect(phraseDesRappels({ ...p, joursAvant: 14 }, "OPERATIONNEL")).toContain("quatorze jours");
    expect(phraseDesRappels({ ...p, fuseau: "Europe/Paris" }, "OPERATIONNEL")).toContain(
      "heure de Paris",
    );
  });

  it("aucune phrase n'emploie le vocabulaire interdit", () => {
    const phrases = [
      MENTION_REGLAGE,
      ...[true, false].flatMap((actifs) =>
        [true, false].flatMap((email) =>
          (["OPERATIONNEL", "INDISPONIBLE"] as const).map((canal) =>
            phraseDesRappels({ ...PREFERENCES_PAR_DEFAUT, actifs, email }, canal),
          ),
        ),
      ),
      ...(["ENVOYE", "EN_ATTENTE", "NON_ENVOYE", null] as const).map(suiteDuDernierRappel),
    ];
    for (const phrase of phrases) expect(verifierTexte(phrase, INTERDITS_PARTOUT), phrase).toEqual([]);
  });
});

describe("le job lit le réglage dans la requête", () => {
  const source = readFileSync("src/server/jobs/rappels.ts", "utf8");

  /**
   * Comme INV-4 pour les règles secondaires : un candidat qui a coupé ses
   * rappels n'est pas filtré à l'envoi, il n'est pas lu.
   */
  it("un compte aux rappels coupés n'est pas même examiné", () => {
    expect(source).toMatch(/user: \{ \.\.\.COMPTE_JOIGNABLE, remindersEnabled: true \}/u);
  });

  it("la réservation porte la clé idempotente, avant tout envoi", () => {
    const reservation = source.indexOf("dedupKey: cleDuRappel(");
    const envoi = source.indexOf("await tenterLeCourrier(notification");
    expect(reservation).toBeGreaterThan(-1);
    expect(envoi).toBeGreaterThan(reservation);
  });

  it("le worker planifie la passe toutes les heures", () => {
    const worker = readFileSync("src/server/jobs/worker.ts", "utf8");
    expect(worker).toContain('boss.schedule(JOBS.RAPPEL_ECHEANCIER, "5 * * * *")');
  });
});
