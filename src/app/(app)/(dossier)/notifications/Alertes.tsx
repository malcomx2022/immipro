"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Alerte, FiltreAlerte } from "@/domain/notifications/alerte";
import {
  FILTRES,
  LIBELLE_FILTRE,
  MENTION_PORTEE,
  compterNonLues,
  filtrer,
  libelleContexte,
  titreAlerte,
  toutMarquerLu,
} from "@/domain/notifications/alerte";
import type { VersionRegle } from "@/domain/notifications/divergence";
import type { EvolutionDesPieces } from "@/domain/rules/comparaison";
import { cn } from "@/lib/utils";
import { DivergenceReglementaire } from "./DivergenceReglementaire";

/**
 * T-01 — Alertes. WF-11.
 *
 * Une alerte dit ce qui a changé, ce que ça implique pour ce dossier-ci, et
 * d'où l'information vient (INV-8). Celle qui appelle un arbitrage ouvre
 * T-02 depuis la liste : la décision se prend là où la nouvelle est lue.
 */
export interface AlertesProps {
  alertes: readonly Alerte[];
  /** Horodatage de rendu, passé par le serveur pour que « Il y a 2 heures » soit stable. */
  maintenant: string;
  /**
   * Divergence à arbitrer. Absente quand il n'y en a aucune — un écran
   * d'arbitrage permanent cesse d'être lu, et le jour où il porte un
   * changement critique, personne ne l'ouvre.
   */
  divergence?: {
    /** De quoi écrire l'arbitrage : sans eux, l'écran ne peut que se fermer. */
    dossierId: string;
    migrationId: string;
    pays: string;
    ancienne: VersionRegle;
    nouvelle: VersionRegle;
    /** Ce que la checklist gagne et perd — nommé, jamais par son code. */
    pieces?: EvolutionDesPieces;
    /** RG-14.1 — la version visée est-elle encore en vigueur ? */
    migrable?: boolean;
    depot?: string;
    detecteeLe: string;
    verifieeLe: string;
    source: string;
  };
}

export function Alertes({ alertes, maintenant, divergence }: AlertesProps) {
  const [liste, setListe] = useState<readonly Alerte[]>(alertes);
  const [filtre, setFiltre] = useState<FiltreAlerte>("TOUTES");
  const [arbitrageOuvert, setArbitrageOuvert] = useState(false);

  const date = new Date(maintenant);
  const visibles = filtrer(liste, filtre);
  const nonLues = compterNonLues(liste);

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          Alertes
        </h1>
        <Button
          variante="lien"
          disabled={nonLues === 0}
          raisonDesactivation="Toutes tes alertes sont déjà lues."
          onClick={() => setListe(toutMarquerLu(liste))}
        >
          Tout marquer lu
        </Button>
      </div>

      <p aria-live="polite" className="text-14 text-ink-700">
        {nonLues === 0
          ? "Aucune alerte non lue."
          : `${nonLues} ${nonLues > 1 ? "alertes non lues" : "alerte non lue"}.`}
      </p>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrer les alertes">
        {FILTRES.map((cle) => (
          <button
            key={cle}
            type="button"
            role="tab"
            aria-selected={filtre === cle}
            onClick={() => setFiltre(cle)}
            className={cn(
              "flex min-h-touch items-center rounded-sm border px-3.5 text-14",
              filtre === cle
                ? "border-ink-900 bg-ink-900 text-white"
                : "border-ink-300 bg-white text-ink-900",
            )}
          >
            {LIBELLE_FILTRE[cle]}
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-lg bg-ink-100 p-4 text-pretty text-14 text-ink-700">
          Aucune alerte dans cette catégorie. Les alertes réglementaires
          arrivent quand une exigence change sur l&apos;un de tes dossiers ouverts.
        </p>
      ) : (
        <ul className="flex flex-col">
          {visibles.map((alerte) => (
            <li
              key={alerte.id}
              className="flex flex-col gap-1.5 border-t border-ink-300 py-4"
            >
              <div className="flex items-start gap-2.5">
                {/* Le point ne porte jamais l'information seul : le libellé
                    « non lue » est écrit pour le lecteur d'écran. */}
                {alerte.lue ? null : (
                  <>
                    <span
                      aria-hidden="true"
                      className="mt-2 h-2 w-2 flex-none rounded-full bg-accent-500"
                    />
                    <span className="sr-only">Non lue.</span>
                  </>
                )}
                <span className="text-pretty text-16 font-medium text-ink-900">
                  {titreAlerte(alerte, maintenant.slice(0, 10))}
                </span>
              </div>
              <p className="text-pretty text-14 text-ink-700">{alerte.corps}</p>
              <p className="text-13 text-ink-500">{libelleContexte(alerte, date)}</p>
              {alerte.arbitrage && divergence ? (
                <Button
                  variante="secondaire"
                  className="mt-1 self-start"
                  onClick={() => setArbitrageOuvert(true)}
                >
                  Choisir la version à appliquer
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 border-t border-ink-300 pt-4">
        <Link
          href="/profil"
          className="flex min-h-touch items-center text-14 text-accent-700 underline"
        >
          Régler mes alertes par email
        </Link>
        <p className="text-pretty text-13 text-ink-500">{MENTION_PORTEE}</p>
      </div>

      {divergence ? (
        <DivergenceReglementaire
          ouverte={arbitrageOuvert}
          onFermer={() => setArbitrageOuvert(false)}
          {...divergence}
        />
      ) : null}
    </div>
  );
}
