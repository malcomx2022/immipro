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
  LIBELLE_LIEN_AVANT_SUPPRESSION,
  LIEN_AVANT_SUPPRESSION,
} from "@/domain/comptes/suppression";
import { MENTION_DELAI_REMBOURSEMENT } from "@/domain/consultants/annulation";

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
 *
 * **Pas de `<form>` ici** (D-16 du 08/10/2026). Les écrans de saisie sont
 * devenus des formulaires, où Entrée envoie (revue du 07/10/2026, M11).
 * Celui-ci ne l'est pas : Entrée dans le champ du mot de passe ne supprime
 * rien. Un geste irréversible se fait sur son bouton, lu et visé — comme le
 * paiement du récapitulatif. `tests/formulaires.test.ts` y veille.
 */
export interface SuppressionDuCompteProps {
  email: string;
  /**
   * Ce qui arrive aux rendez-vous à venir (K.C), une phrase par cas. Vide
   * quand il n'y en a aucun : un encadré vide sur un écran de suppression
   * inquiéterait pour rien.
   *
   * Un paragraphe par cas, et non une phrase continue : les deux se
   * lisaient à la suite, et celui qui coûte de l'argent passait pour la
   * fin de celui qui n'en coûte pas.
   */
  avertissementRendezVous?: readonly string[];
  /** Vrai dès qu'au moins un remboursement s'ouvrira. */
  remboursementAttendu?: boolean;
}

export function SuppressionDuCompte({
  email,
  avertissementRendezVous = [],
  remboursementAttendu = false,
}: SuppressionDuCompteProps) {
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
      <div className="mx-auto flex w-full max-w-reglages flex-col gap-4 px-4 py-6 md:px-8 md:py-10">
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
    <div className="mx-auto flex w-full max-w-reglages flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
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
        <Link
          href={LIEN_AVANT_SUPPRESSION}
          className="flex min-h-touch items-center text-14 font-medium text-accent-600"
        >
          {LIBELLE_LIEN_AVANT_SUPPRESSION}
        </Link>
      </section>

      {/* K.C — les rendez-vous, entre « ce qui reste » et l'avertissement
          d'irréversibilité : c'est la dernière conséquence à connaître, et
          la seule qui coûte de l'argent. La suppression du compte n'annule
          pas les conditions commerciales acceptées à la réservation. */}
      {avertissementRendezVous.length > 0 ? (
        <section className="flex flex-col gap-2 rounded-lg border border-ink-300 p-4">
          <h2 className="text-16 font-semibold text-ink-900">Tes rendez-vous à venir</h2>
          {avertissementRendezVous.map((phrase) => (
            <p key={phrase} className="text-pretty text-14 text-ink-700">
              {phrase}
            </p>
          ))}
          {remboursementAttendu ? (
            <p className="text-pretty text-13 text-ink-500">{MENTION_DELAI_REMBOURSEMENT}</p>
          ) : null}
        </section>
      ) : null}

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
