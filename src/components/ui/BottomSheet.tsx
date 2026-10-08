"use client";

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const FOCALISABLES = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Feuille du bas — P-01, règles clavier 5 et 8.
 *
 * `role="dialog"` et `aria-modal` : tant qu'elle est ouverte, la tabulation
 * tourne à l'intérieur. À la fermeture — par Échap comme par le bouton — le
 * focus revient sur l'élément qui l'a ouverte. C'est la moitié de la règle
 * qui est presque toujours oubliée, elle est tenue ici et non par l'appelant.
 *
 * Échap ferme, Échap ne valide jamais (règle 5).
 */
export interface BottomSheetProps {
  ouverte: boolean;
  titre: string;
  onFermer: () => void;
  /**
   * `bas` : feuille ancrée en bas à toutes les largeurs (P-01).
   * `adaptatif` : feuille en 390 px, boîte de dialogue centrée en 1440 px.
   * Une feuille du bas sur un écran large laisse le regard en haut et la
   * décision en bas, à 900 px de distance (T-02, T-03).
   */
  ancrage?: "bas" | "adaptatif";
  children: ReactNode;
  className?: string;
}

export function BottomSheet({
  ouverte,
  titre,
  onFermer,
  ancrage = "bas",
  children,
  className,
}: BottomSheetProps) {
  const idTitre = useId();
  const feuille = useRef<HTMLDivElement>(null);
  const declencheur = useRef<Element | null>(null);

  const fermer = useCallback(() => onFermer(), [onFermer]);

  useEffect(() => {
    if (!ouverte) return;

    declencheur.current = document.activeElement;
    feuille.current?.focus();

    const auClavier = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        fermer();
        return;
      }
      if (e.key !== "Tab") return;

      const cible = feuille.current;
      if (!cible) return;
      const arrets = Array.from(cible.querySelectorAll<HTMLElement>(FOCALISABLES));
      const premier = arrets[0];
      const dernier = arrets[arrets.length - 1];
      if (!premier || !dernier) {
        e.preventDefault();
        cible.focus();
        return;
      }
      if (e.shiftKey && document.activeElement === premier) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && document.activeElement === dernier) {
        e.preventDefault();
        premier.focus();
      }
    };

    document.addEventListener("keydown", auClavier);
    return () => {
      document.removeEventListener("keydown", auClavier);
      // Retour du focus au déclencheur, à la fermeture comme sur Échap.
      const precedent = declencheur.current;
      if (precedent instanceof HTMLElement) precedent.focus();
    };
  }, [ouverte, fermer]);

  if (!ouverte) return null;

  // Le prototype la pose en `absolute` dans son cadre de 390 px ; dans une
  // page réelle elle doit couvrir la fenêtre, d'où `fixed`.
  return (
    <div className="fixed inset-0 z-50">
      {/* Le voile n'est pas un arrêt de tabulation : la fermeture au clavier
          passe par Échap, pas par un bouton invisible. */}
      <div
        aria-hidden="true"
        onClick={fermer}
        className="absolute inset-0 bg-ink-900/40"
      />
      <div
        ref={feuille}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitre}
        tabIndex={-1}
        className={cn(
          "absolute inset-x-0 bottom-0 flex max-h-feuille flex-col gap-3 overflow-y-auto rounded-t-lg bg-white p-4 pb-6 shadow-e3 outline-none",
          ancrage === "adaptatif" &&
            "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-dialogue md:max-w-ecran md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:p-6",
          className,
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "h-1 w-10 self-center rounded-full bg-ink-300",
            ancrage === "adaptatif" && "md:hidden",
          )}
        />
        <h2 id={idTitre} className="text-19 font-semibold text-ink-900">
          {titre}
        </h2>
        {children}
      </div>
    </div>
  );
}
