import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Facture } from "./Facture";
import { pieceDuClient } from "@/server/lecture/factures";
import { exigerCandidat } from "@/server/securite/page";

/**
 * Facture et facture d'avoir — avis comptable M.C du 04/10/2026.
 *
 * Rendue à la demande et derrière la garde : une facture porte le nom et
 * l'adresse de celui qui a payé, et n'existe pour personne d'autre.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ numero: string }>;
}): Promise<Metadata> {
  const { numero } = await params;
  return { title: `Facture ${decodeURIComponent(numero)}`, description: "Facture ImmiPro." };
}

export default async function PageFacture({ params }: { params: Promise<{ numero: string }> }) {
  const { numero: brut } = await params;
  const numero = decodeURIComponent(brut);
  const acteur = await exigerCandidat(`/paiement/facture/${encodeURIComponent(numero)}`);
  const piece = await pieceDuClient(numero, acteur.id).catch(() => null);
  if (!piece) notFound();
  return <Facture piece={piece} />;
}
