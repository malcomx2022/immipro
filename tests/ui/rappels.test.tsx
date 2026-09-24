import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PreferencesDeRappels } from "@/app/(auth)/compte/rappels/PreferencesDeRappels";
import {
  MENTION_CANAL_INDISPONIBLE,
  PREFERENCES_PAR_DEFAUT,
} from "@/domain/dossiers/preferences-rappels";
import { verifierTexte, INTERDITS_PARTOUT } from "@/domain/copy/vocabulaire-interdit";

const reponse = (corps: unknown, statut = 200) =>
  Promise.resolve({
    ok: statut < 400,
    status: statut,
    json: () => Promise.resolve(corps),
  } as Response);

beforeEach(() => {
  vi.restoreAllMocks();
});

const rendre = (props: Partial<Parameters<typeof PreferencesDeRappels>[0]> = {}) =>
  render(
    <PreferencesDeRappels
      initial={PREFERENCES_PAR_DEFAUT}
      canal="OPERATIONNEL"
      dernier={null}
      retour="/consentements"
      {...props}
    />,
  );

/**
 * Préférences de rappel — S.87, RG-09.4.
 *
 * L'écran qui manquait pour que l'échéancier puisse de nouveau dire « les
 * modifier ». Ce qui se teste : qu'il ne promette pas un canal qui ne part
 * pas, qu'il dise ce qui partira avant l'enregistrement, et qu'un échec
 * ne perde pas les réglages.
 */
describe("Préférences de rappel", () => {
  it("dit ce qui partira, et que rien ne part par SMS", () => {
    const { container } = rendre();
    const texte = container.textContent ?? "";
    expect(texte).toContain("Un rappel par email");
    expect(texte).toContain("8 h, heure de Cotonou, Porto-Novo");
    expect(texte).toMatch(/SMS/u);
    expect(verifierTexte(texte, INTERDITS_PARTOUT)).toEqual([]);
  });

  it("ne promet pas l'email quand le transport n'a rien prouvé", () => {
    const { container } = rendre({ canal: "INDISPONIBLE" });
    const texte = container.textContent ?? "";
    expect(texte).toContain(MENTION_CANAL_INDISPONIBLE);
    expect(texte).not.toContain("Un rappel par email");
    expect(texte).toContain("Un rappel dans tes alertes");
  });

  it("recalcule la phrase avant l'enregistrement, et coupe l'email avec les rappels", () => {
    rendre();
    const [actifs, email] = screen.getAllByRole("switch");
    fireEvent.click(actifs!);
    expect(screen.getByText(/Tes rappels d'échéance sont coupés/u)).toBeDefined();
    expect(email).toBeDisabled();
  });

  it("n'enregistre rien tant que rien n'a changé", () => {
    rendre();
    expect(screen.getByRole("button", { name: "Enregistrer mes réglages" })).toBeDisabled();
  });

  it("enregistre, confirme, et envoie ce qui est affiché", async () => {
    const fetch = vi.fn((_url: string, init?: RequestInit) =>
      reponse({
        preferences: JSON.parse(String(init?.body)),
        canal: "OPERATIONNEL",
        dernier: null,
      }),
    );
    global.fetch = fetch as unknown as typeof globalThis.fetch;
    rendre();
    fireEvent.click(screen.getByRole("radio", { name: /Quatorze jours avant/u }));
    fireEvent.change(screen.getByLabelText("Mon fuseau horaire"), {
      target: { value: "America/Toronto" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer mes réglages" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("enregistrés"));
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("/api/comptes/rappels");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({
      actifs: true,
      email: true,
      fuseau: "America/Toronto",
      joursAvant: 14,
    });
    expect(screen.getByText(/heure de Montréal, Toronto/u)).toBeDefined();
  });

  it("garde les réglages affichés quand l'enregistrement échoue", async () => {
    global.fetch = vi.fn(() =>
      reponse(
        {
          echec: {
            titre: "Tes réglages n'ont pas été enregistrés",
            corps: "Le serveur n'a pas répondu à temps.",
            conserve: "Tes réglages restent affichés : renvoie-les.",
            action: "Réessayer",
            ton: "echec",
          },
        },
        503,
      ),
    ) as unknown as typeof fetch;
    rendre();
    fireEvent.click(screen.getByRole("radio", { name: /Trois jours avant/u }));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer mes réglages" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("restent affichés"),
    );
    expect(screen.getByText(/moins de trois jours/u)).toBeDefined();
    expect(screen.getByRole("button", { name: "Enregistrer mes réglages" })).not.toBeDisabled();
  });

  it("dit du dernier rappel ce qui est vrai de son courrier", () => {
    const { container, rerender } = rendre({
      dernier: { quand: "2026-09-24T07:05:00.000Z", courrier: "NON_ENVOYE" },
    });
    expect(container.textContent).toContain("L'email n'a pas pu partir");
    expect(container.textContent).not.toContain("Parti par email");
    rerender(
      <PreferencesDeRappels
        initial={PREFERENCES_PAR_DEFAUT}
        canal="OPERATIONNEL"
        dernier={{ quand: "2026-09-24T07:05:00.000Z", courrier: "EN_ATTENTE" }}
        retour="/consentements"
      />,
    );
    expect(container.textContent).toContain("L'email n'est pas encore parti");
  });

  it("dit l'état vide sans rien inventer", () => {
    const { container } = rendre();
    expect(container.textContent).toContain("Aucun rappel ne t'a encore été envoyé");
  });
});
