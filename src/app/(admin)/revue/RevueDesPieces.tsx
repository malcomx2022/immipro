"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { EnteteAdmin } from "@/components/admin/EnteteAdmin";
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
 */
export function RevueDesPieces({
  pieces,
  maintenant,
}: {
  pieces: readonly PieceEnEchec[];
  /** Horodatage de rendu : l'âge d'une pièce se calcule, il ne se saisit pas. */
  maintenant: string;
}) {
  const triees = trierParAnciennete(pieces);
  const [selection, setSelection] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision>("A_CORRIGER");
  const [message, setMessage] = useState("");
  const [ouverte, setOuverte] = useState(false);

  const date = new Date(maintenant);
  const retenue = triees.find((p) => p.id === selection) ?? triees[0];
  const refus = refusDuMessage(message, decision);

  if (triees.length === 0) return <FileVide />;

  return (
    <div className="flex flex-col">
      <EnteteAdmin
        titre="Pièces en échec d'analyse"
        resume={resumeRevue(triees, date)}
        actions={<Button variante="secondaire">Voir les pièces traitées</Button>}
      />

      <div className="flex gap-4 p-6">
        <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-ink-300 bg-white">
          <ListeSelectionnable
            libelle="Pièces en attente de relecture humaine"
            elements={triees}
            cle={(p) => p.id}
            selection={retenue?.id ?? null}
            onSelection={(cle) => {
              setSelection(cle);
              setOuverte(false);
              setMessage("");
            }}
            entete={
              <div className="grid grid-cols-[1fr_1.4fr_6rem_1fr] gap-3 bg-ink-100 px-3 py-2 text-13 font-medium text-ink-700">
                <span>Pièce</span>
                <span>Dossier</span>
                <span>Attente</span>
                <span>Motif</span>
              </div>
            }
            rendu={(piece) => (
              <div className="grid grid-cols-[1fr_1.4fr_6rem_1fr] items-center gap-3">
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
          <aside className="flex w-[420px] flex-none flex-col gap-4">
            <section className="flex flex-col gap-2 rounded-lg border border-ink-300 bg-white p-4">
              <h2 className="text-16 font-semibold text-ink-900">{retenue.piece}</h2>
              <p className="text-13 text-ink-500">
                {retenue.dossier} · en attente depuis {libelleAge(retenue, date)}
              </p>

              {ouverte ? (
                <div
                  aria-hidden="true"
                  className="flex h-40 items-center justify-center rounded-md bg-ink-100 text-13 text-ink-500"
                >
                  aperçu de la pièce · page 1 sur 3
                </div>
              ) : (
                <div className="flex flex-col items-start gap-2 rounded-md bg-ink-100 p-3.5">
                  <p className="text-pretty text-13 text-ink-700">{MENTION_ACCES_TRACE}</p>
                  <Button variante="secondaire" onClick={() => setOuverte(true)}>
                    Ouvrir la pièce
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

              <div className="flex flex-col gap-2 border-t border-ink-300 pt-3">
                <Button
                  pleineLargeur
                  disabled={refus !== null}
                  raisonDesactivation="Le message au candidat doit dire le constat et l'action avant d'être envoyé."
                >
                  Enregistrer et passer à la suivante
                </Button>
                <Button variante="secondaire" pleineLargeur>
                  Rendre l&apos;analyse au candidat
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
        <p className="max-w-[70ch] text-pretty text-14 text-ink-700">
          Les pièces en échec d&apos;analyse d&apos;hier ont toutes été traitées. Les
          nouvelles arrivent ici dans les minutes qui suivent l&apos;échec.
        </p>
        <div className="flex gap-2 pt-1">
          <Button variante="secondaire">Voir les pièces traitées</Button>
          <Button variante="tertiaire">Motifs d&apos;échec les plus fréquents</Button>
        </div>
        <p className="pt-2 text-pretty text-13 text-ink-500">{MENTION_ACCES_TRACE}</p>
      </div>
    </div>
  );
}
