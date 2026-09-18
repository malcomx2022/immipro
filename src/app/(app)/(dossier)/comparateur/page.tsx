import Link from "next/link";
import type { Metadata } from "next";
import { LienBouton } from "@/components/ui/LienBouton";
import { SourceNote } from "@/components/ui/SourceNote";
import {
  CLASSEMENT,
  COMPARAISON,
  CRITERES_COMPARATEUR,
  FICHES,
  LECTURE_ATTENTIVE,
} from "@/lib/contenu/destinations";

/**
 * C-03 — Comparateur. WF-03.
 *
 * Un vrai tableau : `table` avec ses en-têtes de ligne et de colonne, pas une
 * grille de div. C'est ce qui permet à un lecteur d'écran d'annoncer « Coût
 * 1re année, Pays-Bas, 6 900 000 F » au lieu de trois valeurs sans lien.
 *
 * Le tableau compare des exigences publiées. Il ne classe pas, et la mention
 * le dit (INV-1).
 */
export const metadata: Metadata = {
  title: "Comparer les destinations",
  description: "Les exigences publiées de trois destinations, critère par critère.",
};

export default function PageComparateur() {
  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          Comparer trois destinations
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
              {FICHES.map((fiche) => (
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
                    {fiche.pays}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CRITERES_COMPARATEUR.map((critere) => (
              <tr key={critere.cle}>
                <th
                  scope="row"
                  className="border-b border-ink-300 py-3 pr-4 align-top text-14 font-normal text-ink-500"
                >
                  {critere.intitule}
                </th>
                {FICHES.map((fiche) => (
                  <td
                    key={fiche.slug}
                    className="border-b border-ink-300 py-3 pr-4 align-top text-14 text-ink-900"
                  >
                    {COMPARAISON[fiche.slug]?.[critere.cle] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="flex flex-col gap-2 rounded-lg bg-accent-50 p-4">
        <h2 className="text-16 font-semibold text-accent-700">
          {LECTURE_ATTENTIVE.titre}
        </h2>
        <p className="text-pretty text-14 text-accent-700">{LECTURE_ATTENTIVE.texte}</p>
      </section>

      <SourceNote
        source={CLASSEMENT.mention.source}
        verifieeLe={CLASSEMENT.mention.verifieeLe}
      >
        Ce tableau compare des exigences publiées, il ne prédit aucune décision.
      </SourceNote>

      <div className="flex items-center gap-3 border-t border-ink-300 pt-4">
        <p className="flex-1 text-13 text-ink-500">
          {FICHES.length} destinations comparées
        </p>
        <LienBouton href="/dossiers/nouveau">Ouvrir un dossier</LienBouton>
      </div>
    </div>
  );
}
