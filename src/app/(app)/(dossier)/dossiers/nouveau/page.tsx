import type { Metadata } from "next";
import { OuvertureDossier } from "./OuvertureDossier";

/**
 * C-05 — Ouverture de dossier. WF-04.
 *
 * Deux informations suffisent. L'aperçu de la checklist est gratuit, et
 * l'écran dit ce qu'ouvrir un dossier n'est pas : aucune démarche auprès de
 * l'administration (INV-1).
 */
export const metadata: Metadata = {
  title: "Ouvrir un dossier",
  description: "Deux informations suffisent pour générer votre checklist.",
};

export default function PageNouveauDossier() {
  return <OuvertureDossier />;
}
