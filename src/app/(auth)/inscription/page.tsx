import type { Metadata } from "next";
import { Inscription } from "./Inscription";
import { pagesPubliees } from "@/server/juridique/lecture";

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

/** La case nomme des textes publiés ou non : cela se lit en base, à chaque visite (S.101). */
export const dynamic = "force-dynamic";

export default async function PageInscription() {
  return <Inscription publiees={await pagesPubliees()} />;
}
