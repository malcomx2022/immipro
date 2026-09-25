import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Relecture } from "./Relecture";
import { vueDuDossier } from "@/server/lecture/dossiers";
import { faitsDuDossier, pieceARediger, vueDeLaRelecture } from "@/server/lecture/redaction";
import { exigerCandidat } from "@/server/securite/page";
import { redactionConfiguree } from "@/server/redaction/redacteur";
import { redactionAssisteeDuDossier } from "@/server/acces/droits";
import { lienDesPacks } from "@/server/acces/montee";

/**
 * R-04 — Analyse critique. WF-08.
 *
 * La relecture porte sur la **dernière** version, et la date affichée est
 * celle de cette version. Une relecture datée d'aujourd'hui sur un texte
 * écrit la semaine dernière ferait croire à une analyse qu'on n'a pas faite.
 *
 * `remarques` vaut `null` quand aucune analyse n'a tourné, et jamais `[]` :
 * la page rendait « Rien à reprendre sur cette version. » alors que rien
 * n'avait été lu. Une liste vide est un résultat, une absence de liste n'en
 * est pas un.
 *
 * Les recoupements de RG-08.3, eux, sont **calculés à la lecture** et non
 * stockés. Ils ne coûtent rien, et un écart figé en `CritiqueFinding`
 * survivrait à la correction du texte : le candidat corrigerait sa lettre
 * et lirait encore l'ancien écart.
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

  const [vue, piece, faits] = await Promise.all([
    vueDuDossier(id, acteur.id).catch(() => null),
    pieceARediger(id, type, acteur.id).catch(() => null),
    faitsDuDossier(id, acteur.id),
  ]);
  if (!vue || !piece) notFound();

  /*
    La décision — « cette version a-t-elle été relue ? » — vit dans
    `vueDeLaRelecture`, et non ici. La fumée du lot appelle cette
    fonction-là : recopier la décision dans un script aurait vérifié un
    chemin que personne n'emprunte, et une mutation l'a prouvé en
    laissant la fumée verte alors que la page redevenait fautive.
  */
  const vueRelecture = await vueDeLaRelecture(
    piece.documentId,
    faits,
    redactionConfiguree(),
    // Lu après `vueDuDossier`, qui a vérifié que le dossier est à lui.
    await redactionAssisteeDuDossier(id),
  );

  return (
    <Relecture
      dossier={vue.dossier}
      type={type}
      {...vueRelecture}
      lienDesPacks={await lienDesPacks(id, acteur.id)}
    />
  );
}
