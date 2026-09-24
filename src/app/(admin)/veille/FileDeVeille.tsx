"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import { Button } from "@/components/ui/Button";
import { LienBouton } from "@/components/ui/LienBouton";
import { EnteteAdmin } from "@/components/admin/EnteteAdmin";
import { Filtres } from "@/components/admin/Filtres";
import { ListeSelectionnable } from "@/components/admin/ListeSelectionnable";
import {
  FILTRES_VEILLE,
  LIBELLE_FILTRE_VEILLE,
  LIBELLE_STATUT_FICHE,
  MENTION_DEPUBLICATION_A_LECHEANCE,
  MENTION_FILE_VIDE,
  MENTION_SOURCE_MUETTE_SANS_EFFET,
  SANS_INDEX_DES_REGLES,
  enRetard,
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
  /**
   * État de la dernière collecte. Nul tant qu'aucune n'a eu lieu : afficher
   * « 14 sources sur 14 » sans avoir relevé personne serait un compte
   * inventé, et c'est précisément le chiffre auquel un veilleur se fie.
   */
  collecte: Collecte | null;
  /** Date de rendu, ISO court : les retards se comptent depuis aujourd'hui. */
  aujourdhui: string;
}

export function FileDeVeille({ fiches, collecte, aujourdhui }: FileDeVeilleProps) {
  const router = useRouter();
  const [filtre, setFiltre] = useState<FiltreVeille>("EN_RETARD");
  const [recherche, setRecherche] = useState("");
  const [selection, setSelection] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);

  /**
   * WF-14 étape 2, branche « inchangé ». Une fiche relue et trouvée
   * identique restait en retard tant que ce bouton n'écrivait rien, et le
   * cron de trois heures finissait par la dépublier : le travail était
   * fait, et le produit se comportait comme s'il ne l'avait pas été.
   */
  async function relire(id: string) {
    setEnvoi(true);
    setEchec(null);
    const resultat = await appeler<{ prochaineLe: string; republiee: boolean }>(
      "/api/admin/veille",
      { methode: "PUT", corps: { id } },
    );
    setEnvoi(false);
    if (!resultat.ok) {
      setEchec(resultat.echec);
      return;
    }
    router.refresh();
  }

  const visibles = filtrerVeille(fiches, filtre, recherche, aujourdhui);
  const retenue = visibles.find((f) => f.id === selection) ?? visibles[0];
  const incident = collecte ? messageSourceInjoignable(collecte, moment) : null;

  return (
    <div className="flex flex-col">
      <EnteteAdmin
        titre="Veille réglementaire"
        resume={resumeVeille(fiches, aujourdhui)}
      />

      <div className="flex flex-col gap-4 p-6">
        <p className="text-13 text-ink-500">
          {collecte
            ? resumeCollecte(collecte, moment)
            : "Aucune collecte enregistrée : le relevé automatique des sources n'a pas encore tourné."}
        </p>

        {incident ? (
          <section className="flex flex-col items-start gap-2 rounded-lg border-l-6 border-warning bg-white p-4 shadow-e2">
            <h2 className="text-16 font-semibold text-ink-900">
              {collecte?.injoignable?.source} n&apos;a pas répondu
            </h2>
            <p className="max-w-[80ch] text-pretty text-14 text-ink-700">{incident}</p>
            <p className="max-w-[80ch] text-pretty text-13 text-ink-500">
              {MENTION_SOURCE_MUETTE_SANS_EFFET}
            </p>
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
              vide={collecte ? <FileVide collecte={collecte} /> : <SansCollecte />}
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
                {echec ? <BlocEchec echec={echec} annonce /> : null}
                <Button
                  variante="secondaire"
                  pleineLargeur
                  disabled={envoi}
                  raisonDesactivation="Enregistrement en cours."
                  onClick={() => relire(retenue.id)}
                >
                  {envoi ? "Enregistrement…" : "Marquer comme relue sans changement"}
                </Button>
                <p className="text-pretty text-13 text-ink-500">
                  {enRetard(retenue, aujourdhui)
                    ? "La fiche repart pour 90 jours et redevient publiée : le retrait ne disait que « personne n'a relu »."
                    : "La fiche repart pour 90 jours. Aucune version n'est créée."}
                </p>
              </div>

              <p className="text-pretty text-13 text-ink-500">{MENTION_VERSIONNEMENT}</p>
            </aside>
          ) : null}
        </div>

        <p className="text-pretty text-13 text-ink-500">
          {MENTION_DEPUBLICATION_A_LECHEANCE}
        </p>
        {collecte && collecteComplete(collecte) && visibles.length === 0 ? (
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
      {/* Aucun lien : le back-office n'a pas d'index des règles, et l'état
          vide est le seul écran où le veilleur n'a rien d'autre à cliquer.
          Il dit donc par où une fiche revient, plutôt que d'offrir une
          porte qui répond 404. */}
      <p className="max-w-[70ch] text-pretty text-13 text-ink-500">
        {SANS_INDEX_DES_REGLES}
      </p>
    </div>
  );
}

/**
 * Rien n'a encore été relevé. L'écran le dit plutôt que de laisser croire à
 * une file vide parce que tout est à jour : les deux se ressemblent, et ils
 * n'appellent pas la même action.
 */
function SansCollecte() {
  return (
    <div className="flex flex-col gap-2 rounded-md bg-ink-100 p-5">
      <p className="text-16 font-semibold text-ink-900">Aucune fiche à relire</p>
      <p className="text-pretty text-14 text-ink-700">
        Aucune collecte n&apos;a encore été enregistrée. Une file vide parce que
        tout est à jour et une file vide parce que rien n&apos;a été relevé ne
        demandent pas la même chose.
      </p>
    </div>
  );
}
