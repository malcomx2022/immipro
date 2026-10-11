"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/domain/echecs/catalogue";
import {
  RELECTURE_EN_COURS,
  RELECTURE_REMPLACEE,
  RELECTURE_INTERROMPUE,
} from "@/domain/redaction/relecture-reservation";
import { issueDeLaRelecture } from "@/domain/redaction/issues";

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
export function LancerLAnalyse({
  dossierId,
  type,
  analyseEnCours = false,
}: {
  dossierId: string;
  type: string;
  analyseEnCours?: boolean;
}) {
  const router = useRouter();
  const [envoi, setEnvoi] = useState(false);
  const [attente, setAttente] = useState<string | null>(null);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const [sansAvis, setSansAvis] = useState<EchecCandidat | null>(null);

  async function lancer() {
    setEnvoi(true);
    setEchec(null);
    setSansAvis(null);
    const resultat = await appeler<{
      relue: boolean;
      disponible: boolean;
      enCours?: boolean;
      motif?: string | null;
    }>(`/api/dossiers/${dossierId}/redaction/${type}/relecture`, { corps: {} });
    if (!resultat.ok) {
      setEnvoi(false);
      setEchec(resultat.echec);
      return;
    }
    if (
      resultat.donnees.enCours ||
      resultat.donnees.motif === "version_remplacee" ||
      resultat.donnees.motif === "relecture_interrompue"
    ) {
      setEnvoi(false);
      setAttente(
        resultat.donnees.enCours
          ? RELECTURE_EN_COURS
          : resultat.donnees.motif === "version_remplacee"
            ? RELECTURE_REMPLACEE
            : RELECTURE_INTERROMPUE,
      );
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
      // Rien rendu, ou une remarque écartée parce qu'elle promettait (M7).
      setSansAvis(issueDeLaRelecture(resultat.donnees));
      return;
    }
    // Une nouvelle version peut apparaître au rafraîchissement et garder
    // ce composant monté : ne pas lui transmettre un chargement terminé.
    setEnvoi(false);
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
      {analyseEnCours || attente ? (
        <>
          <p role="status" className="max-w-lecture-large text-pretty text-14 text-ink-700">
            {attente ?? RELECTURE_EN_COURS}
          </p>
          <Button
            onClick={() => {
              setAttente(null);
              router.refresh();
            }}
            variante="secondaire"
            pleineLargeur
            className="md:w-auto"
          >
            Consulter le résultat
          </Button>
        </>
      ) : (
        <Button onClick={lancer} chargement={envoi} pleineLargeur className="md:w-auto">
          {envoi ? "Analyse en cours…" : "Lancer l'analyse"}
        </Button>
      )}
      {sansAvis ? <BlocEchec echec={sansAvis} /> : null}
      {echec ? <BlocEchec echec={echec} /> : null}
    </div>
  );
}
