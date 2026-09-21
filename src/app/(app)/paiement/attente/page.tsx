import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Attente } from "./Attente";
import { paiementDuTunnel } from "@/server/lecture/paiements";
import { exigerCandidat } from "@/server/securite/page";

/**
 * $-03 — Attente de confirmation Mobile Money. WF-05.
 *
 * Variante retenue : le fil d'étapes. Un anneau qui tourne est le signal
 * exact d'une page bloquée — il tourne aussi bien quand rien n'arrive.
 *
 * L'écran vit d'une référence. Sans elle, il n'y a aucun paiement à
 * attendre : il tournait dans le vide, sans relever le statut d'aucune
 * transaction. C'est le récapitulatif qui l'ouvre et l'amène ici.
 *
 * Un paiement déjà abouti ne repasse pas par l'attente : le rejoindre par
 * un retour arrière ou un signet conduirait à attendre cinq minutes une
 * confirmation déjà reçue.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirmation en cours",
  description: "Confirme le paiement pour ouvrir ton pack.",
};

export default async function PageAttente({
  searchParams,
}: {
  searchParams: Promise<{ tx?: string }>;
}) {
  const { tx } = await searchParams;
  const acteur = await exigerCandidat(
    tx ? `/paiement/attente?tx=${encodeURIComponent(tx)}` : "/paiement/attente",
  );
  if (!tx) notFound();

  const attente = await paiementDuTunnel(tx, acteur.id).catch(() => null);
  if (!attente) notFound();
  if (attente.etat === "paye") redirect(`/paiement/confirme?tx=${encodeURIComponent(tx)}`);
  if (attente.etat !== "en_cours") redirect(`/paiement/echec?tx=${encodeURIComponent(tx)}`);

  return <Attente attente={attente} />;
}
