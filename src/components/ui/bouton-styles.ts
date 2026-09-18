/**
 * Classes partagées par `Button` et `LienBouton`.
 *
 * Ce module n'est PAS un module client, et ne doit jamais le devenir : au
 * travers d'une frontière `"use client"`, un composant serveur ne reçoit
 * qu'une référence au module, pas ses valeurs — les constantes arrivent
 * `undefined` et le bouton se rend sans style. Le défaut est invisible en
 * test jsdom, où la directive est inerte : il ne se voit qu'à l'écran.
 *
 * Source : Bibliothèque de composants §1.
 */
export type ButtonVariante =
  | "primaire"
  | "secondaire"
  | "tertiaire"
  | "destructif"
  | "lien";

export const SOCLE_BOUTON =
  "inline-flex items-center justify-center gap-2.5 rounded-md font-sans text-16 font-semibold transition-colors disabled:cursor-not-allowed";

export const VARIANTES_BOUTON: Record<ButtonVariante, string> = {
  primaire:
    "h-12 px-6 bg-accent-500 text-white hover:bg-accent-600 disabled:bg-ink-300 disabled:text-ink-500",
  secondaire:
    "h-12 px-6 border border-ink-300 bg-white text-ink-900 hover:bg-ink-100 disabled:bg-ink-100 disabled:text-ink-500",
  tertiaire:
    "h-12 px-3 bg-transparent text-accent-700 hover:bg-accent-50 disabled:text-ink-500",
  destructif:
    "h-12 px-5 border border-danger bg-white text-danger hover:bg-danger/5 disabled:border-ink-300 disabled:text-ink-500",
  lien:
    "min-h-touch px-0 bg-transparent text-accent-600 underline underline-offset-2 hover:text-accent-700 disabled:text-ink-500 disabled:no-underline",
};
