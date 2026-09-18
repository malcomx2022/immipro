import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditionRegle } from "./EditionRegle";
import {
  DOSSIERS_EN_VERSION_4,
  DOSSIERS_SOUS_LA_VERSION_5,
  FICHES_SUIVIES,
  HISTORIQUE_REGLE,
  REGLE_BROUILLON,
  REGLE_EN_VIGUEUR,
} from "@/lib/contenu/backoffice";

/**
 * B-02 — Édition d'une règle versionnée. WF-14.
 */
export function generateStaticParams() {
  return FICHES_SUIVIES.map((f) => ({ id: f.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const fiche = FICHES_SUIVIES.find((f) => f.id === id);
  if (!fiche) return { title: "Fiche introuvable" };
  return {
    title: `${fiche.pays} — ${fiche.procedure}`,
    description: "Éditer et publier une version de règle.",
  };
}

export default async function PageEditionRegle({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const fiche = FICHES_SUIVIES.find((f) => f.id === id);
  if (!fiche) notFound();

  return (
    <EditionRegle
      enVigueur={REGLE_EN_VIGUEUR}
      brouillon={REGLE_BROUILLON}
      dossiersConcernes={DOSSIERS_EN_VERSION_4}
      dossiersSousLaNouvelleRegle={DOSSIERS_SOUS_LA_VERSION_5}
      historique={HISTORIQUE_REGLE}
    />
  );
}
