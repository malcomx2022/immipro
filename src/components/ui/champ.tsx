import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Coquille commune à Input et Select — Bibliothèque de composants §2.
 *
 * Le libellé est toujours visible : jamais de placeholder en guise d'étiquette.
 * Le message d'erreur remplace l'aide, il ne s'y ajoute pas (règle 5) — un
 * champ ne porte donc qu'une seule ligne de description à la fois.
 *
 * Interne à la bibliothèque : les écrans passent par Input ou Select.
 */
export const CHAMP_CONTROLE =
  "h-12 w-full rounded-md border border-ink-300 bg-white px-3.5 text-16 text-ink-900 " +
  "placeholder:text-ink-500 disabled:cursor-not-allowed disabled:bg-ink-100 disabled:text-ink-500";

export interface ChampProps {
  id: string;
  libelle: string;
  /** Texte d'aide, effacé dès qu'une erreur est présente. */
  aide?: string;
  /** Constat puis action — jamais « valeur invalide » seul. */
  erreur?: string;
  desactive?: boolean;
  idDescription: string;
  className?: string;
  children: ReactNode;
}

export function Champ({
  id,
  libelle,
  aide,
  erreur,
  desactive = false,
  idDescription,
  className,
  children,
}: ChampProps) {
  const description = erreur ?? aide;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={id}
        className={cn(
          "text-14 font-medium",
          desactive ? "text-ink-500" : "text-ink-900",
        )}
      >
        {libelle}
      </label>
      {children}
      {description ? (
        <span
          id={idDescription}
          className={cn("text-13", erreur ? "text-danger" : "text-ink-500")}
        >
          {description}
        </span>
      ) : null}
    </div>
  );
}
