import Image from "next/image";
import Link from "next/link";
import { SkipLink } from "@/components/layout/SkipLink";
import { NAVIGATION_ADMIN } from "@/domain/backoffice/navigation";

/**
 * Gabarit back-office — section B (DOC-12 §3.7).
 *
 * Registre outil interne : densité élevée, mêmes jetons que l'espace
 * candidat, accent réservé à l'action principale et à la sélection. Desktop
 * seul — ces écrans ne sont pas prototypés en 390 px, et une file de veille
 * au pouce n'aurait pas de sens.
 *
 * Le segment `(admin)` est celui que `tests/copy-forbidden.test.ts` exclut :
 * son lecteur agit sur des codes techniques et des ratios d'exploitation.
 * Ce qu'un administrateur écrit *à destination du candidat* reste, lui,
 * soumis au vocabulaire interdit — la validation vit dans B-02.
 */
export default function GabaritAdmin({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-ink-100">
      <SkipLink cible="contenu" />

      <nav
        aria-label="Navigation du back-office"
        className="flex w-[232px] flex-none flex-col gap-6 border-r border-ink-300 bg-white p-4"
      >
        <Link href="/veille" className="inline-flex items-center px-2">
          <Image
            src="/brand/immipro-logo-primary.svg"
            alt="ImmiPro"
            width={110}
            height={27}
            priority
            unoptimized
          />
        </Link>
        <ul className="flex flex-col gap-0.5">
          {NAVIGATION_ADMIN.map((entree) => (
            <li key={entree.href}>
              <Link
                href={entree.href}
                className="flex min-h-touch items-center rounded-sm px-3 text-14 text-ink-700 hover:bg-ink-100"
              >
                {entree.libelle}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-auto flex items-center gap-2.5 rounded-md bg-ink-100 p-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white text-13 font-semibold text-ink-700"
          >
            MA
          </span>
          <span className="flex flex-col">
            <span className="text-14 font-medium text-ink-900">M. Agossou</span>
            <span className="text-13 text-ink-500">Analyste réglementaire</span>
          </span>
        </div>
      </nav>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
