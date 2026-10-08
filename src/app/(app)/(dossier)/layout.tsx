import Image from "next/image";
import Link from "next/link";
import { LienDeNavigation } from "@/components/layout/LienDeNavigation";
import { SkipLink } from "@/components/layout/SkipLink";
import { NAVIGATION_CANDIDAT } from "@/domain/navigation/courant";
import { db } from "@/lib/db";
import { exigerCandidat, initiales } from "@/server/securite/page";

/**
 * Gabarit dossier — section C (DOC-12, handoff §Gabarits).
 *
 * Colonne de navigation de 264 px à gauche en 1440 px, barre d'onglets en bas
 * en 390 px : sur mobile, le pouce atteint le bas de l'écran, pas le haut.
 *
 * La barre d'onglets est le dernier élément de l'ordre du DOM, comme la barre
 * d'action (règle clavier 12) : Maj+Tab y ramène en un coup.
 *
 * Le gabarit exige une session. La garde est ici plutôt que sur chaque page :
 * une page ajoutée demain sous ce groupe de routes est protégée sans que
 * personne y pense, et c'est exactement le genre d'oubli qui ouvre un
 * dossier à qui n'est pas connecté.
 *
 * Les deux navigations disent la page courante (`aria-current`, revue M12) ;
 * les entrées et leurs sections rattachées vivent dans le domaine (D-17).
 */
export const dynamic = "force-dynamic";

export default async function GabaritDossier({
  children,
}: {
  children: React.ReactNode;
}) {
  const acteur = await exigerCandidat();
  const profil = await db.user.findUnique({
    where: { id: acteur.id },
    select: { firstName: true, lastName: true },
  });

  return (
    <div className="flex min-h-screen flex-col bg-white md:flex-row">
      <SkipLink cible="contenu" />

      <nav
        aria-label="Navigation de l'espace candidat"
        className="pas-a-imprimer hidden flex-none flex-col gap-7 border-r border-ink-300 p-5 md:flex md:w-nav"
      >
        <Link href="/tableau-de-bord" className="inline-flex items-center">
          <Image
            src="/brand/immipro-logo-primary.svg"
            alt="ImmiPro"
            width={110}
            height={27}
            priority
            unoptimized
          />
        </Link>
        <ul className="flex flex-col gap-1">
          {NAVIGATION_CANDIDAT.map((lien) => (
            <li key={lien.href}>
              <LienDeNavigation
                href={lien.href}
                sections={lien.sections}
                className="flex min-h-touch items-center rounded-sm px-3 text-14 text-ink-700 hover:bg-ink-100"
              >
                {lien.libelle}
              </LienDeNavigation>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* En 390 px la colonne de navigation est masquée : sans cet en-tête,
            l'écran perdrait son seul repère de marque et l'accès au profil. */}
        <header className="pas-a-imprimer flex items-center justify-between gap-3 px-4 py-3 md:hidden">
          <Link href="/tableau-de-bord" className="inline-flex items-center">
            <Image
              src="/brand/immipro-logo-primary.svg"
              alt="ImmiPro"
              width={110}
              height={27}
              priority
              unoptimized
            />
          </Link>
          <Link
            href="/profil"
            aria-label="Mon profil"
            className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-ink-100 text-14 font-semibold text-ink-700"
          >
            {initiales(acteur, profil?.firstName, profil?.lastName)}
          </Link>
        </header>
        <main className="flex-1 pb-20 md:pb-0">{children}</main>
      </div>

      {/* Dernier arrêt de tabulation, et premier atteint au pouce. */}
      <nav
        aria-label="Navigation de l'espace candidat"
        className="pas-a-imprimer fixed inset-x-0 bottom-0 flex border-t border-ink-300 bg-white px-2 py-2 md:hidden"
      >
        {NAVIGATION_CANDIDAT.map((lien) => (
          <LienDeNavigation
            key={lien.href}
            href={lien.href}
            sections={lien.sections}
            className="flex min-h-action flex-1 flex-col items-center justify-center gap-1 rounded-sm text-13 text-ink-500 hover:bg-ink-100"
          >
            {lien.libelle}
          </LienDeNavigation>
        ))}
      </nav>
    </div>
  );
}
