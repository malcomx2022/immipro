import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditionRegle } from "./EditionRegle";
import { editionDeLaRegle } from "@/server/lecture/backoffice";
import { exigerVeilleur } from "@/server/securite/page";

/**
 * B-02 — Édition d'une règle versionnée. WF-14.
 *
 * Rendu à la demande : la page n'est plus pré-générée depuis une liste
 * figée, et le nombre de dossiers concernés — celui qui dit combien de
 * checklists bougeront à la publication — est compté au moment où on le lit.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const vue = await editionDeLaRegle(id);
  if (!vue) return { title: "Fiche introuvable" };
  return {
    title: `${vue.enVigueur.pays} — ${vue.enVigueur.procedure}`,
    description: "Éditer et publier une version de règle.",
  };
}

export default async function PageEditionRegle({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigerVeilleur();
  const { id } = await params;
  const vue = await editionDeLaRegle(id);
  if (!vue) notFound();

  return (
    <EditionRegle
      enVigueur={vue.enVigueur}
      brouillon={vue.brouillon}
      dossiersConcernes={vue.dossiersConcernes}
      dossiersSousLaNouvelleRegle={vue.dossiersSousLaNouvelleRegle}
      historique={vue.historique}
    />
  );
}
