import Image from "next/image";
import Link from "next/link";
import { LienDeNavigation } from "@/components/layout/LienDeNavigation";
import { SkipLink } from "@/components/layout/SkipLink";
import { NAVIGATION_ADMIN } from "@/domain/backoffice/navigation";

/**
 * Chrome du back-office — section B (DOC-12 §3.7).
 *
 * Séparé du gabarit pour la même raison que partout ailleurs ici : le
 * gabarit lit la session, le composant rend la navigation. C'est ce qui
 * permet de vérifier l'ordre des registres et le lien d'évitement sans base
 * de données.
 *
 * Registre outil interne : densité élevée, mêmes jetons que l'espace
 * candidat, accent réservé à l'action principale et à la sélection. Pensé
 * pour le bureau — ces écrans ne sont pas prototypés en 390 px, et une file
 * de veille au pouce n'aurait pas de sens.
 *
 * Sous `md`, la colonne de navigation ne reste pourtant pas une colonne
 * (REV11-L7) : à 390 px, ses 232 px laissaient 158 px au contenu, et B-07
 * débordait de 146 px avant même d'afficher une métrique. La navigation
 * passe au-dessus du contenu, ses entrées se replient en ligne ; au bureau,
 * rien ne change.
 */
export interface BarreAdminProps {
  /** Nom de l'opérateur connecté. Jamais un nom écrit en dur. */
  nom: string;
  role: string;
  initialesAffichees: string;
  children: React.ReactNode;
}

export function BarreAdmin({ nom, role, initialesAffichees, children }: BarreAdminProps) {
  return (
    <div className="flex min-h-screen flex-col bg-ink-100 md:flex-row">
      <SkipLink cible="contenu" />

      <nav
        aria-label="Navigation du back-office"
        className="flex flex-col gap-4 border-b border-ink-300 bg-white p-4 md:w-nav-admin md:flex-none md:gap-6 md:border-b-0 md:border-r"
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
        <ul className="flex flex-wrap gap-1 md:flex-col md:gap-0.5">
          {NAVIGATION_ADMIN.map((entree) => (
            <li key={entree.href}>
              <LienDeNavigation
                href={entree.href}
                sections={entree.sections}
                className="flex min-h-touch items-center rounded-sm px-3 text-14 text-ink-700 hover:bg-ink-100"
              >
                {entree.libelle}
              </LienDeNavigation>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2.5 rounded-md bg-ink-100 p-3 md:mt-auto">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white text-13 font-semibold text-ink-700"
          >
            {initialesAffichees}
          </span>
          <span className="flex flex-col">
            <span className="text-14 font-medium text-ink-900">{nom}</span>
            <span className="text-13 text-ink-500">{role}</span>
          </span>
        </div>
      </nav>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
