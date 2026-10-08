/**
 * La page courante d'une navigation — règle clavier 11 ; revue du
 * 07/10/2026, M12 (D-17 du 08/10/2026).
 *
 * Aucune barre ne disait où l'on est : pas d'`aria-current`, pas de style
 * actif. Le lecteur d'écran annonçait quatre liens identiques sur chaque
 * page, et l'œil cherchait sa place.
 *
 * Une entrée est courante sur son adresse (`"page"`) et sur ses sous-pages
 * ou ses sections rattachées (`"true"` : on est *dans* la section, pas sur
 * sa page). Les sections rattachées sont tranchées par D-17 : un dossier,
 * une fiche pays, les services et l'annuaire des consultants se rejoignent
 * depuis un dossier, et allument « Dossiers ».
 *
 * Module pur : le chemin est lu par le composant, pas ici.
 */
export type EtatDuLien = "page" | "true";

const dans = (chemin: string, prefixe: string) =>
  chemin === prefixe || chemin.startsWith(`${prefixe}/`);

/** Sans barre finale ni paramètres : `/profil/?x=1` se lit `/profil`. */
const normaliser = (chemin: string) => {
  const sansRequete = chemin.split(/[?#]/u)[0] ?? "";
  return sansRequete.length > 1 ? sansRequete.replace(/\/+$/u, "") : sansRequete;
};

export function etatDuLien(
  chemin: string | null,
  href: string,
  sections: readonly string[] = [],
): EtatDuLien | undefined {
  if (!chemin) return undefined;
  const ici = normaliser(chemin);
  if (ici === href) return "page";
  if (href !== "/" && dans(ici, href)) return "true";
  return sections.some((s) => dans(ici, s)) ? "true" : undefined;
}

export const estLienCourant = (chemin: string | null, href: string, sections?: readonly string[]) =>
  etatDuLien(chemin, href, sections) !== undefined;

export interface EntreeDeNavigation {
  href: string;
  libelle: string;
  /** Les adresses rattachées à l'entrée sans en être des sous-pages (D-17). */
  sections?: readonly string[];
}

/** La navigation de l'espace candidat, colonne et barre d'onglets. */
export const NAVIGATION_CANDIDAT: readonly EntreeDeNavigation[] = [
  {
    href: "/tableau-de-bord",
    libelle: "Dossiers",
    sections: ["/dossiers", "/fiches", "/services", "/consultants"],
  },
  { href: "/comparateur", libelle: "Destinations" },
  { href: "/notifications", libelle: "Alertes" },
  { href: "/profil", libelle: "Profil" },
];
