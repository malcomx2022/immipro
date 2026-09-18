"use client";

import { cn } from "@/lib/utils";

/**
 * Barre de filtres du back-office. Un seul filtre actif à la fois, porté par
 * `aria-pressed` : l'état ne tient jamais à la seule couleur.
 */
export function Filtres<T extends string>({
  libelle,
  valeurs,
  libelles,
  actif,
  onChangement,
  compteur,
}: {
  libelle: string;
  valeurs: readonly T[];
  libelles: Record<T, string>;
  actif: T;
  onChangement: (valeur: T) => void;
  compteur?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={libelle}>
      {valeurs.map((valeur) => (
        <button
          key={valeur}
          type="button"
          aria-pressed={actif === valeur}
          onClick={() => onChangement(valeur)}
          className={cn(
            "flex min-h-touch items-center rounded-sm border px-3 text-14",
            actif === valeur
              ? "border-ink-900 bg-ink-900 text-white"
              : "border-ink-300 bg-white text-ink-900 hover:bg-ink-100",
          )}
        >
          {libelles[valeur]}
        </button>
      ))}
      {compteur ? <span className="ml-1 text-13 text-ink-500">{compteur}</span> : null}
    </div>
  );
}
