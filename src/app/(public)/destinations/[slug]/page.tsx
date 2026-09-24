import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LienBouton } from "@/components/ui/LienBouton";
import { SourceNote } from "@/components/ui/SourceNote";
import { LISTE_VIDE, libellePieces } from "@/domain/destinations/fiche";
import { ficheParSlugPubliee } from "@/server/lecture/destinations";

/**
 * P-04 — Fiche destination. WF-01, INV-8.
 *
 * La source officielle et la date de vérification sont en tête de fiche, pas
 * en note de bas de page : c'est la première chose à savoir d'une exigence
 * réglementaire. Les réserves disent ce que la fiche n'affirme pas.
 *
 * La page n'est plus pré-générée : la liste des fiches vient de la base, et
 * la figer au build ferait survivre une fiche dépubliée jusqu'au prochain
 * déploiement. Une minute de fraîcheur suffit, et une relecture échue la
 * retire de l'affichage dans la minute (RG-14.1).
 */
/**
 * Rendu à la demande, et non au build.
 *
 * Deux raisons, et la seconde compte autant que la première. Les fiches
 * viennent de la base : les pré-générer figerait au déploiement une liste
 * qu'une dépublication doit pouvoir vider en minutes (RG-14.1). Et surtout,
 * **le build ne doit pas exiger de base de données** — l'image Docker se
 * construit en intégration continue, où il n'y en a pas, et un build qui
 * réclame Postgres est un build qui casse le jour où on en a le plus besoin.
 *
 * Le cache a sa place, mais dans la couche de lecture, où pages et routes le
 * partagent — pas dans une pré-génération qui déplace le problème au build.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const fiche = await ficheParSlugPubliee(slug);
  if (!fiche) return { title: "Destination introuvable" };
  return {
    title: `${fiche.pays} — ${fiche.intitule}`,
    description: fiche.resume,
  };
}

export default async function PageDestination({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const fiche = await ficheParSlugPubliee(slug);
  if (!fiche) notFound();

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-4 py-6 md:flex-row md:gap-12 md:px-12 md:py-10">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <Link href="/resultats" className="text-14 font-semibold text-ink-900">
          Résultats
        </Link>

        <div className="flex items-center gap-3.5">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 flex-none items-center justify-center rounded-md bg-ink-100 font-mono text-13 text-ink-700"
          >
            {fiche.code}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1
              id="contenu"
              tabIndex={-1}
              className="text-24 font-semibold text-ink-900 outline-none md:text-32"
            >
              {fiche.pays}
            </h1>
            <p className="text-14 text-ink-500">{fiche.intitule}</p>
          </div>
        </div>

        {/* INV-8 : la source vient avant les chiffres qu'elle garantit. */}
        <div className="flex flex-col gap-2 rounded-md bg-accent-50 p-4">
          <p className="text-14 font-medium text-accent-700">
            Source officielle — {fiche.mention.autorite ?? fiche.mention.source}
          </p>
          <p className="text-13 text-accent-700">
            Vérifiée le{" "}
            {new Intl.DateTimeFormat("fr-FR").format(new Date(fiche.mention.verifieeLe))}
            {fiche.mention.relectureLe ? (
              <>
                {" · prochaine relecture le "}
                {new Intl.DateTimeFormat("fr-FR").format(
                  new Date(fiche.mention.relectureLe),
                )}
              </>
            ) : null}
          </p>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-19 font-semibold text-ink-900">Conditions principales</h2>
          {/* Un titre sans rien dessous se lit comme une page qui a échoué
              à charger. La section dit ce qu'il en est. */}
          {fiche.conditions.length === 0 ? (
            <p className="text-pretty text-16 text-ink-700">{LISTE_VIDE.conditions}</p>
          ) : null}
          <dl className="flex flex-col">
            {fiche.conditions.map((c) => (
              <div
                key={c.intitule}
                className="flex justify-between gap-4 border-b border-ink-300 py-3 text-14 last:border-b-0"
              >
                <dt className="text-ink-500">{c.intitule}</dt>
                <dd className="text-right font-medium text-ink-900">{c.valeur}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-19 font-semibold text-ink-900">Travail étudiant</h2>
          <p className="text-pretty text-16 text-ink-700">{fiche.travailEtudiant}</p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-19 font-semibold text-ink-900">Après le diplôme</h2>
          <p className="text-pretty text-16 text-ink-700">{fiche.apresDiplome}</p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-19 font-semibold text-ink-900">Réserves</h2>
          {fiche.reserves.length === 0 ? (
            <p className="text-pretty text-16 text-ink-700">{LISTE_VIDE.reserves}</p>
          ) : null}
          {fiche.reserves.map((r) => (
            <div
              key={r.texte}
              className="flex items-start gap-3 rounded-md bg-ink-100 p-3.5"
            >
              <span
                aria-hidden="true"
                className={`mt-2 h-2 w-2 flex-none rounded-full ${
                  r.ton === "attention" ? "bg-warning" : "bg-ink-500"
                }`}
              />
              <p className="text-pretty text-14 text-ink-700">{r.texte}</p>
            </div>
          ))}
        </section>

        <SourceNote {...fiche.mention}>
          ImmiPro reproduit les exigences publiées par l&apos;administration et
          n&apos;intervient pas dans la décision.
        </SourceNote>
      </div>

      <aside className="flex flex-col gap-3 rounded-lg border border-ink-300 p-5 md:w-60 md:flex-none md:self-start">
        <h2 className="text-16 font-semibold text-ink-900">Préparer ce dossier</h2>
        <p className="text-14 text-ink-700">{libellePieces(fiche.piecesAReunir)}</p>
        <LienBouton href="/inscription" pleineLargeur>
          Voir la checklist
        </LienBouton>
      </aside>
    </div>
  );
}
