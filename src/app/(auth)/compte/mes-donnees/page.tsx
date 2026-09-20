import type { Metadata } from "next";
import { MesDonnees } from "./MesDonnees";
import { exigerCandidat } from "@/server/securite/page";
import { tableauDeBord } from "@/server/lecture/dossiers";

/**
 * Mes données — A-05, WF-15, droit d'accès et portabilité.
 *
 * Rendu à la demande et derrière la garde : l'écran nomme les dossiers du
 * compte, et il n'y a pas de version de cette page qui vaille pour tout le
 * monde.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mes données",
  description: "Ce que contient l'export, ce qu'il ne contient pas, et où trouver tes pièces.",
};

export default async function PageMesDonnees() {
  const acteur = await exigerCandidat("/compte/mes-donnees");
  const dossiers = await tableauDeBord(acteur.id);

  return (
    <MesDonnees
      dossiers={dossiers.map((d) => ({
        id: d.id,
        pays: d.destination.pays,
        intitule: d.destination.intitule,
      }))}
    />
  );
}
