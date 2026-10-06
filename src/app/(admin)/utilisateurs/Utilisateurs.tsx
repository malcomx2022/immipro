"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { CHAMP_CONTROLE } from "@/components/ui/champ";
import { EnteteAdmin } from "@/components/admin/EnteteAdmin";
import { appeler } from "@/lib/api";
import { CorrectionDuDepot } from "./CorrectionDuDepot";
import type { EchecCandidat } from "@/server/http/echecs";
import { Filtres } from "@/components/admin/Filtres";
import { ListeSelectionnable } from "@/components/admin/ListeSelectionnable";
import { MENTION_AUDIT } from "@/domain/backoffice/navigation";
import {
  CE_QUE_TU_NE_PEUX_PAS_VOIR,
  FILTRES_COMPTE,
  LIBELLE_FILTRE_COMPTE,
  LIBELLE_STATUT_COMPTE,
  actionsPour,
  diagnostiquerRecherche,
  messageDeRelance,
  filtrerComptes,
  obstacleALActionCompte,
  resumeComptes,
  type ActionCompte,
  type BilanRelanceSuppression,
  type Compte,
  type FiltreCompte,
} from "@/domain/backoffice/comptes";
import { jourEnFrancais } from "@/domain/format/moment";
import { cn } from "@/lib/utils";

/**
 * B-03 — Utilisateurs. WF-15.
 *
 * L'écran dit ce qu'il ne montre pas : les pièces d'un candidat ne sont
 * accessibles que depuis la file de revue, sur une pièce en échec, et
 * l'accès est consigné avec son motif.
 *
 * Une recherche sans résultat nomme toujours le critère qui exclut le reste.
 * « Aucun résultat » laisse l'opérateur retirer les filtres un à un jusqu'à
 * retrouver le compte qu'il sait exister.
 *
 * ── La liste d'actions était fausse dans les deux sens ──────────────────
 *
 * Elle proposait trois boutons — renvoyer l'email de vérification,
 * recréditer des analyses, traiter une demande de suppression — dont
 * aucun n'était relié à quoi que ce soit et dont aucun n'avait de route.
 * Depuis S.121, deux ont leur route et leur bouton : le renvoi du code
 * et la relance d'une suppression. Seul le recrédit reste nommé dans
 * `ACTIONS_ATTENDUES`, parce qu'il attend une décision et non du code.
 * Et elle omettait **la seule action que le produit sait faire** : la
 * suspension, dont la route existe depuis le début, journalise son motif
 * et ferme les sessions ouvertes.
 *
 * Un écran qui offre ce qu'il ne peut pas et cache ce qu'il peut se
 * trompe deux fois. Les trois absentes sont nommées dans
 * `ACTIONS_ATTENDUES`, avec ce qui manque à chacune : les retirer sans
 * les nommer ferait disparaître le besoin avec le bouton.
 *
 * « Exporter la sélection » est parti pour la raison de Q.A : aucun code
 * d'export n'existe dans le dépôt, et un bouton qui promet un fichier
 * qu'aucune ligne ne produit vaut moins qu'une absence.
 */
