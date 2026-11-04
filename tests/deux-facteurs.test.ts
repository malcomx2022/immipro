// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  BLOCAGE_2FA_MINUTES,
  ECHECS_APRES_LEVEE,
  ECHECS_AVANT_BLOCAGE_2FA,
  adresseOtpauth,
  apresUnEchec,
  codeAuPas,
  compteurEnOctets,
  decalagesAEssayer,
  depuisBase32,
  etatDuBlocage,
  formaterCodeDeSecours,
  libelleCodesRestants,
  libelleDuRefus,
  lireLaSaisie,
  normaliserCodeDeSecours,
  pasDeTemps,
  secretEnGroupes,
  verifierLeCode,
  versBase32,
} from "@/domain/comptes/deux-facteurs";
import { codesDeSecoursNeufs, hmacSha1, secretNeuf } from "@/server/securite/totp";

/**
 * Double authentification, logique pure — S.214.
 *
 * Les vecteurs de la RFC 6238 (annexe B, SHA-1) fondent le calcul ; le
 * reste éprouve les décisions : fenêtre, dérive, anti-rejeu, blocage avec
 * hystérésis, codes de secours.
 */

const RFC_SECRET = new TextEncoder().encode("12345678901234567890");
const huit = (t: number) => codeAuPas(RFC_SECRET, pasDeTemps(t * 1000), hmacSha1, 8);

describe("calcul du code — RFC 6238, annexe B", () => {
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])("T = %i s → %s", (t, attendu) => {
    expect(huit(t)).toBe(attendu);
  });

  it("le compteur est écrit sur huit octets, gros-boutiste", () => {
    expect([...compteurEnOctets(1)]).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect([...compteurEnOctets(0x0102)]).toEqual([0, 0, 0, 0, 0, 0, 1, 2]);
  });
});

describe("base32 — RFC 4648", () => {
  it.each([
    ["", ""],
    ["f", "MY"],
    ["fo", "MZXQ"],
    ["foo", "MZXW6"],
    ["foob", "MZXW6YQ"],
    ["fooba", "MZXW6YTB"],
    ["foobar", "MZXW6YTBOI"],
  ])("« %s » ↔ %s", (clair, code) => {
    expect(versBase32(new TextEncoder().encode(clair))).toBe(code);
    if (code) expect(new TextDecoder().decode(depuisBase32(code)!)).toBe(clair);
  });

  it("refuse ce qui n'est pas du base32, tolère blancs, minuscules et remplissage", () => {
    expect(depuisBase32("MZXW1")).toBeNull();
    expect(depuisBase32("")).toBeNull();
    expect(new TextDecoder().decode(depuisBase32("mzxw 6ytb oi==")!)).toBe("foobar");
  });

  it("un secret neuf fait 160 bits et se lit par groupes de quatre", () => {
    const s = secretNeuf();
    expect(s).toMatch(/^[A-Z2-7]{32}$/u);
    expect(depuisBase32(s)!.length).toBe(20);
    expect(secretEnGroupes("ABCDEFGHIJ")).toBe("ABCD EFGH IJ");
    expect(secretNeuf()).not.toBe(s);
  });
});

describe("fenêtre, dérive et anti-rejeu", () => {
  const secret = depuisBase32("JBSWY3DPEHPK3PXP")!;
  const t = 1_800_000_000_000;
  const courant = pasDeTemps(t);
  const code = (d: number) => codeAuPas(secret, courant + d, hmacSha1);
  const verifier = (saisie: string, opts: { dernierPas?: number | null; derive?: number } = {}) =>
    verifierLeCode({ saisie, secret, maintenantMs: t, dernierPas: opts.dernierPas ?? null, derive: opts.derive ?? 0, hmac: hmacSha1 });

  it("accepte le pas courant et ses deux voisins, pas au-delà", () => {
    expect(verifier(code(0))).toEqual({ accepte: true, pas: courant, derive: 0 });
    expect(verifier(code(-1))).toMatchObject({ accepte: true, pas: courant - 1, derive: -1 });
    expect(verifier(code(1))).toMatchObject({ accepte: true, pas: courant + 1, derive: 1 });
    expect(verifier(code(2))).toEqual({ accepte: false, raison: "faux" });
    expect(verifier(code(-2))).toEqual({ accepte: false, raison: "faux" });
  });

  it("la dérive retenue recentre la fenêtre, bornée à un pas : jamais plus de deux pas d'écart", () => {
    expect(verifier(code(2), { derive: 1 })).toMatchObject({ accepte: true, derive: 1 });
    expect(verifier(code(-1), { derive: 1 })).toEqual({ accepte: false, raison: "faux" });
    // Une dérive stockée hors bornes ne l'élargit pas.
    expect(decalagesAEssayer(5)).toEqual([1, 0, 2]);
    expect(verifier(code(3), { derive: 5 })).toEqual({ accepte: false, raison: "faux" });
  });

  it("un code d'un pas déjà accepté, ou antérieur, est un rejeu", () => {
    expect(verifier(code(0), { dernierPas: courant })).toEqual({ accepte: false, raison: "rejeu" });
    expect(verifier(code(-1), { dernierPas: courant })).toEqual({ accepte: false, raison: "rejeu" });
    expect(verifier(code(1), { dernierPas: courant })).toMatchObject({ accepte: true, pas: courant + 1 });
  });

  it("refuse une saisie qui n'a pas six chiffres, tolère blancs et tirets", () => {
    expect(verifier("12345")).toEqual({ accepte: false, raison: "format" });
    const c = code(0);
    expect(verifier(`${c.slice(0, 3)} ${c.slice(3)}`)).toMatchObject({ accepte: true });
  });
});

