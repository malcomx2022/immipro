import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Barre haute du gabarit acquisition — sections P et A.
 *
 * Elle suit le lien d'évitement dans l'ordre du DOM : le premier arrêt de
 * tabulation de la page reste « Aller au contenu » (règle clavier 2).
 */
/**
 * Trois des quatre entrées répondaient 404 — « Destinations », « Comment ça
 * marche » et « Guides pays » —, sur toutes les pages publiques et depuis le
 * premier lot. Le catalogue et les guides existent désormais ; « Comment ça
 * marche » demande une page de présentation qui n'est pas écrite, et une
 * barre de navigation n'est pas l'endroit où promettre (annexe Q).
 */
const NAVIGATION = [
  { href: "/destinations", libelle: "Destinations" },
  { href: "/tarifs", libelle: "Tarifs" },
  { href: "/guides", libelle: "Guides pays" },
] as const;

export interface HeaderProps {
  className?: string;
}

export function Header({ className }: HeaderProps) {
  return (
    <header
      className={cn(
        "flex items-center justify-between gap-8 border-b border-ink-300 px-4 py-3 md:px-12 md:py-5",
        className,
      )}
    >
      <Link href="/" className="flex items-center">
        <Image
          src="/brand/immipro-logo-primary.svg"
          alt="ImmiPro"
          width={124}
          height={30}
          priority
          unoptimized
        />
      </Link>

      <nav aria-label="Navigation principale" className="hidden items-center gap-7 md:flex">
        {NAVIGATION.map((l) => (
          <Link key={l.href} href={l.href} className="text-14 text-ink-900">
            {l.libelle}
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        <Link
          href="/connexion"
          className="flex min-h-touch items-center rounded-md px-3.5 text-14 font-semibold text-ink-900 hover:bg-ink-100"
        >
          Connexion
        </Link>
        <Link
          href="/inscription"
          className="hidden min-h-touch items-center rounded-md border border-ink-300 px-5 text-14 font-semibold text-ink-900 hover:bg-ink-100 md:flex"
        >
          Créer un compte
        </Link>
      </div>
    </header>
  );
}
