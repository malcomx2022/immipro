import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { causeDeLErreur, type ChaineDAppel } from "@/server/ia/appel";
import { CAUSES_DAPPEL, appelSeReprend } from "@/domain/ia/appel";

/**
 * La classification des erreurs d'appel au modèle — WF-06, WF-08.
 *
 * ── Ce qui existait en double ───────────────────────────────────────
 *
 * `domain/ia/appel.ts` avait déjà unifié la **politique** : six causes,
 * et lesquelles se rejouent. Son commentaire dit pourquoi — « recopier
 * ces six causes dans le second module aurait produit deux sources pour
 * une même règle ; elles divergent toujours ».
 *
 * La plomberie qui l'alimente était restée en double : `causeDeLErreur`,
 * `texteRendu` et `noterLesJetons` vivaient à la fois dans l'extracteur
 * et dans l'adaptateur de rédaction. Elles ne pouvaient pas rejoindre le
 * domaine, qui s'interdit le SDK et Prisma.
 *
 * Les deux copies ont été comparées **avant** la fusion, sur les onze cas
 * ci-dessous : zéro écart. La fusion ne change donc aucun comportement,
 * et ce test est ce qui l'a établi.
 */
const CHAINE: ChaineDAppel = {
  cle: "la clé d'essai",
  service: "le service d'essai",
  delaiMs: 1234,
};

/**
 * Les erreurs du SDK n'ont pas de constructeur public utilisable ici :
 * elles se fabriquent par leur prototype, ce qui est exactement ce que
 * `instanceof` regarde.
 */
const erreurSdk = (C: new (...a: never[]) => unknown, statut?: number): unknown =>
  Object.create(C.prototype, { status: { value: statut, enumerable: true } });

describe("la classification d'une erreur d'appel au modèle", () => {
  it.each([
    ["une clé refusée", erreurSdk(Anthropic.AuthenticationError, 401), "non_configure"],
    ["une clé sans accès", erreurSdk(Anthropic.PermissionDeniedError, 403), "non_configure"],
    ["une cadence dépassée", erreurSdk(Anthropic.RateLimitError, 429), "service_sature"],
    ["une demande mal formée", erreurSdk(Anthropic.BadRequestError, 400), "reponse_illisible"],
    ["un délai dépassé", erreurSdk(Anthropic.APIConnectionTimeoutError), "delai_depasse"],
    ["une connexion perdue", erreurSdk(Anthropic.APIConnectionError), "injoignable"],
    ["une réponse 500", erreurSdk(Anthropic.APIError, 500), "injoignable"],
  ])("classe %s en %s", (_nom, erreur, attendue) => {
    expect(causeDeLErreur(erreur, CHAINE).cause).toBe(attendue);
  });

  /*
    L'ordre des branches est significatif : `APIConnectionTimeoutError`
    étend `APIConnectionError`, qui étend `APIError`. Tester la plus
    générale d'abord absorberait les deux autres, et un délai dépassé —
    qui se rejoue — deviendrait un « injoignable » avec un autre message.
    Cette assertion tient l'ordre, que rien d'autre ne tient.
  */
  it("ne laisse pas la classe générale absorber les spécialisées", () => {
    const delai = causeDeLErreur(erreurSdk(Anthropic.APIConnectionTimeoutError), CHAINE);
    const perdue = causeDeLErreur(erreurSdk(Anthropic.APIConnectionError), CHAINE);

    expect(delai.cause).not.toBe(perdue.cause);
    expect(delai.detail).toContain("1234 ms");
  });

  /*
    Une erreur qui n'est pas du SDK peut venir d'un `AbortController` posé
    au-dessus, et elle se reconnaît alors à son nom.
  */
  it.each([
    ["TimeoutError", "delai_depasse"],
    ["AbortError", "delai_depasse"],
  ])("reconnaît un %s posé au-dessus du SDK", (nom, attendue) => {
    expect(causeDeLErreur({ name: nom }, CHAINE).cause).toBe(attendue);
  });

  /*
    Le repli ne suppose rien, et il penche du bon côté : « injoignable »
    se rejoue, ce qu'une erreur inconnue mérite plus qu'un abandon.
  */
  it.each([
    ["une Error nue", new Error("boum")],
    ["null", null],
    ["une chaîne", "panne"],
  ])("se replie sur « injoignable » pour %s", (_nom, erreur) => {
    const { cause } = causeDeLErreur(erreur, CHAINE);
    expect(cause).toBe("injoignable");
    expect(appelSeReprend(cause)).toBe(true);
  });

  /** Aucune cause inventée : la classification reste dans le vocabulaire du domaine. */
  it("ne rend jamais une cause hors des six du domaine", () => {
    const toutes = [
      erreurSdk(Anthropic.AuthenticationError, 401),
      erreurSdk(Anthropic.RateLimitError, 429),
      erreurSdk(Anthropic.APIError, 503),
      { name: "AbortError" },
      new Error("boum"),
      null,
    ];
    for (const e of toutes) {
      expect(CAUSES_DAPPEL).toContain(causeDeLErreur(e, CHAINE).cause);
    }
  });

  /** Le vocabulaire de la chaîne est ce qui reste propre à chacune. */
  it("nomme la chaîne dans le détail, pour le journal d'exploitation", () => {
    expect(causeDeLErreur(erreurSdk(Anthropic.AuthenticationError, 401), CHAINE).detail).toContain(
      "la clé d'essai",
    );
    expect(causeDeLErreur(new Error("boum"), CHAINE).detail).toContain("le service d'essai");
  });
});
