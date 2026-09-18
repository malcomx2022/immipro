"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Interrupteur — Bibliothèque de composants §3.
 *
 * `role="switch"` avec `aria-checked` : un lecteur d'écran annonce « activé »
 * ou « désactivé », pas seulement « bouton ». Le libellé est relié par
 * `aria-labelledby` et la description par `aria-describedby`, de sorte que
 * l'interrupteur s'annonce avec ce qu'il autorise — un « activé » seul ne
 * dit rien sur A-05.
 *
 * Contrôlé, sans valeur par défaut : c'est ce qui rend impossible une
 * autorisation pré-accordée (RG-02.1).
 */
export interface SwitchProps {
  /** Identifiant du libellé visible, rendu par l'appelant. */
  idLibelle: string;
  /** Identifiant de la description visible, quand il y en a une. */
  idDescription?: string;
  checked: boolean;
  onChangement: (actif: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function Switch({
  idLibelle,
  idDescription,
  checked,
  onChangement,
  disabled = false,
  className,
}: SwitchProps) {
  const genere = useId();

  return (
    <button
      id={genere}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={idLibelle}
      aria-describedby={idDescription}
      disabled={disabled}
      onClick={() => onChangement(!checked)}
      className={cn(
        "flex h-8 w-13 flex-none items-center rounded-full p-1 transition-colors",
        checked ? "bg-accent-500" : "bg-ink-300",
        disabled && "cursor-not-allowed bg-ink-100",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-6 w-6 rounded-full bg-white shadow-e1 transition-transform",
          checked && "translate-x-5",
          disabled && "bg-ink-300",
        )}
      />
    </button>
  );
}
