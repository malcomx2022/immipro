"use client";

import { useRef, type KeyboardEvent } from "react";

/**
 * Le clavier d'un choix exclusif — règle clavier 4 ; revue du 07/10/2026, M12.
 *
 * Le groupe entier est un seul arrêt de tabulation : les flèches changent la
 * sélection et déplacent le focus, Origine et Fin vont aux extrémités, une
 * option désactivée est sautée. `RadioGroup` le faisait seul ; le simulateur
 * et la bascule de devise n'avaient pas de flèches du tout. Ils partagent
 * désormais ce crochet, et donc le même comportement.
 *
 * Le crochet ne rend rien : chaque groupe garde son apparence.
 */
export interface OptionDeGroupe {
  valeur: string;
  desactivee?: boolean;
}

export function useGroupeRadio<E extends HTMLElement = HTMLButtonElement>({
  options,
  valeur,
  onChangement,
}: {
  options: readonly OptionDeGroupe[];
  valeur: string | null;
  onChangement: (valeur: string) => void;
}) {
  const refs = useRef<(E | null)[]>([]);

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

  const auClavier = (e: KeyboardEvent<HTMLElement>) => {
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

  // Un seul arrêt de tabulation : l'option retenue, ou la première disponible.
  const valeurTabulable = valeur ?? selectionnables[0]?.o.valeur ?? null;

  return {
    /** À poser sur l'élément `role="radiogroup"`. */
    auClavier,
    /** Le `ref` de l'option d'indice `i`. */
    refDe: (i: number) => (n: E | null) => {
      refs.current[i] = n;
    },
    /** `0` pour l'arrêt de tabulation du groupe, `-1` pour les autres. */
    tabIndexDe: (v: string): 0 | -1 => (v === valeurTabulable ? 0 : -1),
  };
}
