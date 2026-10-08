"use client";

import { EchecDeRendu } from "@/components/etats/EchecDeRendu";
import { SkipLink } from "@/components/layout/SkipLink";

/**
 * Un gabarit de groupe a échoué — revue du 07/10/2026, E8.
 *
 * L'`error.tsx` d'un groupe n'attrape pas l'erreur de son propre gabarit :
 * une base indisponible quand `(dossier)/layout.tsx` lit le profil remonte
 * jusqu'ici. Ce fichier est rendu sous le seul gabarit racine, il pose donc
 * lui-même le lien d'évitement et le `main`. L'espace est inconnu : le
 * texte s'en tient à ce qui est vrai partout.
 */
export default function Erreur(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SkipLink cible="contenu" />
      <main className="flex-1">
        <EchecDeRendu espace="general" {...props} />
      </main>
    </div>
  );
}
