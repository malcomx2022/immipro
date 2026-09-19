import Link from "next/link";
import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { SourceNote } from "@/components/ui/SourceNote";
import { destinationsEnVedette } from "@/server/lecture/destinations";
import { AccueilSimulateur } from "./AccueilSimulateur";

/**
 * P-01 — Accueil. WF-01.
 *
 * L'objet central est le simulateur, pas un carrousel : variante « plein
 * écran » retenue le 13/09/2026. Rien sur cet écran n'annonce de décision,
 * et la dernière ligne dit à qui elle appartient (INV-1).
 *
 * Les destinations viennent du référentiel. L'intitulé du bloc suit la
 * donnée : « les plus demandées » n'est écrit que s'il y a assez de dossiers
 * ouverts pour que l'ordre veuille dire quelque chose. En deçà, le bloc
 * s'appelle « Destinations couvertes », ce qui est exactement vrai.
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
export const metadata: Metadata = {
  title: "Préparer son dossier d'immigration",
  description:
    "Six questions, aucun compte à créer. Trois destinations classées, avec le coût de la première année et ce qu'il faut prouver.",
};

const PROMESSES = [
  {
    titre: "Les règles, à la date d'aujourd'hui",
    texte: "Chaque fiche porte sa source officielle et sa date de vérification.",
  },
  {
    titre: "Votre dossier, pièce par pièce",
    texte:
      "Une checklist par destination, et ce qu'il faut corriger sur chaque document.",
  },
  {
    titre: "Paiement Mobile Money",
    texte: "MTN MoMo et Moov Money, en francs CFA.",
  },
];

export default async function Accueil() {
  const { destinations, intitule, mention } = await destinationsEnVedette();

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-12 px-4 py-8 md:px-12 md:py-12">
      <section className="flex flex-col gap-6 md:max-w-[640px]">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-44"
        >
          Où pouvez-vous étudier ou travailler&nbsp;?
        </h1>
        <AccueilSimulateur />
      </section>

      {destinations.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-19 font-semibold text-ink-900">{intitule}</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {destinations.map(({ fiche, cout, fenetre }) => (
              <Card key={fiche.slug} variante="bordure">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 flex-none items-center justify-center rounded-md bg-ink-100 font-mono text-13 text-ink-700"
                  >
                    {fiche.code}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <Link
                      href={`/destinations/${fiche.slug}`}
                      className="text-19 font-semibold text-ink-900"
                    >
                      {fiche.pays}
                    </Link>
                    {/* Un même pays peut publier plusieurs procédures : sans
                        l'intitulé, deux cartes portent le même titre et rien
                        ne dit laquelle ouvrir. */}
                    <span className="text-13 text-ink-500">{fiche.intitule}</span>
                  </span>
                </div>
                <p className="text-14 text-ink-700">{cout}</p>
                <p className="text-14 text-ink-500">{fenetre}</p>
              </Card>
            ))}
          </div>
          {mention ? (
            <SourceNote source={mention.source} verifieeLe={mention.verifieeLe} />
          ) : null}
        </section>
      ) : (
        /* Règle 6 de la doctrine d'erreur : dire pourquoi rien n'est affiché.
           Une fiche dont la relecture est échue disparaît (RG-14.1) ; le
           simulateur, lui, reste utilisable. */
        <section className="flex flex-col gap-2 rounded-lg bg-ink-100 p-6">
          <h2 className="text-16 font-semibold text-ink-900">
            Aucune destination n&apos;est publiée en ce moment
          </h2>
          <p className="text-pretty text-14 text-ink-700">
            Les fiches sont retirées de l&apos;affichage dès que leur date de
            relecture est dépassée : mieux vaut rien qu&apos;une exigence peut-être
            périmée. Le simulateur ci-dessus reste utilisable.
          </p>
        </section>
      )}

      <section className="grid gap-6 rounded-lg bg-ink-100 p-6 md:grid-cols-3">
        {PROMESSES.map((p) => (
          <div key={p.titre} className="flex flex-col gap-2">
            <h2 className="text-16 font-semibold text-ink-900">{p.titre}</h2>
            <p className="text-14 text-ink-700">{p.texte}</p>
          </div>
        ))}
      </section>

      <p className="text-pretty text-14 text-ink-500">
        ImmiPro prépare votre dossier. La décision appartient aux autorités du pays
        de destination.
      </p>
    </div>
  );
}
