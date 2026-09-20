import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Checklist } from "./Checklist";
import { vueDuDossier } from "@/server/lecture/dossiers";
import { propositionPourLeDossier } from "@/server/lecture/partenaires";
import { exigerCandidat } from "@/server/securite/page";

/**
 * C-06 — Dossier, checklist. WF-06.
 *
 * Rendu à la demande : un dossier est nominatif, et sa checklist change à
 * chaque dépôt de pièce. Le pré-générer le figerait au déploiement.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const acteur = await exigerCandidat(`/dossiers/${id}`);
  const vue = await vueDuDossier(id, acteur.id).catch(() => null);
  if (!vue) return { title: "Dossier introuvable" };
  return {
    title: `Checklist — ${vue.dossier.destination.pays}`,
    description: "Les pièces à réunir pour ce dossier, et ce qui reste à faire sur chacune.",
  };
}

export default async function PageChecklist({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const acteur = await exigerCandidat(`/dossiers/${id}`);
  const vue = await vueDuDossier(id, acteur.id).catch(() => null);
  if (!vue) notFound();

  // La proposition est lue après le dossier et jamais en parallèle : sans
  // dossier lisible, il n'y a rien à proposer, et la lecture inscrit une
  // ligne de suivi (WF-13, étape 2).
  const proposition = await propositionPourLeDossier(id, acteur.id);

  return <Checklist dossier={vue.dossier} pieces={vue.pieces} proposition={proposition} />;
}
