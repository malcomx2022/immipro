import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * Un lien qui ouvre un nouvel onglet, et qui le dit — revue du 07/10/2026,
 * F8 (D-21).
 *
 * Les textes à lire avant de cocher (inscription, récapitulatif de
 * paiement) s'ouvraient dans un nouvel onglet sans `rel` ni annonce : un
 * lecteur d'écran se retrouvait ailleurs sans l'avoir su. La mention est
 * réservée aux lecteurs d'écran (D-21) : le nom accessible du lien la porte,
 * l'écran ne change pas.
 *
 * `rel="noopener"` : la page ouverte ne peut pas manipuler celle-ci. Un lien
 * partenaire qui a besoin d'un `rel` plus fort (`sponsored`, `nofollow`) le
 * passe en propriété.
 */
export const MENTION_NOUVEL_ONGLET = " (s'ouvre dans un nouvel onglet)";

export type LienNouvelOngletProps = Omit<ComponentProps<typeof Link>, "target"> & {
  children: ReactNode;
};

export function LienNouvelOnglet({ children, rel = "noopener", ...props }: LienNouvelOngletProps) {
  return (
    <Link {...props} target="_blank" rel={rel}>
      {children}
      <span className="sr-only">{MENTION_NOUVEL_ONGLET}</span>
    </Link>
  );
}
