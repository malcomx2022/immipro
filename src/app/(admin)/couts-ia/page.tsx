import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";
import { EnteteAdmin } from "@/components/admin/EnteteAdmin";
import {
  COMMENT_SE_REMPLIT,
  GARDE_FOUS,
  MENTION_ETAT_VIDE,
  MENTION_SANS_DONNEE_CANDIDAT,
  METRIQUES,
  POURQUOI_AUCUNE_VALEUR,
  aucuneMesure,
} from "@/domain/backoffice/couts";

/**
 * B-07 — Supervision des coûts IA. WF-16.
 *
 * Livré en état vide, et c'est la décision : tant que dix dossiers réels
 * n'ont pas alimenté `AiUsage`, aucune valeur n'est affichée. Un chiffre
 * posé ici serait repris comme une spécification, puis comme un budget, puis
 * comme un prix — c'est exactement ce qui est arrivé aux quotas de tokens
 * des packs, qui sont des hypothèses et que la grille tarifaire traite
 * aujourd'hui comme des données.
 *
 * Ce qui est affiché, en revanche, est vrai quel que soit le coût réel : le
 * nom de chaque métrique, sa source de calcul, et les garde-fous exprimés en
 * ratio.
 */
export const metadata: Metadata = {
  title: "Coûts IA",
  description:
    "Métriques de coût, plafonds et seuils d'alerte. Aucune valeur tant qu'aucune mesure n'existe.",
};

export default function PageCoutsIa() {
  const vide = aucuneMesure(METRIQUES);

  return (
    <div className="flex flex-col">
      <EnteteAdmin
        titre="Coûts IA"
        resume={
          vide
            ? "Aucune mesure enregistrée : l'écran attend les premières écritures dans AiUsage."
            : "Consommation et coûts de la période."
        }
        actions={
          <>
            <Button variante="secondaire">Modifier les plafonds</Button>
            <Button
              disabled={vide}
              raisonDesactivation="Aucun appel enregistré : il n'y a rien à exporter."
            >
              Exporter le détail des appels
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-5 p-6">
        <div className="grid grid-cols-4 gap-3">
          {METRIQUES.map((m) => (
            <div
              key={m.cle}
              className="flex flex-col gap-1 rounded-lg border border-ink-300 bg-white p-4"
            >
              <span className="text-13 text-ink-500">{m.libelle}</span>
              <span className="text-24 font-semibold text-ink-900">
                {m.valeur ?? "—"}
              </span>
              <span className="text-pretty text-13 text-ink-500">{m.source}</span>
            </div>
          ))}
        </div>

        <section className="flex flex-col gap-2 rounded-lg border border-ink-300 bg-white p-5">
          <h2 className="text-16 font-semibold text-ink-900">Dépense quotidienne</h2>
          <div className="flex h-32 items-center justify-center rounded-md bg-ink-100 text-14 text-ink-500">
            Aucune dépense enregistrée
          </div>
          <p className="text-pretty text-13 text-ink-500">{MENTION_ETAT_VIDE}</p>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-ink-300 bg-white p-5">
          <h2 className="text-16 font-semibold text-ink-900">Garde-fous</h2>
          <dl className="flex flex-col">
            {GARDE_FOUS.map((g) => (
              <div
                key={g.libelle}
                className="flex items-baseline justify-between gap-6 border-t border-ink-300 py-2.5"
              >
                <dt className="flex flex-col">
                  <span className="text-14 text-ink-900">{g.libelle}</span>
                  <span className="text-pretty text-13 text-ink-500">{g.consequence}</span>
                </dt>
                <dd className="whitespace-nowrap text-14 font-medium text-ink-900">
                  {g.seuil}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="flex max-w-[80ch] flex-col gap-2 rounded-lg bg-white p-5">
          <h2 className="text-16 font-semibold text-ink-900">
            Comment cet écran se remplit
          </h2>
          <p className="text-pretty text-14 text-ink-700">{COMMENT_SE_REMPLIT}</p>
          <p className="text-pretty text-14 text-ink-700">{POURQUOI_AUCUNE_VALEUR}</p>
        </section>

        <p className="text-pretty text-13 text-ink-500">{MENTION_SANS_DONNEE_CANDIDAT}</p>
      </div>
    </div>
  );
}
