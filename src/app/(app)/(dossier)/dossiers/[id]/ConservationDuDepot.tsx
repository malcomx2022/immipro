"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { appeler } from "@/lib/api";
import type { EchecCandidat } from "@/server/http/echecs";
import type { ConservationDuDepot as Conservation } from "@/domain/dossiers/dossier";
import { PROLONGATION_MOIS } from "@/domain/dossiers/conservation";
import { jourEnFrancais } from "@/domain/format/moment";
import { DemandeDeCorrection } from "./DemandeDeCorrection";

/**
 * La conservation des pièces d'un dossier déposé — arbitrage S.78.
 *
 * Trois états, et chacun dit ce qui se passe et ce qui reste à faire :
 * pièces conservées jusqu'à une date, purge annoncée, pièces supprimées.
 * Le bouton n'apparaît que lorsque la confirmation est ouverte ; avant, la
 * date à laquelle elle le sera est écrite, et rien ne se désactive sans
 * raison.
 *
 * Aucune phrase ne suppose l'issue de l'instruction (INV-1, INV-2) : la
 * plateforme ne sait pas si l'autorité a répondu, c'est au candidat de le
 * dire.
 */
export function ConservationDuDepot({
  dossierId,
  conservation,
}: {
  dossierId: string;
  conservation: Conservation;
}) {
  const router = useRouter();
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const [confirmee, setConfirmee] = useState<string | null>(null);

  async function confirmer() {
    setEnvoi(true);
    setEchec(null);
    const resultat = await appeler<{ piecesConserveesJusquAu: string }>(
      `/api/dossiers/${dossierId}/conservation`,
      { corps: {} },
    );
    setEnvoi(false);
    if (resultat.ok) {
      setConfirmee(resultat.donnees.piecesConserveesJusquAu.slice(0, 10));
      router.refresh();
      return;
    }
    setEchec(resultat.echec);
  }

  if (conservation.purgeeLe) {
    return (
      <section className="flex flex-col gap-1 rounded-lg border border-ink-300 p-5">
        <h2 className="text-16 font-semibold text-ink-900">Pièces supprimées</h2>
        <p className="text-pretty text-14 text-ink-700">
          Les pièces de ce dossier ont été supprimées le{" "}
          {jourEnFrancais(conservation.purgeeLe)}. Le dossier, ses verdicts et son
          historique restent consultables.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-ink-300 p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-16 font-semibold text-ink-900">Conservation de tes pièces</h2>
        {/* S.89 — la date réelle du dépôt commande la suite : elle se lit
            avant l'échéance qu'elle fixe, avec la prochaine question. */}
        {conservation.deposeLe ? (
          <>
            <p className="text-pretty text-14 text-ink-700">
              {`Demande déposée le ${jourEnFrancais(conservation.deposeLe)}.`}
              {conservation.prochaineQuestion
                ? ` Le ${jourEnFrancais(conservation.prochaineQuestion)}, nous te demanderons si l'autorité t'a répondu.`
                : ""}
            </p>
            <DemandeDeCorrection
              dossierId={dossierId}
              deposeLe={conservation.deposeLe}
              enAttente={conservation.correctionDemandee ?? null}
            />
          </>
        ) : null}
        <p className="text-pretty text-14 text-ink-700" role="status">
          {confirmee
            ? `C'est noté : tes pièces sont conservées jusqu'au ${jourEnFrancais(confirmee)}.`
            : conservation.purgeLe
              ? `Tes pièces seront supprimées le ${jourEnFrancais(conservation.purgeLe)}. Si ta demande est toujours à l'instruction, confirme-le : la suppression sera annulée et tes pièces conservées ${PROLONGATION_MOIS} mois de plus.`
              : `Tes pièces sont conservées jusqu'au ${jourEnFrancais(conservation.jusquAu)}, douze mois après ton dépôt. Si l'instruction se poursuit au-delà, tu pourras le confirmer à partir du ${jourEnFrancais(conservation.confirmableLe)} : elles seront conservées ${PROLONGATION_MOIS} mois de plus.`}
        </p>
      </div>
      {echec ? <BlocEchec echec={echec} /> : null}
      {conservation.confirmable && !confirmee ? (
        <Button
          pleineLargeur
          chargement={envoi}
          onClick={confirmer}
          className="min-h-action md:w-auto md:self-start"
        >
          L&apos;instruction continue
        </Button>
      ) : null}
    </section>
  );
}
