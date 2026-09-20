import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Echec } from "./Echec";
import { paiementDuTunnel } from "@/server/lecture/paiements";
import { exigerCandidat } from "@/server/securite/page";

/**
 * $-05 — Échec ou expiration. WF-05.
 *
 * Le motif vient de l'opérateur, transmis dans l'adresse. Un motif inconnu
 * retombe sur le délai dépassé : c'est le cas le moins accusateur, et
 * annoncer un refus bancaire à tort est la pire des erreurs sur cet écran.
 *
 * L'écran porte maintenant la transaction qui a échoué : son montant, sa
 * référence — celle qu'on dicte au service client — et de quoi relancer le
 * même achat. Il affichait le premier pack de la grille et la référence
 * `IMP-2609-4471` pour tout le monde, ce qui est précisément ce qu'il ne
 * faut pas quand quelqu'un appelle en croyant avoir été débité.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Paiement non abouti",
  description: "Aucun montant n'a été débité. Votre dossier est conservé.",
};

export default async function PageEchec({
  searchParams,
}: {
  searchParams: Promise<{ tx?: string; motif?: string }>;
}) {
  const { tx, motif } = await searchParams;
  const acteur = await exigerCandidat(
    tx ? `/paiement/echec?tx=${encodeURIComponent(tx)}` : "/paiement/echec",
  );
  if (!tx) notFound();

  const paiement = await paiementDuTunnel(tx, acteur.id).catch(() => null);
  if (!paiement) notFound();

  return <Echec paiement={paiement} motif={motif ?? null} />;
}
