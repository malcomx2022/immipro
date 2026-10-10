"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { LienBouton } from "@/components/ui/LienBouton";
import { LienDeNavigation } from "./LienDeNavigation";

/**
 * Le menu de la barre publique sous 768 px — revue du 07/10/2026, M13
 * (D-18 du 08/10/2026).
 *
 * La barre masquait « Destinations », « Tarifs », « Guides pays » et
 * « Créer un compte » sur mobile : il fallait descendre au pied de page,
 * sur l'écran même où la plupart des candidats arrivent. Le menu ouvre la
 * feuille du bas existante (`BottomSheet` : piège de tabulation, Échap,
 * focus rendu au bouton).
 *
 * Les liens arrivent de `Header`, qui les déclare : `tests/liens-morts`
 * lit les adresses dans ce fichier-là, et une seule liste sert les deux
 * largeurs.
 *
 * « Fermer le menu » est un vrai bouton : sous TalkBack, Échap n'existe
 * pas, et le voile n'est pas un arrêt.
 *
 * Écart au prototype 390 px, qui n'a pas de menu : consigné dans
 * `ECARTS-A-ARBITRER.md` pour report par le design.
 */
export interface LienDuMenu {
  href: string;
  libelle: string;
}

export function MenuPublic({ liens }: { liens: readonly LienDuMenu[] }) {
  const chemin = usePathname();
  const [ouvert, setOuvert] = useState(false);
  // Une navigation ferme le menu, y compris par le bouton retour. Le
  // chemin vu au rendu précédent est retenu et comparé pendant le rendu,
  // sans effet (S.164) : revenir ensuite sur la page de départ ne le
  // rouvre pas.
  const [cheminVu, setCheminVu] = useState(chemin);
  if (chemin !== cheminVu) {
    setCheminVu(chemin);
    setOuvert(false);
  }

  const fermer = () => setOuvert(false);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={ouvert}
        onClick={() => setOuvert(true)}
        className="flex min-h-touch items-center rounded-md px-3.5 text-14 font-semibold text-ink-900 hover:bg-ink-100 md:hidden"
      >
        Menu
      </button>
      <BottomSheet ouverte={ouvert} titre="Menu" onFermer={fermer}>
        <nav aria-label="Navigation principale" className="flex flex-col">
          {liens.map((l) => (
            <LienDeNavigation
              key={l.href}
              href={l.href}
              className="flex min-h-touch items-center rounded-sm px-3 text-16 text-ink-900 hover:bg-ink-100"
            >
              {l.libelle}
            </LienDeNavigation>
          ))}
        </nav>
        <LienBouton href="/inscription" pleineLargeur onClick={fermer}>
          Créer un compte
        </LienBouton>
        <Link
          href="/connexion"
          onClick={fermer}
          className="flex min-h-touch items-center justify-center text-14 font-semibold text-ink-900"
        >
          Connexion
        </Link>
        <Button variante="secondaire" pleineLargeur onClick={fermer}>
          Fermer le menu
        </Button>
      </BottomSheet>
    </>
  );
}
