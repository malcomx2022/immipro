"use client";

import { useId, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Case à cocher — Bibliothèque de composants §3.
 *
 * Aucune case n'est pré-cochée : le composant est contrôlé, il n'expose pas
 * de `defaultChecked`. C'est la règle produit des consentements (A-05), et
 * elle tient par le type, pas par la relecture.
 *
 * La ligne entière est cliquable et mesure au moins 44 px.
 */
export interface CheckboxProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "type" | "id" | "className" | "defaultChecked" | "children"
  > {
  libelle: string;
  checked: boolean;
  onChangement: (coche: boolean) => void;
  description?: string;
  /** Constat puis action : « À accepter pour transmettre le dossier. » */
  erreur?: string;
  id?: string;
}

export function Checkbox({
  libelle,
  checked,
  onChangement,
  description,
  erreur,
  id,
  disabled = false,
  ...reste
}: CheckboxProps) {
  const genere = useId();
  const idChamp = id ?? genere;
  const idDescription = `${idChamp}-description`;
  const texte = erreur ?? description;

  return (
    <label
      htmlFor={idChamp}
      className={cn(
        "flex min-h-touch items-start gap-3 py-2.5",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
      )}
    >
      <input
        id={idChamp}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={texte ? idDescription : undefined}
        onChange={(e) => onChangement(e.target.checked)}
        className={cn(
          "mt-0.5 h-5.5 w-5.5 flex-none rounded-sm border accent-accent-500",
          erreur ? "border-danger" : "border-ink-300",
          disabled && "cursor-not-allowed bg-ink-100",
        )}
        {...reste}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("text-15", disabled ? "text-ink-500" : "text-ink-900")}>
          {libelle}
        </span>
        {texte ? (
          <span
            id={idDescription}
            className={cn("text-13", erreur ? "text-danger" : "text-ink-500")}
          >
            {texte}
          </span>
        ) : null}
      </span>
    </label>
  );
}
