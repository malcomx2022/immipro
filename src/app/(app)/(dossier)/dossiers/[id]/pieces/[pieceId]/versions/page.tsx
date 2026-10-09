import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { historiqueDeLaPiece, vueDuDossier } from "@/server/lecture/dossiers";
import { exigerCandidat } from "@/server/securite/page";
import { HISTORIQUE_VIDE, sortDeLaVersion } from "@/domain/dossiers/historique";
import { momentEnFrancais } from "@/domain/format/moment";
import { EnteteDossier } from "../../../EnteteDossier";

/**
 * Historique des versions d'une pièce — C-08, WF-06, S.157 (R-03).
 *
 * Le lien existait sous chaque lecture et menait à une page absente. En
 * lecture seule : la version courante est la seule qui commande la pièce
 * (RG-06.8), les autres disent ce qu'il en est advenu. Le chargement,
 * l'erreur et l'introuvable sont ceux du groupe `(dossier)`.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; pieceId: string }>;
}): Promise<Metadata> {
  const { id, pieceId } = await params;
  const acteur = await exigerCandidat(`/dossiers/${id}/pieces/${pieceId}/versions`);
  const vue = await historiqueDeLaPiece(pieceId, id, acteur.id).catch(() => null);
  if (!vue) return { title: "Pièce introuvable" };
  return {
    title: `Versions — ${vue.piece.libelle}`,
    description: "Les fichiers déposés pour cette pièce, et ce qu'il en est advenu.",
  };
}

export default async function PageVersions({
  params,
}: {
  params: Promise<{ id: string; pieceId: string }>;
}) {
  const { id, pieceId } = await params;
  const acteur = await exigerCandidat(`/dossiers/${id}/pieces/${pieceId}/versions`);
  const [vueDossier, historique] = await Promise.all([
    vueDuDossier(id, acteur.id).catch(() => null),
    historiqueDeLaPiece(pieceId, id, acteur.id).catch(() => null),
  ]);
  if (!vueDossier || !historique) notFound();
  const retour = `/dossiers/${id}/pieces/${pieceId}`;

  return (
    <div className="mx-auto flex w-full max-w-colonne flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <EnteteDossier dossier={vueDossier.dossier} retour={retour} libelleRetour={historique.piece.libelle} />

      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          Historique des versions
        </h1>
        <p className="text-pretty text-14 text-ink-700">
          {historique.piece.libelle} · seule la version la plus récente compte pour ton dossier.
        </p>
      </div>

      {historique.versions.length === 0 ? (
        <div className="flex flex-col gap-3 rounded-lg bg-ink-100 p-4">
          <p className="text-pretty text-14 text-ink-700">{HISTORIQUE_VIDE}</p>
          <Link href={retour} className="flex min-h-touch items-center text-14 text-accent-700 underline">
            Déposer un fichier
          </Link>
        </div>
      ) : (
        <ol className="flex flex-col">
          {historique.versions.map((v) => (
            <li key={v.rang} className="flex flex-col gap-1 border-t border-ink-300 py-3">
              <p className="flex flex-wrap items-baseline gap-x-2 text-14 font-medium text-ink-900">
                <span>Version {v.rang}</span>
                {v.courante ? (
                  <span className="rounded-sm bg-accent-50 px-1.5 text-13 font-medium text-accent-700">
                    Version courante
                  </span>
                ) : null}
              </p>
              <p className="text-13 text-ink-500">
                {momentEnFrancais(v.deposeeLe)} · <span className="break-all">{v.fichier}</span>
              </p>
              <p className="text-pretty text-14 text-ink-700">{sortDeLaVersion(v)}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
