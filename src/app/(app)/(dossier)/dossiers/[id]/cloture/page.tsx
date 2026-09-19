import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Cloture } from "./Cloture";
import { vueDuDossier } from "@/server/lecture/dossiers";
import { exigerCandidat } from "@/server/securite/page";

/**
 * C-11 — Clôture. WF-10, INV-5.
 *
 * La purge des pièces d'identité y est annoncée au moment où elle se
 * déclenche, avec son délai : c'est la forme visible de l'engagement de
 * rétention, et la seule occasion de proposer le téléchargement avant.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const acteur = await exigerCandidat(`/dossiers/${id}/cloture`);
  const vue = await vueDuDossier(id, acteur.id).catch(() => null);
  if (!vue) return { title: "Dossier introuvable" };
  return {
    title: `Clôture — ${vue.dossier.destination.pays}`,
    description: "Déclarer l'issue de la démarche et clôturer le dossier.",
  };
}

export default async function PageCloture({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const acteur = await exigerCandidat(`/dossiers/${id}/cloture`);
  const vue = await vueDuDossier(id, acteur.id).catch(() => null);
  if (!vue) notFound();

  return <Cloture dossier={vue.dossier} />;
}
