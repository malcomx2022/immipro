import type { Metadata } from "next";
import Link from "next/link";
import { SourceNote } from "@/components/ui/SourceNote";
import { fichesPubliees } from "@/server/lecture/destinations";

/**
 * P-02 — Catalogue des destinations. P.A.
 *
 * L'en-tête promettait « Destinations » sur chaque écran public depuis le
 * premier lot, et l'adresse répondait 404. C'est le troisième lien mort du
 * même genre, et le plus visible : il est le premier de la barre.
 *
 * À ne pas confondre avec P-03, « Vos destinations », qui classe les mêmes
 * fiches selon les réponses du simulateur. Ici, rien n'est classé selon
 * personne : c'est le catalogue, dans l'ordre alphabétique du pays, et
 * c'est ce qu'on veut quand on sait déjà où l'on va.
 *
 * La mention porte la vérification **la plus ancienne** des fiches
 * listées : un catalogue dont l'une des entrées date de trois mois n'est
 * pas « vérifié aujourd'hui » (INV-8).
 */
/**
 * Rendu à la demande, et non régénéré — la différence tient au segment.
 *
 * Les pages de document (`/guides/[pays]`) portent un paramètre dynamique
 * que rien n'énumère au build : Next ne peut pas les pré-rendre, et leur
 * `revalidate` suffit. Une page d'index n'a pas de paramètre : Next la
 * pré-rend au build, où il n'y a pas de base de données (J.8), et la
 * construction échoue. `force-dynamic` est donc la seule réponse honnête
 * ici, et son coût est une requête par visite sur une liste de quelques
 * lignes.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Destinations couvertes",
  description:
    "Les procédures dont ImmiPro suit les règles, avec le coût de la première année et ce qu'il faut prouver.",
};

export default async function PageDestinations() {
  const { fiches, mention } = await fichesPubliees();
  const triees = [...fiches].sort((a, b) => a.pays.localeCompare(b.pays, "fr"));

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-4 py-6 md:py-10">
      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-pretty text-32 font-semibold text-ink-900 outline-none md:text-44"
        >
          Destinations couvertes
        </h1>
        <p className="text-pretty text-16 text-ink-700">
          Les procédures dont nous suivons les règles. Chacune dit ce qu&apos;il
          faut prouver, et d&apos;où vient l&apos;information.
        </p>
      </div>

      {triees.length === 0 ? (
        <p className="text-pretty rounded-lg bg-ink-100 p-5 text-16 text-ink-700">
          Aucune destination n&apos;est publiée pour l&apos;instant.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {triees.map((fiche) => (
            <li key={fiche.slug}>
              <Link
                href={`/destinations/${fiche.slug}`}
                className="flex flex-col gap-2 rounded-lg border border-ink-300 p-5 hover:bg-ink-100"
              >
                <span className="flex flex-wrap items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 flex-none items-center justify-center rounded-sm bg-ink-100 font-mono text-13 text-ink-700"
                  >
                    {fiche.code}
                  </span>
                  {/* Le pays et l'intitulé, jamais le pays seul : deux
                      procédures du même pays donneraient deux cartes
                      indistinguables (défaut déjà corrigé sur l'accueil). */}
                  <span className="text-19 font-semibold text-accent-600">{fiche.pays}</span>
                  <span className="text-pretty text-14 text-ink-700">{fiche.intitule}</span>
                </span>
                <span className="text-pretty text-14 text-ink-700">{fiche.resume}</span>
                <span className="text-13 text-ink-500">
                  {fiche.piecesAReunir} pièces à réunir
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {mention ? (
        <SourceNote source={mention.source} verifieeLe={mention.verifieeLe}>
          ImmiPro compare des exigences publiées. La décision appartient à
          l&apos;administration du pays de destination.
        </SourceNote>
      ) : null}
    </div>
  );
}
