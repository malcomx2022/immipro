"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CHAMP_CONTROLE } from "@/components/ui/champ";
import { appeler } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { EchecCandidat } from "@/server/http/echecs";
import {
  AIDE_DEMANDE_DE_CORRECTION,
  demandeEnAttente,
  refusDeLExplication,
} from "@/domain/dossiers/depot";

/**
 * « La date de ton dépôt est fausse ? » — arbitrage S.90.
 *
 * La date déclarée ne se modifie pas depuis le dossier : elle commande la
 * conservation et les relances, et sa correction est une action auditée.
 * Le candidat la **signale** ici, avec la bonne date et d'où vient
 * l'erreur. L'écran dit ensuite que la demande attend, et que la date
 * affichée reste la déclarée d'ici là — pas qu'elle a changé.
 *
 * Replié par défaut : c'est un recours, pas une étape du parcours.
 */
export function DemandeDeCorrection({
  dossierId,
  deposeLe,
  enAttente,
}: {
  dossierId: string;
  deposeLe: string;
  enAttente: { deposeLe: string; demandeeLe: string } | null;
}) {
  const router = useRouter();
  const [ouverte, setOuverte] = useState(false);
  const [date, setDate] = useState(deposeLe);
  const [explication, setExplication] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const [envoyee, setEnvoyee] = useState<string | null>(null);
  const idExplication = useId();

  if (enAttente || envoyee) {
    return (
      <p role="status" className="text-pretty text-13 text-ink-700">
        {envoyee ?? demandeEnAttente(enAttente!.deposeLe, enAttente!.demandeeLe)}
      </p>
    );
  }

  if (!ouverte) {
    return (
      <button
        type="button"
        onClick={() => setOuverte(true)}
        className="flex min-h-touch items-center self-start text-14 font-medium text-accent-600"
      >
        La date de ton dépôt est fausse ?
      </button>
    );
  }

  const manque =
    date === deposeLe
      ? "Choisis la bonne date : elle est identique à celle enregistrée."
      : refusDeLExplication(explication);

  async function envoyer() {
    if (manque !== null || envoi) return;
    setEnvoi(true);
    setEchec(null);
    const resultat = await appeler<{ message: string }>(
      `/api/dossiers/${dossierId}/depot/correction`,
      { corps: { deposeLe: date, explication } },
    );
    setEnvoi(false);
    if (resultat.ok) {
      setEnvoyee(resultat.donnees.message);
      router.refresh();
      return;
    }
    // Rien n'est perdu : la date et l'explication restent saisies.
    setEchec(resultat.echec);
  }

  return (
    // Un formulaire (revue du 07/10/2026, M11) : Entrée dans la date envoie,
    // Entrée dans l'explication va à la ligne, comme dans tout `textarea`.
    <form
      noValidate
      aria-label="Corriger la date du dépôt"
      onSubmit={(e) => {
        e.preventDefault();
        void envoyer();
      }}
      className="flex flex-col gap-3 border-t border-ink-300 pt-3"
    >
      <p className="text-pretty text-13 text-ink-700">{AIDE_DEMANDE_DE_CORRECTION}</p>
      <Input
        type="date"
        name="deposeLe"
        libelle="Date réelle de ton dépôt"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        erreur={echec?.champs?.deposeLe}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={idExplication} className="text-14 font-medium text-ink-900">
          D&apos;où vient l&apos;erreur ?
        </label>
        <textarea
          id={idExplication}
          name="explication"
          rows={3}
          value={explication}
          onChange={(e) => setExplication(e.target.value)}
          aria-describedby={`${idExplication}-aide`}
          className={cn(CHAMP_CONTROLE, "h-auto py-2.5")}
        />
        <span id={`${idExplication}-aide`} className="text-13 text-ink-500">
          {echec?.champs?.explication ??
            "Par exemple : la date qui figure sur ton récépissé de dépôt."}
        </span>
      </div>
      {echec && !echec.champs ? <BlocEchec echec={echec} annonce /> : null}
      <Button
        type="submit"
        variante="secondaire"
        className="md:w-auto md:self-start"
        disabled={manque !== null}
        chargement={envoi}
        raisonDesactivation={manque ?? undefined}
      >
        Demander la correction
      </Button>
    </form>
  );
}
