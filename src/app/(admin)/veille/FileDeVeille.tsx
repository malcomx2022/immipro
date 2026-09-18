"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { LienBouton } from "@/components/ui/LienBouton";
import { EnteteAdmin } from "@/components/admin/EnteteAdmin";
import { Filtres } from "@/components/admin/Filtres";
import { ListeSelectionnable } from "@/components/admin/ListeSelectionnable";
import {
  FILTRES_VEILLE,
  LIBELLE_FILTRE_VEILLE,
  LIBELLE_STATUT_FICHE,
  MENTION_FILE_VIDE,
  MENTION_SANS_DEPUBLICATION,
  collecteComplete,
  filtrerVeille,
  libelleRelecture,
  messageSourceInjoignable,
  resumeCollecte,
  resumeVeille,
  type Collecte,
  type FicheSuivie,
  type FiltreVeille,
} from "@/domain/backoffice/veille";
import {
  LIBELLE_NIVEAU,
  MENTION_VERSIONNEMENT,
  visiblePourLeCandidat,
} from "@/domain/backoffice/regle";
import { jourEnFrancais } from "@/domain/format/moment";
import { cn } from "@/lib/utils";

/**
 * B-01 — File de veille réglementaire. WF-14.
 *
 * Trois choses que cet écran refuse de faire seul : dépublier une règle
 * quand sa source est muette, présenter une file vide comme une panne, et
 * faire disparaître la ligne d'une source injoignable. Les trois reviennent
 * à la même discipline : l'absence de réponse d'un tiers n'est pas une
 * information sur la règle (RG-14.3).
 */
const FORMAT_MOMENT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});
const moment = (iso: string) =>
  `le ${FORMAT_MOMENT.format(new Date(iso)).replace(" ", " à ").replace(":", " h ")}`;

/**
 * Date courte dans le tableau : « 9 septembre 2026 » y passe sur deux lignes
 * et fait respirer une ligne sur deux pour rien. Le format long reste dans
 * le panneau de droite, où il y a la place.
 */
const FORMAT_COURT = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC" });
const jourCourt = (iso: string) => FORMAT_COURT.format(new Date(`${iso}T00:00:00Z`));

export interface FileDeVeilleProps {
  fiches: readonly FicheSuivie[];
  collecte: Collecte;
  /** Date de rendu, ISO court : les retards se comptent depuis aujourd'hui. */
  aujourdhui: string;
}

