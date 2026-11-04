"use client";

import { useState } from "react";
import { HORS_LIGNE, appeler } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Se déconnecter — S.212.
 *
 * La route `DELETE /api/comptes/session` existait depuis WF-02 (la ligne de
 * session est supprimée, pas seulement le cookie), mais aucun écran ne
 * l'appelait : ni l'espace candidat ni le back-office n'avaient de bouton,
 * et la seule façon de sortir était d'attendre l'échéance de la session ou
 * de vider ses cookies — sur un poste partagé, c'est la session oubliée.
 *
 * Après l'appel, la page de connexion est rechargée **en entier**, et non
 * atteinte par une navigation interne : le routeur de Next garde en mémoire
 * les gabarits déjà affichés, et un écran du compte précédent survivrait
 * à la session qu'on vient de fermer.
 *
 * Une session déjà échue répond 401 : on est déjà dehors, on va à la
 * connexion. Seule une coupure réseau retient l'écran, avec quoi faire.
 */
export function BoutonDeconnexion({ className }: { className?: string }) {
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<string | null>(null);

  async function sortir() {
    if (envoi) return;
    setEnvoi(true);
    setEchec(null);
    const resultat = await appeler<void>("/api/comptes/session", { methode: "DELETE" });
    if (!resultat.ok && resultat.echec === HORS_LIGNE) {
      setEnvoi(false);
      setEchec("La déconnexion n'est pas partie : vérifie ta connexion internet, puis réessaie.");
      return;
    }
    window.location.replace("/connexion");
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => void sortir()}
        disabled={envoi}
        className={cn(
          "flex min-h-touch items-center rounded-sm px-3 text-left text-14 text-ink-700 hover:bg-ink-100 disabled:cursor-not-allowed disabled:text-ink-500",
          className,
        )}
      >
        {envoi ? "Déconnexion…" : "Se déconnecter"}
      </button>
      {echec ? (
        <p role="alert" className="text-pretty px-3 text-13 text-danger">
          {echec}
        </p>
      ) : null}
    </div>
  );
}
