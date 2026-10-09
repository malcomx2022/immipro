"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { EnteteAdmin } from "@/components/admin/EnteteAdmin";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import { ListeSelectionnable } from "@/components/admin/ListeSelectionnable";
import { CHAMP_CONTROLE } from "@/components/ui/champ";
import { LIBELLES_ETAT_PIECE } from "@/components/ui/StatusBadge";
import {
  DECISIONS,
  LIBELLE_MOTIF,
  MENTION_ACCES_TRACE,
  MENTION_DECISION,
  horsDelai,
  libelleAge,
  obstacleALaDecision,
  obstacleALOuverture,
  recrediteLeQuota,
  refusDuMessage,
  resumeRevue,
  trierParAnciennete,
  type Decision,
  type PieceEnEchec,
} from "@/domain/backoffice/revue";
import { cn } from "@/lib/utils";

/**
 * B-05 — Revue manuelle des pièces en échec. WF-15.
 *
 * Le message envoyé au candidat passe la même exigence que le code : constat
 * puis action, jamais « non conforme » seul (RG-06.3), et le vocabulaire
 * interdit s'y applique. C'est le deuxième endroit où un humain écrit pour
 * le candidat, et il n'y a pas de raison qu'il soit moins tenu que la machine.
 *
 * Aucune pièce n'est préchargée : la file montre le motif d'échec et la
 * trace technique, l'ouverture du document est un acte séparé et tracé.
 *
 * ── Ce que l'écran annonçait sans le faire ──────────────────────────────
 *
 * **L'ouverture n'était pas tracée.** « Ouvrir la pièce » posait un
 * drapeau local et affichait un aperçu inventé — « aperçu de la pièce ·
 * page 1 sur 3 » — qui ne correspondait à aucun fichier. Aucun motif
 * n'était demandé, aucune ligne n'était écrite : l'action
 * `piece.consultation` figurait dans la table des actions auditées sans
 * qu'aucun code ne l'emploie jamais. L'écran affirmait pourtant, trois
 * lignes plus haut, que l'ouverture était « un acte tracé, avec son
 * motif » — RG-15.1, contredit par la phrase qui l'énonce.
 *
 * **Et la décision ne partait pas non plus.** « Enregistrer et passer à
 * la suivante » n'était relié à rien. La route existait, validait le
 * message, journalisait et recréditait le quota ; seule la moitié
 * cliente manquait. La file de revue est le repli de l'extraction non
 * branchée : elle est le filet, et elle ne décidait rien.
 *
 * **Un motif, deux lignes d'audit.** L'opérateur ouvre la pièce *pour* la
 * trancher ; lui faire écrire deux justifications du même geste
 * produirait deux textes dont l'un serait recopié de l'autre. Le motif
 * est demandé avant l'ouverture — demandé après, il justifierait un accès
 * déjà eu — et il accompagne ensuite la décision.
 *
 * **Deux commandes ont été retirées.** « Rendre l'analyse au candidat »
 * proposait un choix que le produit n'offre pas : c'est la décision qui
 * recrédite le quota, et la ligne au-dessus du bouton dit déjà laquelle.
 * « Voir les pièces traitées » et « Motifs d'échec les plus fréquents »
 * menaient à des écrans qui n'existent pas — la règle de Q.A, qui a fait
 * retirer neuf liens du pied de page plutôt que d'inventer leurs pages.
 */
