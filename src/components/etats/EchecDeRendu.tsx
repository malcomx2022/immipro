"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { EtatDEcran } from "@/components/ui/EtatDEcran";
import {
  ECRAN_HORS_LIGNE,
  SORTIE_DE_L_ESPACE,
  pageEnEchec,
  type Espace,
} from "@/domain/etats/ecrans";

/**
 * Ce que rend chaque `error.tsx` — revue du 07/10/2026, E8.
 *
 * Le journal ne reçoit que l'espace et le `digest` : jamais `error.message`
 * ni la pile. En production, Next remplace déjà le message d'une erreur
 * serveur ; mais une erreur levée dans le navigateur arrive entière, et
 * peut porter une requête, une adresse ou une donnée du candidat. Le
 * `digest` suffit à retrouver la trace côté serveur.
 *
 * « Réessayer » rafraîchit d'abord les composants serveur, puis efface la
 * frontière : `reset()` seul rejouerait le rendu client avec les mêmes
 * données serveur, celles qui ont échoué.
 *
 * Hors connexion, l'écran le dit : « la plateforme a échoué » serait faux,
 * et ferait attendre une réparation qui ne viendra pas.
 */
export interface EchecDeRenduProps {
  espace: Espace;
  error: Error & { digest?: string };
  reset: () => void;
}

export function EchecDeRendu({ espace, error, reset }: EchecDeRenduProps) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [horsLigne, setHorsLigne] = useState(false);

  useEffect(() => {
    console.error("[rendu]", { espace, digest: error.digest });
  }, [espace, error.digest]);

  useEffect(() => {
    const relire = () => setHorsLigne(!navigator.onLine);
    relire();
    window.addEventListener("online", relire);
    window.addEventListener("offline", relire);
    return () => {
      window.removeEventListener("online", relire);
      window.removeEventListener("offline", relire);
    };
  }, []);

  const etat = horsLigne ? ECRAN_HORS_LIGNE : pageEnEchec(espace);
  const sortie = SORTIE_DE_L_ESPACE[espace];

  return (
    <EtatDEcran
      etat={etat}
      illustration={horsLigne ? "hors-ligne" : "erreur"}
      action={
        <Button
          chargement={enCours}
          className="w-full"
          onClick={() =>
            demarrer(() => {
              router.refresh();
              reset();
            })
          }
        >
          {etat.action}
        </Button>
      }
      sortie={
        <Link
          href={sortie.href}
          className="flex min-h-touch items-center justify-center text-14 text-ink-700"
        >
          {sortie.libelle}
        </Link>
      }
    >
      {/* Au back-office seulement (règle 3) : de quoi retrouver la trace serveur. */}
      {espace === "backoffice" && error.digest ? (
        <p className="text-center text-13 text-ink-500">
          Trace <span className="font-mono text-ink-700">{error.digest}</span>
        </p>
      ) : null}
    </EtatDEcran>
  );
}