describe("blocage avec hystérésis", () => {
  const maintenant = new Date("2026-11-04T10:00:00Z");

  it("cinq échecs bloquent quinze minutes", () => {
    let etat = etatDuBlocage(0, null, maintenant);
    let suite = { echecs: 0, bloqueJusqua: null as Date | null };
    for (let i = 0; i < ECHECS_AVANT_BLOCAGE_2FA; i += 1) {
      suite = apresUnEchec(etat, maintenant);
      etat = etatDuBlocage(suite.echecs, suite.bloqueJusqua, maintenant);
    }
    expect(etat.bloque).toBe(true);
    expect(suite.bloqueJusqua!.getTime() - maintenant.getTime()).toBe(BLOCAGE_2FA_MINUTES * 60_000);
    expect(etat.reprendDansMinutes).toBe(BLOCAGE_2FA_MINUTES);
  });

  it("à la levée, le compteur redescend à trois et non à zéro : deux essais avant le prochain blocage", () => {
    const passe = new Date(maintenant.getTime() - 1000);
    const leve = etatDuBlocage(5, passe, maintenant);
    expect(leve).toMatchObject({ bloque: false, echecs: ECHECS_APRES_LEVEE, essaisRestants: 2 });
    const un = apresUnEchec(leve, maintenant);
    expect(un.bloqueJusqua).toBeNull();
    const deux = apresUnEchec(etatDuBlocage(un.echecs, null, maintenant), maintenant);
    expect(deux.bloqueJusqua).not.toBeNull();
  });

  it("sans blocage antérieur, le compteur n'est pas abaissé", () => {
    expect(etatDuBlocage(4, null, maintenant)).toMatchObject({ echecs: 4, essaisRestants: 1 });
  });

  it("chaque refus dit ce qui s'est passé et ce qui reste", () => {
    const etat = etatDuBlocage(2, null, maintenant);
    expect(libelleDuRefus("faux", etat)).toMatch(/heure de ton téléphone.*3 essais/su);
    expect(libelleDuRefus("rejeu", etat)).toMatch(/déjà de servir.*suivant/su);
    expect(libelleDuRefus("secours", etat)).toMatch(/une fois/u);
    expect(libelleDuRefus("format", etatDuBlocage(4, null, maintenant))).toMatch(/Dernier essai/u);
    expect(libelleDuRefus("faux", etatDuBlocage(5, new Date(maintenant.getTime() + 600_000), maintenant))).toMatch(
      /se rouvre dans 10 minutes/u,
    );
  });
});

describe("codes de secours et saisie", () => {
  it("dix codes distincts dans l'alphabet dictable", () => {
    const codes = codesDeSecoursNeufs();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/u);
    expect(formaterCodeDeSecours("ABCDEFGH")).toBe("ABCD-EFGH");
  });

  it("normalise casse, blancs et tiret ; refuse un caractère ambigu", () => {
    expect(normaliserCodeDeSecours(" abcd-efgh ")).toBe("ABCDEFGH");
    expect(normaliserCodeDeSecours("ABCD-EFG0")).toBeNull();
    expect(normaliserCodeDeSecours("ABCD")).toBeNull();
  });

  it("un seul champ : six chiffres pour l'application, huit caractères pour un code de secours", () => {
    expect(lireLaSaisie("123 456")).toEqual({ genre: "totp", code: "123456" });
    expect(lireLaSaisie("abcd-efgh")).toEqual({ genre: "secours", code: "ABCDEFGH" });
    expect(lireLaSaisie("1234")).toEqual({ genre: "illisible" });
    expect(lireLaSaisie("12a456")).toEqual({ genre: "illisible" });
  });

  it("le décompte des codes restants dit quoi faire quand il en reste peu", () => {
    expect(libelleCodesRestants(10)).toBe("10 codes de secours restants sur 10.");
    expect(libelleCodesRestants(1)).toMatch(/Un code.*générer/u);
    expect(libelleCodesRestants(0)).toMatch(/Aucun.*génère/u);
  });
});

describe("adresse du code QR", () => {
  it("le format otpauth que lisent les applications, paramètres écrits", () => {
    const a = adresseOtpauth("awa+test@exemple.com", "JBSWY3DPEHPK3PXP");
    expect(a.startsWith("otpauth://totp/ImmiPro:awa%2Btest%40exemple.com?")).toBe(true);
    const p = new URL(a).searchParams;
    expect(Object.fromEntries(p)).toEqual({
      secret: "JBSWY3DPEHPK3PXP",
      issuer: "ImmiPro",
      algorithm: "SHA1",
      digits: "6",
      period: "30",
    });
  });
});
