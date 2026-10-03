"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { CHAMP_CONTROLE } from "@/components/ui/champ";
import { appeler } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { EchecCandidat } from "@/server/http/echecs";
import { momentEnFrancais } from "@/domain/format/moment";

export interface RelectureDemandee {
  id: string;
  dossierId: string;
  candidat: string;
  pays: string;
  explication: string;
  demandeeLe: string;
}

/**
 * B-05 — Relectures de la complétude demandées par les candidats (avis
 * juridique L.A, 03/10/2026). Le relecteur — le responsable de la revue
 * manuelle — relit l'évaluation et répond : la réponse part dans les
 * alertes du candidat, et au journal comme motif.
 */
export function RelecturesDeLaCompletude({ demandes }: { demandes: readonly RelectureDemandee[] }) {
  return (
    <section aria-labelledby="relectures-completude" className="flex flex-col gap-3">
      <h2 id="relectures-completude" className="text-19 font-semibold text-ink-900">
        Relectures de la complétude demandées
      </h2>
      {demandes.length === 0 ? (
        <p className="text-pretty text-14 text-ink-700">
          Aucune demande de relecture en attente.
        </p>
      ) : (
        demandes.map((d) => <Demande key={d.id} demande={d} />)
      )}
    </section>
  );
}

function Demande({ demande }: { demande: RelectureDemandee }) {
  const router = useRouter();
  const [reponse, setReponse] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const idReponse = useId();
  const manque =
    reponse.trim().length < 20
      ? "Dis au candidat ce que la relecture a établi, et ce qu'il peut faire ensuite."
      : null;

  async function repondre() {
    setEnvoi(true);
    setEchec(null);
    const resultat = await appeler(`/api/admin/completude/relectures/${demande.id}`, {
      corps: { reponse },
    });
    setEnvoi(false);
    if (resultat.ok) {
      router.refresh();
      return;
    }
    setEchec(resultat.echec);
  }

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-ink-300 p-4">
      <div className="flex flex-col gap-1">
        <p className="text-14 font-semibold text-ink-900">
          {demande.candidat} · {demande.pays}
        </p>
        <p className="text-13 text-ink-500">
          Demandée le {momentEnFrancais(demande.demandeeLe)} · dossier{" "}
          <span className="font-mono">{demande.dossierId}</span>
        </p>
      </div>
      <blockquote className="text-pretty rounded-md bg-ink-100 p-3 text-14 text-ink-700">
        {demande.explication}
      </blockquote>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={idReponse} className="text-14 font-medium text-ink-900">
          Réponse au candidat
        </label>
        <textarea
          id={idReponse}
          rows={3}
          value={reponse}
          onChange={(e) => setReponse(e.target.value)}
          aria-describedby={`${idReponse}-aide`}
          className={cn(CHAMP_CONTROLE, "h-auto py-2.5")}
        />
        <span id={`${idReponse}-aide`} className="text-13 text-ink-500">
          {echec?.champs?.reponse ??
            "Elle part dans les alertes du candidat. Ni promesse sur la décision, ni note sur cent."}
        </span>
      </div>
      {echec && !echec.champs ? <BlocEchec echec={echec} annonce /> : null}
      <Button
        className="md:w-auto md:self-start"
        disabled={manque !== null}
        chargement={envoi}
        raisonDesactivation={manque ?? undefined}
        onClick={() => void repondre()}
      >
        Répondre
      </Button>
    </article>
  );
}
