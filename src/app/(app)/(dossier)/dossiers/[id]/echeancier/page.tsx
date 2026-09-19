import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Echeancier } from "./Echeancier";
import { echeancierDuDossier, vueDuDossier } from "@/server/lecture/dossiers";
import { exigerCandidat } from "@/server/securite/page";

/**
 * C-10 — Échéancier. WF-09.
 *
 * Rendu à la demande : le compte à rebours et le classement des échéances se
 * lisent par rapport à aujourd'hui. Préservé en statique, l'écran afficherait
 * indéfiniment le nombre de jours du jour du déploiement, et le retard
 * n'apparaîtrait jamais.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const acteur = await exigerCandidat(`/dossiers/${id}/echeancier`);
  const vue = await vueDuDossier(id, acteur.id).catch(() => null);
  if (!vue) return { title: "Dossier introuvable" };
  return {
    title: `Échéancier — ${vue.dossier.destination.pays}`,
    description: "Les dates à tenir avant le dépôt, calculées depuis la date visée.",
  };
}

export default async function PageEcheancier({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const acteur = await exigerCandidat(`/dossiers/${id}/echeancier`);
  const vue = await vueDuDossier(id, acteur.id).catch(() => null);
  if (!vue) notFound();

  const { echeances } = await echeancierDuDossier(id, acteur.id);

  return (
    <Echeancier
      dossier={vue.dossier}
      echeances={echeances}
      aujourdhui={new Date().toISOString().slice(0, 10)}
    />
  );
}
