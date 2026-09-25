"use client";

import { useId, useState } from "react";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CHAMP_CONTROLE } from "@/components/ui/champ";
import { appeler } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { EchecCandidat } from "@/server/http/echecs";
import type { DepotDeclare } from "@/domain/backoffice/comptes";
import { jourEnFrancais, momentEnFrancais } from "@/domain/format/moment";

/**
 * Correction de la date réelle d'un dépôt — B-03, arbitrage S.89.
 *
 * Les deux dates restent lisibles côte à côte : celle du dépôt, que le
 * candidat a déclarée, et celle où il l'a déclarée. C'est l'écart entre
 * les deux qui explique une déclaration tardive — et qui rend lisible une
 * demande de correction.
 *
 * Le motif est propre à cette action, et obligatoire : il part au journal
 * avec l'ancienne et la nouvelle valeur. Le bouton dit ce qui lui manque
 * tant qu'il est désactivé.
 */
export function CorrectionDuDepot({ depot }: { depot: DepotDeclare }) {
  const [deposeLe, setDeposeLe] = useState(depot.deposeLe);
  const [actuelle, setActuelle] = useState(depot.deposeLe);
  const [motif, setMotif] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);
  const [fait, setFait] = useState<string | null>(null);
  const [demande, setDemande] = useState(depot.demande ?? null);
  const [reponse, setReponse] = useState("");
  const [refus, setRefus] = useState(false);
  const idMotif = useId();
  const idReponse = useId();

  const manque =
    deposeLe === actuelle
      ? "Choisis la date corrigée : elle est identique à la date enregistrée."
      : motif.trim().length < 10
        ? "Écris le motif de la correction, en une phrase au moins."
        : null;

  async function corriger() {
    setEnvoi(true);
    setEchec(null);
    setFait(null);
    const resultat = await appeler<{ nouvelle: string; conservationJusquAu: string | null }>(
      `/api/admin/dossiers/${depot.dossierId}/depot`,
      { corps: { deposeLe, motif } },
    );
    setEnvoi(false);
    if (resultat.ok) {
      setActuelle(resultat.donnees.nouvelle);
      setMotif("");
      // La correction tranche la demande du candidat, s'il y en avait une.
      setDemande(null);
      setFait(
        `Date corrigée : ${jourEnFrancais(resultat.donnees.nouvelle)}.${
          resultat.donnees.conservationJusquAu
            ? ` Pièces conservées jusqu'au ${jourEnFrancais(resultat.donnees.conservationJusquAu.slice(0, 10))}.`
            : ""
        }`,
      );
      return;
    }
    setEchec(resultat.echec);
  }

  async function refuser() {
    if (!demande) return;
    setRefus(true);
    setEchec(null);
    setFait(null);
    const resultat = await appeler<{ statut: string }>(
      `/api/admin/depots/demandes/${demande.id}/refus`,
      { corps: { reponse } },
    );
    setRefus(false);
    if (resultat.ok) {
      setDemande(null);
      setReponse("");
      setFait("Demande non retenue : le candidat a reçu ta réponse dans ses alertes.");
      return;
    }
    setEchec(resultat.echec);
  }

  const manqueReponse =
    reponse.trim().length < 20
      ? "Écris la réponse au candidat : pourquoi la date reste inchangée, et ce qu'il peut fournir."
      : null;

  return (
    <div className="flex flex-col gap-2 border-t border-ink-300 pt-3">
      <p className="text-14 font-medium text-ink-900">{depot.destination}</p>
      <p className="text-13 text-ink-700">
        Déposé le {jourEnFrancais(actuelle)} · déclaré le {momentEnFrancais(depot.declareLe)}
      </p>
      {/* S.90 — la demande du candidat, avec ce qu'il en dit. La retenir,
          c'est appliquer la correction ci-dessous ; ne pas la retenir
          demande une réponse, qu'il lira. */}
      {demande ? (
        <div className="flex flex-col gap-2 rounded-md bg-ink-100 p-3">
          <p className="text-pretty text-13 text-ink-900">
            Demande du {momentEnFrancais(demande.demandeeLe)} : corriger au{" "}
            {jourEnFrancais(demande.deposeLe)}.
          </p>
          <p className="text-pretty text-13 text-ink-700">« {demande.explication} »</p>
          <Button variante="tertiaire" onClick={() => setDeposeLe(demande.deposeLe)}>
            Reprendre la date demandée
          </Button>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={idReponse} className="text-13 font-medium text-ink-900">
              Réponse au candidat, si la demande n&apos;est pas retenue
            </label>
            <textarea
              id={idReponse}
              rows={2}
              value={reponse}
              onChange={(e) => setReponse(e.target.value)}
              className={cn(CHAMP_CONTROLE, "h-auto py-2.5")}
            />
            {echec?.champs?.reponse ? (
              <span className="text-13 text-danger">{echec.champs.reponse}</span>
            ) : null}
          </div>
          <Button
            variante="secondaire"
            disabled={manqueReponse !== null}
            chargement={refus}
            raisonDesactivation={manqueReponse ?? undefined}
            onClick={() => void refuser()}
          >
            Ne pas retenir la demande
          </Button>
        </div>
      ) : null}
      <Input
        type="date"
        libelle="Date réelle du dépôt"
        value={deposeLe}
        onChange={(e) => setDeposeLe(e.target.value)}
        erreur={echec?.champs?.deposeLe}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={idMotif} className="text-14 font-medium text-ink-900">
          Motif de la correction
        </label>
        <textarea
          id={idMotif}
          rows={2}
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          className={cn(CHAMP_CONTROLE, "h-auto py-2.5")}
        />
      </div>
      {echec && !echec.champs ? <BlocEchec echec={echec} annonce /> : null}
      {fait ? (
        <p role="status" className="text-pretty text-13 text-ink-900">
          {fait}
        </p>
      ) : null}
      <Button
        variante="secondaire"
        pleineLargeur
        disabled={manque !== null}
        chargement={envoi}
        raisonDesactivation={manque ?? undefined}
        onClick={() => void corriger()}
      >
        Corriger la date du dépôt
      </Button>
    </div>
  );
}
