"use client";

import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

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
 */
export type ButtonVariante =
  | "primaire"
  | "secondaire"
  | "tertiaire"
  | "destructif"
  | "lien";

const SOCLE =
  "inline-flex items-center justify-center gap-2.5 rounded-md font-sans text-16 font-semibold transition-colors disabled:cursor-not-allowed";

const VARIANTES: Record<ButtonVariante, string> = {
  primaire:
    "h-12 px-6 bg-accent-500 text-white hover:bg-accent-600 disabled:bg-ink-300 disabled:text-ink-500",
  secondaire:
    "h-12 px-6 border border-ink-300 bg-white text-ink-900 hover:bg-ink-100 disabled:bg-ink-100 disabled:text-ink-500",
  tertiaire:
    "h-12 px-3 bg-transparent text-accent-700 hover:bg-accent-50 disabled:text-ink-500",
  destructif:
    "h-12 px-5 border border-danger bg-white text-danger hover:bg-danger/5 disabled:border-ink-300 disabled:text-ink-500",
  lien:
    "min-h-touch px-0 bg-transparent text-accent-600 underline underline-offset-2 hover:text-accent-700 disabled:text-ink-500 disabled:no-underline",
};

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
      className={cn(SOCLE, VARIANTES[variante], pleineLargeur && "w-full", className)}
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
