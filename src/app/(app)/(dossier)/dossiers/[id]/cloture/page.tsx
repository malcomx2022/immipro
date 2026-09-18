import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Cloture } from "./Cloture";
import { DOSSIERS, dossierParId } from "@/lib/contenu/dossiers";

/**
 * C-11 — Clôture. WF-10, INV-5.
 *
 * La purge des pièces d'identité y est annoncée au moment où elle se
 * déclenche, avec son délai : c'est la forme visible de l'engagement de
 * rétention, et la seule occasion de proposer le téléchargement avant.
 */
export function generateStaticParams() {
  return DOSSIERS.map((d) => ({ id: d.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const dossier = dossierParId(id);
  if (!dossier) return { title: "Dossier introuvable" };
  return {
    title: `Clôture — ${dossier.destination.pays}`,
    description: "Déclarer l'issue de la démarche et clôturer le dossier.",
  };
}

export default async function PageCloture({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dossier = dossierParId(id);
  if (!dossier) notFound();

  return <Cloture dossier={dossier} />;
}
