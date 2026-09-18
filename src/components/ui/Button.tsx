"use client";

import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  SOCLE_BOUTON,
  VARIANTES_BOUTON,
  type ButtonVariante,
} from "./bouton-styles";

/**
 * Bouton — Bibliothèque de composants §1.
 *
 * Cinq variantes, hauteur 48 px partout (4 px de marge sur le minimum tactile
 * de 44 px). Le désactivé est un vrai `disabled` : `aria-disabled` seul laisse
 * le bouton cliquable et trompe le lecteur d'écran.
 *
 * Règle de focus 1 : l'anneau vient de `:focus-visible` dans globals.css et
 * n'est jamais retiré ici.
 * Règle de désactivation 3 : un bouton gris sans explication est un défaut —
 * `raisonDesactivation` rend la légende obligatoire dans le rendu même.
 * Règle 4 : en chargement le libellé reste écrit, l'animation ne le remplace pas.
 *
 * Les classes vivent dans `bouton-styles`, hors frontière client, pour que
 * `LienBouton` puisse les partager depuis un composant serveur.
 */
export type { ButtonVariante };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: ButtonVariante;
  /** Occupe toute la largeur — barre d'action mobile. */
  pleineLargeur?: boolean;
  /** Conserve le libellé et empêche le double envoi. */
  chargement?: boolean;
  /** Obligatoire dès que le bouton est désactivé : sans elle, l'écran ment. */
  raisonDesactivation?: string;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variante = "primaire",
    pleineLargeur = false,
    chargement = false,
    raisonDesactivation,
    disabled = false,
    className,
    children,
    ...reste
  },
  ref,
) {
  const inactif = disabled || chargement;
  const idRaison = useId();
  const raisonVisible = disabled && raisonDesactivation ? raisonDesactivation : null;

  const bouton = (
    <button
      ref={ref}
      type={reste.type ?? "button"}
      disabled={inactif}
      aria-busy={chargement || undefined}
      aria-describedby={raisonVisible ? idRaison : undefined}
      className={cn(
        SOCLE_BOUTON,
        VARIANTES_BOUTON[variante],
        pleineLargeur && "w-full",
        className,
      )}
      {...reste}
    >
      {chargement ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-transparent border-t-current"
        />
      ) : null}
      {children}
    </button>
  );

  if (!raisonVisible) return bouton;

  return (
    <span className="flex flex-col items-start gap-2">
      {bouton}
      <span id={idRaison} className="text-13 text-ink-500">
        {raisonVisible}
      </span>
    </span>
  );
});
