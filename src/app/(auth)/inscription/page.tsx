import type { Metadata } from "next";
import { Inscription } from "./Inscription";

/**
 * A-01 — Inscription. WF-02.
 *
 * Une seule case à cocher ici, pour les conditions. Le consentement au
 * traitement des pièces d'identité est demandé séparément, au premier
 * téléversement (RG-02.1) : le mélanger aux conditions le rendrait subi.
 */
export const metadata: Metadata = {
  title: "Créer un compte",
  description: "Crée ton compte ImmiPro pour ouvrir et suivre un dossier.",
};

export default function PageInscription() {
  return <Inscription />;
}
