"use client";

import { cn } from "@/lib/utils";
import type { Devise } from "@/domain/payments/pricing";
import { useGroupeRadio } from "./useGroupeRadio";

/**
 * Bascule de devise — tarifs (P-05) et choix du pack ($-01) ; revue du
 * 07/10/2026, M12.
 *
 * Les deux écrans en avaient chacun une copie, déclarée `radiogroup` sans
 * en avoir le clavier : deux arrêts de tabulation, aucune flèche. Une seule
 * bascule désormais, au clavier de `useGroupeRadio` : un arrêt, les flèches,
 * Origine et Fin.
 */
export const LIBELLE_DEVISE: Record<Devise, string> = { XOF: "Francs CFA", EUR: "Euros" };

export interface BasculeDeDeviseProps {
  /** Les devises proposées : seules celles dont le rail est ouvert, au tunnel. */
  devises: readonly Devise[];
  devise: Devise;
  onChangement: (devise: Devise) => void;
  className?: string;
}

export function BasculeDeDevise({ devises, devise, onChangement, className }: BasculeDeDeviseProps) {
  const { auClavier, refDe, tabIndexDe } = useGroupeRadio({
    options: devises.map((valeur) => ({ valeur })),
    valeur: devise,
    onChangement: (v) => onChangement(v as Devise),
  });

  return (
    <div
      role="radiogroup"
      aria-label="Devise d'affichage"
      onKeyDown={auClavier}
      className={cn("flex gap-2 rounded-full bg-ink-100 p-1", className)}
    >
      {devises.map((d, i) => (
        <button
          key={d}
          ref={refDe(i)}
          type="button"
          role="radio"
          aria-checked={devise === d}
          tabIndex={tabIndexDe(d)}
          onClick={() => onChangement(d)}
          className={cn(
            "min-h-touch flex-1 rounded-full text-14 font-semibold text-ink-900",
            devise === d ? "bg-white shadow-e1" : "hover:bg-white",
          )}
        >
          {LIBELLE_DEVISE[d]}
        </button>
      ))}
    </div>
  );
}
