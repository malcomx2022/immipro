import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Annuaire } from "./Annuaire";
import { annuaire } from "@/server/lecture/consultants";
import { tableauDeBord, vueDuDossier } from "@/server/lecture/dossiers";
import { exigerCandidat } from "@/server/securite/page";

/**
 * T-04 — Annuaire des consultants habilités. WF-12, pack Accompagné.
 *
 * L'annuaire est propre à un dossier : l'habilitation se vérifie destination
 * par destination (RG-12.1), et la liste n'a pas de sens hors de l'une
 * d'elles. Sans dossier ouvert, il n'y a rien à afficher — et l'écran le dit
 * plutôt que de lister des consultants sans rapport.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Consultants habilités",
  description:
    "Les consultants dont le titre d'exercice a été vérifié pour cette destination.",
};

export default async function PageConsultants({
  searchParams,
}: {
  searchParams: Promise<{ dossier?: string }>;
}) {
  const acteur = await exigerCandidat("/consultants");
  const { dossier: id } = await searchParams;

  const dossiers = await tableauDeBord(acteur.id);
  const choisi = id ?? dossiers[0]?.id;
  if (!choisi) notFound();

  const vue = await vueDuDossier(choisi, acteur.id).catch(() => null);
  if (!vue) notFound();

  return (
    <Annuaire
      dossier={vue.dossier}
      consultants={await annuaire(vue.dossier.destination.code)}
      destination={vue.dossier.destination.code}
    />
  );
}
