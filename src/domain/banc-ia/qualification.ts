/** REV11-L5 : couverture et preuves manquantes, sans certification automatique. */
import { CAS_DE_LECTURE, CAS_DE_REDACTION } from "./jeu-d-essai";
import type { SyntheseDuBanc } from "./notation";

export function selectionnerLesCas(options: {
  pieces?: string;
  sansLecture?: boolean;
  sansRedaction?: boolean;
}) {
  if (options.sansLecture && options.sansRedaction)
    throw new Error("Aucune fonction sélectionnée.");
  const ids = options.pieces === undefined ? null : options.pieces.split(",").map((s) => s.trim());
  const connus = new Set([...CAS_DE_LECTURE, ...CAS_DE_REDACTION].map((c) => c.id));
  if (ids && (ids.some((id) => !connus.has(id)) || new Set(ids).size !== ids.length)) {
    throw new Error("--pieces contient un cas inconnu, vide ou répété.");
  }
  const lectures = options.sansLecture
    ? []
    : CAS_DE_LECTURE.filter((c) => !ids || ids.includes(c.id));
  const redactions = options.sansRedaction
    ? []
    : CAS_DE_REDACTION.filter((c) => !ids || ids.includes(c.id));
  if (lectures.length + redactions.length === 0)
    throw new Error("La sélection ne contient aucun cas exécutable.");
  return { lectures, redactions };
}

export function etatDuPassage(
  nature: "SIMULATION" | "SERVEUR_LOCAL" | "FOURNISSEUR_REEL",
  synthese: SyntheseDuBanc,
) {
  return {
    nature,
    statut: synthese.disqualifie
      ? "DISQUALIFIE"
      : nature === "FOURNISSEUR_REEL"
        ? "A_COMPLETER"
        : "VERIFICATION_DU_BANC",
    fournisseurQualifie: false,
    couverture: {
      pieces: synthese.pieces,
      piecesAttendues: CAS_DE_LECTURE.length,
      redactions: synthese.redactions.total,
      redactionsAttendues: CAS_DE_REDACTION.length,
    },
    // Même trente pièces parfaites ne prouvent ni disponibilité future ni DPA.
    preuvesRestantes: [
      "modèles et tarifs officiels revalidés",
      "incidents du fournisseur réel",
      "deux relectures humaines des lettres",
      "rapprochement du relevé fournisseur",
      "DPA, résidence et conservation validés",
      "choix extraction/rédaction et configuration déployée",
    ],
  } as const;
}
