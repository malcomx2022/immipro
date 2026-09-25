import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Depot } from "./Depot";
import { vueDuDossier } from "@/server/lecture/dossiers";
import { exigerCandidat } from "@/server/securite/page";
import { fuseauDuCandidat } from "@/server/comptes/rappels";
import { db } from "@/lib/db";
import { momentDans } from "@/domain/format/fuseau";

/**
 * C-11a — Déclaration de dépôt. WF-10 étape 1, INV-1.
 *
 * Le candidat déclare avoir déposé sa demande ; la plateforme ne dépose
 * rien. L'écran dit ce que la déclaration fige et ce qu'elle ouvre : la
 * conservation de ses pièces pendant l'instruction (arbitrage S.78).
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const acteur = await exigerCandidat(`/dossiers/${id}/depot`);
  const vue = await vueDuDossier(id, acteur.id).catch(() => null);
  if (!vue) return { title: "Dossier introuvable" };
  return {
    title: `Déclaration de dépôt — ${vue.dossier.destination.pays}`,
    description: "Déclarer le dépôt de la demande auprès de l'autorité.",
  };
}

export default async function PageDepot({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const acteur = await exigerCandidat(`/dossiers/${id}/depot`);
  const vue = await vueDuDossier(id, acteur.id).catch(() => null);
  if (!vue) notFound();

  // « Aujourd'hui » et l'ouverture, dans le fuseau du candidat (S.89).
  const [fuseau, ouverture] = await Promise.all([
    fuseauDuCandidat(acteur.id),
    db.application.findUniqueOrThrow({ where: { id }, select: { createdAt: true } }),
  ]);
  return (
    <Depot
      dossier={vue.dossier}
      aujourdhui={momentDans(new Date(), fuseau).jour}
      ouvertLe={momentDans(ouverture.createdAt, fuseau).jour}
    />
  );
}
