import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Relecture } from "./Relecture";
import { db } from "@/lib/db";
import { vueDuDossier } from "@/server/lecture/dossiers";
import { faitsDuDossier, pieceARediger, remarquesDeLaVersion } from "@/server/lecture/redaction";
import { AUCUN_RECOUPEMENT, recoupements } from "@/domain/redaction/coherence";
import { exigerCandidat } from "@/server/securite/page";
import { redactionConfiguree } from "@/server/redaction/redacteur";

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

  const derniere = await db.documentVersion.findFirst({
    where: { documentId: piece.documentId },
    orderBy: { rank: "desc" },
    select: { id: true, uploadedAt: true, body: true },
  });

  /**
   * Tant que le service d'analyse n'est pas branché, aucune remarque n'a pu
   * être produite : la liste vide de la base ne veut pas dire « rien à
   * reprendre ». Le jour où il l'est, une version analysée sans remarque
   * rendra bien `[]`, et l'écran dira enfin la vérité en le disant.
   */
  const remarques =
    derniere && redactionConfiguree() ? await remarquesDeLaVersion(derniere.id) : null;

  /*
    Les recoupements déterministes ne dépendent ni du service d'analyse ni
    du quota : la règle d'architecture 2 veut que ce qui est vérifiable
    sans IA le soit sans IA. Ils tournent donc même quand la rédaction
    n'est pas branchée — c'est tout l'objet de ce lot.
  */
  const croisements = derniere?.body
    ? recoupements(derniere.body, faits)
    : AUCUN_RECOUPEMENT;

  return (
    <Relecture
      dossier={vue.dossier}
      type={type}
      remarques={remarques}
      recoupements={croisements}
      texteExistant={derniere !== null}
      relectureLe={(derniere?.uploadedAt ?? new Date()).toISOString().slice(0, 10)}
    />
  );
}
