"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import type { PieceComptable } from "@/server/lecture/factures";
import { MENTION_ESSAI } from "@/domain/facturation/numerotation";
import { arreteDeLaSomme } from "@/domain/facturation/facture";
import { formatMineur, libelleDuTaux } from "@/domain/facturation/montants";
import { MENTION_PDF } from "@/domain/paiement/recu";
import { momentEnFrancais } from "@/domain/format/moment";

/**
 * Facture et facture d'avoir — avis comptable M.C du 04/10/2026.
 *
 * La pièce s'affiche telle qu'elle a été figée : les mentions que l'avis
 * exige, dans l'ordre où un comptable les cherche. Une pièce d'essai le
 * dit en tête, avant tout le reste ; une pièce réelle sans code de
 * certification le dit aussi, au lieu de laisser un emplacement vide.
 *
 * Comme le reçu, elle devient un PDF par la fenêtre d'impression du
 * navigateur : aucune bibliothèque de rendu n'entre au dépôt pour
 * fabriquer un document moins fidèle que la page.
 */
export function Facture({ piece }: { piece: PieceComptable }) {
  const montant = (mineur: number) => formatMineur(mineur, piece.devise);

  return (
    <div className="a-imprimer mx-auto flex w-full max-w-decision flex-col gap-6 px-4 pb-8 md:py-8">
      <h1
        id="contenu"
        tabIndex={-1}
        className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
      >
        {piece.intitule} {piece.numero}
      </h1>

      {piece.serie === "ESSAI" ? (
        <p role="note" className="rounded-lg bg-ink-100 p-4 text-pretty text-14 font-medium text-ink-900">
          {MENTION_ESSAI}
        </p>
      ) : null}
      {piece.annulation ? (
        <p role="note" className="rounded-lg bg-ink-100 p-4 text-pretty text-14 font-medium text-ink-900">
          Pièce annulée le {momentEnFrancais(piece.annulation.le)} : {piece.annulation.motif}
        </p>
      ) : null}

      <article className="flex flex-col overflow-hidden rounded-lg border border-ink-300">
        <div className="grid gap-4 border-b border-ink-300 p-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="text-13 text-ink-500">Émetteur</span>
            {piece.emetteur ? (
              <address className="flex flex-col text-14 not-italic text-ink-900">
                {piece.emetteur.map((ligne) => (
                  <span key={ligne}>{ligne}</span>
                ))}
              </address>
            ) : (
              <p className="text-pretty text-14 text-ink-700">
                Mentions de l&apos;émetteur non saisies au jour de cette pièce d&apos;essai.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-13 text-ink-500">Client</span>
            <address className="flex flex-col text-14 not-italic text-ink-900">
              <span>{piece.client.nom ?? "Nom de facturation non renseigné"}</span>
              <span className="whitespace-pre-line">
                {piece.client.adresse ?? "Adresse de facturation non renseignée"}
              </span>
              <span className="text-ink-500">{piece.client.qualite}</span>
            </address>
          </div>
        </div>

        <dl className="flex flex-col gap-3 border-b border-ink-300 p-5">
          {[
            { intitule: "Numéro", valeur: piece.numero, mono: true },
            { intitule: "Date d'émission", valeur: momentEnFrancais(piece.emiseLe), mono: false },
            // La vente ou le remboursement constaté : une pièce émise par le
            // filet le 02/01 garde le 31/12 de la vente (revue F5, D-14).
            { intitule: "Date de la prestation", valeur: momentEnFrancais(piece.prestationLe), mono: false },
            ...(piece.origine
              ? [{ intitule: "Facture d'origine", valeur: piece.origine, mono: true }]
              : []),
            { intitule: "Référence du paiement", valeur: piece.reference, mono: true },
            { intitule: "Règlement", valeur: piece.reglement, mono: false },
          ].map((ligne) => (
            <div key={ligne.intitule} className="flex justify-between gap-4 text-14">
              <dt className="text-ink-500">{ligne.intitule}</dt>
              <dd
                className={
                  ligne.mono
                    ? "break-all text-right font-mono font-medium text-ink-900"
                    : "text-right font-medium text-ink-900"
                }
              >
                {ligne.valeur}
              </dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-col gap-3 border-b border-ink-300 p-5">
          <div className="flex items-start justify-between gap-4 text-14">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-16 font-medium text-ink-900">{piece.designation}</span>
              <span className="text-ink-500">Quantité : 1 · Prix unitaire hors taxes : {montant(piece.ht)}</span>
            </span>
            <span className="flex-none text-16 font-medium text-ink-900">{montant(piece.ht)}</span>
          </div>
          <div className="flex justify-between gap-4 text-14">
            <span className="text-ink-500">Total hors taxes</span>
            <span className="text-ink-900">{montant(piece.ht)}</span>
          </div>
          <div className="flex justify-between gap-4 text-14">
            <span className="text-ink-500">
              TVA{piece.tauxBp !== null ? ` (${libelleDuTaux(piece.tauxBp)})` : ""}
            </span>
            <span className="text-ink-900">{montant(piece.tva)}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 bg-ink-100 p-5">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-16 font-semibold text-ink-900">
              {piece.genre === "AVOIR" ? "Total remboursé TTC" : "Total TTC"}
            </span>
            <span className="text-24 font-semibold text-ink-900">{montant(piece.ttc)}</span>
          </div>
          <p className="text-pretty text-13 text-ink-700">{arreteDeLaSomme(piece.enLettres, piece.genre)}</p>
        </div>
      </article>

      <p className="text-pretty text-13 text-ink-700">{piece.mentionTva}</p>
      <p className="text-pretty text-13 text-ink-700">
        {piece.certification
          ? `Facture normalisée, code de certification ${piece.certification.code}, certifiée le ${momentEnFrancais(piece.certification.le)}.`
          : piece.serie === "ESSAI"
            ? "Pièce d'essai : elle n'est pas soumise au système de facture normalisée."
            : "Code de certification de la facture normalisée en attente."}
      </p>

      <p className="text-pretty text-13 text-ink-500">
        Pièce conservée au moins jusqu&apos;au {momentEnFrancais(piece.conserveeJusquau)}, comme toute pièce
        comptable.
      </p>

      <div className="pas-a-imprimer flex flex-col gap-3">
        <Button pleineLargeur onClick={() => window.print()}>
          Imprimer
        </Button>
        <p className="text-pretty text-center text-13 text-ink-500">{MENTION_PDF}</p>
        <Link
          href={`/paiement/recu/${encodeURIComponent(piece.reference)}`}
          className="flex min-h-touch items-center justify-center text-14 font-semibold text-ink-900"
        >
          Revenir au reçu
        </Link>
      </div>
    </div>
  );
}
