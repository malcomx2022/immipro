"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { telechargerFichier } from "@/lib/telechargement";
import type { EchecCandidat } from "@/server/http/echecs";
import {
  JOURS_MAXIMUM,
  MENTION_COUT_RECALCULE,
  MENTION_SANS_DONNEE_CANDIDAT_EXPORT,
  nomDesAppels,
  obstacleALaPeriode,
} from "@/domain/backoffice/appels-ia";

/**
 * « Exporter le détail des appels » — B-07, WF-16.
 *
 * Le bouton était retiré : aucun écrivain de fichier n'existait. Il revient
 * avec ce que sa première version ne pouvait pas dire — la période, et ce
 * que le fichier contient. La période vient avec l'écran (la fenêtre de
 * l'histogramme) et se change ici : on exporte ce qu'on regarde, ou autre
 * chose, mais jamais sans savoir quoi.
 *
 * Un obstacle de période se dit avant l'envoi, avec ce qu'il faut faire ;
 * le serveur le redit, car c'est lui qui borne.
 */
export function ExportDesAppels({ duParDefaut, auParDefaut }: { duParDefaut: string; auParDefaut: string }) {
  const [du, setDu] = useState(duParDefaut);
  const [au, setAu] = useState(auParDefaut);
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);

  const obstacle = obstacleALaPeriode({ du, au });

  async function exporter() {
    if (obstacle) return;
    setEnvoi(true);
    setEchec(null);
    const parametres = new URLSearchParams({ du, au });
    const resultat = await telechargerFichier(
      `/api/admin/couts-ia/export?${parametres.toString()}`,
      nomDesAppels({ du, au }),
    );
    setEnvoi(false);
    if (!resultat.ok) setEchec(resultat.echec);
  }

  return (
    <section
      aria-labelledby="export-appels"
      className="flex flex-col gap-3 rounded-lg border border-ink-300 bg-white p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id="export-appels" className="text-16 font-semibold text-ink-900">
          Exporter le détail des appels
        </h2>
        <p className="max-w-lecture-large text-pretty text-13 text-ink-500">
          Un fichier CSV, une ligne par appel : fournisseur, modèle, jetons d&apos;entrée et de
          sortie, coût, moment, référence du dossier. Période de {JOURS_MAXIMUM} jours au plus.
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <Input
          libelle="Du"
          type="date"
          value={du}
          onChange={(e) => setDu(e.target.value)}
          disabled={envoi}
        />
        <Input
          libelle="Au"
          type="date"
          value={au}
          onChange={(e) => setAu(e.target.value)}
          disabled={envoi}
        />
        <div className="self-end">
          <Button
            variante="secondaire"
            disabled={envoi || obstacle !== null}
            raisonDesactivation={envoi ? "Préparation du fichier en cours." : (obstacle ?? "")}
            onClick={exporter}
          >
            {envoi ? "Préparation…" : "Exporter le détail des appels"}
          </Button>
        </div>
      </div>

      {echec ? <BlocEchec echec={echec} annonce /> : null}

      <p className="max-w-lecture-large text-pretty text-13 text-ink-500">
        {MENTION_SANS_DONNEE_CANDIDAT_EXPORT} {MENTION_COUT_RECALCULE}
      </p>
    </section>
  );
}
