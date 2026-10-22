// @vitest-environment node
import { describe, expect, it } from "vitest";
import { codeDuCourrier } from "../scripts/recette/courrier";

/**
 * Le courrier tel que `nodemailer` le compose pour `envoyerCodeDeVerification`,
 * relevé le 22/10 : objet encodé replié sur deux lignes, puis un `Message-ID`
 * dont l'UUID commence par six chiffres.
 */
const brut = (code: string, messageId: string) =>
  [
    "From: ImmiPro <ne-pas-repondre@immipro.app>",
    "To: l6-firefox-1440-984789882315@immipro.test",
    `Subject: =?UTF-8?Q?${code}_=E2=80=94_ton_code_de_v=C3=A9rifi?=`,
    " =?UTF-8?Q?cation_ImmiPro?=",
    `Message-ID: <${messageId}@immipro.app>`,
    "Content-Transfer-Encoding: quoted-printable",
    "Date: Thu, 22 Oct 2026 16:07:56 +0000",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    `Ton code de v=C3=A9rification est ${code}.`,
    "",
    "Il est valable 10 minutes. Si tu=",
    " n'as pas cr=C3=A9=C3=A9 de compte, ignore ce message : rien n'est ouvert =",
    "sans ce code.",
    "",
  ].join("\r\n");

describe("le banc relève le code du corps du courrier", () => {
  it("ignore un Message-ID qui commence par six chiffres", () => {
    expect(codeDuCourrier(brut("964475", "87205187-8293-c54a-847f-d4fc29400c65"))).toBe("964475");
  });

  it("garde le code quand l'identifiant ne contient pas de chiffres en tête", () => {
    expect(codeDuCourrier(brut("039695", "f2142265-c99e-3f44-24a3-1cdded7dcc40"))).toBe("039695");
  });

  it("un courrier sans code ne rend rien", () => {
    const sansCode = "Subject: Tu as déjà un compte ImmiPro\r\n\r\nUn compte existe déjà.\r\n";
    expect(codeDuCourrier(sansCode)).toBeUndefined();
  });
});
