import type { Metadata } from "next";
import { FileDeVeille } from "./FileDeVeille";
import { COLLECTE, FICHES_SUIVIES } from "@/lib/contenu/backoffice";

/**
 * B-01 — File de veille réglementaire. WF-14.
 *
 * Rendu à la demande : les retards de relecture se comptent depuis
 * aujourd'hui. Figés au build, ils vieilliraient d'un jour par jour.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Veille réglementaire",
  description: "Les fiches à relire, les écarts détectés et l'état des sources.",
};

export default function PageVeille() {
  return (
    <FileDeVeille
      fiches={FICHES_SUIVIES}
      collecte={COLLECTE}
      aujourdhui={new Date().toISOString().slice(0, 10)}
    />
  );
}
