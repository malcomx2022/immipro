import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditionContenu } from "./EditionContenu";
import { documentPourEdition } from "@/server/lecture/editorial";
import { exigerVeilleur } from "@/server/securite/page";

/**
 * B-08 — Édition d'un guide ou d'un article. J.C.
 *
 * Le corps se saisit bloc par bloc, dans les cinq formes que le rendu
 * connaît. Pas d'éditeur riche : un collage depuis un traitement de texte
 * apporterait du balisage qu'aucun de nos gabarits ne sait rendre, et le
 * jour où il faudrait le nettoyer, on nettoierait à l'aveugle.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  await exigerVeilleur(`/contenus/${id}`);
  const document = await documentPourEdition(id).catch(() => null);
  return { title: document ? document.titre : "Document introuvable" };
}

export default async function PageEditionContenu({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await exigerVeilleur(`/contenus/${id}`);
  const document = await documentPourEdition(id).catch(() => null);
  if (!document) notFound();

  return <EditionContenu document={document} />;
}
