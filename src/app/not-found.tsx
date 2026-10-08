import type { Metadata } from "next";
import { PageIntrouvable } from "@/components/etats/PageIntrouvable";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { SkipLink } from "@/components/layout/SkipLink";
import { PAGE_INTROUVABLE } from "@/domain/etats/ecrans";

/**
 * Adresse qui ne mène à rien — revue du 07/10/2026, E8.
 *
 * Next la rend sous le seul gabarit racine : elle recompose donc celui de
 * l'acquisition (lien d'évitement, barre, pied de page). Pré-rendue au
 * build, elle ne lit aucune donnée.
 */
export const metadata: Metadata = { title: PAGE_INTROUVABLE.public.titre };

export default function Introuvable() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SkipLink cible="contenu" />
      <Header />
      <main className="flex-1">
        <PageIntrouvable espace="public" />
      </main>
      <Footer />
    </div>
  );
}