export function FileDeVeille({ fiches, collecte, aujourdhui }: FileDeVeilleProps) {
  const [filtre, setFiltre] = useState<FiltreVeille>("EN_RETARD");
  const [recherche, setRecherche] = useState("");
  const [selection, setSelection] = useState<string | null>(null);

  const visibles = filtrerVeille(fiches, filtre, recherche, aujourdhui);
  const retenue = visibles.find((f) => f.id === selection) ?? visibles[0];
  const incident = messageSourceInjoignable(collecte, moment);

  return (
    <div className="flex flex-col">
      <EnteteAdmin
        titre="Veille réglementaire"
        resume={resumeVeille(fiches, aujourdhui)}
        actions={
          <>
            <Button variante="secondaire">Journal des collectes</Button>
            <Button>Nouvelle fiche</Button>
          </>
        }
      />

      <div className="flex flex-col gap-4 p-6">
        <p className="text-13 text-ink-500">{resumeCollecte(collecte, moment)}</p>

        {incident ? (
          <section className="flex flex-col items-start gap-2 rounded-lg border-l-6 border-warning bg-white p-4 shadow-e2">
            <h2 className="text-16 font-semibold text-ink-900">
              {collecte.injoignable?.source} n&apos;a pas répondu
            </h2>
            <p className="max-w-[80ch] text-pretty text-14 text-ink-700">{incident}</p>
            <div className="flex gap-2">
              <Button variante="secondaire">
                Relever {collecte.injoignable?.source}
              </Button>
              <Button variante="tertiaire">Déclarer un incident</Button>
            </div>
          </section>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Filtres
            libelle="Filtrer la file de veille"
            valeurs={FILTRES_VEILLE}
            libelles={LIBELLE_FILTRE_VEILLE}
            actif={filtre}
            onChangement={setFiltre}
            compteur={`${visibles.length} sur ${fiches.length}`}
          />
          <label className="flex items-center gap-2 text-14 text-ink-700">
            <span>Rechercher</span>
            <input
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              className="h-10 w-[220px] rounded-md border border-ink-300 bg-white px-3 text-14 text-ink-900"
            />
          </label>
        </div>

        <div className="flex gap-4">
          <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-ink-300 bg-white">
            <ListeSelectionnable
              libelle="Fiches suivies, triées par échéance de relecture"
              elements={visibles}
              cle={(f) => f.id}
              selection={retenue?.id ?? null}
              onSelection={setSelection}
              entete={
                <div className="grid grid-cols-[2.5rem_1fr_10rem_6rem_8rem_7rem] gap-3 bg-ink-100 px-3 py-2 text-13 font-medium text-ink-700">
                  <span>Pays</span>
                  <span>Procédure</span>
                  <span>Niveau de source</span>
                  <span>Vérifiée le</span>
                  <span>Relecture</span>
                  <span>Statut</span>
                </div>
              }
              vide={<FileVide collecte={collecte} />}
              rendu={(fiche) => (
                <div className="grid grid-cols-[2.5rem_1fr_10rem_6rem_8rem_7rem] items-center gap-3">
                  <span className="font-mono text-13 text-ink-700">{fiche.code}</span>
                  <span className="truncate text-ink-900">{fiche.procedure}</span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-ink-700">
                      {LIBELLE_NIVEAU[fiche.niveauSource]}
                    </span>
                    {visiblePourLeCandidat(fiche.niveauSource) ? null : (
                      <span className="text-13 text-ink-500">jamais affiché (INV-4)</span>
                    )}
                  </span>
                  <span className="whitespace-nowrap text-ink-700">
                    {jourCourt(fiche.verifieeLe)}
                  </span>
                  <span
                    className={cn(
                      "whitespace-nowrap",
                      libelleRelecture(fiche, aujourdhui).startsWith("En retard")
                        ? "text-danger"
                        : "text-ink-700",
                    )}
                  >
                    {libelleRelecture(fiche, aujourdhui)}
                  </span>
                  <span className="whitespace-nowrap text-13 text-ink-700">
                    v{fiche.version} · {LIBELLE_STATUT_FICHE[fiche.statut]}
                  </span>
                </div>
              )}
            />
          </div>

          {retenue ? (
            <aside className="flex w-[340px] flex-none flex-col gap-3 rounded-lg border border-ink-300 bg-white p-4">
              <h2 className="text-13 font-medium uppercase tracking-wide text-ink-500">
                Comparaison N / N+1
              </h2>
              <p className="text-16 font-semibold text-ink-900">
                {retenue.pays} — {retenue.procedure}
              </p>
              <p className="text-13 text-ink-500">
                Source {retenue.source} · vérifiée {jourEnFrancais(retenue.verifieeLe)}
              </p>

              {retenue.ecart ? (
                <p className="rounded-md bg-warning/10 p-3 text-pretty text-14 text-ink-900">
                  {retenue.ecart}
                </p>
              ) : (
                <p className="rounded-md bg-ink-100 p-3 text-14 text-ink-700">
                  Aucun écart constaté à la dernière collecte.
                </p>
              )}

              <div className="mt-1 flex flex-col gap-2">
                <LienBouton href={`/regles/${retenue.id}`} pleineLargeur>
                  Ouvrir en édition
                </LienBouton>
                <Button variante="secondaire" pleineLargeur>
                  Marquer comme relue sans changement
                </Button>
              </div>

              <p className="text-pretty text-13 text-ink-500">{MENTION_VERSIONNEMENT}</p>
            </aside>
          ) : null}
        </div>

        <p className="text-pretty text-13 text-ink-500">{MENTION_SANS_DEPUBLICATION}</p>
        {collecteComplete(collecte) && visibles.length === 0 ? (
          <p className="text-pretty text-13 text-ink-500">{MENTION_FILE_VIDE}</p>
        ) : null}
      </div>
    </div>
  );
}

function FileVide({ collecte }: { collecte: Collecte }) {
  return (
    <div className="flex flex-col items-start gap-2 p-6">
      <h2 className="text-19 font-semibold text-ink-900">Aucun écart à arbitrer</h2>
      <p className="max-w-[70ch] text-pretty text-14 text-ink-700">
        Les {collecte.sources} sources ont répondu {moment(collecte.faiteLe)} et aucune ne
        diverge des règles publiées. La prochaine collecte est programmée{" "}
        {moment(collecte.prochaineLe)}.
      </p>
      <div className="flex gap-2 pt-1">
        <Link
          href="/regles/nl-etudes"
          className="flex min-h-touch items-center text-14 text-accent-700 underline"
        >
          Voir les règles publiées
        </Link>
      </div>
    </div>
  );
}
