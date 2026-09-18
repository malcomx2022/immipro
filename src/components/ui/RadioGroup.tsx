"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

/**
 * Choix exclusif — Bibliothèque de composants §3, règle clavier 4.
 *
 * Le groupe entier est un seul arrêt de tabulation : les flèches changent la
 * sélection, Origine et Fin vont aux extrémités. Sans ça, traverser les trois
 * packs de $-01 coûte trois tabulations avant d'atteindre « Continuer ».
 *
 * `aria-checked` porte l'état ; la ligne entière est cliquable et mesure au
 * moins 44 px. Une option indisponible garde son libellé et sa raison.
 */
export interface RadioOption {
  valeur: string;
  libelle: string;
  /** Raison d'indisponibilité, ou précision affichée sous le libellé. */
  description?: string;
  desactivee?: boolean;
  /**
   * Option mise en avant. Elle est cadrée sans être retenue : une mise en
   * avant n'est pas un choix fait à la place de qui lit. L'information est
   * aussi portée par la description, jamais par la seule couleur.
   */
  misEnAvant?: boolean;
}

export interface RadioGroupProps {
  libelle: string;
  options: readonly RadioOption[];
  valeur: string | null;
  onChangement: (valeur: string) => void;
  className?: string;
}

export function RadioGroup({
  libelle,
  options,
  valeur,
  onChangement,
  className,
}: RadioGroupProps) {
  const idLibelle = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectionnables = options
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => !o.desactivee);

  const positionCourante = () => {
    const trouve = selectionnables.findIndex(({ o }) => o.valeur === valeur);
    return trouve === -1 ? 0 : trouve;
  };

  const deplacer = (pas: number | "debut" | "fin") => {
    if (selectionnables.length === 0) return;
    const courant = positionCourante();
    const cible =
      pas === "debut"
        ? 0
        : pas === "fin"
          ? selectionnables.length - 1
          : (courant + pas + selectionnables.length) % selectionnables.length;
    const entree = selectionnables[cible];
    if (!entree) return;
    onChangement(entree.o.valeur);
    refs.current[entree.i]?.focus();
  };

  const auClavier = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case "ArrowDown":
      case "ArrowRight":
        e.preventDefault();
        deplacer(1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        e.preventDefault();
        deplacer(-1);
        break;
      case "Home":
        e.preventDefault();
        deplacer("debut");
        break;
      case "End":
        e.preventDefault();
        deplacer("fin");
        break;
      default:
        break;
    }
  };

  // Un seul arrêt de tabulation : la ligne retenue, ou la première disponible.
  const valeurTabulable = valeur ?? selectionnables[0]?.o.valeur ?? null;

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <span id={idLibelle} className="text-14 font-medium text-ink-900">
        {libelle}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={idLibelle}
        onKeyDown={auClavier}
        className="flex flex-col gap-2.5"
      >
        {options.map((o, i) => {
          const retenue = o.valeur === valeur;
          return (
            <button
              key={o.valeur}
              ref={(n) => {
                refs.current[i] = n;
              }}
              type="button"
              role="radio"
              aria-checked={retenue}
              disabled={o.desactivee}
              tabIndex={o.valeur === valeurTabulable ? 0 : -1}
              onClick={() => onChangement(o.valeur)}
              className={cn(
                "flex min-h-touch items-center gap-3 rounded-md border px-3.5 py-2.5 text-left",
                retenue
                  ? "border-accent-500 bg-accent-50"
                  : o.misEnAvant
                    ? "border-2 border-accent-500 bg-white hover:bg-ink-100"
                    : "border-ink-300 bg-white hover:bg-ink-100",
                o.desactivee && "cursor-not-allowed bg-ink-100 hover:bg-ink-100",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-5 w-5 flex-none rounded-full border bg-white",
                  retenue ? "border-6 border-accent-500" : "border-ink-300",
                )}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                  className={cn(
                    "text-15",
                    retenue && "font-medium",
                    o.desactivee ? "text-ink-500" : "text-ink-900",
                  )}
                >
                  {o.libelle}
                </span>
                {o.description ? (
                  <span className="text-13 text-ink-500">{o.description}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
