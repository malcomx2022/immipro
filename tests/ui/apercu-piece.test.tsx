import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { PieceDuDossier } from "@/app/(app)/(dossier)/dossiers/[id]/pieces/[pieceId]/PieceDuDossier";
import { ApercuDeLaPiece } from "@/app/(app)/(dossier)/dossiers/[id]/pieces/[pieceId]/ApercuDeLaPiece";
import { MENTION_PIECE_PURGEE } from "@/domain/comptes/portabilite";
import { ANALYSE_RESSOURCES, PIECES_NL, QUOTA, dossierParId } from "@/lib/contenu/dossiers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

/**
 * S.221 — C-08 montrait « aperçu de la pièce · page 1 sur 1 », un cadre
 * du prototype posé sur aucun fichier. L'écran demande désormais l'URL
 * signée à la route de la pièce et charge le fichier dans un cadre.
 */
const DOSSIER = dossierParId("nl-4471")!;
const attestation = PIECES_NL.find((p) => p.id === "attestation-de-ressources")!;
const URL_SIGNEE = "https://stockage.immipro.app/confiance/cle?X-Amz-Signature=abc";

const fetchAvant = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchAvant;
});

function repondre(corps: unknown, statut = 200) {
  const fetch = vi.fn(async () =>
    new Response(JSON.stringify(corps), {
      status: statut,
      headers: { "content-type": "application/json" },
    }),
  );
  globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
  return fetch;
}

const rendreApercu = () =>
  render(<ApercuDeLaPiece dossierId="d-1" pieceId="p-1" libelle="Justificatif de logement" />);

describe("S.221 — aperçu du fichier envoyé (C-08)", () => {
  it("l'écran de la pièce n'affiche plus de cadre inventé", async () => {
    repondre({ apercu: URL_SIGNEE, mentionApercu: null });
    const { container } = render(
      <PieceDuDossier
        dossier={DOSSIER}
        piece={attestation}
        quota={QUOTA}
        analyse={ANALYSE_RESSOURCES}
        prixRecharge="3 000 F"
        volumeRecharge={10}
      />,
    );
    expect(container.textContent).not.toMatch(/aperçu de la pièce|page 1 sur/iu);
    const cadre = await screen.findByTitle(`Fichier envoyé : ${attestation.libelle}`);
    expect(cadre.getAttribute("src")).toBe(URL_SIGNEE);
  });

  it("demande l'URL à la route de la pièce, et la charge dans un cadre", async () => {
    const fetch = repondre({ apercu: URL_SIGNEE, mentionApercu: null });
    rendreApercu();
    expect(screen.getByRole("status").textContent).toContain("Chargement");
    const cadre = await screen.findByTitle("Fichier envoyé : Justificatif de logement");
    expect(cadre.tagName).toBe("IFRAME");
    expect(cadre.getAttribute("src")).toBe(URL_SIGNEE);
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toBe("/api/dossiers/d-1/pieces/p-1");
  });

  it("« Recharger l'aperçu » redemande une URL : la précédente ne vaut que cinq minutes", async () => {
    const fetch = repondre({ apercu: URL_SIGNEE, mentionApercu: null });
    rendreApercu();
    fireEvent.click(await screen.findByRole("button", { name: "Recharger l'aperçu" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });

  it("une pièce en contrôle dit la raison du serveur, sans cadre vide", async () => {
    const mention = "Ta pièce est en cours de contrôle antivirus. Elle sera consultable dans un instant.";
    repondre({ apercu: null, mentionApercu: mention });
    const { container } = rendreApercu();
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(mention));
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("une pièce purgée le dit, sans cadre vide", async () => {
    repondre({ apercu: null, mentionApercu: null });
    const { container } = rendreApercu();
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(MENTION_PIECE_PURGEE),
    );
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("un échec de la route est dit, et l'aperçu se redemande", async () => {
    const fetch = repondre({}, 503);
    rendreApercu();
    const alerte = await screen.findByRole("alert");
    expect(alerte.textContent?.length).toBeGreaterThan(0);
    repondre({ apercu: URL_SIGNEE, mentionApercu: null });
    fireEvent.click(screen.getByRole("button", { name: "Réessayer l'aperçu" }));
    expect(await screen.findByTitle("Fichier envoyé : Justificatif de logement")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("l'écran ne signe rien lui-même : la décision reste à `urlDeLecture`", () => {
    const source = readFileSync(
      "src/app/(app)/(dossier)/dossiers/[id]/pieces/[pieceId]/ApercuDeLaPiece.tsx",
      "utf8",
    );
    expect(source).not.toMatch(/presigned|purgedAt|scanState/u);
  });
});
