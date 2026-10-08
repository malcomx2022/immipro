import { CHARGEMENT_DE_LA_PAGE } from "@/domain/etats/ecrans";

/**
 * Ce que rend chaque `loading.tsx` — revue du 07/10/2026, E8 ; DOC-12 §3.8.
 *
 * Des squelettes, jamais un spinner plein écran, sur le modèle de
 * `Chargement` dans les résultats du simulateur. L'annonce est lue par le
 * lecteur d'écran (`role="status"`) sans déplacer le focus ; elle porte la
 * cible du lien d'évitement, que la page remplacera par son titre.
 *
 * Les blocs ne s'animent que si la personne n'a pas demandé à réduire les
 * animations.
 */
export function ChargementDePage() {
  return (
    <div className="mx-auto flex w-full max-w-gabarit flex-col gap-6 px-4 py-6 md:px-12 md:py-10">
      <p id="contenu" tabIndex={-1} role="status" className="text-16 text-ink-700 outline-none">
        {CHARGEMENT_DE_LA_PAGE}
      </p>
      <div aria-hidden="true" className="flex flex-col gap-3">
        <div className="h-8 w-2/5 rounded-md bg-ink-300 motion-safe:animate-pulse" />
        <div className="h-3.5 w-3/5 rounded-full bg-ink-100 motion-safe:animate-pulse" />
      </div>
      <div aria-hidden="true" className="grid gap-3 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-lg bg-white p-4 shadow-e2 motion-safe:animate-pulse"
          >
            <div className="h-3.5 w-3/5 rounded-full bg-ink-300" />
            <div className="h-28 rounded-md bg-ink-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
