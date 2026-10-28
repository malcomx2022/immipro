import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  HORIZON_FIN_PREVUE_JOURS,
  finsSansRelais,
  libelleFinPrevue,
  suiteFinPrevue,
  type VersionPourRelais,
} from "@/domain/backoffice/veille";
import { INTERDITS_PARTOUT, verifierTexte } from "@/domain/copy/vocabulaire-interdit";

/**
 * C-13 — une fin prévue sans relais se dit au veilleur avant qu'elle
 * retire la procédure (S.200).
 *
 * Les deux règles NL de la graine finissent le 31/12/2026. Le filtre
 * candidat lit `effectiveTo` comme fin prévue : sans version 2027
 * publiée, plus aucune destination néerlandaise ne s'affiche le
 * 1er janvier. La file de veille ne suit que l'échéance de relecture ;
 * rien ne l'annonçait.
 */
const AUJOURDHUI = "2026-10-28";

const nl = (surcharges: Partial<VersionPourRelais> = {}): VersionPourRelais => ({
  id: "nl-1",
  code: "NL",
  procedure: "NL:etudes_mvv_vvr",
  pays: "Pays-Bas",
  libelle: "Séjour pour études (MVV + VVR)",
  version: 1,
  statut: "PUBLISHED",
  publieeLe: "2026-01-02T08:00:00.000Z",
  finPrevue: "2026-12-31",
  ...surcharges,
});

describe("finsSansRelais", () => {
  it("signale la version en vigueur qui finit dans l'horizon sans successeur", () => {
    const [fin, ...reste] = finsSansRelais([nl()], AUJOURDHUI);
    expect(reste).toHaveLength(0);
    expect(fin).toEqual({
      id: "nl-1",
      code: "NL",
      pays: "Pays-Bas",
      libelle: "Séjour pour études (MVV + VVR)",
      version: 1,
      finPrevue: "2026-12-31",
      joursRestants: 64,
      brouillonSuivant: null,
    });
  });

  it("borne l'horizon à quatre-vingt-dix jours, compris", () => {
    expect(HORIZON_FIN_PREVUE_JOURS).toBe(90);
    expect(finsSansRelais([nl({ finPrevue: "2027-01-26" })], AUJOURDHUI)).toHaveLength(1);
    expect(finsSansRelais([nl({ finPrevue: "2027-01-27" })], AUJOURDHUI)).toHaveLength(0);
  });

  it("ne dit rien d'une version sans fin prévue", () => {
    expect(finsSansRelais([nl({ finPrevue: null })], AUJOURDHUI)).toEqual([]);
  });

  it("compte la version que RG-14.1 a repassée en brouillon : elle reste en vigueur", () => {
    expect(finsSansRelais([nl({ statut: "DRAFT" })], AUJOURDHUI)).toHaveLength(1);
  });

  it("ignore une version archivée et un brouillon jamais publié", () => {
    expect(finsSansRelais([nl({ statut: "ARCHIVED" })], AUJOURDHUI)).toEqual([]);
    expect(finsSansRelais([nl({ statut: "DRAFT", publieeLe: null })], AUJOURDHUI)).toEqual([]);
  });

  it("se tait quand un successeur est déjà en vigueur", () => {
    const suivante = nl({ id: "nl-2", version: 2, finPrevue: null });
    expect(finsSansRelais([nl(), suivante], AUJOURDHUI)).toEqual([]);
  });

  it("nomme le brouillon suivant qui attend sa publication", () => {
    const brouillon = nl({ id: "nl-2", version: 2, statut: "DRAFT", publieeLe: null, finPrevue: null });
    const [fin] = finsSansRelais([nl(), brouillon], AUJOURDHUI);
    expect(fin?.brouillonSuivant).toBe(2);
  });

  it("ne confond pas deux procédures du même pays", () => {
    const emploi = nl({
      id: "nl-emploi-2",
      procedure: "NL:kennismigrant",
      version: 2,
      finPrevue: null,
    });
    expect(finsSansRelais([nl(), emploi], AUJOURDHUI)).toHaveLength(1);
  });

  it("garde une fin déjà passée, la plus urgente en tête", () => {
    const passee = nl({ id: "de-1", code: "DE", procedure: "DE:etudes", finPrevue: "2026-10-25" });
    const fins = finsSansRelais([nl(), passee], AUJOURDHUI);
    expect(fins.map((f) => [f.id, f.joursRestants])).toEqual([
      ["de-1", -3],
      ["nl-1", 64],
    ]);
  });
});

