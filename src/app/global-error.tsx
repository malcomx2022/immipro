"use client";

import "@/styles/globals.css";
import Image from "next/image";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { EtatDEcran } from "@/components/ui/EtatDEcran";
import { SERVICE_INTERROMPU, TITRE_SERVICE_INTERROMPU } from "@/domain/etats/ecrans";

/**
 * Le gabarit racine lui-même a échoué — revue du 07/10/2026, E8.
 *
 * Ce fichier remplace `layout.tsx` : il écrit son propre `<html lang="fr">`,
 * importe la feuille de styles et pose son titre d'onglet, faute de quoi la
 * page serait anglaise et sans style. Ni barre ni pied de page : ce sont
 * eux, peut-être, qui ont échoué.
 *
 * Recharger la page complète, et non `reset()` : il n'y a plus de gabarit
 * sur lequel rejouer le rendu. Le journal ne reçoit que le `digest`.
 */
export default function ErreurGlobale({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error("[rendu]", { espace: "racine", digest: error.digest });
  }, [error.digest]);

  return (
    <html lang="fr">
      <head>
        <title>{TITRE_SERVICE_INTERROMPU}</title>
      </head>
      <body className="bg-white">
        <header className="px-4 py-4 md:px-12">
          <Image
            src="/brand/immipro-logo-primary.svg"
            alt="ImmiPro"
            width={110}
            height={27}
            unoptimized
          />
        </header>
        <main>
          <EtatDEcran
            etat={SERVICE_INTERROMPU}
            illustration="erreur"
            action={
              <Button className="w-full" onClick={() => window.location.reload()}>
                {SERVICE_INTERROMPU.action}
              </Button>
            }
            sortie={
              // Un lien HTML, pas `next/link` : le routeur client est peut-être ce qui a cédé.
              <a
                href={SERVICE_INTERROMPU.destination}
                className="flex min-h-touch items-center justify-center text-14 text-ink-700"
              >
                Revenir à l&apos;accueil
              </a>
            }
          />
        </main>
      </body>
    </html>
  );
}
