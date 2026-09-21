"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { SourceNote } from "@/components/ui/SourceNote";
import type { Arbitrage, VersionRegle } from "@/domain/notifications/divergence";
import {
  MENTION_HISTORIQUE,
  MENTION_SANS_ACCORD,
  ecartMontant,
  libelleImpact,
  mentionArbitrage,
  optionsArbitrage,
} from "@/domain/notifications/divergence";
import { formatMontant } from "@/lib/utils";

/**
 * T-02 — Divergence réglementaire. WF-11, INV-3.
 *
 * Un écran d'arbitrage, pas une notification : l'application ne tranche pas
 * seule. Migrer d'office trahirait INV-3, qui fige la version de règle d'un
 * dossier ; se taire trahirait INV-8. Les deux versions sont donc posées
 * côte à côte, avec ce qui les sépare et ce que le choix change.
 *
 * Aucune option n'est présélectionnée : un arbitrage pré-coché n'est pas un
 * arbitrage.
 */
export interface DivergenceProps {
  ouverte: boolean;
  onFermer: () => void;
  pays: string;
  ancienne: VersionRegle;
  nouvelle: VersionRegle;
  /**
   * Date de **dépôt** du dossier concerné — la cible moins le délai
   * d'instruction —, si elle est fixée. C'est elle qui décide de la
   * version applicable, pas la date de départ.
   */
  depot?: string;
  detecteeLe: string;
  verifieeLe: string;
  source: string;
}

export function DivergenceReglementaire({
  ouverte,
  onFermer,
  pays,
  ancienne,
  nouvelle,
  depot,
  detecteeLe,
  verifieeLe,
  source,
}: DivergenceProps) {
  const [choix, setChoix] = useState<Arbitrage | null>(null);

  const montant = (v: VersionRegle) => formatMontant(v.montant, v.devise);
  const options = optionsArbitrage(ancienne, nouvelle, montant(ancienne), montant(nouvelle));
  const retenue = options.find((o) => o.cle === choix);

  return (
    <BottomSheet
      ouverte={ouverte}
      onFermer={onFermer}
      ancrage="adaptatif"
      titre={`Une exigence a changé pour l'${pays}`}
    >
      <p className="text-pretty text-14 text-ink-700">
        Tu décides si ton dossier suit la nouvelle règle ou reste sur
        l&apos;ancienne. {MENTION_SANS_ACCORD}
      </p>

      <div className="flex flex-col gap-2 md:flex-row">
        <CarteVersion version={ancienne} statut="En vigueur dans ton dossier" />
        <CarteVersion version={nouvelle} statut="Nouvelle" />
      </div>

      <section className="flex flex-col gap-1.5 rounded-md bg-ink-100 p-3.5">
        <h3 className="text-14 font-semibold text-ink-900">
          Ce que ça change pour ton dossier
        </h3>
        <p className="text-pretty text-14 text-ink-700">
          {libelleImpact(
            ancienne,
            nouvelle,
            formatMontant(ecartMontant(ancienne, nouvelle), nouvelle.devise),
            depot,
          )}
        </p>
      </section>

      <RadioGroup
        libelle="Ton arbitrage"
        options={options.map((o) => ({
          valeur: o.cle,
          libelle: o.titre,
          description: o.detail,
        }))}
        valeur={choix}
        onChangement={(v) => setChoix(v as Arbitrage)}
      />

      <SourceNote source={source} verifieeLe={verifieeLe}>
        Changement détecté le{" "}
        {new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC" }).format(
          new Date(`${detecteeLe}T00:00:00Z`),
        )}
        . {MENTION_HISTORIQUE}
      </SourceNote>

      <div className="flex flex-col gap-2 border-t border-ink-300 pt-3">
        <Button
          pleineLargeur
          className="min-h-action"
          disabled={!retenue}
          raisonDesactivation="Choisis d'abord la version à appliquer : nous ne modifions rien sans ton accord."
          onClick={onFermer}
        >
          {retenue ? retenue.titre : "Appliquer mon choix"}
        </Button>
        {choix ? (
          <p aria-live="polite" className="text-center text-13 text-ink-500">
            {mentionArbitrage(choix, pays)}
          </p>
        ) : null}
      </div>
    </BottomSheet>
  );
}

function CarteVersion({ version, statut }: { version: VersionRegle; statut: string }) {
  const FORMAT = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC" });
  const jour = (iso: string) => FORMAT.format(new Date(`${iso}T00:00:00Z`));

  return (
    <div className="flex flex-1 flex-col gap-1 rounded-md border border-ink-300 p-3.5">
      <span className="text-13 font-medium uppercase tracking-wide text-ink-500">
        Version {version.numero} · {statut}
      </span>
      <span className="text-24 font-semibold text-ink-900">
        {formatMontant(version.montant, version.devise)}
      </span>
      <span className="text-14 text-ink-700">{version.intitule}</span>
      <span className="text-pretty text-13 text-ink-500">
        Publiée le {jour(version.publieeLe)}
        {version.applicableJusquau
          ? ` · applicable aux dépôts jusqu'au ${jour(version.applicableJusquau)}`
          : ""}
        {version.applicableDepuis
          ? ` · applicable aux dépôts à partir du ${jour(version.applicableDepuis)}`
          : ""}
      </span>
    </div>
  );
}
