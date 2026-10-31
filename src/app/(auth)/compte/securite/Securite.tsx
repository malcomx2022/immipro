"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import type { EtatDeSecurite } from "@/server/acces/profil";
import { momentEnFrancais } from "@/domain/format/moment";

/**
 * « Sécurité » — S.208.
 *
 * Trois sections, et une absence dite comme telle :
 *
 * - le mot de passe se change par un code envoyé à l'adresse du compte
 *   (`/mot-de-passe`) — le changement ferme toutes les sessions ;
 * - les sessions ouvertes, et un bouton qui les ferme toutes, celle-ci
 *   comprise : le geste de qui a oublié sa session sur un poste partagé ;
 * - la double authentification **n'existe pas encore**. L'écran le dit,
 *   sans interrupteur : un réglage qui ne règle rien serait une promesse.
 */
export interface SecuriteProps {
  email: string;
  etat: EtatDeSecurite;
  retour: string;
}

export function Securite({ email, etat, retour }: SecuriteProps) {
  const router = useRouter();
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const [confirmer, setConfirmer] = useState(false);

  async function fermerTout() {
    setEnvoi(true);
    setEchec(null);
    const resultat = await appeler<{ sessionsFermees: number }>("/api/comptes/sessions", {
      methode: "POST",
    });
    setEnvoi(false);
    if (!resultat.ok) {
      setEchec(resultat.echec);
      return;
    }
    // La session de cet onglet est fermée aussi : la suite est la connexion.
    router.push("/connexion");
  }

  return (
    <div className="mx-auto flex w-full max-w-reglages flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <Link href={retour} className="text-14 font-semibold text-ink-900">
        {retour === "/mon-compte" ? "Revenir à mon compte interne" : "Revenir à mon compte"}
      </Link>

      <div className="flex flex-col gap-2">
        <h1
          id="contenu"
          tabIndex={-1}
          className="text-pretty text-24 font-semibold text-ink-900 outline-none md:text-32"
        >
          Sécurité du compte
        </h1>
        <p className="break-all text-16 text-ink-700">{email}</p>
      </div>

      <section className="flex flex-col gap-2 border-t border-ink-300 pt-5">
        <h2 className="text-16 font-semibold text-ink-900">Mot de passe</h2>
        <p className="text-pretty text-14 text-ink-700">
          Un code à six chiffres part à ton adresse ; tu choisis ensuite le nouveau mot de passe.
          Toutes tes sessions se ferment, y compris celle-ci.
        </p>
        <Link href="/mot-de-passe" className="text-14 font-semibold text-ink-900">
          Changer mon mot de passe
        </Link>
      </section>

      <section className="flex flex-col gap-3 border-t border-ink-300 pt-5">
        <h2 className="text-16 font-semibold text-ink-900">Sessions ouvertes</h2>
        {etat.plusRecente ? (
          <p className="text-pretty text-14 text-ink-700">
            {etat.sessions > 1 ? `${etat.sessions} sessions ouvertes.` : "Une session ouverte."}{" "}
            {`La plus récente date du ${momentEnFrancais(etat.plusRecente.ouverteLe)}, active le ${momentEnFrancais(etat.plusRecente.vueLe)}.`}
          </p>
        ) : (
          <p className="text-pretty text-14 text-ink-700">Aucune autre session ouverte.</p>
        )}
        {echec ? <BlocEchec echec={echec} annonce /> : null}
        {confirmer ? (
          <div className="flex flex-col gap-2 rounded-md border border-ink-300 bg-ink-100 p-3">
            <p className="text-pretty text-14 text-ink-900">
              Toutes tes sessions vont se fermer, y compris celle-ci. Tu devras te reconnecter.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variante="secondaire"
                disabled={envoi}
                raisonDesactivation="Fermeture en cours."
                onClick={() => void fermerTout()}
              >
                {envoi ? "Fermeture…" : "Confirmer la fermeture"}
              </Button>
              <Button variante="tertiaire" disabled={envoi} onClick={() => setConfirmer(false)}>
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <Button variante="secondaire" onClick={() => setConfirmer(true)}>
            Fermer toutes mes sessions
          </Button>
        )}
      </section>

      <section className="flex flex-col gap-2 border-t border-ink-300 pt-5">
        <h2 className="text-16 font-semibold text-ink-900">Double authentification</h2>
        <p className="text-pretty text-14 text-ink-700">
          Pas encore disponible. Ton compte est protégé par ton mot de passe, le blocage après
          cinq essais faux et la fermeture des sessions à chaque changement de mot de passe.
        </p>
      </section>
    </div>
  );
}
