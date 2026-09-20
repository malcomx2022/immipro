import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Relecture } from "./Relecture";
import { db } from "@/lib/db";
import { vueDuDossier } from "@/server/lecture/dossiers";
import { pieceARediger, remarquesDeLaVersion } from "@/server/lecture/redaction";
import { exigerCandidat } from "@/server/securite/page";

/**
 * R-04 — Analyse critique. WF-08.
 *
 * La relecture porte sur la **dernière** version, et la date affichée est
 * celle de cette version. Une relecture datée d'aujourd'hui sur un texte
 * écrit la semaine dernière ferait croire à une analyse qu'on n'a pas faite.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; type: string }>;
}): Promise<Metadata> {
  const { id, type } = await params;
  const acteur = await exigerCandidat(`/dossiers/${id}/redaction/${type}/relecture`);
  const piece = await pieceARediger(id, type, acteur.id).catch(() => null);
  if (!piece) return { title: "Pièce introuvable" };
  return {
    title: `Relecture — ${piece.libelle}`,
    description: "Les incohérences et les imprécisions relevées sur cette version.",
  };
}

export default async function PageRelecture({
  params,
}: {
  params: Promise<{ id: string; type: string }>;
}) {
  const { id, type } = await params;
  const acteur = await exigerCandidat(`/dossiers/${id}/redaction/${type}/relecture`);

  const [vue, piece] = await Promise.all([
    vueDuDossier(id, acteur.id).catch(() => null),
    pieceARediger(id, type, acteur.id).catch(() => null),
  ]);
  if (!vue || !piece) notFound();

  const derniere = await db.documentVersion.findFirst({
    where: { documentId: piece.documentId },
    orderBy: { rank: "desc" },
    select: { id: true, uploadedAt: true },
  });

  return (
    <Relecture
      dossier={vue.dossier}
      type={type}
      remarques={derniere ? await remarquesDeLaVersion(derniere.id) : []}
      relectureLe={(derniere?.uploadedAt ?? new Date()).toISOString().slice(0, 10)}
    />
  );
}
