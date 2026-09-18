import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  SOCLE_BOUTON,
  VARIANTES_BOUTON,
  type ButtonVariante,
} from "./bouton-styles";

/**
 * Lien qui a l'allure d'un bouton — Bibliothèque de composants §1.
 *
 * « Ouvrir un dossier » et « Voir la fiche » mènent ailleurs : ce sont des
 * liens. Leur donner un `button` casserait l'ouverture dans un nouvel
 * onglet, le menu contextuel et l'annonce du lecteur d'écran. L'apparence
 * est partagée avec `Button` pour que les deux ne divergent jamais.
 */
export interface LienBoutonProps extends ComponentProps<typeof Link> {
  variante?: ButtonVariante;
  pleineLargeur?: boolean;
  children: ReactNode;
}

export function LienBouton({
  variante = "primaire",
  pleineLargeur = false,
  className,
  children,
  ...reste
}: LienBoutonProps) {
  return (
    <Link
      className={cn(
        SOCLE_BOUTON,
        VARIANTES_BOUTON[variante],
        pleineLargeur && "w-full",
        className,
      )}
      {...reste}
    >
      {children}
    </Link>
  );
}
