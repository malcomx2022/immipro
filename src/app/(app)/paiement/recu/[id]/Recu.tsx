"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import type { Recu as Donnees } from "@/server/lecture/paiements";
import {
  confirmationDeRenvoi,
  EMETTEUR,
  EN_COURS_CORPS,
  EN_COURS_TITRE,
  LIBELLE_ETAT,
  MENTION_ATTESTATION,
  MENTION_PDF,
  mentionRembourse,
  RAISON_RENVOI_FERME,
  SANS_SUITE_CORPS,
  SANS_SUITE_TITRE,
  estAttestable,
} from "@/domain/paiement/recu";
import { momentEnFrancais } from "@/domain/format/moment";
import { formatMontant } from "@/lib/utils";

/**
 * $-06 — Reçu. WF-05.
 *
 * Les deux boutons du prototype ne faisaient rien. Ils font maintenant
 * chacun la seule chose honnête à leur portée :
 *
 * **« Imprimer »** ouvre la fenêtre d'impression, et c'est ainsi que le
 * reçu devient un PDF — même doctrine que l'archive d'un dossier, aucune
 * bibliothèque de rendu n'entre au dépôt pour fabriquer un document moins
 * fidèle que la page elle-même. Le libellé ne dit plus « Télécharger » :
 * rien ne descend dans les téléchargements, et la mention en dessous dit
 * où se trouve « Enregistrer au format PDF ».
 *
 * **« Renvoyer par email »** expédie vraiment, vers l'adresse du compte, et
 * la confirmation la nomme — c'est le seul moyen de s'apercevoir qu'on
 * attend le reçu sur une adresse qu'on ne lit plus.
 *
 * Un reçu ne s'établit qu'après confirmation : les états en cours et sans
 * suite ne rendent pas un document à en-tête, ils disent pourquoi il n'y en
 * a pas.
 */
