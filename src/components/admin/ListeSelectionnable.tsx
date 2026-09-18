"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Liste sélectionnable du back-office — B-01, B-03, B-04, B-05, B-06.
 *
 * `role="listbox"` avec tabindex mobile : la liste entière est un seul arrêt
 * de tabulation, les flèches changent la sélection, Origine et Fin vont aux
 * extrémités. Sans cela, traverser quarante fiches de veille coûte quarante
 * tabulations avant d'atteindre le panneau de comparaison — et un opérateur
 * qui fait ça huit heures par jour cesse d'utiliser le clavier.
 *
 * Le composant ne connaît pas la forme des lignes : il prend une liste de
 * clés et laisse l'appelant rendre ce qu'il veut dans chacune.
 */
export interface ListeSelectionnableProps<T> {
  /** Nom accessible de la liste. */
  libelle: string;
  elements: readonly T[];
  cle: (element: T) => string;
  selection: string | null;
  onSelection: (cle: string) => void;
  rendu: (element: T, selectionne: boolean) => ReactNode;
  /** En-tête de colonnes, rendu hors de la listbox. */
  entete?: ReactNode;
  vide?: ReactNode;
  className?: string;
}

export function ListeSelectionnable<T>({
  libelle,
  elements,
  cle,
  selection,
  onSelection,
  rendu,
  entete,
  vide,
  className,
}: ListeSelectionnableProps<T>) {
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const aBouge = useRef(false);

  const cles = elements.map(cle);
  const position = Math.max(0, selection ? cles.indexOf(selection) : 0);

  // Le focus ne suit la sélection que lorsqu'elle vient du clavier : le
  // déplacer sur un rendu initial volerait le focus au reste de la page.
  useEffect(() => {
    if (!aBouge.current || !selection) return;
    refs.current[selection]?.focus();
    aBouge.current = false;
  }, [selection]);

  const deplacer = (e: KeyboardEvent<HTMLDivElement>) => {
    const cibles: Record<string, number> = {
      ArrowDown: Math.min(cles.length - 1, position + 1),
      ArrowUp: Math.max(0, position - 1),
      Home: 0,
      End: cles.length - 1,
    };
    const cible = cibles[e.key];
    if (cible === undefined || cles.length === 0) return;
    e.preventDefault();
    const suivante = cles[cible];
    if (!suivante || suivante === selection) return;
    aBouge.current = true;
    onSelection(suivante);
  };

  if (elements.length === 0 && vide) {
    return (
      <div className={cn("flex flex-col", className)}>
        {entete}
        {vide}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", className)}>
      {entete}
      <div role="listbox" aria-label={libelle} onKeyDown={deplacer} className="flex flex-col">
        {elements.map((element, index) => {
          const k = cle(element);
          const selectionne = selection ? k === selection : index === 0;
          return (
            <div
              key={k}
              ref={(el) => {
                refs.current[k] = el;
              }}
              role="option"
              aria-selected={selectionne}
              tabIndex={index === position ? 0 : -1}
              onClick={() => onSelection(k)}
              className={cn(
                "cursor-pointer border-t border-ink-300 px-3 py-2.5 text-14 outline-none",
                selectionne ? "bg-accent-50" : "bg-white hover:bg-ink-100",
              )}
            >
              {rendu(element, selectionne)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
