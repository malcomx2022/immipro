import type { Metadata } from "next";
import { OuvertureDossier } from "./OuvertureDossier";
import { fichesPubliees, ficheParSlugPubliee } from "@/server/lecture/destinations";
import { reglePubliieParSlug, payload } from "@/server/acces/regles";
import { exigerCandidat } from "@/server/securite/page";

/**
 * C-05 — Ouverture de dossier. WF-04.
 *
 * Deux informations suffisent. L'aperçu de la checklist est gratuit, et
 * l'écran dit ce qu'ouvrir un dossier n'est pas : aucune démarche auprès de
 * l'administration (INV-1).
 *
 * La destination et l'aperçu sont résolus ici, côté serveur : l'écran de
 * saisie n'a pas à connaître le référentiel, et les trois pièces montrées
 * sont les trois premières pièces obligatoires de la règle, pas une liste
 * écrite à la main qui divergerait de la checklist réellement créée.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ouvrir un dossier",
  description: "Deux informations suffisent pour générer ta checklist.",
};

export default async function PageNouveauDossier({
  searchParams,
}: {
  searchParams: Promise<{ destination?: string }>;
}) {
  await exigerCandidat("/dossiers/nouveau");
  const { destination } = await searchParams;

  const fiche =
    (destination ? await ficheParSlugPubliee(destination) : null) ??
    (await fichesPubliees()).fiches[0] ??
    null;

  if (!fiche) return <OuvertureDossier fiche={null} visaRuleId="" apercu={[]} />;

  const regle = await reglePubliieParSlug(fiche.slug);
  const apercu = regle
    ? payload(regle)
        .pieces_requises.filter((p) => p.obligatoire)
        .slice(0, 3)
        .map((p) => p.libelle)
    : [];

  return <OuvertureDossier fiche={fiche} visaRuleId={regle?.id ?? ""} apercu={apercu} />;
}
