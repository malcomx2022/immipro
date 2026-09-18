import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { SkipLink } from "@/components/layout/SkipLink";

/**
 * Gabarit acquisition — sections P et A (DOC-12, handoff §Gabarits).
 *
 * Barre haute, contenu centré à 1120 px, pied de page. Le lien d'évitement
 * est le premier arrêt de tabulation de chaque écran (règle clavier 2) ; il
 * vise `#contenu`, l'identifiant que chaque page pose sur son titre, rendu
 * focalisable par `tabindex="-1"`.
 */
export default function GabaritAcquisition({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SkipLink cible="contenu" />
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
