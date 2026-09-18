import Image from "next/image";
import Link from "next/link";
import { SkipLink } from "@/components/layout/SkipLink";

/**
 * Gabarit comptes — section A (DOC-12).
 *
 * Barre haute réduite au logo : sur un écran de saisie, une navigation
 * complète est une invitation à partir. Le lien contextuel — « se connecter »
 * ou « s'inscrire » — vit dans la barre d'action de chaque écran, comme en
 * 390 px.
 *
 * Le lien d'évitement reste le premier arrêt de tabulation (règle clavier 2)
 * et vise `#contenu`, posé par chaque écran sur son titre.
 */
export default function GabaritComptes({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SkipLink cible="contenu" />
      <header className="px-4 py-4 md:px-12">
        <Link href="/" className="inline-flex items-center">
          <Image
            src="/brand/immipro-logo-primary.svg"
            alt="ImmiPro"
            width={110}
            height={27}
            priority
            unoptimized
          />
        </Link>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
