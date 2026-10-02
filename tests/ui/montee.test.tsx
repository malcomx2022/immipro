import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Recapitulatif } from "@/app/(app)/paiement/recapitulatif/Recapitulatif";
import { MonteeRefusee } from "@/app/(app)/paiement/recapitulatif/MonteeRefusee";
import { PasserADossier } from "@/app/(app)/paiement/pack/PasserADossier";
import { detailDuPrix, MESSAGE_DU_REFUS } from "@/domain/payments/montee";
import { tarifDe } from "@/domain/payments/achat";
import type { Tunnel } from "@/server/lecture/paiements";
import { formatMontant } from "@/lib/utils";

/** Les espaces insécables de `Intl` rendus lisibles pour la comparaison. */
const plat = (t: string | null | undefined) => (t ?? "").replace(/[\u00a0\u202f]/gu, " ");
const F = (n: number) => plat(formatMontant(n, "XOF"));

/**
 * Le passage d'Essentiel à Dossier, à l'écran — S.88.
 *
 * Trois choses se vérifient : le prix est la différence et l'écran écrit
 * le calcul ; la devise est celle de l'achat d'origine ; et un pack au
 * prix plein ne se lit jamais comme une montée en gamme.
 */

const TUNNEL: Tunnel = {
  dossier: { id: "nl-1", pays: "Pays-Bas", intitule: "Séjour pour études (MVV + VVR)" },
  devise: "XOF",
  paysConnu: true,
  telephone: "97 •• •• 42",
  dejaOuvert: true,
};

const reponse = (corps: unknown, statut = 200) =>
  Promise.resolve({ ok: statut < 400, status: statut, json: () => Promise.resolve(corps) } as Response);

beforeEach(() => vi.restoreAllMocks());

describe("Récapitulatif d'un passage à Dossier", () => {
  const rendre = (devise: "XOF" | "EUR" = "XOF") =>
    render(
      <Recapitulatif publiees={{}}
        tunnel={TUNNEL}
        achat={{ type: "montee" }}
        montee={detailDuPrix(devise === "XOF" ? { montant: 5000, devise } : { montant: 12, devise })}
        deviseInitiale={devise}
      />,
    );

  it("écrit le calcul : prix de Dossier, déjà payé, différence", () => {
    const { container } = rendre();
    const texte = plat(container.textContent);
    expect(texte).toContain("Tu paies la différence");
    expect(texte).toMatch(/Dossier aujourd'hui15 000 F/u);
    expect(texte).toMatch(/Déjà payé pour Essentiel− 5 000 F/u);
    expect(screen.getByRole("button", { name: `Payer ${formatMontant(10_000, "XOF")}` })).toBeDefined();
    expect(texte).toContain("Passage d'Essentiel à Dossier");
    expect(texte).toContain("de 10 à 30");
  });

  it("garde la devise de l'achat Essentiel, sans conversion", () => {
    const { container } = rendre("EUR");
    expect(screen.getByRole("button", { name: /Payer 17/u })).toBeDefined();
    expect(container.textContent).toContain("aucune conversion");
    expect(container.textContent).not.toContain("La grille en francs CFA est distincte");
  });

  it("envoie la catégorie seule : ni montant, ni achat d'origine", async () => {
    const fetch = vi.fn(() => reponse({ reference: "IMP-1", url: "https://checkout.stripe.com/x" }));
    global.fetch = fetch as unknown as typeof globalThis.fetch;
    const assign = vi.fn();
    Object.defineProperty(window, "location", { value: { assign }, writable: true });
    rendre();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Payer/u }));
    await waitFor(() => expect(assign).toHaveBeenCalled());
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      dossierId: "nl-1",
      achat: { type: "montee" },
      devise: "XOF",
    });
  });
});

describe("Un pack au prix plein sur un dossier déjà couvert", () => {
  it("se dit achat supplémentaire, et renvoie au passage quand il existe", () => {
    const { container } = render(
      <Recapitulatif publiees={{}}
        tunnel={TUNNEL}
        achat={{ type: "pack", code: "dossier" }}
        tarif={tarifDe({ type: "pack", code: "dossier" })!}
        deviseInitiale="XOF"
        supplementaire={{ passage: "10 000 F" }}
      />,
    );
    expect(container.textContent).toContain("pack supplémentaire, au prix plein");
    expect(container.textContent).toContain("Ce n'est pas un passage à Dossier");
    expect(container.textContent).not.toContain("Tu paies la différence");
    const lien = screen.getByRole("link", { name: "Passer plutôt à Dossier pour 10 000 F" });
    expect(lien.getAttribute("href")).toMatch(/achat=montee-dossier$/u);
    expect(screen.getByRole("button", { name: `Payer ${formatMontant(15_000, "XOF")}` })).toBeDefined();
  });
});

describe("La page des packs d'un dossier Essentiel", () => {
  it("propose deux gestes distincts, aucun présélectionné", () => {
    const { container } = render(
      <PasserADossier tunnel={TUNNEL} detail={detailDuPrix({ montant: 5000, devise: "XOF" })} />,
    );
    const passage = screen.getByRole("link", { name: "Passer à Dossier" });
    expect(passage.getAttribute("href")).toBe("/paiement/recapitulatif?dossier=nl-1&achat=montee-dossier");
    const recharge = screen.getByRole("link", { name: "Ajouter des analyses" });
    expect(recharge.getAttribute("href")).toBe(
      "/paiement/recapitulatif?dossier=nl-1&achat=recharge&devise=XOF",
    );
    const texte = plat(container.textContent);
    expect(texte).toContain(`Passer à Dossier — ${F(10_000)}`);
    expect(texte).toContain(`${F(15_000)} − ${F(5000)} déjà payés pour Essentiel = ${F(10_000)}.`);
    expect(texte).toContain(`Ajouter des analyses — 10 pour ${F(3000)}`);
    expect(texte).toContain("recharge indépendante");
  });
});

describe("Un passage refusé", () => {
  it("dit pourquoi, et que rien n'a été débité", () => {
    const { container } = render(
      <MonteeRefusee dossierId="nl-1" message={MESSAGE_DU_REFUS.DEJA_MONTE} />,
    );
    expect(container.textContent).toContain(MESSAGE_DU_REFUS.DEJA_MONTE);
    expect(container.textContent).toContain("Rien n'a été débité");
    expect(screen.getByRole("link", { name: "Revenir à mon dossier" }).getAttribute("href")).toBe(
      "/dossiers/nl-1",
    );
  });
});
