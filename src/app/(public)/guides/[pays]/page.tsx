import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ancre, BlocsEditoriaux } from "@/components/ui/BlocsEditoriaux";
import { LienBouton } from "@/components/ui/LienBouton";
import { SourceNote } from "@/components/ui/SourceNote";
import { documentPublie } from "@/server/lecture/editorial";

/**
 * P-05 — Guide pays. Contenu de référencement.
 *
 * Gabarit long : sommaire en colonne fixe sur desktop, en tête de page sur
 * mobile. La mention finale rappelle que le guide informe et ne conseille
 * pas (INV-1).
 *
 * **Régénéré à la demande, pas pré-généré.** Le contenu vient du
 * back-office (B-08) et non plus d'un fichier du dépôt, or le build se fait
 * en intégration continue, sans base de données (J.8) : `generateStaticParams`
 * ne peut plus rien énumérer. La page se rend à la première demande, reste
 * en cache une heure, et la publication invalide son adresse — on garde donc
 * ce qui comptait pour le référencement, une page servie en HTML complet et
 * sans attente, sans exiger une base au moment de la construction.
 *
 * Le sommaire ne se saisit pas : il est tiré des intertitres du corps.
 */
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pays: string }>;
}): Promise<Metadata> {
  const { pays } = await params;
  const guide = await documentPublie("GUIDE", pays);
  if (!guide) return { title: "Guide introuvable" };
  return { title: guide.titre, description: guide.chapeau };
}

export default async function PageGuide({
  params,
}: {
  params: Promise<{ pays: string }>;
}) {
  const { pays } = await params;
  const guide = await documentPublie("GUIDE", pays);
  if (!guide) notFound();

  return (
    <div className="mx-auto flex w-full max-w-gabarit flex-col gap-8 px-4 py-6 md:flex-row-reverse md:gap-12 md:px-12 md:py-10">
      {/* Un guide sans intertitre n'a pas de sommaire : une colonne vide
          occuperait un quart de l'écran pour ne rien dire. */}
      {guide.sommaire.length > 0 ? (
        <nav
          aria-label="Sommaire"
          className="flex flex-col gap-2.5 rounded-lg bg-ink-100 p-4 md:w-60 md:flex-none md:self-start"
        >
          <p className="text-13 font-semibold uppercase tracking-wider text-ink-900">
            Au sommaire
          </p>
          {guide.sommaire.map((entree) => (
            <a key={entree} href={`#${ancre(entree)}`} className="text-14 text-accent-600">
              {entree}
            </a>
          ))}
        </nav>
      ) : null}

      <article className="flex min-w-0 flex-1 flex-col gap-6">
        <p className="font-mono text-13 uppercase tracking-wider text-ink-500">
          Guide · {guide.pays}
        </p>
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-pretty text-32 font-semibold text-ink-900 outline-none md:text-44"
        >
          {guide.titre}
        </h1>
        <p className="text-pretty text-16 text-ink-700">{guide.chapeau}</p>

        <BlocsEditoriaux blocs={guide.corps.blocs} />

        <section className="flex flex-col items-start gap-3 rounded-lg bg-ink-100 p-5">
          <h2 className="text-19 font-semibold text-ink-900">{guide.corps.appel.titre}</h2>
          <p className="text-14 text-ink-700">{guide.corps.appel.texte}</p>
          <LienBouton href={guide.corps.appel.href}>{guide.corps.appel.action}</LienBouton>
        </section>

        <SourceNote {...guide.mention}>
          {guide.mentionSuite}
        </SourceNote>
      </article>
    </div>
  );
}
