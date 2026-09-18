import Image from "next/image";
import Link from "next/link";
import { SkipLink } from "@/components/layout/SkipLink";

/**
 * Gabarit paiement — section $ (DOC-12, handoff §Gabarits).
 *
 * Barre haute minimale : logo et fil des trois étapes, pas de navigation
 * latérale. Sur un écran qui débite, une navigation complète est une sortie
 * de plus qu'une aide.
 *
 * Le lien d'évitement reste le premier arrêt de tabulation (règle 2) et vise
 * `#contenu`, posé par chaque écran sur son titre.
 */
const ETAPES = ["Choix du pack", "Récapitulatif", "Confirmation"] as const;

export default function GabaritPaiement({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SkipLink cible="contenu" />
      <header className="flex items-center gap-6 border-b border-ink-300 px-4 py-4 md:px-12">
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
        <ol className="hidden items-center gap-2 md:flex">
          {ETAPES.map((etape, i) => (
            <li key={etape} className="flex items-center gap-2">
              {i > 0 ? (
                <span aria-hidden="true" className="h-px w-6 bg-ink-300" />
              ) : null}
              <span className="text-13 text-ink-500">{etape}</span>
            </li>
          ))}
        </ol>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
