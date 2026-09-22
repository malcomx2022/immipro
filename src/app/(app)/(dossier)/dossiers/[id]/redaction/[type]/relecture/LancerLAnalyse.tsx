"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";

/**
 * Le seul geste de R-04 qui déclenche quelque chose — WF-08 étape 4.
 *
 * Il n'existait pas. L'écran portait un bouton « Voir l'analyse critique »
 * qui ouvrait une page lisant des remarques que rien ne produisait, et la
 * page elle-même n'offrait aucune action quand l'analyse manquait — avec
 * raison, puisqu'il n'y avait rien à lancer.
 *
 * L'analyse **débite une analyse du quota** (RG-08.4). Le libellé le dit
 * avant le clic : un geste qui coûte s'annonce, il ne se découvre pas au
 * compteur.
 */
export function LancerLAnalyse({ dossierId, type }: { dossierId: string; type: string }) {
  const router = useRouter();
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const [sansAvis, setSansAvis] = useState(false);

  async function lancer() {
    setEnvoi(true);
    setEchec(null);
    setSansAvis(false);
    const resultat = await appeler<{ relue: boolean; disponible: boolean }>(
      `/api/dossiers/${dossierId}/redaction/${type}/relecture`,
      { corps: {} },
    );
    if (!resultat.ok) {
      setEnvoi(false);
      setEchec(resultat.echec);
      return;
    }
    /*
      Le service était là et n'a rien rendu. Rien n'a été débité — la
      route rend l'analyse —, et rien n'est affiché comme un avis. Le
      dire est la seule issue honnête : recharger montrerait le même
      écran sans expliquer pourquoi.
    */
    if (!resultat.donnees.relue) {
      setEnvoi(false);
      setSansAvis(true);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {/*
        `chargement` et non `disabled` : le libellé reste lisible pendant
        l'appel, et le bouton annonce son activité aux lecteurs d'écran.
        Un bouton grisé et muet laisserait croire à une panne pendant les
        secondes que l'analyse prend.
      */}
      <Button onClick={lancer} chargement={envoi} pleineLargeur className="md:w-auto">
        {envoi ? "Analyse en cours…" : "Lancer l'analyse"}
      </Button>
      {sansAvis ? (
        <BlocEchec
          echec={{
            titre: "L'analyse n'a pas abouti",
            corps: "Le service n'a rien rendu cette fois. Ton texte n'a pas été analysé.",
            conserve: "Aucune analyse n'a été décomptée de ton quota, et ta version est intacte.",
            action: "Réessayer",
            ton: "attente",
          }}
        />
      ) : null}
      {echec ? <BlocEchec echec={echec} /> : null}
    </div>
  );
}
