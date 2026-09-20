import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArchiveDuDossier } from "./ArchiveDuDossier";
import { archiveDuDossier } from "@/server/lecture/portabilite";
import { exigerCandidat } from "@/server/securite/page";

/**
 * Archive d'un dossier — C-11, WF-10.
 *
 * L'écran vers lequel pointe « Télécharger mon dossier », et qui répondait
 * 404 depuis que le bouton existe. Rendu à la demande : il liste des pièces
 * dont l'état change à chaque dépôt, et dont certaines auront été purgées.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const acteur = await exigerCandidat(`/dossiers/${id}/archive`);
  const archive = await archiveDuDossier(id, acteur.id).catch(() => null);
  if (!archive) return { title: "Dossier introuvable" };
  return {
    title: `Archive — ${archive.dossier.pays}`,
    description: "Ce que ce dossier contient, à garder avant la purge.",
  };
}

export default async function PageArchive({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const acteur = await exigerCandidat(`/dossiers/${id}/archive`);
  const archive = await archiveDuDossier(id, acteur.id).catch(() => null);
  if (!archive) notFound();

  return <ArchiveDuDossier archive={archive} />;
}
