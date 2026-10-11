import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { CoutsIa } from "@/app/(admin)/couts-ia/CoutsIa";
import { etatDesFonctions, type ConsommationDuFournisseur } from "@/domain/ia/fournisseurs";

/**
 * B-07 — les fournisseurs d'IA (S.94).
 *
 * L'exploitant lit qui sert chaque fonction, si c'est branché, et sinon
 * quoi faire ; puis ce que chacun a consommé. État vide compris.
 */
const base = { metriques: [], serie: [], candidats: [], tarife: false };

describe("B-07 — fournisseurs d'IA", () => {
  it("dit qui sert chaque fonction, et pourquoi la lecture n'est pas branchée", () => {
    render(
      <CoutsIa
        {...base}
        fonctions={etatDesFonctions({
          AI_OPENAI_URL: "https://api.exemple.test/v1",
          AI_OPENAI_API_KEY: "k",
          AI_OPENAI_MODEL: "modele-essai",
          AI_FOURNISSEUR_EXTRACTION: "openai_compatible",
          AI_FOURNISSEUR_REDACTION: "openai_compatible",
        })}
      />,
    );
    const section = screen.getByRole("region", { name: "Fournisseurs d'IA" });
    expect(within(section).getByText("Lecture des pièces")).toBeTruthy();
    // Le libellé figure sur les deux fonctions, et dans la raison du refus.
    expect(within(section).getAllByText(/API compatible OpenAI/u).length).toBeGreaterThanOrEqual(2);
    expect(within(section).getByText(/AI_PIECES_SOUS_TRAITANT_AUTORISE=openai_compatible/u)).toBeTruthy();
    expect(within(section).getAllByText(/Non branché/u)).toHaveLength(1);
    expect(within(section).getAllByText(/^Branché/u)).toHaveLength(1);
    expect(within(section).getByText(/Aucune bascule automatique/u)).toBeTruthy();
  });

  it("sans appel, l'état vide le dit", () => {
    render(<CoutsIa {...base} fonctions={etatDesFonctions({})} parFournisseur={[]} />);
    expect(screen.getByText(/la ventilation par fournisseur apparaîtra au premier appel/u)).toBeTruthy();
  });

  it("ventile la consommation, et ne donne un coût qu'au tarif du fournisseur", () => {
    const lignes: ConsommationDuFournisseur[] = [
      { fournisseur: "anthropic", modele: null, appels: 3, appelsARapprocher: 0, jetonsEntree: 3000, jetonsSortie: 600, coutMicros: 18_000, devise: "USD" },
      { fournisseur: "openai_compatible", modele: "modele-essai", appels: 2, appelsARapprocher: 0, jetonsEntree: 1500, jetonsSortie: 200, coutMicros: null, devise: null },
    ];
    render(<CoutsIa {...base} fonctions={etatDesFonctions({})} parFournisseur={lignes} />);
    const table = screen.getByRole("table", { name: "Consommation par fournisseur et par modèle" });
    expect(within(table).getByText("non consigné (avant S.94)")).toBeTruthy();
    expect(within(table).getByText("0,018 USD")).toBeTruthy();
    expect(within(table).getByText("sans tarif")).toBeTruthy();
    // Toutes les mesures sont complètes : aucune alerte de rapprochement.
    expect(screen.queryByRole("region", { name: "Consommation à rapprocher" })).toBeNull();
  });

  it("S.173 — un appel sans mesure complète demande un rapprochement, et le coût devient un minorant", () => {
    const lignes: ConsommationDuFournisseur[] = [
      { fournisseur: "anthropic", modele: "modele-a", appels: 4, appelsARapprocher: 0, jetonsEntree: 3000, jetonsSortie: 600, coutMicros: 18_000, devise: "USD" },
      { fournisseur: "openai_compatible", modele: "modele-essai", appels: 5, appelsARapprocher: 2, jetonsEntree: 1500, jetonsSortie: 200, coutMicros: 9_000, devise: "USD" },
    ];
    render(<CoutsIa {...base} fonctions={etatDesFonctions({})} parFournisseur={lignes} />);
    const alerte = screen.getByRole("region", { name: "Consommation à rapprocher" });
    expect(within(alerte).getByText(/2 appels n'ont pas reçu de mesure complète de leurs jetons/u)).toBeTruthy();
    expect(within(alerte).getByText(/facture du fournisseur/u)).toBeTruthy();
    const table = screen.getByRole("table", { name: "Consommation par fournisseur et par modèle" });
    expect(within(table).getByText(/dont 2 à rapprocher/u)).toBeTruthy();
    expect(within(table).getByText("au moins 0,009 USD")).toBeTruthy();
    expect(within(table).getByText("0,018 USD")).toBeTruthy();
  });
});
