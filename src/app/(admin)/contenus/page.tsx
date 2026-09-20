import type { Metadata } from "next";
import { Contenus } from "./Contenus";
import { documentsEditoriaux } from "@/server/lecture/editorial";
import { exigerVeilleur } from "@/server/securite/page";

/**
 * B-08 — Guides et articles. J.C, WF-14 dans l'esprit.
 *
 * Écran absent du prototype : les guides y étaient des maquettes, pas un
 * registre. Il suit donc les six autres — même densité, même colonne
 * d'état, même mention d'audit — plutôt qu'une forme inventée pour lui.
 *
 * Rendu à la demande : la liste change à chaque enregistrement.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Guides et articles",
  description: "Les contenus publiés, leurs brouillons, et ce qui bloque leur publication.",
};

export default async function PageContenus() {
  await exigerVeilleur("/contenus");
  return <Contenus documents={await documentsEditoriaux()} />;
}
