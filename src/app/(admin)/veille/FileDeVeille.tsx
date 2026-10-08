"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import { Button } from "@/components/ui/Button";
import { CHAMP_CONTROLE, Champ } from "@/components/ui/champ";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { LienBouton } from "@/components/ui/LienBouton";
import { EnteteAdmin } from "@/components/admin/EnteteAdmin";
import { Filtres } from "@/components/admin/Filtres";
import { ListeSelectionnable } from "@/components/admin/ListeSelectionnable";
import {
  FILTRES_VEILLE,
  LIBELLE_FILTRE_VEILLE,
  LIBELLE_STATUT_FICHE,
  MENTION_DEPUBLICATION_A_LECHEANCE,
  AUCUN_RELEVE,
  LIBELLE_ETAT_SOURCE,
  MENTION_FILE_VIDE,
  SUITE_DE_LA_CONCLUSION,
  MENTION_SOURCE_MUETTE_SANS_EFFET,
  SANS_INDEX_DES_REGLES,
  enRetard,
  collecteComplete,
  filtrerVeille,
  libelleRelecture,
  messageSourceInjoignable,
  resumeCollecte,
  resumeFileVide,
  resumeVeille,
  type Collecte,
  type EtatSource,
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
import { FUSEAU_AFFICHAGE } from "@/domain/format/fuseau";

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
  timeZone: FUSEAU_AFFICHAGE,
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
  const [conclusion, setConclusion] = useState<EtatSource>("A_JOUR");
  const [note, setNote] = useState("");
  const idNote = useId();

  /**
   * WF-14 étape 2 — les trois conclusions du veilleur.
   *
   * « Inchangé » était la seule offerte, et c'est l'issue la plus
   * fréquente : une fiche relue et trouvée identique restait en retard
   * tant que ce bouton n'écrivait rien, et le cron de trois heures
   * finissait par la dépublier.
   *
   * Les deux autres n'écrivaient nulle part. « J'ai vu un écart » se
   * perdait jusqu'à ce qu'une version soit rédigée, et « la source n'a pas
   * répondu » ne se disait à personne — alors que l'écran lit `SourceCheck`
   * pour afficher l'un et l'autre, et que seule la graine de démonstration
   * en écrivait.
   */
  async function relire(id: string, conclusion: EtatSource, note?: string) {
    setEnvoi(true);
    setEchec(null);
    const resultat = await appeler<{ conclusion: EtatSource; republiee: boolean }>(
      "/api/admin/veille",
      { methode: "PUT", corps: { id, conclusion, ...(note ? { note } : {}) } },
    );
    setEnvoi(false);
    if (!resultat.ok) {
      setEchec(resultat.echec);
      return;
    }
    setNote("");
    setConclusion("A_JOUR");
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
            : AUCUN_RELEVE}
        </p>

        {incident ? (
          <section className="flex flex-col items-start gap-2 rounded-lg border-l-6 border-warning bg-white p-4 shadow-e2">
            <h2 className="text-16 font-semibold text-ink-900">
              {collecte?.injoignable?.source} n&apos;a pas répondu
            </h2>
            <p className="max-w-lecture-large text-pretty text-14 text-ink-700">{incident}</p>
            <p className="max-w-lecture-large text-pretty text-13 text-ink-500">
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
              className="h-10 w-filtre rounded-md border border-ink-300 bg-white px-3 text-14 text-ink-900"
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
                <div className="grid grid-cols-veille gap-3 bg-ink-100 px-3 py-2 text-13 font-medium text-ink-700">
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
                <div className="grid grid-cols-veille items-center gap-3">
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
            <aside className="flex w-panneau flex-none flex-col gap-3 rounded-lg border border-ink-300 bg-white p-4">
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
                {/*
                  Les trois conclusions, dans l'ordre de fréquence. Un seul
                  bouton n'en portait qu'une, et les deux autres ne
                  s'écrivaient nulle part — alors que l'écran les lit pour
                  afficher l'écart d'une fiche et le silence d'une source.

                  Chaque option porte sa suite en description : ce que la
                  conclusion écrit, et ce qu'elle ne touche pas. Choisir
                  « périmé » sans savoir que les dates ne bougent pas
                  reviendrait à croire la fiche relue.
                */}
                <RadioGroup
                  libelle="Ce que tu as trouvé sur la source"
                  valeur={conclusion}
                  onChangement={(v) => setConclusion(v as EtatSource)}
                  options={(["A_JOUR", "A_ARBITRER", "PERIME"] as const).map((valeur) => ({
                    valeur,
                    libelle: LIBELLE_ETAT_SOURCE[valeur],
                    description:
                      valeur === "A_JOUR" && enRetard(retenue, aujourdhui)
                        ? "La fiche repart pour 90 jours et redevient publiée : le retrait ne disait que « personne n'a relu »."
                        : SUITE_DE_LA_CONCLUSION[valeur],
                  }))}
                />

                {/*
                  La note est obligatoire dès que la conclusion n'est pas
                  « à jour » : « injoignable » seul ne se relit pas dans six
                  mois, et un écart sans texte ne dit rien à qui écrira la
                  version suivante. Le serveur la refuse aussi — deux
                  contrôles, parce que celui-ci explique et celui-là tient.
                */}
                {conclusion === "A_JOUR" ? null : (
                  <Champ
                    id={idNote}
                    idDescription={`${idNote}-aide`}
                    libelle={
                      conclusion === "A_ARBITRER"
                        ? "Ce qui a changé sur la source"
                        : "Ce que la source a répondu"
                    }
                    aide="Le relevé se relit dans six mois : écris ce qu'on aura besoin de savoir."
                  >
                    <textarea
                      id={idNote}
                      aria-describedby={`${idNote}-aide`}
                      rows={3}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className={CHAMP_CONTROLE}
                    />
                  </Champ>
                )}

                <Button
                  variante="secondaire"
                  pleineLargeur
                  disabled={envoi || (conclusion !== "A_JOUR" && note.trim().length === 0)}
                  raisonDesactivation={
                    envoi
                      ? "Enregistrement en cours."
                      : "Écris ce que tu as trouvé : le relevé se relit dans six mois."
                  }
                  onClick={() => relire(retenue.id, conclusion, note)}
                >
                  {envoi ? "Enregistrement…" : "Consigner ce relevé"}
                </Button>

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
      {/*
        La phrase disait « les 14 sources ont répondu » et « la prochaine
        collecte est programmée demain » : trois assertions sur un
        collecteur qui n'existe pas, sur l'état où une instance saine se
        trouve la plupart du temps. Le relevé est le geste du veilleur
        (WF-14 étape 2), et la phrase dit maintenant ce qu'il a relevé.
      */}
      <p className="max-w-lecture text-pretty text-14 text-ink-700">
        {resumeFileVide(collecte, moment)}
      </p>
      {/* Aucun lien : le back-office n'a pas d'index des règles, et l'état
          vide est le seul écran où le veilleur n'a rien d'autre à cliquer.
          Il dit donc par où une fiche revient, plutôt que d'offrir une
          porte qui répond 404. */}
      <p className="max-w-lecture text-pretty text-13 text-ink-500">
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
