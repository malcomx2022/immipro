import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Echec } from "./Echec";
import { paiementDuTunnel } from "@/server/lecture/paiements";
import { exigerCandidat } from "@/server/securite/page";

/**
 * $-05 — Échec ou expiration. WF-05.
 *
 * Le motif vient de la cause conservée (N.B), de l'adresse à défaut, et de
 * l'état de la transaction en dernier recours. Un échec dont on ignore la
 * raison tombe dans le refus sans motif — et non plus dans le délai
 * dépassé, qui paraissait le moins accusateur mais affirmait « les cinq
 * minutes se sont écoulées » sur un refus reçu en deux secondes.
 *
 * Ce refus sans motif reste générique et n'invente pas de cause (O.A) : le
 * rail Mobile Money ne fournit pas de code normalisé, et une précision
 * inventée envoie corriger ce qui n'est pas en cause.
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
  description: "Aucun montant n'a été débité. Ton dossier est conservé.",
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
