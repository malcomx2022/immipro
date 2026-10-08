import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pieceARediger, versionsDeLaPiece } from "@/server/lecture/redaction";
import { exigerCandidat } from "@/server/securite/page";
import {
  MENTION_AIDE_A_LA_REDACTION,
  libelleVersion,
  versionCourante,
} from "@/domain/redaction/versions";

/**
 * Impression d'une pièce rédigée — WF-08 étape 6, le PDF.
 *
 * Aucune bibliothèque de génération : la page s'imprime, et c'est ainsi
 * qu'elle devient un PDF. C'est la décision de L.3 pour l'archive d'un
 * dossier, et elle vaut telle quelle ici — « Imprimer » puis « Enregistrer
 * au format PDF » rend un document plus fidèle que ce qu'un générateur
 * embarqué produirait, pour un poids nul.
 *
 * Une page à part, et non l'éditeur : l'éditeur porte un champ de saisie,
 * et un `textarea` imprimé rend une boîte grise coupée à sa hauteur
 * d'écran. Le texte s'imprime comme un texte.
 *
 * Ce qui disparaît à l'impression porte `pas-a-imprimer` : le lien de
 * retour et la consigne. La règle ne devine pas par nom de balise — c'est
 * la correction de L.3, où masquer `header` emportait l'en-tête de
 * l'archive elle-même.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; type: string }>;
}): Promise<Metadata> {
  const { id, type } = await params;
  const acteur = await exigerCandidat(`/dossiers/${id}/redaction/${type}/impression`);
  const piece = await pieceARediger(id, type, acteur.id).catch(() => null);
  return { title: piece ? `${piece.libelle} — impression` : "Pièce introuvable" };
}

export default async function PageImpression({
  params,
}: {
  params: Promise<{ id: string; type: string }>;
}) {
  const { id, type } = await params;
  const acteur = await exigerCandidat(`/dossiers/${id}/redaction/${type}/impression`);
  const piece = await pieceARediger(id, type, acteur.id).catch(() => null);
  if (!piece) notFound();

  const courante = versionCourante(await versionsDeLaPiece(piece.documentId));

  return (
    <div className="a-imprimer mx-auto flex w-full max-w-colonne flex-col gap-5 px-4 py-6 md:px-8 md:py-10">
      <Link
        href={`/dossiers/${id}/redaction/${type}`}
        className="pas-a-imprimer flex min-h-touch items-center text-14 text-accent-700 underline"
      >
        Retour à l&apos;éditeur
      </Link>

      {courante ? (
        <>
          <div className="flex flex-col gap-1">
            <h1
              id="contenu"
              tabIndex={-1}
              className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
            >
              {piece.libelle}
            </h1>
            <p className="pas-a-imprimer text-13 text-ink-500">
              {libelleVersion(courante, new Date())}
            </p>
          </div>

          <p className="pas-a-imprimer text-pretty rounded-md bg-ink-100 p-3.5 text-14 text-ink-700">
            Utilise « Imprimer » puis « Enregistrer au format PDF ». Le lien de
            retour et cette consigne ne s&apos;impriment pas.
          </p>

          {courante.paragraphes.map((paragraphe, rang) => (
            <section
              key={`${paragraphe.section}-${rang}`}
              className="flex flex-col gap-1.5"
            >
              {paragraphe.section ? (
                <h2 className="text-13 font-semibold uppercase tracking-wide text-ink-500">
                  {paragraphe.section}
                </h2>
              ) : null}
              {/* `whitespace-pre-line` : les retours à la ligne du candidat
                  sont les siens, et les recoller en un bloc changerait son
                  texte. */}
              <p className="max-w-redaction whitespace-pre-line text-pretty text-16 leading-relaxed text-ink-900">
                {paragraphe.texte}
              </p>
            </section>
          ))}

          {/* RG-08.1 — la mention s'imprime avec le texte. Un document qui
              sort de la plateforme doit dire ce qu'il est, et c'est ici
              qu'il le dit à qui n'a pas vu l'écran. */}
          <p className="max-w-redaction text-pretty border-t border-ink-300 pt-3 text-13 italic text-ink-700">
            {MENTION_AIDE_A_LA_REDACTION}
          </p>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <h1
            id="contenu"
            tabIndex={-1}
            className="text-pretty text-24 font-semibold text-ink-900 outline-none"
          >
            {piece.libelle}
          </h1>
          <p className="max-w-redaction text-pretty text-16 text-ink-700">
            Cette pièce n&apos;a pas encore de texte : il n&apos;y a rien à
            imprimer. L&apos;entretien guidé et l&apos;éditeur produisent la
            première version.
          </p>
        </div>
      )}
    </div>
  );
}
