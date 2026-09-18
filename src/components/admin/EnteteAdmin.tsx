import type { ReactNode } from "react";

/**
 * En-tête d'écran du back-office.
 *
 * Le résumé porte les compteurs qui décident du travail de la journée : ce
 * qui est en retard, ce qui attend, ce qui diverge. Il est au même endroit
 * sur les sept écrans.
 */
export function EnteteAdmin({
  titre,
  resume,
  actions,
}: {
  titre: string;
  resume: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-300 bg-white px-6 py-4">
      <div className="flex flex-col gap-1">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-24 font-semibold text-ink-900 outline-none"
        >
          {titre}
        </h1>
        <p className="text-14 text-ink-700">{resume}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