export function Recu({ recu }: { recu: Donnees }) {
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const [envoyeA, setEnvoyeA] = useState<string | null>(null);

  async function renvoyer() {
    setEnvoi(true);
    setEchec(null);
    const resultat = await appeler<{ adresse: string }>(
      `/api/paiements/${encodeURIComponent(recu.reference)}/recu`,
      { methode: "POST" },
    );
    setEnvoi(false);
    if (!resultat.ok) {
      setEchec(resultat.echec);
      return;
    }
    setEnvoyeA(resultat.donnees.adresse);
  }

  const montant = formatMontant(recu.montant, recu.devise);

  if (!estAttestable(recu.etat)) {
    const attente = recu.etat === "en_cours";
    return (
      <div className="mx-auto flex w-full max-w-[520px] flex-col gap-6 px-4 pb-8 md:py-8">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          {attente ? EN_COURS_TITRE : SANS_SUITE_TITRE}
        </h1>
        <p className="text-pretty text-16 text-ink-700">
          {attente ? EN_COURS_CORPS : SANS_SUITE_CORPS}
        </p>
        <dl className="flex justify-between gap-4 rounded-lg bg-ink-100 p-5 text-14">
          <dt className="text-ink-500">Référence</dt>
          <dd className="font-mono font-medium text-ink-900">{recu.reference}</dd>
        </dl>
        <Link
          href={recu.dossier ? `/dossiers/${recu.dossier.id}` : "/tableau-de-bord"}
          className="flex min-h-touch items-center justify-center text-14 font-semibold text-ink-900"
        >
          {recu.dossier ? "Revenir à mon dossier" : "Revenir au tableau de bord"}
        </Link>
      </div>
    );
  }

  return (
    <div className="a-imprimer mx-auto flex w-full max-w-[520px] flex-col gap-6 px-4 pb-8 md:py-8">
      <h1
        id="contenu"
        tabIndex={-1}
        className="text-24 font-semibold text-ink-900 outline-none md:text-32"
      >
        Reçu {recu.reference}
      </h1>

      <article className="flex flex-col overflow-hidden rounded-lg border border-ink-300">
        <div className="flex items-start justify-between gap-4 border-b border-ink-300 p-5">
          <Image
            src="/brand/immipro-logo-primary.svg"
            alt="ImmiPro"
            width={98}
            height={24}
            unoptimized
          />
          {/* Pastille propre au reçu : `StatusBadge` porte l'état d'une
              pièce de dossier, et le détourner pour son apparence ferait
              dire « Conforme » à un paiement. */}
          <span className="inline-flex items-center gap-2 rounded-full bg-ink-100 px-3 py-1.5 text-13 font-medium text-ink-700">
            <span
              aria-hidden="true"
              className={
                recu.etat === "paye" ? "h-2 w-2 rounded-full bg-success" : "h-2 w-2 rounded-full bg-ink-500"
              }
            />
            {LIBELLE_ETAT[recu.etat]}
          </span>
        </div>

        <dl className="flex flex-col gap-3 border-b border-ink-300 p-5">
          {[
            { intitule: "Référence", valeur: recu.reference, mono: true },
            // « Date » suffisait tant qu'il n'y en avait qu'une. Depuis que
            // le remboursement porte la sienne, le reçu en montre deux.
            { intitule: "Date du paiement", valeur: momentEnFrancais(recu.le), mono: false },
            { intitule: "Moyen", valeur: recu.moyen, mono: false },
            ...(recu.transactionOperateur
              ? [
                  {
                    intitule: "Transaction opérateur",
                    valeur: recu.transactionOperateur,
                    mono: true,
                  },
                ]
              : []),
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
          <div className="flex items-start justify-between gap-4">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-16 font-medium text-ink-900">{recu.achat}</span>
              {/* Sans le mot « Dossier » : le pack acheté s'appelle
                  « Dossier », et la ligne se lisait « Dossier / Dossier
                  Pays-Bas ». La destination suffit à dire sur quoi porte
                  l'achat. */}
              {recu.dossier ? (
                <span className="text-pretty text-14 text-ink-500">
                  {recu.dossier.pays} — {recu.dossier.intitule}
                </span>
              ) : null}
            </span>
            <span className="flex-none text-16 font-medium text-ink-900">{montant}</span>
          </div>
          <div className="flex justify-between gap-4 text-14">
            <span className="text-ink-500">Frais de service</span>
            <span className="text-ink-900">{formatMontant(0, recu.devise)}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 bg-ink-100 p-5">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-16 font-semibold text-ink-900">
              {recu.etat === "rembourse" ? "Total remboursé" : "Total payé"}
            </span>
            <span className="text-24 font-semibold text-ink-900">{montant}</span>
          </div>
        </div>
      </article>

      <p className="text-14 text-ink-700">{EMETTEUR}</p>
      {recu.etat === "rembourse" ? (
        <p className="text-pretty text-13 text-ink-700">
          {mentionRembourse(momentEnFrancais(recu.rembourseLe ?? recu.le))}
        </p>
      ) : null}
      <p className="text-pretty text-13 text-ink-500">{MENTION_ATTESTATION}</p>

      {echec ? <BlocEchec echec={echec} annonce className="pas-a-imprimer" /> : null}

      <div className="pas-a-imprimer flex flex-col gap-3">
        {/* Empilés sous 640 px : côte à côte, « Renvoyer par email » passe
            sur deux lignes et le bouton dépasse la hauteur d'action de la
            bibliothèque. L'action principale reste la première atteinte. */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button pleineLargeur onClick={() => window.print()}>
            Imprimer
          </Button>
          <Button
            variante="secondaire"
            pleineLargeur
            chargement={envoi}
            disabled={recu.etat === "rembourse"}
            raisonDesactivation={RAISON_RENVOI_FERME}
            onClick={() => void renvoyer()}
          >
            Renvoyer par email
          </Button>
        </div>
        {envoyeA ? (
          <p aria-live="polite" className="text-center text-13 text-ink-500">
            {confirmationDeRenvoi(envoyeA)}
          </p>
        ) : null}
        <p className="text-pretty text-center text-13 text-ink-500">{MENTION_PDF}</p>
      </div>
    </div>
  );
}
