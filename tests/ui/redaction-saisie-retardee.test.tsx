import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { Redaction } from "@/app/(app)/(dossier)/dossiers/[id]/redaction/[type]/Redaction";
import { dossierParId } from "@/lib/contenu/dossiers";
import { PIECES_REDIGEABLES } from "@/lib/contenu/redaction";

const transport = vi.hoisted(() => ({
  appel: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ appeler: transport.appel }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: transport.refresh, push: vi.fn() }),
}));

const initial = "Texte initial du candidat. ".repeat(12);
const soumis = "Version envoyée pour enregistrement. ".repeat(12);
const version = (rang: number, texte: string) => ({
  rang,
  enregistreeLe: "2026-10-15T09:00:00Z",
  paragraphes: [{ section: "Projet", texte }],
  motif: "Réécriture",
});
const rendre = (versions: ReturnType<typeof version>[]) => (
  <Redaction
    dossier={dossierParId("nl-4471")!}
    piece={PIECES_REDIGEABLES[0]!}
    reponsesEnregistrees={{ 0: "Une.", 1: "Deux.", 2: "Trois.", 3: "Quatre." }}
    versions={versions}
    redactionDisponible
    redactionAssistee
    maintenant="2026-10-15T09:01:00Z"
  />
);
let terminer: (r: unknown) => void;
beforeEach(() => {
  transport.appel.mockReset();
  transport.refresh.mockReset();
  transport.appel.mockImplementation(
    () =>
      new Promise((ok) => {
        terminer = ok;
      }),
  );
});

it.each([
  ["enregistrement", true],
  ["enregistrement", false],
  ["restauration", true],
  ["restauration", false],
] as const)(
  "%s : saisie postérieure %s, la réponse respecte le texte courant",
  async (geste, ajout) => {
    const poursuivi = soumis + "Ajout personnel saisi pendant la réponse lente, à conserver.";
    const anciennes = [version(1, initial), version(2, initial)];
    const { rerender } = render(rendre(anciennes));
    const champ = screen.getByLabelText("Ton texte") as HTMLTextAreaElement;
    fireEvent.change(champ, { target: { value: soumis } });
    fireEvent.click(
      screen.getByRole("button", {
        name: geste === "enregistrement" ? "Enregistrer une version" : "Restaurer",
      }),
    );
    expect(transport.appel).toHaveBeenCalledTimes(1);
    expect(champ).toBeEnabled();
    if (ajout) fireEvent.change(champ, { target: { value: poursuivi } });
    await act(async () => {
      terminer({ ok: true, donnees: { produite: true, disponible: true } });
    });
    expect(transport.refresh).toHaveBeenCalledTimes(1);
    const livree = version(3, geste === "enregistrement" ? soumis : initial);
    rerender(rendre([...anciennes, livree]));
    const apres = (screen.getByLabelText("Ton texte") as HTMLTextAreaElement).value;
    if (ajout) expect(apres).toBe(poursuivi);
    else expect(apres).toContain(livree.paragraphes[0]!.texte);
  },
);

it("conserve la saisie commencée pendant la génération du premier texte", async () => {
  const { rerender } = render(rendre([]));
  fireEvent.click(screen.getByRole("button", { name: "Écrire directement dans l'éditeur" }));
  fireEvent.click(screen.getByRole("button", { name: "Proposer un premier texte" }));
  fireEvent.change(screen.getByLabelText("Ton texte"), { target: { value: soumis } });
  await act(async () => {
    terminer({ ok: true, donnees: { produite: true, disponible: true } });
  });
  rerender(rendre([version(1, initial)]));
  expect(screen.getByLabelText("Ton texte")).toHaveValue(soumis);
});

it("garde la saisie lorsque l'enregistrement échoue", async () => {
  const { rerender } = render(rendre([version(1, initial)]));
  fireEvent.change(screen.getByLabelText("Ton texte"), { target: { value: soumis } });
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer une version" }));
  const ajout = soumis + " Dernières modifications.";
  fireEvent.change(screen.getByLabelText("Ton texte"), { target: { value: ajout } });
  await act(async () => {
    terminer({
      ok: false,
      echec: {
        titre: "Enregistrement refusé",
        corps: "Réessaie.",
        action: "Réessayer",
        ton: "echec",
      },
    });
  });
  expect(transport.refresh).not.toHaveBeenCalled();
  rerender(rendre([version(1, initial), version(2, initial)]));
  expect(screen.getByLabelText("Ton texte")).toHaveValue(ajout);
});
