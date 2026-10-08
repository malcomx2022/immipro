import Image from "next/image";
import type { ReactNode } from "react";
import type { EtatDEcranTexte } from "@/domain/etats/ecrans";

/**
 * Page d'état en pleine page — revue du 07/10/2026, E8.
 *
 * Introuvable, échec du rendu, hors ligne : un titre qui nomme le fait,
 * le corps, ce qui est conservé **avant** l'action (DOC-12 §16, règle 2),
 * une action principale et une sortie discrète (règle 4).
 *
 * `BlocEchec` n'est pas réutilisé ici : son titre est un `<p>` et il porte
 * `role="alert"`. En pleine page, le titre est le `h1` que vise le lien
 * d'évitement (règle clavier 2), et une page présente au chargement ne
 * doit pas parler avant qu'on l'ait lue.
 *
 * Aucun état ni événement : il se rend côté serveur, et les pages d'erreur
 * (client) le rendent aussi.
 */
const ILLUSTRATIONS = {
  erreur: "/illustrations/erreur.svg",
  "hors-ligne": "/illustrations/hors-ligne.svg",
} as const;

export interface EtatDEcranProps {
  etat: EtatDEcranTexte;
  /** D-15 : `erreur` sur l'échec, `hors-ligne` hors connexion, rien sur l'introuvable. */
  illustration?: keyof typeof ILLUSTRATIONS;
  /** L'action principale : un `LienBouton` ou un `Button`. */
  action: ReactNode;
  /** La sortie discrète, sous l'action. */
  sortie?: ReactNode;
  /** Ce qui se lit en dernier : la trace au back-office. */
  children?: ReactNode;
}

export function EtatDEcran({ etat, illustration, action, sortie, children }: EtatDEcranProps) {
  return (
    <div className="mx-auto flex w-full max-w-etroit flex-col gap-6 px-4 py-8 md:py-12">
      <div className="flex flex-col items-center gap-5 text-center">
        {illustration ? (
          <Image src={ILLUSTRATIONS[illustration]} alt="" width={260} height={163} unoptimized />
        ) : null}
        <div className="flex flex-col gap-2">
          <h1
            id="contenu"
            tabIndex={-1}
            className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
          >
            {etat.titre}
          </h1>
          <p className="text-pretty text-16 text-ink-700">{etat.corps}</p>
        </div>
      </div>
      {etat.conserve ? (
        <p className="text-pretty rounded-lg bg-ink-100 p-4 text-center text-14 font-medium text-ink-900">
          {etat.conserve}
        </p>
      ) : null}
      <div className="flex flex-col items-center gap-2">
        {action}
        {sortie}
      </div>
      {children}
    </div>
  );
}
