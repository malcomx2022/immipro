import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Pied de page du gabarit acquisition.
 *
 * La dernière ligne n'est pas une mention légale de politesse : elle dit ce
 * que la plateforme ne fait pas (INV-1, INV-2), et elle est présente sur tous
 * les écrans publics.
 */
const COLONNES = [
  {
    titre: "Destinations",
    liens: [
      { href: "/destinations/pays-bas", libelle: "Pays-Bas" },
      { href: "/destinations/canada", libelle: "Canada" },
      { href: "/destinations/allemagne", libelle: "Allemagne" },
      { href: "/destinations", libelle: "Toutes les fiches" },
    ],
  },
  {
    titre: "Produit",
    liens: [
      { href: "/tarifs", libelle: "Tarifs" },
      { href: "/comment-ca-marche", libelle: "Comment ça marche" },
      { href: "/guides", libelle: "Guides pays" },
      { href: "/articles", libelle: "Blog" },
    ],
  },
  {
    titre: "Société",
    liens: [
      { href: "/a-propos", libelle: "À propos" },
      { href: "/consultants", libelle: "Consultants partenaires" },
      { href: "/contact", libelle: "Contact" },
    ],
  },
  {
    titre: "Légal",
    liens: [
      { href: "/mentions-legales", libelle: "Mentions légales" },
      { href: "/donnees-personnelles", libelle: "Données personnelles" },
      { href: "/conditions", libelle: "Conditions" },
    ],
  },
] as const;

export interface FooterProps {
  className?: string;
}

export function Footer({ className }: FooterProps) {
  return (
    <footer className={cn("flex flex-col gap-6 bg-ink-100 px-4 py-8 md:px-12", className)}>
      <Image
        src="/brand/immipro-logo-primary.svg"
        alt="ImmiPro"
        width={110}
        height={27}
        unoptimized
      />

      <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
        {COLONNES.map((colonne) => (
          <nav key={colonne.titre} aria-label={colonne.titre} className="flex flex-col gap-2.5">
            <span className="text-13 font-semibold uppercase tracking-wider text-ink-900">
              {colonne.titre}
            </span>
            {colonne.liens.map((l) => (
              <Link key={l.href} href={l.href} className="text-14 text-accent-600">
                {l.libelle}
              </Link>
            ))}
          </nav>
        ))}
      </div>

      <p className="border-t border-ink-300 pt-4 text-13 text-ink-500">
        ImmiPro n&apos;est pas un cabinet de conseil en immigration et ne dépose aucun
        dossier à votre place.
      </p>
    </footer>
  );
}
