"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { CHAMP_CONTROLE } from "@/components/ui/champ";
import { appeler } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { EchecCandidat } from "@/server/http/echecs";
import {
  AIDE_EXPLICATION,
  INVITATION_RELECTURE,
  MENTION_EN_ATTENTE,
  refusDeLaDemande,
} from "@/domain/completeness/relecture";
import type { EtatDeLaRelecture } from "@/server/dossiers/relecture-completude";

/**
 * Demander une relecture humaine de la complétude — avis juridique L.A du
 * 03/10/2026. La pondération du calcul n'est pas exposée ; l'avis l'admet
 * parce qu'une personne peut relire l'évaluation à la demande du candidat.
 * Même geste que la correction de la date de dépôt : on demande, avec ce
 * qui semble inexact, et la réponse arrive dans les alertes.
 */
export function RelectureDeLaCompletude({
  dossierId,
  relecture,
}: {
  dossierId: string;
  relecture: EtatDeLaRelecture;
}) {
  const router = useRouter();
  const [ouverte, setOuverte] = useState(false);
  const [explication, setExplication] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const [envoyee, setEnvoyee] = useState(false);
  const idExplication = useId();

  async function envoyer() {
    setEnvoi(true);
    setEchec(null);
    const resultat = await appeler(`/api/dossiers/${dossierId}/completude/relecture`, {
      corps: { explication },
    });
    setEnvoi(false);
    if (resultat.ok) {
      setEnvoyee(true);
      router.refresh();
      return;
    }
    // Rien n'est perdu : l'explication reste saisie.
    setEchec(resultat.echec);
  }

  const manque = refusDeLaDemande(explication);

  return (
    <section aria-labelledby="relecture-completude" className="flex flex-col gap-2">
      <h2 id="relecture-completude" className="text-16 font-semibold text-ink-900">
        Relecture humaine
      </h2>
      <p className="text-pretty text-13 text-ink-700">{INVITATION_RELECTURE}</p>

      {relecture.etat === "traitee" && !envoyee ? (
        <div className="flex flex-col gap-1 rounded-md bg-ink-100 p-3.5">
          <p className="text-13 font-semibold text-ink-900">Réponse à ta dernière demande</p>
          <p className="text-pretty text-14 text-ink-700">{relecture.reponse}</p>
        </div>
      ) : null}

      {relecture.etat === "en_attente" || envoyee ? (
        <p role="status" className="text-pretty text-13 text-ink-700">
          {MENTION_EN_ATTENTE}
        </p>
      ) : !ouverte ? (
        <button
          type="button"
          onClick={() => setOuverte(true)}
          className="flex min-h-touch items-center self-start text-14 font-medium text-accent-600"
        >
          Demander une relecture
        </button>
      ) : (
        <div className="flex flex-col gap-3 border-t border-ink-300 pt-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={idExplication} className="text-14 font-medium text-ink-900">
              Qu&apos;est-ce qui te semble inexact ?
            </label>
            <textarea
              id={idExplication}
              rows={3}
              value={explication}
              onChange={(e) => setExplication(e.target.value)}
              aria-describedby={`${idExplication}-aide`}
              className={cn(CHAMP_CONTROLE, "h-auto py-2.5")}
            />
            <span id={`${idExplication}-aide`} className="text-13 text-ink-500">
              {echec?.champs?.explication ?? AIDE_EXPLICATION}
            </span>
          </div>
          {echec && !echec.champs ? <BlocEchec echec={echec} annonce /> : null}
          <Button
            variante="secondaire"
            className="md:w-auto md:self-start"
            disabled={manque !== null}
            chargement={envoi}
            raisonDesactivation={manque ?? undefined}
            onClick={() => void envoyer()}
          >
            Envoyer la demande
          </Button>
        </div>
      )}
    </section>
  );
}
