import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlocsEditoriaux } from "@/components/ui/BlocsEditoriaux";
import { LienBouton } from "@/components/ui/LienBouton";
import { SourceNote } from "@/components/ui/SourceNote";
import { documentPublie } from "@/server/lecture/editorial";

/**
 * P-07 — Article. Contenu de référencement.
 *
 * Même régime que le guide pays : régénéré à la demande depuis le
 * back-office (B-08), en cache une heure, et invalidé à la publication. Le
 * build n'exige aucune base de données (J.8).
 *
 * La durée de lecture ne se saisit pas : elle se compte. Annoncer « 6 min »
 * sur un texte rallongé depuis est un petit mensonge que personne ne
 * corrige.
 */
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await documentPublie("ARTICLE", slug);
  if (!article) return { title: "Article introuvable" };
  return { title: article.titre, description: article.chapeau };
}

export default async function PageArticle({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await documentPublie("ARTICLE", slug);
  if (!article) notFound();

  return (
    <article className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-6 md:py-10">
      <p className="font-mono text-13 uppercase tracking-wider text-ink-500">
        {article.rubrique} · {article.dureeLecture}
      </p>
      <h1
        id="contenu"
        tabIndex={-1}
        className="text-pretty text-32 font-semibold text-ink-900 outline-none md:text-44"
      >
        {article.titre}
      </h1>

      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="h-9 w-9 flex-none rounded-full bg-ink-100" />
        <span className="flex flex-col">
          <span className="text-14 font-medium text-ink-900">{article.auteur}</span>
          {article.publieLe ? (
            <time dateTime={article.publieLe} className="text-13 text-ink-500">
              {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(
                new Date(`${article.publieLe}T00:00:00Z`),
              )}
            </time>
          ) : null}
        </span>
      </div>

      <p className="text-pretty text-19 text-ink-900">{article.chapeau}</p>

      <BlocsEditoriaux blocs={article.corps.blocs} />

      <section className="flex flex-col items-start gap-3 rounded-lg bg-ink-100 p-5">
        <h2 className="text-19 font-semibold text-ink-900">{article.corps.appel.titre}</h2>
        <p className="text-14 text-ink-700">{article.corps.appel.texte}</p>
        <LienBouton href={article.corps.appel.href}>{article.corps.appel.action}</LienBouton>
      </section>

      <SourceNote {...article.mention}>
        {article.mentionSuite}
      </SourceNote>
    </article>
  );
}
