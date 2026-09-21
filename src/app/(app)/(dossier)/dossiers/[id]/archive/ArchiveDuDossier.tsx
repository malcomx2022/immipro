"use client";

import Link from "next/link";
import { useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import type { Archive } from "@/server/lecture/portabilite";
import {
  MENTION_IMPRESSION,
  MENTION_LIEN_COURT,
  MENTION_PIECE_PURGEE,
  TITRE_ARCHIVE,
} from "@/domain/comptes/portabilite";
import { LIBELLES_ETAT_PIECE } from "@/components/ui/StatusBadge";
import { SourceNote } from "@/components/ui/SourceNote";
import { LIBELLE_FAMILLE, type FamillePiece } from "@/domain/dossiers/piece";
import type { DocumentState } from "@/domain/completeness/score";
import { jourEnFrancais } from "@/domain/format/moment";

/**
 * Archive d'un dossier — C-11.
 *
 * Elle s'imprime, et c'est ainsi qu'elle devient un PDF : aucune
 * bibliothèque n'est embarquée pour en fabriquer un, parce qu'elle
 * pèserait plus que le reste de l'application et rendrait un document
 * moins fidèle que la page elle-même.
 *
 * Les textes rédigés sont ici **en entier**. Ce sont les seules pièces qui
 * n'existent nulle part ailleurs : un fichier téléversé est encore sur
 * l'appareil qui l'a envoyé, une lettre écrite ici n'y est pas.
 *
 * Les fichiers, eux, ne sont que nommés, et leur lien se demande au clic.
 * Un lien signé vaut cinq minutes : posé dans la page, il serait mort avant
 * qu'on y arrive ; imprimé, il serait mort pour toujours.
 */
export function ArchiveDuDossier({ archive }: { archive: Archive }) {
  const { dossier, regle, pieces, echeances } = archive;
  const [enCours, setEnCours] = useState<string | null>(null);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);

  async function ouvrirLaPiece(pieceId: string) {
    setEnCours(pieceId);
    setEchec(null);
    const resultat = await appeler<{ apercu: string | null; mentionApercu: string | null }>(
      `/api/dossiers/${dossier.id}/pieces/${pieceId}`,
    );
    setEnCours(null);
    if (!resultat.ok) {
      setEchec(resultat.echec);
      return;
    }
    if (!resultat.donnees.apercu) {
      // Deux absences, deux phrases. Une pièce en cours de contrôle revient
      // toute seule ; une pièce purgée ne revient pas. Écrire « n'est plus
      // disponible » sur la première ferait redéposer une pièce déjà là.
      const enAttente = resultat.donnees.mentionApercu;
      setEchec({
        titre: enAttente ? "Ce fichier n'est pas encore consultable" : "Ce fichier n'est plus disponible",
        corps: enAttente ?? MENTION_PIECE_PURGEE,
        action: "Revenir à la liste",
        ton: enAttente ? "attente" : "limite",
      });
      return;
    }
    window.open(resultat.donnees.apercu, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="a-imprimer mx-auto flex w-full max-w-[880px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <Link
        href={`/dossiers/${dossier.id}`}
        className="pas-a-imprimer flex min-h-touch items-center text-14 text-accent-600"
      >
        ‹ Retour à la checklist
      </Link>

      <header className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          {TITRE_ARCHIVE} — {dossier.pays}
        </h1>
        <p className="text-pretty text-16 text-ink-700">{dossier.intitule}</p>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 pt-1 text-14 text-ink-700">
          <div className="flex gap-1.5">
            <dt className="text-ink-500">Ouvert le</dt>
            <dd>{jourEnFrancais(dossier.ouvertLe.slice(0, 10))}</dd>
          </div>
          {dossier.depotVise ? (
            <div className="flex gap-1.5">
              <dt className="text-ink-500">Départ visé</dt>
              <dd>{jourEnFrancais(dossier.depotVise)}</dd>
            </div>
          ) : null}
          {dossier.purgePrevueLe ? (
            <div className="flex gap-1.5">
              <dt className="text-ink-500">Pièces supprimées le</dt>
              <dd>{jourEnFrancais(dossier.purgePrevueLe)}</dd>
            </div>
          ) : null}
        </dl>
      </header>

      <p className="pas-a-imprimer text-pretty rounded-md bg-ink-100 p-3.5 text-14 text-ink-700">
        {MENTION_IMPRESSION} {MENTION_LIEN_COURT}
      </p>

      {echec ? <BlocEchec echec={echec} annonce className="pas-a-imprimer" /> : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-16 font-semibold text-ink-900">
          Pièces {pieces.length > 0 ? `(${pieces.length})` : ""}
        </h2>
        {pieces.length === 0 ? (
          <p className="text-pretty text-14 text-ink-700">
            Ce dossier n&apos;a pas encore de checklist. Il n&apos;y a donc rien
            à archiver.
          </p>
        ) : (
          <ul className="flex flex-col">
            {pieces.map((p) => (
              <li
                key={p.id}
                className="flex flex-col gap-2 border-b border-ink-300 py-4 last:border-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-16 font-medium text-ink-900">{p.libelle}</span>
                  <span className="text-13 text-ink-500">
                    {LIBELLE_FAMILLE[p.famille as FamillePiece] ?? p.famille} ·{" "}
                    {LIBELLES_ETAT_PIECE[p.etat as DocumentState] ?? p.etat}
                  </span>
                </div>

                {p.constat ? (
                  <p className="text-pretty text-14 text-ink-700">{p.constat}</p>
                ) : null}

                {p.analyses.map((a) => (
                  <p key={a.analyseeLe + a.titre} className="text-pretty text-14 text-ink-700">
                    <span className="font-medium text-ink-900">{a.titre}</span> — {a.corps}{" "}
                    <span className="text-ink-500">
                      (analysée le {jourEnFrancais(a.analyseeLe)})
                    </span>
                  </p>
                ))}

                {p.textes.map((t) => (
                  <article
                    key={t.rang}
                    className="flex flex-col gap-1.5 rounded-md border border-ink-300 p-3.5"
                  >
                    <span className="text-13 text-ink-500">
                      Version {t.rang}
                      {t.motif ? ` — ${t.motif}` : ""}
                    </span>
                    <p className="whitespace-pre-wrap text-pretty text-14 text-ink-700">
                      {t.texte}
                    </p>
                  </article>
                ))}

                {p.purgeeLe ? (
                  <p className="text-pretty text-13 text-ink-500">
                    {MENTION_PIECE_PURGEE} Supprimée le {jourEnFrancais(p.purgeeLe)}.
                  </p>
                ) : null}

                {p.telechargeable ? (
                  <Button
                    variante="secondaire"
                    className="pas-a-imprimer self-start"
                    chargement={enCours === p.id}
                    onClick={() => void ouvrirLaPiece(p.id)}
                  >
                    Télécharger le fichier
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {echeances.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-16 font-semibold text-ink-900">Échéances</h2>
          <ul className="flex flex-col">
            {echeances.map((e) => (
              <li
                key={e.libelle + e.echeanceLe}
                className="flex justify-between gap-4 border-b border-ink-300 py-2.5 last:border-0"
              >
                <span className="text-pretty text-14 text-ink-700">{e.libelle}</span>
                <span className="shrink-0 text-14 text-ink-500">
                  {jourEnFrancais(e.echeanceLe)}
                  {e.faite ? " · faite" : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* INV-8 : ce qui a été exigé porte sa source et sa date. Sans elles,
          l'archive dit ce qu'il fallait réunir sans dire d'après qui. */}
      {regle ? (
        <footer className="border-t border-ink-300 pt-4">
          <SourceNote source={regle.source} verifieeLe={regle.verifieeLe}>
            Exigences de la version {regle.version} du référentiel. ImmiPro
            contrôle la complétude du dossier, pas la décision de
            l&apos;administration.
          </SourceNote>
        </footer>
      ) : null}
    </div>
  );
}
