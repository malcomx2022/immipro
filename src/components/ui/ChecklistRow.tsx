import Link from "next/link";
import type { DocumentState } from "@/domain/completeness/score";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";

/**
 * Ligne de pièce — C-06 et C-09, règle clavier 5.
 *
 * C'est un `button` ou un `a`, jamais un `div` avec un `onClick` : sinon la
 * ligne n'existe ni pour la tabulation, ni pour Entrée, ni pour le lecteur
 * d'écran. Quand la ligne mène à un écran, c'est un lien — l'ouvrir dans un
 * nouvel onglet doit rester possible, et un bouton l'interdirait.
 *
 * Le message est un constat suivi d'une action — « Validité restante après
 * retour : 4 mois. Minimum exigé : 6 mois. Renouvellement à engager. » — et
 * jamais « document non conforme » seul (RG-06.3).
 */
interface ChecklistRowBase {
  /** Code court de la pièce, en monospace : ID, DIP, REL, FIN, ADM. */
  code: string;
  libelle: string;
  etat: DocumentState;
  /** Constat puis action. Absent quand la pièce est conforme. */
  message?: string;
  /** Précision de validité, à côté de la pastille d'état. */
  mention?: string;
  /** Libellé de l'issue : « Voir », « Ajouter », « Remplacer ». */
  action: string;
  className?: string;
}

export type ChecklistRowProps = ChecklistRowBase &
  ({ href: string; onClick?: never } | { onClick: () => void; href?: never });

const SOCLE =
  "flex min-h-18 w-full items-start gap-3 border-t border-ink-300 bg-white p-4 text-left hover:bg-ink-100";

export function ChecklistRow({
  code,
  libelle,
  etat,
  message,
  mention,
  action,
  href,
  onClick,
  className,
}: ChecklistRowProps) {
  const contenu = (
    <>
      <span
        aria-hidden="true"
        className="flex h-9 w-9 flex-none items-center justify-center rounded-sm bg-ink-100 font-mono text-13 text-ink-700"
      >
        {code}
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
        <span className="text-16 font-medium text-ink-900">{libelle}</span>
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge etat={etat} />
          {mention ? <span className="text-13 text-ink-500">{mention}</span> : null}
        </span>
        {message ? (
          <span className="text-pretty text-14 text-ink-700">{message}</span>
        ) : null}
      </span>
      <span className="flex-none text-14 text-ink-500">{action}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cn(SOCLE, className)}>
        {contenu}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={cn(SOCLE, className)}>
      {contenu}
    </button>
  );
}