export function RevueDesPieces({
  pieces,
  maintenant,
}: {
  pieces: readonly PieceEnEchec[];
  /** Horodatage de rendu : l'âge d'une pièce se calcule, il ne se saisit pas. */
  maintenant: string;
}) {
  const router = useRouter();
  const triees = trierParAnciennete(pieces);
  const [selection, setSelection] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision>("A_CORRIGER");
  const [motif, setMotif] = useState("");
  const [message, setMessage] = useState("");
  /** L'aperçu que le serveur a signé — jamais un cadre inventé. */
  const [apercu, setApercu] = useState<{ url: string | null; raison: string | null } | null>(
    null,
  );
  const [envoi, setEnvoi] = useState<"" | "ouverture" | "decision">("");
  const [echec, setEchec] = useState<EchecCandidat | null>(null);

  const date = new Date(maintenant);
  const retenue = triees.find((p) => p.id === selection) ?? triees[0];
  const refus = refusDuMessage(message, decision);
  const manqueAvantOuverture = obstacleALOuverture(motif);
  const manqueAvantDecision = obstacleALaDecision({ motif, decision, message });

  /** Changer de pièce remet tout à zéro, aperçu compris. */
  function choisir(cle: string | null) {
    setSelection(cle);
    setApercu(null);
    setMotif("");
    setMessage("");
    setEchec(null);
  }

  async function ouvrirLaPiece() {
    if (!retenue || manqueAvantOuverture) return;
    setEnvoi("ouverture");
    setEchec(null);
    const resultat = await appeler<{ apercu: string | null; raison: string | null }>(
      `/api/admin/revue/${retenue.id}/consultation`,
      { corps: { motif } },
    );
    setEnvoi("");
    if (!resultat.ok) {
      setEchec(resultat.echec);
      return;
    }
    setApercu({ url: resultat.donnees.apercu, raison: resultat.donnees.raison });
  }

  async function trancher() {
    if (!retenue || manqueAvantDecision) return;
    setEnvoi("decision");
    setEchec(null);
    const resultat = await appeler<{ decidee: boolean; quotaRendu: boolean }>(
      `/api/admin/revue/${retenue.id}`,
      { corps: { decision, message, motif } },
    );
    setEnvoi("");
    if (!resultat.ok) {
      setEchec(resultat.echec);
      return;
    }
    // La pièce tranchée sort de la file : la suivante devient la retenue
    // au prochain rendu, et rien de la précédente ne doit y survivre.
    choisir(null);
    router.refresh();
  }

  if (triees.length === 0) return <FileVide />;

  return (
    <div className="flex flex-col">
      <EnteteAdmin
        titre="Pièces en échec d'analyse"
        resume={resumeRevue(triees, date)}
      />

      <div className="flex gap-4 p-6">
        <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-ink-300 bg-white">
          <ListeSelectionnable
            libelle="Pièces en attente de relecture humaine"
            elements={triees}
            cle={(p) => p.id}
            selection={retenue?.id ?? null}
            onSelection={choisir}
            entete={
              <div className="grid grid-cols-revue gap-3 bg-ink-100 px-3 py-2 text-13 font-medium text-ink-700">
                <span>Pièce</span>
                <span>Dossier</span>
                <span>Attente</span>
                <span>Motif</span>
              </div>
            }
            rendu={(piece) => (
              <div className="grid grid-cols-revue items-center gap-3">
                <span className="truncate text-ink-900">{piece.piece}</span>
                <span className="truncate text-ink-700">{piece.dossier}</span>
                <span
                  className={cn(horsDelai(piece, date) ? "text-danger" : "text-ink-700")}
                >
                  {libelleAge(piece, date)}
                </span>
                <span className="truncate text-13 text-ink-700">
                  {LIBELLE_MOTIF[piece.motif]}
                </span>
              </div>
            )}
          />
        </div>

        {retenue ? (
          <aside className="flex w-panneau-large flex-none flex-col gap-4">
            <section className="flex flex-col gap-2 rounded-lg border border-ink-300 bg-white p-4">
              <h2 className="text-16 font-semibold text-ink-900">{retenue.piece}</h2>
              <p className="text-13 text-ink-500">
                {retenue.dossier} · en attente depuis {libelleAge(retenue, date)}
              </p>
              {/* S.157 — ce que le candidat désigne comme faux, s'il a signalé. */}
              {retenue.signalement ? (
                <p className="text-pretty rounded-md border-l-6 border-accent-500 bg-accent-50 p-3 text-14 text-ink-900">
                  {retenue.signalement}
                </p>
              ) : null}

              {apercu ? (
                apercu.url ? (
                  <iframe
                    src={apercu.url}
                    title={`Aperçu de ${retenue.piece}`}
                    className="h-40 w-full rounded-md border border-ink-300 bg-ink-100"
                  />
                ) : (
                  // Ni cadre vide ni page inventée : la raison, telle que
                  // le serveur l'a donnée — purgée, en quarantaine, ou
                  // stockage injoignable.
                  <p
                    role="status"
                    className="text-pretty rounded-md bg-ink-100 p-3.5 text-13 text-ink-700"
                  >
                    {apercu.raison}
                  </p>
                )
              ) : (
                <div className="flex flex-col items-start gap-2 rounded-md bg-ink-100 p-3.5">
                  <p className="text-pretty text-13 text-ink-700">{MENTION_ACCES_TRACE}</p>
                  <Button
                    variante="secondaire"
                    disabled={manqueAvantOuverture !== null || envoi !== ""}
                    raisonDesactivation={manqueAvantOuverture ?? "Ouverture en cours."}
                    onClick={ouvrirLaPiece}
                  >
                    {envoi === "ouverture" ? "Ouverture…" : "Ouvrir la pièce"}
                  </Button>
                </div>
              )}

              <h3 className="pt-1 text-14 font-medium text-ink-900">
                Ce que la lecture automatique a renvoyé
              </h3>
              <p className="rounded-md bg-ink-100 p-3 font-mono text-13 text-ink-700">
                {retenue.journal}
              </p>
            </section>

            <section className="flex flex-col gap-3 rounded-lg border border-ink-300 bg-white p-4">
              <h2 className="text-13 font-medium uppercase tracking-wide text-ink-500">
                Décision
              </h2>

              {/*
                Le motif vient en premier parce qu'il conditionne
                l'ouverture : demandé après, il justifierait un accès déjà
                eu, ce qui n'est pas une justification (RG-15.1).
              */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="motif" className="text-14 font-medium text-ink-900">
                  Motif de l&apos;accès et de la décision
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
                  Il part au journal d&apos;audit, avec ton identifiant, à
                  l&apos;ouverture de la pièce comme à la décision. Le candidat ne le
                  lit pas.
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {DECISIONS.map((cle) => (
                  <button
                    key={cle}
                    type="button"
                    aria-pressed={decision === cle}
                    onClick={() => setDecision(cle)}
                    className={cn(
                      "flex min-h-touch items-center rounded-sm border px-3 text-14",
                      decision === cle
                        ? "border-ink-900 bg-ink-900 text-white"
                        : "border-ink-300 bg-white text-ink-900 hover:bg-ink-100",
                    )}
                  >
                    {LIBELLES_ETAT_PIECE[cle]}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="message" className="text-14 font-medium text-ink-900">
                  Message envoyé au candidat
                </label>
                <textarea
                  id="message"
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  aria-invalid={refus ? true : undefined}
                  aria-describedby="message-aide"
                  className={cn(CHAMP_CONTROLE, "h-auto py-2.5", refus && "border-danger")}
                />
                <span
                  id="message-aide"
                  role={refus ? "alert" : undefined}
                  className={cn(
                    "text-pretty text-13",
                    refus ? "text-danger" : "text-ink-500",
                  )}
                >
                  {refus
                    ? `${refus.raison} ${refus.consigne}`
                    : "Dis ce qui bloque et ce qu'il faut faire. Jamais « non conforme » seul."}
                </span>
              </div>

              <p className="text-13 text-ink-700">
                {recrediteLeQuota(decision)
                  ? "Cette décision rend l'analyse : le quota du candidat est recrédité."
                  : "Cette décision ne recrédite pas le quota : la lecture a rendu un résultat."}
              </p>

              {echec ? <BlocEchec echec={echec} annonce /> : null}

              <div className="flex flex-col gap-2 border-t border-ink-300 pt-3">
                {/*
                  Un seul bouton. « Rendre l'analyse au candidat » en
                  proposait un second, pour un choix que le produit
                  n'offre pas : c'est la décision qui recrédite le quota,
                  et la ligne au-dessus le dit déjà.
                */}
                <Button
                  pleineLargeur
                  disabled={manqueAvantDecision !== null || envoi !== ""}
                  raisonDesactivation={manqueAvantDecision ?? "Enregistrement en cours."}
                  onClick={trancher}
                >
                  {envoi === "decision"
                    ? "Enregistrement…"
                    : "Enregistrer et passer à la suivante"}
                </Button>
              </div>

              <p className="text-pretty text-13 text-ink-500">{MENTION_DECISION}</p>
            </section>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

/** File vide : un état normal, avec la preuve que la collecte fonctionne. */
function FileVide() {
  return (
    <div className="flex flex-col">
      <EnteteAdmin
        titre="Pièces en échec d'analyse"
        resume="File partagée · tout accès à une pièce est consigné avec son motif"
      />
      <div className="flex flex-col items-start gap-2 p-6">
        <span className="rounded-full bg-success/10 px-3 py-1 text-13 font-medium text-success">
          File à jour
        </span>
        <h2 className="text-19 font-semibold text-ink-900">
          Aucune pièce en attente de revue
        </h2>
        <p className="max-w-lecture text-pretty text-14 text-ink-700">
          Les pièces en échec d&apos;analyse d&apos;hier ont toutes été traitées. Les
          nouvelles arrivent ici dans les minutes qui suivent l&apos;échec.
        </p>
        <p className="pt-2 text-pretty text-13 text-ink-500">{MENTION_ACCES_TRACE}</p>
      </div>
    </div>
  );
}
