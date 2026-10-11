import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RevueDesPieces } from "@/app/(admin)/revue/RevueDesPieces";
import { Resultats } from "@/app/(public)/resultats/Resultats";
import { PieceDuDossier } from "@/app/(app)/(dossier)/dossiers/[id]/pieces/[pieceId]/PieceDuDossier";
import { piecesEnEchec } from "@/lib/contenu/backoffice";
import { ANALYSE_RESSOURCES, DOSSIERS, PIECES_PAR_DOSSIER, QUOTA } from "@/lib/contenu/dossiers";
import { causeDuStatut } from "@/server/ia/openai-compatible";
import { MESSAGE_AU_CANDIDAT } from "@/domain/dossiers/extraction";

const { appeler, refresh } = vi.hoisted(() => ({ appeler: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/api", () => ({ appeler }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }), usePathname: () => "/revue" }));
const maintenant = "2026-10-10T15:00:00Z";

beforeEach(() => {
  appeler.mockReset();
  refresh.mockReset();
  window.sessionStorage.clear();
});

describe("revue complémentaire — réponses et faits affichés", () => {
  it("L1 : l'opérateur voit la correction de destination et aucun quota encore dû", () => {
    const piece = { ...piecesEnEchec(new Date(maintenant))[0]!, motif: "ECHEC_TECHNIQUE" as const,
      journal: causeDuStatut(308).detail, analyseDebitee: false };
    render(<RevueDesPieces pieces={[piece]} maintenant={maintenant} />);
    expect(screen.getByText(/déclarer dans AI_OPENAI_URL/)).toBeDefined();
    expect(screen.getByText(/Aucune analyse à rendre pour cette lecture/)).toBeDefined();
    expect(screen.queryByText(/SECRET_LOCATION|ECHO_SENSIBLE/)).toBeNull();
  });

  it("L1 : le candidat voit la revue humaine après refus de destination", () => {
    const dossier = DOSSIERS[0]!;
    const piece = { ...PIECES_PAR_DOSSIER[dossier.id]![0]!, etat: "ILLISIBLE" as const };
    const analyse = { ...ANALYSE_RESSOURCES, verdict: "ILLISIBLE" as const, verdictLu: "ILLISIBLE" as const,
      titre: "Cette pièce demande une relecture", corps: MESSAGE_AU_CANDIDAT.non_configure,
      champs: [], relecture: { etat: "EN_COURS" as const, signalee: false } };
    render(<PieceDuDossier dossier={dossier} piece={piece} quota={QUOTA} analyse={analyse}
      autorise prixRecharge="3 000 F" volumeRecharge={10} />);
    expect(screen.getByText(MESSAGE_AU_CANDIDAT.non_configure)).toBeDefined();
    expect(screen.queryByText(/adresse finale|HTTP 308/)).toBeNull();
    expect(appeler).not.toHaveBeenCalled();
  });

  it("ne montre pas l'aperçu d'une pièce après sélection d'une autre", async () => {
    let terminer!: (value: unknown) => void;
    appeler.mockReturnValue(
      new Promise((resolve) => {
        terminer = resolve;
      }),
    );
    const pieces = piecesEnEchec(new Date(maintenant));
    render(<RevueDesPieces pieces={pieces} maintenant={maintenant} />);
    fireEvent.change(screen.getByLabelText("Motif de l'accès et de la décision"), {
      target: { value: "Lecture de la pièce à vérifier." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir la pièce" }));
    const lignes = screen.getAllByRole("option");
    fireEvent.click(lignes[1]!);
    await act(async () =>
      terminer({ ok: true, donnees: { apercu: "https://exemple.test/piece-a", raison: null } }),
    );
    expect(screen.queryByTitle(/Aperçu de/)).toBeNull();
    expect(screen.getByLabelText("Motif de l'accès et de la décision")).toHaveValue("");
  });

  it("une décision terminée sur l'ancienne pièce conserve la saisie de la suivante", async () => {
    let terminer!: (value: unknown) => void;
    appeler.mockReturnValue(
      new Promise((resolve) => {
        terminer = resolve;
      }),
    );
    render(<RevueDesPieces pieces={piecesEnEchec(new Date(maintenant))} maintenant={maintenant} />);
    const motif = screen.getByLabelText("Motif de l'accès et de la décision");
    const message = screen.getByLabelText("Message envoyé au candidat");
    fireEvent.change(motif, { target: { value: "Relecture du premier fichier." } });
    fireEvent.change(message, {
      target: { value: "Le bas de la page manque. Reprends la photo en cadrant toute la page." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer et passer/ }));
    fireEvent.click(screen.getAllByRole("option")[1]!);
    fireEvent.change(motif, { target: { value: "Relecture du second fichier." } });
    fireEvent.change(message, { target: { value: "Message en cours pour la seconde pièce." } });
    await act(async () => terminer({ ok: true, donnees: { decidee: true, quotaRendu: false } }));
    expect(motif).toHaveValue("Relecture du second fichier.");
    expect(message).toHaveValue("Message en cours pour la seconde pièce.");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("une erreur de consultation tardive ne s'affiche pas pour la nouvelle pièce", async () => {
    let terminer!: (value: unknown) => void;
    appeler.mockReturnValue(
      new Promise((resolve) => {
        terminer = resolve;
      }),
    );
    render(<RevueDesPieces pieces={piecesEnEchec(new Date(maintenant))} maintenant={maintenant} />);
    fireEvent.change(screen.getByLabelText("Motif de l'accès et de la décision"), {
      target: { value: "Relecture du premier fichier." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir la pièce" }));
    fireEvent.click(screen.getAllByRole("option")[1]!);
    await act(async () =>
      terminer({
        ok: false,
        echec: {
          titre: "Échec de la première pièce",
          corps: "Réessaie.",
          action: "Réessayer",
          ton: "echec",
        },
      }),
    );
    expect(screen.queryByText("Échec de la première pièce")).toBeNull();
  });

  it("ne rapporte ni résultat ni recrédit pour une lecture sans débit", () => {
    const pieces = piecesEnEchec(new Date(maintenant)).map((p) => ({
      ...p,
      analyseDebitee: false,
    }));
    render(<RevueDesPieces pieces={pieces} maintenant={maintenant} />);
    expect(screen.getByText(/Aucune analyse à rendre pour cette lecture/)).toBeDefined();
    expect(screen.queryByText(/la lecture a rendu un résultat/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Illisible" }));
    expect(screen.queryByText(/le quota du candidat est recrédité/)).toBeNull();
  });

  it("ne déduit pas les traitements d'hier d'une file vide", () => {
    render(<RevueDesPieces pieces={[]} maintenant={maintenant} />);
    expect(screen.getByRole("heading", { name: "Aucune pièce en attente de revue" })).toBeDefined();
    expect(screen.queryByText(/hier/)).toBeNull();
  });

  it("distingue deux procédures d'un même pays et compte les pays dans le titre", async () => {
    appeler.mockResolvedValue({
      ok: true,
      donnees: {
        retenues: [
          {
            rang: "1",
            code: "NL",
            pays: "Pays-Bas",
            slug: "pays-bas",
            procedure: "Études — VVR",
            motifs: [],
          },
          {
            rang: "2",
            code: "NL",
            pays: "Pays-Bas",
            slug: "pays-bas-emploi",
            procedure: "Emploi — kennismigrant",
            motifs: [],
          },
        ],
        ecartees: [],
        aucuneNePasse: false,
        composantesAbsentes: [],
      },
    });
    window.sessionStorage.setItem("immipro.simulation", JSON.stringify({ langue: "C1 et plus" }));
    render(<Resultats />);
    expect(await screen.findByText("Études — VVR")).toBeDefined();
    expect(screen.getByText("Emploi — kennismigrant")).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "Une destination correspond à ton profil" }),
    ).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Voir la fiche Pays-Bas — Emploi — kennismigrant" }),
    ).toHaveAttribute("href", "/destinations/pays-bas-emploi");
  });

  it("envoie l'identité de la lecture montrée lors d'un signalement", async () => {
    appeler.mockResolvedValue({ ok: true, donnees: { dejaEnRelecture: false } });
    const dossier = DOSSIERS[0]!;
    const piece = PIECES_PAR_DOSSIER[dossier.id]![0]!;
    render(
      <PieceDuDossier
        dossier={dossier}
        piece={piece}
        quota={QUOTA}
        analyse={ANALYSE_RESSOURCES}
        autorise
        prixRecharge="3 000 F"
        volumeRecharge={10}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Signaler une erreur de lecture" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Autre chose/ }));
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le signalement" }));
    await waitFor(() =>
      expect(appeler).toHaveBeenCalledWith(expect.stringContaining("/signalement"), {
        corps: { champs: ["Autre chose"], analyseId: expect.any(String) },
      }),
    );
  });
});
