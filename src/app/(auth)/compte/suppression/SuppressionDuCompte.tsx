"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { CHAMP_CONTROLE } from "@/components/ui/champ";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import {
  AIDE_CONFIRMATION,
  AVERTISSEMENT_IRREVERSIBLE,
  A_FAIRE_AVANT,
  CE_QUI_PART,
  CE_QUI_RESTE,
  LIBELLE_CONFIRMATION,
} from "@/domain/comptes/suppression";

/**
 * Suppression de compte — A-05, RG-10.4.
 *
 * L'écran est construit dans l'ordre des questions, et pas dans celui du
 * formulaire : ce qui part, ce qui reste, ce qu'il faut faire avant, puis
 * seulement la confirmation. Un écran qui demande le mot de passe en haut
 * fait confirmer avant d'avoir lu.
 *
 * « Ce qui reste » est écrit **avant** le bouton. Quelqu'un qui découvre
 * après coup qu'une trace subsiste a été trompé, même quand la trace est
 * légitime — et elle l'est : un reçu de paiement survit au compte, comme
 * C-11 l'annonce déjà à la clôture.
 *
 * Après coup, l'écran ne redirige pas tout de suite : il confirme. Un
 * renvoi immédiat vers l'accueil laisserait la personne se demander si le
 * geste a été fait.
 */
export function SuppressionDuCompte({ email }: { email: string }) {
  const [motDePasse, setMotDePasse] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [fait, setFait] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const idMotDePasse = useId();

  async function supprimer() {
    setEnvoi(true);
    setEchec(null);
    const resultat = await appeler<{ supprime: boolean }>("/api/comptes/suppression", {
      corps: { motDePasse },
    });
    setEnvoi(false);
    if (resultat.ok) {
      setMotDePasse("");
      setFait(true);
      return;
    }
    setEchec(resultat.echec);
  }

  if (fait) {
    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 py-6 md:px-8 md:py-10">
        <h1
          id="contenu"
          tabIndex={-1}
          aria-live="polite"
          className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          Ton compte est supprimé
        </h1>
        <p className="text-pretty text-16 text-ink-700">
          Tes pièces ont été supprimées de nos serveurs et ton nom a été effacé
          de nos bases. Tu es déconnecté de tous tes appareils.
        </p>
        <p className="text-pretty text-14 text-ink-700">
          Tu peux ouvrir un nouveau compte avec la même adresse quand tu veux.
          Il repartira de zéro.
        </p>
        <Link
          href="/"
          className="flex min-h-action items-center justify-center rounded-md bg-ink-900 px-4 text-16 font-medium text-white"
        >
          Revenir à l&apos;accueil
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          Supprimer mon compte
        </h1>
        <p className="text-pretty text-16 text-ink-700">
          Le compte {email}, ses dossiers et ses pièces.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-16 font-semibold text-ink-900">Ce qui est supprimé</h2>
        <ul className="flex flex-col gap-2">
          {CE_QUI_PART.map((ligne) => (
            <li key={ligne} className="flex items-start gap-2.5">
              <span aria-hidden="true" className="pt-2 text-ink-500">
                •
              </span>
              <span className="text-pretty text-14 text-ink-700">{ligne}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2 rounded-lg bg-ink-100 p-4">
        <h2 className="text-16 font-semibold text-ink-900">Ce qui reste, et pourquoi</h2>
        <ul className="flex flex-col gap-2">
          {CE_QUI_RESTE.map((ligne) => (
            <li key={ligne} className="flex items-start gap-2.5">
              <span aria-hidden="true" className="pt-2 text-ink-500">
                •
              </span>
              <span className="text-pretty text-14 text-ink-700">{ligne}</span>
            </li>
          ))}
        </ul>
        <p className="text-pretty pt-1 text-14 text-ink-700">{A_FAIRE_AVANT}</p>
      </section>

      <p className="text-pretty text-14 text-ink-700">{AVERTISSEMENT_IRREVERSIBLE}</p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={idMotDePasse} className="text-14 font-medium text-ink-900">
          {LIBELLE_CONFIRMATION}
        </label>
        <input
          id={idMotDePasse}
          type="password"
          autoComplete="current-password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          aria-describedby={`${idMotDePasse}-aide`}
          className={CHAMP_CONTROLE}
        />
        <span id={`${idMotDePasse}-aide`} className="text-13 text-ink-500">
          {AIDE_CONFIRMATION}
        </span>
      </div>

      <div className="flex flex-col gap-2 border-t border-ink-300 pt-4">
        {echec ? <BlocEchec echec={echec} annonce /> : null}
        <Button
          variante="destructif"
          pleineLargeur
          className="min-h-action"
          disabled={motDePasse.length === 0}
          chargement={envoi}
          raisonDesactivation="Saisis ton mot de passe pour confirmer la suppression."
          onClick={() => void supprimer()}
        >
          Supprimer définitivement mon compte
        </Button>
        <Link
          href="/consentements"
          className="flex min-h-touch items-center justify-center text-14 text-accent-600"
        >
          Annuler et revenir à mes autorisations
        </Link>
      </div>
    </div>
  );
}
