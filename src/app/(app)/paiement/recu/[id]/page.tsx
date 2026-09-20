import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Recu } from "./Recu";
import { recuDuPaiement } from "@/server/lecture/paiements";
import { exigerCandidat } from "@/server/securite/page";

/**
 * $-06 — Reçu. WF-05.
 *
 * L'écran lisait une transaction inventée : le premier pack de la grille,
 * une date de septembre et un numéro d'opérateur écrits en dur, servis à
 * l'identique pour n'importe quelle référence dans l'URL. Il lit désormais
 * la transaction que la référence désigne, et refuse celle d'autrui.
 *
 * Rendu à la demande, et derrière la garde : un reçu est nominatif, et il
 * n'y a pas de version de cette page qui vaille pour tout le monde.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Reçu ${id.toUpperCase()}`,
    description: "Reçu de paiement ImmiPro.",
  };
}

export default async function PageRecu({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const acteur = await exigerCandidat(`/paiement/recu/${id}`);
  const recu = await recuDuPaiement(id, acteur.id).catch(() => null);
  if (!recu) notFound();

  return <Recu recu={recu} />;
}
