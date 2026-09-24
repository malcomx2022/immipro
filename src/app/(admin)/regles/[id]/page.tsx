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
  const acteur = await exigerVeilleur();
  const { id } = await params;
  const vue = await editionDeLaRegle(id);
  if (!vue) notFound();

  return (
    <EditionRegle
      id={id}
      // RG-14.2 : la route de publication est réservée à un administrateur.
      // L'écran lit le même rôle, pour le dire avant le clic plutôt que
      // de laisser un veilleur enregistrer puis buter sur un refus.
      peutPublier={acteur.role === "ADMIN"}
      // L'enregistrement écrit toujours un brouillon : celui qui existe, ou
      // celui qu'il ouvre. L'écran annonce lequel avant le clic, plutôt que
      // d'appeler « brouillon » la version que les dossiers ont figée.
      brouillonExistant={vue.brouillonExistant}
      versionAEcrire={vue.versionAEcrire}
      enVigueur={vue.enVigueur}
      brouillon={vue.brouillon}
      dossiersConcernes={vue.dossiersConcernes}
      dossiersSousLaNouvelleRegle={vue.dossiersSousLaNouvelleRegle}
      historique={vue.historique}
    />
  );
}
