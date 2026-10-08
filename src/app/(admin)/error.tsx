"use client";

import { EchecDeRendu } from "@/components/etats/EchecDeRendu";

/** La page n'a pas pu s'afficher : rendu sous le gabarit du groupe — revue du 07/10/2026, E8. */
export default function Erreur(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <EchecDeRendu espace="backoffice" {...props} />;
}
