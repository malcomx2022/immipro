import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlocsEditoriaux } from "@/components/ui/BlocsEditoriaux";
import { LienBouton } from "@/components/ui/LienBouton";
import { SourceNote } from "@/components/ui/SourceNote";
import { ARTICLES, articleParSlug } from "@/lib/contenu/editorial";

/**
 * P-07 — Article. Gabarit long, colonne unique de 720 px sur desktop.
 */
export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = articleParSlug(slug);
  if (!article) return { title: "Article introuvable" };
  return { title: article.titre, description: article.chapeau };
}

export default async function PageArticle({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = articleParSlug(slug);
  if (!article) notFound();

  const publieLe = new Date(article.publieLe);

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
          <time dateTime={article.publieLe} className="text-13 text-ink-500">
            {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(publieLe)}
          </time>
        </span>
      </div>

      <p className="text-pretty text-19 text-ink-900">{article.chapeau}</p>

      <BlocsEditoriaux blocs={article.blocs} />

      <section className="flex flex-col items-start gap-3 rounded-lg bg-ink-100 p-5">
        <h2 className="text-19 font-semibold text-ink-900">{article.appel.titre}</h2>
        <p className="text-14 text-ink-700">{article.appel.texte}</p>
        <LienBouton href={article.appel.href}>{article.appel.action}</LienBouton>
      </section>

      <SourceNote source={article.mention.source} verifieeLe={article.mention.verifieeLe}>
        {article.mentionSuite}
      </SourceNote>
    </article>
  );
}
