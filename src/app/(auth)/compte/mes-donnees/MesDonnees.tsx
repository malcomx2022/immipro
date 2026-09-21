"use client";

import Link from "next/link";
import { useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { telechargerFichier } from "@/lib/telechargement";
import type { EchecCandidat } from "@/server/http/echecs";
import {
  CE_QUE_CONTIENT,
  CE_QUE_NE_CONTIENT_PAS,
  MENTION_FORMAT,
  nomDuFichier,
} from "@/domain/comptes/portabilite";

/**
 * Mes données — A-05, WF-15.
 *
 * L'écran dit ce que contient l'export **et ce qu'il ne contient pas**,
 * avant le bouton. Découvrir après téléchargement que les pièces n'y sont
 * pas fait recommencer, et fait douter du reste du fichier.
 *
 * Le téléchargement ne passe pas par `appeler()` : celui-ci lit du JSON
 * pour un écran, or ici le succès est un fichier et l'échec seul est du
 * JSON. La distinction vit maintenant dans `telechargerFichier`, partagée
 * avec les deux exports du back-office — elle était traitée à la main ici,
 * et une troisième copie l'attendait. L'échec reste le contrat du serveur :
 * mêmes titres, mêmes actions.
 *
 * Le repli reste celui de cet écran-ci : il tutoie et parle de « ton
 * compte », là où le back-office vouvoie son opérateur.
 */
const REFUS_SANS_DETAIL: EchecCandidat = {
  titre: "L'export n'a pas pu être préparé",
  corps: "Le serveur a répondu quelque chose d'inattendu.",
  conserve: "Rien n'a changé sur ton compte.",
  action: "Réessayer",
  ton: "echec",
};
export interface MesDonneesProps {
  dossiers: readonly { id: string; pays: string; intitule: string }[];
}

export function MesDonnees({ dossiers }: MesDonneesProps) {
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const [fait, setFait] = useState(false);

  async function telecharger() {
    setEnvoi(true);
    setEchec(null);
    const resultat = await telechargerFichier(
      "/api/comptes/donnees",
      nomDuFichier(new Date().toISOString().slice(0, 10)),
      REFUS_SANS_DETAIL,
    );
    setEnvoi(false);
    if (!resultat.ok) {
      setEchec(resultat.echec);
      return;
    }
    setFait(true);
  }

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          Mes données
        </h1>
        <p className="text-pretty text-16 text-ink-700">
          Tout ce que ton compte contient, dans un fichier que tu gardes ou que
          tu donnes à un autre service.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-16 font-semibold text-ink-900">Ce que contient le fichier</h2>
        <ul className="flex flex-col gap-2">
          {CE_QUE_CONTIENT.map((ligne) => (
            <li key={ligne} className="flex items-start gap-2.5">
              <span aria-hidden="true" className="pt-2 text-ink-500">
                •
              </span>
              <span className="text-pretty text-14 text-ink-700">{ligne}</span>
            </li>
          ))}
        </ul>
        <p className="text-pretty pt-1 text-13 text-ink-500">{MENTION_FORMAT}</p>
      </section>

      <section className="flex flex-col gap-2 rounded-lg bg-ink-100 p-4">
        <h2 className="text-16 font-semibold text-ink-900">Ce qu&apos;il ne contient pas</h2>
        <ul className="flex flex-col gap-2">
          {CE_QUE_NE_CONTIENT_PAS.map((ligne) => (
            <li key={ligne} className="flex items-start gap-2.5">
              <span aria-hidden="true" className="pt-2 text-ink-500">
                •
              </span>
              <span className="text-pretty text-14 text-ink-700">{ligne}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-col gap-2">
        {echec ? <BlocEchec echec={echec} annonce /> : null}
        <Button
          pleineLargeur
          className="min-h-action"
          chargement={envoi}
          onClick={() => void telecharger()}
        >
          Télécharger mes données
        </Button>
        {fait ? (
          <p aria-live="polite" className="text-center text-13 text-ink-500">
            Le fichier est dans tes téléchargements.
          </p>
        ) : null}
      </div>

      <section className="flex flex-col gap-2 border-t border-ink-300 pt-4">
        <h2 className="text-16 font-semibold text-ink-900">Mes pièces, dossier par dossier</h2>
        {dossiers.length === 0 ? (
          <p className="text-pretty text-14 text-ink-700">
            Tu n&apos;as pas encore de dossier. Les pièces que tu téléverseras
            se retrouveront ici.
          </p>
        ) : (
          <ul className="flex flex-col">
            {dossiers.map((d) => (
              <li key={d.id} className="border-b border-ink-300 last:border-0">
                <Link
                  href={`/dossiers/${d.id}/archive`}
                  className="flex min-h-touch flex-col justify-center py-3"
                >
                  <span className="text-14 font-medium text-accent-600">{d.pays}</span>
                  <span className="text-pretty text-13 text-ink-500">{d.intitule}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link
        href="/consentements"
        className="flex min-h-touch items-center text-14 text-accent-600"
      >
        Revenir à mes autorisations
      </Link>
    </div>
  );
}
