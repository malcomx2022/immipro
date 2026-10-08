"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { etatDuLien } from "@/domain/navigation/courant";

/**
 * Un lien de barre de navigation qui sait s'il est courant — règle clavier
 * 11 ; revue du 07/10/2026, M12.
 *
 * `aria-current` le dit au lecteur d'écran, le style actif du prototype
 * (`bg-accent-50 font-semibold text-accent-700`) le dit à l'œil. Le chemin
 * est lu ici, côté client, pour que les gabarits restent des composants
 * serveur.
 */
export interface LienDeNavigationProps {
  href: string;
  sections?: readonly string[];
  className?: string;
  /** Le style de l'entrée courante, quand celui du prototype ne convient pas. */
  classNameCourant?: string;
  children: ReactNode;
}

export function LienDeNavigation({
  href,
  sections,
  className,
  classNameCourant = "bg-accent-50 font-semibold text-accent-700",
  children,
}: LienDeNavigationProps) {
  const etat = etatDuLien(usePathname(), href, sections);
  return (
    <Link href={href} aria-current={etat} className={cn(className, etat && classNameCourant)}>
      {children}
    </Link>
  );
}
