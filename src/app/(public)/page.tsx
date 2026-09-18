import Link from "next/link";
import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { SourceNote } from "@/components/ui/SourceNote";
import { LES_PLUS_DEMANDEES, MENTION_ACCUEIL } from "@/lib/contenu/destinations";
import { AccueilSimulateur } from "./AccueilSimulateur";

/**
 * P-01 — Accueil. WF-01.
 *
 * L'objet central est le simulateur, pas un carrousel : variante « plein
 * écran » retenue le 13/09/2026. Rien sur cet écran n'annonce de décision,
 * et la dernière ligne dit à qui elle appartient (INV-1).
 */
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

export default function Accueil() {
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

      <section className="flex flex-col gap-4">
        <h2 className="text-19 font-semibold text-ink-900">
          Destinations les plus demandées
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {LES_PLUS_DEMANDEES.map(({ fiche, cout, fenetre }) => (
            <Card key={fiche.slug} variante="bordure">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 flex-none items-center justify-center rounded-md bg-ink-100 font-mono text-13 text-ink-700"
                >
                  {fiche.code}
                </span>
                <Link
                  href={`/destinations/${fiche.slug}`}
                  className="text-19 font-semibold text-ink-900"
                >
                  {fiche.pays}
                </Link>
              </div>
              <p className="text-14 text-ink-700">{cout}</p>
              <p className="text-14 text-ink-500">{fenetre}</p>
            </Card>
          ))}
        </div>
        <SourceNote
          source={MENTION_ACCUEIL.source}
          verifieeLe={MENTION_ACCUEIL.verifieeLe}
        />
      </section>

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
