"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { LienBouton } from "@/components/ui/LienBouton";
import { Card } from "@/components/ui/Card";
import type { Dossier } from "@/domain/dossiers/dossier";
import type { ConsultantHabilite, FiltreDelai } from "@/domain/consultants/annuaire";
import {
  MENTION_HABILITATION,
  SANS_CONSULTANT,
  annuaireVide,
  filtrerAnnuaire,
  habilitesPour,
  languesDisponibles,
  libelleDelai,
} from "@/domain/consultants/annuaire";
import { CONSULTATION, CONSULTATION_DUREE_MINUTES, deviseParDefaut } from "@/domain/payments/pricing";
import { jourEnFrancais } from "@/domain/format/moment";
import { formatMontant } from "@/lib/utils";
import { nomDestination } from "@/lib/contenu/consultants";
import { cn } from "@/lib/utils";
import { EnteteDossier } from "../dossiers/[id]/EnteteDossier";

/**
 * T-04 — Annuaire des consultants habilités. WF-12.
 *
 * L'écran sépare deux choses que le mot « habilité » réunit facilement :
 * un titre d'exercice vérifié pour une destination, et l'issue d'une
 * demande. La première est attestée, la seconde ne se promet pas (INV-1).
 *
 * Le tarif et la durée viennent de la grille, pas de la carte : c'est un
 * tarif unique ImmiPro, et trois cartes qui l'écrivent chacune finiraient
 * par en écrire trois.
 */
export interface AnnuaireProps {
  dossier: Dossier;
  consultants: readonly ConsultantHabilite[];
  /** Code de la destination du dossier. */
  destination: string;
}

export function Annuaire({ dossier, consultants, destination }: AnnuaireProps) {
  const [langue, setLangue] = useState<string | null>(null);
  const [delai, setDelai] = useState<FiltreDelai>("TOUS");

  const devise = deviseParDefaut("BJ");
  const tarif = `${formatMontant(CONSULTATION.prix[devise], devise)} · ${CONSULTATION_DUREE_MINUTES} min`;

  const vide = annuaireVide(
    consultants,
    destination,
    nomDestination(destination),
    nomDestination,
  );
  const visibles = filtrerAnnuaire(consultants, destination, langue, delai);
  const langues = languesDisponibles(consultants, destination);

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <EnteteDossier
        dossier={dossier}
        retour={`/dossiers/${dossier.id}`}
        libelleRetour="Mon dossier"
      />

      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          Consultants habilités
        </h1>
        <p className="text-14 text-ink-700">
          {dossier.destination.pays} — {dossier.destination.intitule.split("—")[0]?.trim()} ·{" "}
          {habilitesPour(consultants, destination).length} consultants · habilitation
          vérifiée par ImmiPro
        </p>
      </div>

      {vide ? (
        <section className="flex flex-col items-start gap-3 rounded-lg bg-ink-100 p-5">
          <h2 className="text-pretty text-19 font-semibold text-ink-900">{vide.titre}</h2>
          <p className="max-w-[70ch] text-pretty text-16 text-ink-700">
            {vide.explication}
          </p>
          <div className="flex flex-col gap-2 md:flex-row">
            <Button variante="secondaire">Me prévenir dès qu&apos;il y en a un</Button>
            <LienBouton href={`/dossiers/${dossier.id}`} variante="tertiaire">
              Continuer sans consultant
            </LienBouton>
          </div>
          <p className="text-pretty text-14 text-ink-700">{SANS_CONSULTANT}</p>
        </section>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer l'annuaire">
            <Puce active={langue === null && delai === "TOUS"} onClick={() => { setLangue(null); setDelai("TOUS"); }}>
              Tous
            </Puce>
            {langues.map((l) => (
              <Puce key={l} active={langue === l} onClick={() => setLangue(langue === l ? null : l)}>
                {l}
              </Puce>
            ))}
            <Puce
              active={delai === "SOUS_48H"}
              onClick={() => setDelai(delai === "SOUS_48H" ? "TOUS" : "SOUS_48H")}
            >
              Sous 48 h
            </Puce>
          </div>

          {visibles.length === 0 ? (
            <p className="rounded-lg bg-ink-100 p-4 text-pretty text-14 text-ink-700">
              Aucun consultant habilité pour {nomDestination(destination)} ne correspond à
              ce filtre. Retire-le pour voir les{" "}
              {habilitesPour(consultants, destination).length} habilités.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {visibles.map((consultant) => (
                <li key={consultant.id} className="flex">
                  <Card variante="bordure" className="w-full gap-2.5">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-16 font-semibold text-ink-900">
                        {consultant.nom}
                      </span>
                      <span className="text-14 text-ink-700">{consultant.cabinet}</span>
                    </div>

                    <dl className="flex flex-col gap-1 md:flex-row md:gap-6">
                      <Repere intitule="Habilité le" valeur={jourEnFrancais(consultant.habiliteLe)} />
                      <Repere intitule="Langues" valeur={consultant.langues.join(", ")} />
                      <Repere intitule="Réponse" valeur={libelleDelai(consultant).replace("Répond en ", "")} />
                    </dl>

                    <div className="flex flex-col gap-2 border-t border-ink-300 pt-3 md:flex-row md:items-center md:justify-between">
                      <p className="text-14 text-ink-700">
                        Consultation {tarif} · tarif unique ImmiPro
                      </p>
                      <LienBouton
                        href={`/consultants/${consultant.id}/rendez-vous?dossier=${dossier.id}`}
                        pleineLargeur
                        className="md:w-auto"
                      >
                        Voir les créneaux
                      </LienBouton>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <p className="max-w-[75ch] text-pretty text-13 text-ink-500">
        {MENTION_HABILITATION}
      </p>

      <Link
        href="/profil"
        className="flex min-h-touch items-center text-14 text-accent-700 underline"
      >
        Gérer mes consentements de partage
      </Link>
    </div>
  );
}

function Puce({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex min-h-touch items-center rounded-sm border px-3.5 text-14",
        active
          ? "border-ink-900 bg-ink-900 text-white"
          : "border-ink-300 bg-white text-ink-900 hover:bg-ink-100",
      )}
    >
      {children}
    </button>
  );
}

function Repere({ intitule, valeur }: { intitule: string; valeur: string }) {
  return (
    <div className="flex gap-1.5 md:flex-col md:gap-0">
      <dt className="text-13 text-ink-500">{intitule}</dt>
      <dd className="text-14 text-ink-900">{valeur}</dd>
    </div>
  );
}
