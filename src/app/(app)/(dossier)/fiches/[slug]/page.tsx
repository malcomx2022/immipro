import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FicheDetaillee } from "./FicheDetaillee";
import { ficheParSlug } from "@/domain/destinations/fiche";
import { FICHES } from "@/lib/contenu/destinations";

/**
 * C-04 — Fiche détaillée. WF-03, INV-8.
 *
 * La version connectée de P-04 : mêmes exigences, mais rangées par onglets
 * parce que le candidat y revient plusieurs fois et cherche une section
 * précise. Les réserves sont affichées en contexte, pas reléguées en bas.
 *
 * Route `/fiches/[slug]` et non `/destinations/[slug]` : le guide proposait
 * cette dernière pour C-04 comme pour P-04, mais un groupe de routes
 * n'ajoute pas de segment d'URL — les deux résolvaient la même adresse et le
 * build refusait. « Fiche détaillée » est le nom de l'écran dans DOC-12.
 */
export function generateStaticParams() {
  return FICHES.map((f) => ({ slug: f.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const fiche = ficheParSlug(FICHES, slug);
  if (!fiche) return { title: "Destination introuvable" };
  return { title: `${fiche.pays} — fiche détaillée`, description: fiche.resume };
}

export default async function PageFicheDetaillee({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const fiche = ficheParSlug(FICHES, slug);
  if (!fiche) notFound();

  return <FicheDetaillee fiche={fiche} />;
}
