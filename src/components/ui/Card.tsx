import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Carte — Bibliothèque de composants §5, bloc « carte destination ».
 *
 * Rayon plafonné à `rounded-lg` (16 px) : c'est le plus grand rayon du
 * référentiel, rien au-dessus n'existe.
 */
export interface CardProps {
  /** `ombre` pour une carte posée sur le fond, `bordure` pour une carte en liste. */
  variante?: "ombre" | "bordure";
  as?: ElementType;
  className?: string;
  children: ReactNode;
}

export function Card({
  variante = "ombre",
  as: Balise = "div",
  className,
  children,
}: CardProps) {
  return (
    <Balise
      className={cn(
        "flex flex-col gap-3 rounded-lg bg-white p-4",
        variante === "ombre" ? "shadow-e2" : "border border-ink-300",
        className,
      )}
    >
      {children}
    </Balise>
  );
}
