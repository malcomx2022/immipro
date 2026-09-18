"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import {
  QUESTIONS_ACCUEIL,
  repereEtape,
  type CleQuestion,
  type Reponses,
} from "@/domain/simulateur/questions";
import { ecrireReponses, lireReponses } from "@/lib/simulation-session";

/**
 * Bloc de départ du simulateur sur P-01 — variante retenue : plein écran.
 *
 * Motif de l'arbitrage : sur 390 px, la carte flottante sur photo laissait
 * la photo gagner l'attention avant le simulateur. En plein écran, le titre
 * et les trois premières questions tiennent au-dessus de la ligne de
 * flottaison sans concurrent.
 *
 * Chaque champ ouvre une feuille du bas, qui rend le focus au champ à la
 * fermeture (règle clavier 8, tenue par `BottomSheet`).
 */
export function AccueilSimulateur() {
  const router = useRouter();
  const [reponses, setReponses] = useState<Reponses>({});
  const [feuille, setFeuille] = useState<CleQuestion | null>(null);

  // Les réponses déjà données dans la session reviennent à l'écran : on ne
  // redemande pas ce qui a été répondu.
  useEffect(() => setReponses(lireReponses()), []);

  const repondre = (cle: CleQuestion, valeur: string) => {
    const suivantes = { ...reponses, [cle]: valeur };
    setReponses(suivantes);
    ecrireReponses(suivantes);
    setFeuille(null);
  };

  const questionOuverte = QUESTIONS_ACCUEIL.find((q) => q.cle === feuille);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {QUESTIONS_ACCUEIL.map((q, i) => (
          <button
            key={q.cle}
            type="button"
            onClick={() => setFeuille(q.cle)}
            className="flex min-h-14 items-center justify-between gap-3 rounded-md border border-ink-300 bg-white px-4 py-2 text-left hover:bg-ink-100"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-13 text-ink-500">{q.libelleCourt}</span>
              <span className="text-16 font-medium text-ink-900">
                {reponses[q.cle] ?? "À préciser"}
              </span>
            </span>
            <span className="flex-none font-mono text-13 text-ink-500">
              {repereEtape(i)}
            </span>
          </button>
        ))}
      </div>

      <Button
        pleineLargeur
        className="min-h-action"
        onClick={() => router.push("/simulateur")}
      >
        Voir mes destinations
      </Button>
      <p className="text-center text-13 text-ink-500">
        Six questions, aucun compte à créer. Trois destinations classées à la fin.
      </p>

      {questionOuverte ? (
        <BottomSheet
          ouverte
          titre={questionOuverte.intitule}
          onFermer={() => setFeuille(null)}
        >
          <div className="flex flex-col gap-2">
            {questionOuverte.options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => repondre(questionOuverte.cle, option)}
                className="flex min-h-action items-center justify-between gap-3 rounded-md border border-ink-300 bg-white px-4 text-left text-16 font-medium text-ink-900 hover:bg-ink-100"
              >
                <span>{option}</span>
                <span className="text-14 text-ink-500">
                  {reponses[questionOuverte.cle] === option ? "Choisi" : ""}
                </span>
              </button>
            ))}
          </div>
        </BottomSheet>
      ) : null}
    </div>
  );
}
