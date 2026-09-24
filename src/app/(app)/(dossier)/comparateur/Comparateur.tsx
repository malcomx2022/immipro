import Link from "next/link";
import { LienBouton } from "@/components/ui/LienBouton";
import { SourceNote } from "@/components/ui/SourceNote";
import type { FicheDestination, Mention } from "@/domain/destinations/fiche";
import { CRITERES, type CleCritere } from "@/server/lecture/destinations";

/**
 * C-03 — Comparateur, présentation. WF-03.
 *
 * Un vrai tableau : `table` avec ses en-têtes de ligne et de colonne, pas une
 * grille de div. C'est ce qui permet à un lecteur d'écran d'annoncer « Coût
 * 1re année, Pays-Bas, 6 900 000 F » au lieu de trois valeurs sans lien.
 *
 * Le tableau compare des exigences publiées. Il ne classe pas, et la mention
 * le dit (INV-1).
 */
export interface ComparateurProps {
  fiches: readonly FicheDestination[];
  valeurs: Record<string, Record<CleCritere, string>>;
  mention: Mention | null;
  lectureAttentive: { titre: string; texte: string } | null;
}

export function Comparateur({
  fiches,
  valeurs,
  mention,
  lectureAttentive,
}: ComparateurProps) {
  if (fiches.length === 0) return <SansDestination />;

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          {titre(fiches.length)}
        </h1>
        <p className="text-16 text-ink-700 md:hidden">
          Fais défiler le tableau vers la droite.
        </p>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <caption className="sr-only">
            Exigences publiées de trois destinations, critère par critère
          </caption>
          <thead>
            <tr>
              <th scope="col" className="border-b border-ink-300 py-3 pr-4 text-13 font-medium text-ink-500">
                Critère
              </th>
              {fiches.map((fiche) => (
                <th
                  key={fiche.slug}
                  scope="col"
                  className="border-b border-ink-300 py-3 pr-4 text-16 font-semibold text-ink-900"
                >
                  <Link
                    href={`/fiches/${fiche.slug}`}
                    className="flex items-center gap-2"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-8 w-8 flex-none items-center justify-center rounded-sm bg-ink-100 font-mono text-13 text-ink-700"
                    >
                      {fiche.code}
                    </span>
                    {/* Un pays peut publier plusieurs procédures : sans
                        l'intitulé, deux colonnes portent le même en-tête et
                        le tableau devient illisible. */}
                    <span className="flex min-w-0 flex-col">
                      {fiche.pays}
                      <span className="text-13 font-normal text-ink-500">
                        {fiche.intitule}
                      </span>
                    </span>
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CRITERES.map((critere) => (
              <tr key={critere.cle}>
                <th
                  scope="row"
                  className="border-b border-ink-300 py-3 pr-4 align-top text-14 font-normal text-ink-500"
                >
                  {critere.intitule}
                </th>
                {fiches.map((fiche) => (
                  <td
                    key={fiche.slug}
                    className="border-b border-ink-300 py-3 pr-4 align-top text-14 text-ink-900"
                  >
                    {valeurs[fiche.slug]?.[critere.cle] ?? "Non publié"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {lectureAttentive ? (
        <section className="flex flex-col gap-2 rounded-lg bg-accent-50 p-4">
          <h2 className="text-16 font-semibold text-accent-700">{lectureAttentive.titre}</h2>
          <p className="text-pretty text-14 text-accent-700">{lectureAttentive.texte}</p>
        </section>
      ) : null}

      {mention ? (
        <SourceNote {...mention}>
          Ce tableau compare des exigences publiées, il ne prédit aucune décision.
        </SourceNote>
      ) : null}

      <div className="flex items-center gap-3 border-t border-ink-300 pt-4">
        <p className="flex-1 text-13 text-ink-500">
          {fiches.length > 1
            ? `${fiches.length} destinations comparées`
            : "1 destination comparée"}
        </p>
        <LienBouton href="/dossiers/nouveau">Ouvrir un dossier</LienBouton>
      </div>
    </div>
  );
}

/**
 * Le titre suit le nombre réel de colonnes. « Comparer trois destinations »
 * écrit en dur devenait faux dès qu'une fiche était dépubliée — et c'est
 * précisément le jour où il faut regarder le tableau de près.
 */
function titre(combien: number): string {
  if (combien === 1) return "Une seule destination est publiée";
  return `Comparer ${combien} destinations`;
}

/**
 * Règle 6 de la doctrine d'erreur : dire pourquoi rien n'est affiché. Une
 * fiche dont la relecture est échue disparaît (RG-14.1), et un tableau vide
 * sans explication se lit comme une panne.
 */
function SansDestination() {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4 px-4 py-10 md:px-8">
      <h1
        id="contenu"
        tabIndex={-1}
        className="text-24 font-semibold text-ink-900 outline-none md:text-32"
      >
        Aucune destination à comparer
      </h1>
      <p className="text-pretty text-16 text-ink-700">
        Les fiches sont retirées de l&apos;affichage dès que leur date de
        relecture est dépassée : mieux vaut rien qu&apos;une exigence peut-être
        périmée. Elles reviennent dès qu&apos;un veilleur les a reprises.
      </p>
    </div>
  );
}
