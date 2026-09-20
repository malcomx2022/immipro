import type { Metadata } from "next";
import { SuppressionDuCompte } from "./SuppressionDuCompte";
import { exigerCandidat } from "@/server/securite/page";
import { rendezVousQueLaSuppressionAnnule } from "@/server/lecture/consultants";
import { avertissementSuppression } from "@/domain/consultants/annulation";

/**
 * Suppression de compte — A-05, RG-10.4.
 *
 * Rendu à la demande et derrière la garde : l'écran le plus irréversible du
 * produit ne s'ouvre pas à quelqu'un qui n'est pas connecté, et la question
 * « de quel compte parle-t-on ? » ne doit jamais se poser.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Supprimer mon compte",
  description: "Ce qui est supprimé, ce qui reste, et pourquoi.",
};

export default async function PageSuppression() {
  const acteur = await exigerCandidat("/compte/suppression");
  // K.C — ce qui arrive aux rendez-vous à venir, et à ce qui a été payé,
  // se lit avant le bouton. Découvrir après coup qu'une consultation a été
  // retenue, c'est avoir été trompé, même quand la retenue est légitime.
  const rendezVous = await rendezVousQueLaSuppressionAnnule(acteur.id);
  return (
    <SuppressionDuCompte
      email={acteur.email}
      avertissementRendezVous={avertissementSuppression(rendezVous)}
      remboursementAttendu={rendezVous.some((r) => r.issue === "REMBOURSABLE")}
    />
  );
}
