import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Services } from "./Services";
import { offresDuDossier } from "@/server/lecture/partenaires";
import { tableauDeBord, vueDuDossier } from "@/server/lecture/dossiers";
import { exigerCandidat } from "@/server/securite/page";

/**
 * T-06 — Services partenaires. WF-13, K.A tranché le 20/09/2026.
 *
 * La page est propre à un dossier : un partenaire n'est activé qu'après
 * vérification destination par destination (RG-13.4), et la liste n'a pas
 * de sens hors de l'une d'elles. C'est la même règle que l'annuaire des
 * consultants, pour la même raison.
 *
 * Elle est **dédiée**, au sens de l'arbitrage : on y vient, elle ne vient
 * pas. C'est ce qui la distingue de la carte qu'elle remplace, laquelle
 * s'affichait dans la checklist au moment où une pièce manquait.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Services partenaires",
  description:
    "Les prestataires indépendants qui fournissent certaines pièces demandées par ton dossier.",
};

export default async function PageServices({
  searchParams,
}: {
  searchParams: Promise<{ dossier?: string }>;
}) {
  const acteur = await exigerCandidat("/services");
  const { dossier: id } = await searchParams;

  const dossiers = await tableauDeBord(acteur.id);
  const choisi = id ?? dossiers[0]?.id;
  if (!choisi) notFound();

  const vue = await vueDuDossier(choisi, acteur.id).catch(() => null);
  if (!vue) notFound();

  const { autorisation, offres } = await offresDuDossier(vue.dossier.id, acteur.id);

  return <Services dossier={vue.dossier} offres={offres} autorisation={autorisation} />;
}