export function Utilisateurs({ comptes }: { comptes: readonly Compte[] }) {
  const router = useRouter();
  const [filtre, setFiltre] = useState<FiltreCompte>("TOUS");
  const [recherche, setRecherche] = useState("");
  const [selection, setSelection] = useState<string | null>(null);
  const [motif, setMotif] = useState("");
  const [envoi, setEnvoi] = useState("");
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  /** Ce que l'écran dit une fois l'action faite : un succès muet ne se distingue pas d'un clic perdu. */
  const [fait, setFait] = useState<{ texte: string; achevee: boolean } | null>(null);

  const visibles = filtrerComptes(comptes, filtre, recherche);
  const retenu = visibles.find((c) => c.id === selection) ?? visibles[0];
  const diagnostic = diagnostiquerRecherche(comptes, filtre, recherche);
  const manque = obstacleALActionCompte(motif);

  /** Changer de compte remet le motif à zéro : il portait sur l'autre. */
  function choisir(cle: string | null) {
    setSelection(cle);
    setMotif("");
    setEchec(null);
    setFait(null);
  }

  async function agir(action: ActionCompte) {
    if (!retenu || manque) return;
    setEnvoi(action.cle);
    setEchec(null);
    setFait(null);
    const corps = { userId: retenu.id, motif };
    const resultat =
      action.cle === "renvoyer-verification"
        ? await appeler<{ envoye: boolean }>("/api/admin/utilisateurs/verification", {
            methode: "POST",
            corps,
          })
        : action.cle === "relancer-suppression"
          ? await appeler<BilanRelanceSuppression>("/api/admin/utilisateurs/suppression", {
              methode: "POST",
              corps,
            })
          : await appeler<{ suspendu: boolean; sessionsFermees: number }>(
              "/api/admin/utilisateurs",
              { methode: "PUT", corps: { ...corps, suspendre: action.cle === "suspendre" } },
            );
    setEnvoi("");
    if (!resultat.ok) {
      setEchec(resultat.echec);
      return;
    }
    setMotif("");
    if (action.cle === "relancer-suppression") {
      setFait(messageDeRelance(resultat.donnees as BilanRelanceSuppression));
    } else {
      setFait({ texte: action.confirmation, achevee: true });
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col">
      <EnteteAdmin
        titre="Utilisateurs"
        resume={resumeComptes(comptes)}
      />

      <div className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Filtres
            libelle="Filtrer les comptes"
            valeurs={FILTRES_COMPTE}
            libelles={LIBELLE_FILTRE_COMPTE}
            actif={filtre}
            onChangement={setFiltre}
            compteur={`${visibles.length} sur ${comptes.length}`}
          />
          <label className="flex items-center gap-2 text-14 text-ink-700">
            <span>Rechercher</span>
            <input
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              className="h-10 w-[240px] rounded-md border border-ink-300 bg-white px-3 text-14 text-ink-900"
            />
          </label>
        </div>

        <div className="flex gap-4">
          <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-ink-300 bg-white">
            <ListeSelectionnable
              libelle="Comptes utilisateurs"
              elements={visibles}
              cle={(c) => c.id}
              selection={retenu?.id ?? null}
              onSelection={choisir}
              entete={
                <div className="grid grid-cols-[1.6fr_8rem_4rem_7rem_9rem] gap-3 bg-ink-100 px-3 py-2 text-13 font-medium text-ink-700">
                  <span>Compte</span>
                  <span>Inscrit le</span>
                  <span>Dossiers</span>
                  <span>Pack</span>
                  <span>Statut</span>
                </div>
              }
              vide={
                diagnostic ? (
                  <RechercheVide
                    diagnostic={diagnostic}
                    onRetirerFiltre={() => setFiltre("TOUS")}
                    onEffacer={() => setRecherche("")}
                  />
                ) : undefined
              }
              rendu={(compte) => (
                <div className="grid grid-cols-[1.6fr_8rem_4rem_7rem_9rem] items-center gap-3">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-ink-900">{compte.nom}</span>
                    <span className="truncate text-13 text-ink-500">{compte.email}</span>
                  </span>
                  <span className="text-ink-700">{jourEnFrancais(compte.inscritLe)}</span>
                  <span className="text-ink-700">{compte.dossiers}</span>
                  <span className="truncate text-ink-700">{compte.pack}</span>
                  <span className="truncate text-13 text-ink-700">
                    {LIBELLE_STATUT_COMPTE[compte.statut]}
                  </span>
                </div>
              )}
            />
          </div>

          {retenu ? (
            <aside className="flex w-[340px] flex-none flex-col gap-4">
              <section className="flex flex-col gap-2 rounded-lg border border-ink-300 bg-white p-4">
                <h2 className="text-13 font-medium uppercase tracking-wide text-ink-500">
                  Compte sélectionné
                </h2>
                <p className="text-16 font-semibold text-ink-900">{retenu.nom}</p>
                <p className="text-13 text-ink-500">{retenu.email}</p>
                <dl className="flex flex-col pt-1">
                  <Ligne intitule="Inscrit le" valeur={jourEnFrancais(retenu.inscritLe)} />
                  <Ligne intitule="Dossiers" valeur={String(retenu.dossiers)} />
                  <Ligne intitule="Pack" valeur={retenu.pack} />
                  <Ligne
                    intitule="Analyses utilisées"
                    valeur={`${retenu.analysesUtilisees} sur ${retenu.analysesTotal}`}
                  />
                </dl>
              </section>

              <section className="flex flex-col gap-2 rounded-lg border border-ink-300 bg-white p-4">
                <h2 className="text-13 font-medium uppercase tracking-wide text-ink-500">
                  Consentements
                </h2>
                <ul className="flex flex-wrap gap-1.5">
                  {retenu.consentements.map((c) => (
                    <li
                      key={c}
                      className="rounded-full bg-ink-100 px-2.5 py-1 text-13 text-ink-700"
                    >
                      {c}
                    </li>
                  ))}
                </ul>
              </section>

              {retenu.depots && retenu.depots.length > 0 ? (
                <section className="flex flex-col gap-2 rounded-lg border border-ink-300 bg-white p-4">
                  <h2 className="text-13 font-medium uppercase tracking-wide text-ink-500">
                    Dépôts déclarés
                  </h2>
                  <p className="text-pretty text-13 text-ink-700">
                    Le candidat ne modifie pas la date une fois déclarée. Une correction
                    recalcule la conservation et les relances, et part au journal.
                  </p>
                  {retenu.depots.map((depot) => (
                    <CorrectionDuDepot key={depot.dossierId} depot={depot} />
                  ))}
                </section>
              ) : null}

              <section className="flex flex-col gap-2 rounded-lg border border-ink-300 bg-white p-4">
                <h2 className="text-14 font-semibold text-ink-900">
                  Ce que tu ne peux pas voir
                </h2>
                <p className="text-pretty text-13 text-ink-700">
                  {CE_QUE_TU_NE_PEUX_PAS_VOIR}
                </p>
              </section>

              <section className="flex flex-col gap-3 rounded-lg border border-ink-300 bg-white p-4">
                <h2 className="text-13 font-medium uppercase tracking-wide text-ink-500">
                  Agir sur ce compte
                </h2>

                {/*
                  Le motif d'abord : c'est lui qu'on relit quand une
                  suspension est contestée, et « suspendu le 12 » ne
                  répond à rien (RG-15.1).
                */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="motif" className="text-14 font-medium text-ink-900">
                    Motif de la décision
                  </label>
                  <textarea
                    id="motif"
                    rows={2}
                    value={motif}
                    onChange={(e) => setMotif(e.target.value)}
                    aria-describedby="motif-aide"
                    className={cn(CHAMP_CONTROLE, "h-auto py-2.5")}
                  />
                  <span id="motif-aide" className="text-pretty text-13 text-ink-500">
                    Il part au journal d&apos;audit avec ton identifiant. Le titulaire du
                    compte ne le lit pas.
                  </span>
                </div>

                {echec ? <BlocEchec echec={echec} annonce /> : null}
                {fait ? (
                  <p
                    role="status"
                    className={cn(
                      "text-pretty rounded-md border p-3 text-14 text-ink-900",
                      fait.achevee ? "border-ink-300 bg-ink-100" : "border-ink-500 bg-white",
                    )}
                  >
                    {fait.texte}
                  </p>
                ) : null}

                {actionsPour(retenu).map((action) => (
                  <div key={action.cle} className="flex flex-col gap-1.5">
                    <Button
                      variante="secondaire"
                      pleineLargeur
                      disabled={manque !== null || envoi !== ""}
                      raisonDesactivation={manque ?? "Envoi en cours."}
                      onClick={() => agir(action)}
                    >
                      {envoi === action.cle
                        ? action.cle === "relancer-suppression"
                          ? "Traitement…"
                          : "Envoi…"
                        : action.libelle}
                    </Button>
                    <span className="text-pretty text-13 text-ink-500">
                      {action.consequence}
                    </span>
                  </div>
                ))}
              </section>

              <p className="text-pretty text-13 text-ink-500">{MENTION_AUDIT}</p>
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function RechercheVide({
  diagnostic,
  onRetirerFiltre,
  onEffacer,
}: {
  diagnostic: NonNullable<ReturnType<typeof diagnostiquerRecherche>>;
  onRetirerFiltre: () => void;
  onEffacer: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-2 p-6">
      <h2 className="text-pretty text-19 font-semibold text-ink-900">
        {diagnostic.message}
      </h2>
      {diagnostic.critere ? (
        <>
          <p className="max-w-[70ch] text-pretty text-14 text-ink-700">
            {diagnostic.critere.explication}
          </p>
          <div className="flex gap-2 pt-1">
            <Button variante="secondaire" onClick={onRetirerFiltre}>
              Retirer le filtre « {diagnostic.critere.libelle} »
            </Button>
            <Button variante="tertiaire" onClick={onEffacer}>
              Effacer la recherche
            </Button>
          </div>
        </>
      ) : (
        <Button variante="secondaire" onClick={onEffacer}>
          Effacer la recherche
        </Button>
      )}
    </div>
  );
}

function Ligne({ intitule, valeur }: { intitule: string; valeur: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-ink-300 py-2">
      <dt className="text-13 text-ink-500">{intitule}</dt>
      <dd className="text-14 text-ink-900">{valeur}</dd>
    </div>
  );
}
