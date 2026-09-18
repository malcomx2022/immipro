import Link from "next/link";
import type { Dossier } from "@/domain/dossiers/dossier";
import { LIBELLE_STATUT } from "@/domain/dossiers/dossier";

/**
 * En-tête commun aux cinq écrans d'un dossier (C-06 à C-11).
 *
 * Le fil de retour est un lien et non une flèche seule : « ‹ » n'a pas de
 * nom accessible, et le prototype le laisse nu sur quatre écrans.
 *
 * Le titre de l'écran reste dans chaque page — c'est lui que vise « Aller au
 * contenu », et il doit donc porter `id="contenu"` là où il est écrit.
 */
export function EnteteDossier({
  dossier,
  retour = "/tableau-de-bord",
  libelleRetour = "Mes dossiers",
}: {
  dossier: Dossier;
  retour?: string;
  libelleRetour?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Link
        href={retour}
        className="inline-flex min-h-touch items-center gap-1.5 self-start text-14 text-ink-700 underline"
      >
        <span aria-hidden="true">‹</span>
        {libelleRetour}
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 flex-none items-center justify-center rounded-sm bg-ink-100 font-mono text-13 text-ink-700"
        >
          {dossier.destination.code}
        </span>
        <span className="text-16 font-semibold text-ink-900">
          {dossier.destination.pays} — {dossier.destination.intitule.split("—")[0]?.trim()}
        </span>
        <span className="rounded-full bg-ink-100 px-2.5 py-1 text-13 font-medium text-ink-700">
          {LIBELLE_STATUT[dossier.statut]}
        </span>
      </div>
    </div>
  );
}
