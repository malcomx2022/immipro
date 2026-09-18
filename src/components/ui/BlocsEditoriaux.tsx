import type { Bloc } from "@/lib/contenu/editorial";

/**
 * Rendu des blocs éditoriaux de P-05 et P-07.
 *
 * Les intertitres portent un identifiant dérivé de leur texte : c'est la
 * cible des liens du sommaire, qui n'a donc pas d'ancre à maintenir à part.
 */
export const ancre = (texte: string) =>
  texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function BlocsEditoriaux({ blocs }: { blocs: readonly Bloc[] }) {
  return (
    <>
      {blocs.map((bloc, i) => {
        switch (bloc.type) {
          case "intertitre":
            return (
              <h2
                key={`${bloc.type}-${i}`}
                id={ancre(bloc.texte)}
                className="text-24 font-semibold text-ink-900"
              >
                {bloc.texte}
              </h2>
            );
          case "paragraphe":
            return (
              <p key={`${bloc.type}-${i}`} className="text-pretty text-16 text-ink-700">
                {bloc.texte}
              </p>
            );
          case "encadre":
            return (
              <div
                key={`${bloc.type}-${i}`}
                className="flex flex-col gap-2 rounded-lg bg-accent-50 p-4"
              >
                <p className="text-16 font-semibold text-accent-700">{bloc.titre}</p>
                <p className="text-pretty text-14 text-accent-700">{bloc.texte}</p>
              </div>
            );
          case "citation":
            return (
              <blockquote
                key={`${bloc.type}-${i}`}
                className="border-l-2 border-accent-500 bg-ink-100 p-5 text-pretty text-16 font-medium text-ink-900"
              >
                {bloc.texte}
              </blockquote>
            );
          case "liste":
            return (
              <ul key={`${bloc.type}-${i}`} className="flex flex-col gap-3">
                {bloc.items.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-2 h-2 w-2 flex-none rounded-full bg-accent-500"
                    />
                    <span className="text-16 text-ink-700">{item}</span>
                  </li>
                ))}
              </ul>
            );
        }
      })}
    </>
  );
}