describe("ce que lit le veilleur", () => {
  const [avant] = finsSansRelais([nl()], AUJOURDHUI);
  const [jourMeme] = finsSansRelais([nl({ finPrevue: AUJOURDHUI })], AUJOURDHUI);
  const [apres] = finsSansRelais([nl({ finPrevue: "2026-10-25" })], AUJOURDHUI);
  const [avecBrouillon] = finsSansRelais(
    [nl(), nl({ id: "nl-2", version: 2, statut: "DRAFT", publieeLe: null, finPrevue: null })],
    AUJOURDHUI,
  );

  it("dit l'écart en jours, jamais la seule date", () => {
    expect(libelleFinPrevue(avant!)).toBe("Fin prévue dans 64 j");
    expect(libelleFinPrevue(jourMeme!)).toBe("Fin prévue aujourd'hui");
    expect(libelleFinPrevue(apres!)).toBe("Fin prévue dépassée de 3 j");
  });

  it("dit l'effet chez le candidat et le geste qui l'évite", () => {
    expect(suiteFinPrevue(avant!)).toBe(
      "Le lendemain de cette date, la procédure ne s'affiche plus chez le candidat. Aucune version suivante n'existe : ouvre la version 2 depuis la fiche, à partir de la source officielle, puis publie-la.",
    );
    expect(suiteFinPrevue(apres!)).toMatch(/^La procédure ne s'affiche plus chez le candidat depuis cette date\./u);
    expect(suiteFinPrevue(avecBrouillon!)).toContain(
      "Le brouillon de la version 2 attend : relis-le sur la source officielle, puis publie-le.",
    );
  });

  it("n'emploie aucune formulation interdite", () => {
    for (const fin of [avant!, jourMeme!, apres!, avecBrouillon!]) {
      expect(verifierTexte(`${libelleFinPrevue(fin)} ${suiteFinPrevue(fin)}`, INTERDITS_PARTOUT)).toEqual([]);
    }
  });
});

const m = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { visaRule: { findMany: m.findMany } } }));

describe("finsPrevuesSansRelais — la lecture de B-01", () => {
  const ligne = (surcharges: Record<string, unknown> = {}) => ({
    id: "nl-1",
    countryCode: "NL",
    visaType: "etudes_mvv_vvr",
    version: 1,
    status: "PUBLISHED",
    publishedAt: new Date("2026-01-02T08:00:00Z"),
    effectiveTo: new Date("2026-12-31T00:00:00Z"),
    rules: { libelle: "Séjour pour études (MVV + VVR)" },
    ...surcharges,
  });

  beforeEach(() => m.findMany.mockReset());

  it("cherche les procédures en vigueur à fin prévue, puis toutes leurs versions", async () => {
    const { finsPrevuesSansRelais } = await import("@/server/lecture/backoffice");
    m.findMany
      .mockResolvedValueOnce([{ countryCode: "NL", visaType: "etudes_mvv_vvr" }])
      .mockResolvedValueOnce([
        ligne(),
        ligne({ id: "nl-2", version: 2, status: "DRAFT", publishedAt: null, effectiveTo: null }),
      ]);
    const fins = await finsPrevuesSansRelais(new Date("2026-10-28T10:00:00Z"));
    expect(m.findMany.mock.calls[0]![0]).toMatchObject({
      where: { effectiveTo: { not: null }, publishedAt: { not: null }, status: { not: "ARCHIVED" } },
    });
    expect(m.findMany.mock.calls[1]![0]).toMatchObject({
      where: { OR: [{ countryCode: "NL", visaType: "etudes_mvv_vvr" }] },
    });
    expect(fins).toMatchObject([
      { id: "nl-1", code: "NL", version: 1, finPrevue: "2026-12-31", joursRestants: 64, brouillonSuivant: 2 },
    ]);
  });

  it("ne lit rien de plus quand aucune procédure n'a de fin prévue", async () => {
    const { finsPrevuesSansRelais } = await import("@/server/lecture/backoffice");
    m.findMany.mockResolvedValueOnce([]);
    expect(await finsPrevuesSansRelais(new Date("2026-10-28T10:00:00Z"))).toEqual([]);
    expect(m.findMany).toHaveBeenCalledTimes(1);
  });

  it("compte les jours depuis le jour civil de Cotonou, pas depuis UTC", async () => {
    const { finsPrevuesSansRelais } = await import("@/server/lecture/backoffice");
    m.findMany
      .mockResolvedValueOnce([{ countryCode: "NL", visaType: "etudes_mvv_vvr" }])
      .mockResolvedValueOnce([ligne()]);
    // 23 h 30 UTC le 27/10 : il est déjà le 28/10 à Cotonou.
    const [fin] = await finsPrevuesSansRelais(new Date("2026-10-27T23:30:00Z"));
    expect(fin?.joursRestants).toBe(64);
  });
});
