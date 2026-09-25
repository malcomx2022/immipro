"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { BlocEchec } from "@/components/ui/BlocEchec";
import { Input } from "@/components/ui/Input";
import { appeler } from "@/lib/api";
import { formatMontant } from "@/lib/utils";
import { jourEnFrancais } from "@/domain/format/moment";
import {
  LIBELLE_ETAPE,
  consigneFedaPay,
  lireLaReferenceDeRemboursement,
  type DetteFedaPay,
} from "@/domain/paiement/remboursement";
import type { EchecCandidat } from "@/server/http/echecs";

/**
 * Les remboursements FedaPay à faire à la main — B-04, arbitrage S.91.
 *
 * FedaPay n'a pas d'API de remboursement. Chaque dette de ce rail attend
 * donc deux choses, dans cet ordre : un geste au tableau de bord du
 * fournisseur, puis sa notification signée. La liste montre les deux
 * étapes et ne retire une dette qu'à la seconde — une déclaration n'est
 * pas un versement (INV-7).
 */
export function RemboursementsFedaPay({ dettes }: { dettes: readonly DetteFedaPay[] }) {
  return (
    <section aria-labelledby="remboursements-fedapay" className="flex flex-col gap-3">
      <h2 id="remboursements-fedapay" className="text-19 font-semibold text-ink-900">
        Remboursements FedaPay à faire au tableau de bord
      </h2>
      {dettes.length === 0 ? (
        <p className="text-pretty text-14 text-ink-700">
          Aucun remboursement FedaPay en attente : toute somme due sur ce rail a été confirmée
          par une notification signée de FedaPay.
        </p>
      ) : (
        dettes.map((d) => <DetteAuTableauDeBord key={d.reference} dette={d} />)
      )}
    </section>
  );
}

function DetteAuTableauDeBord({ dette }: { dette: DetteFedaPay }) {
  const router = useRouter();
  const [saisie, setSaisie] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<EchecCandidat | null>(null);

  const lue = saisie.trim() === "" ? null : lireLaReferenceDeRemboursement(saisie);
  const obstacle =
    lue === null
      ? "Saisis d'abord la référence affichée par le tableau de bord FedaPay."
      : lue.valide
        ? null
        : lue.message;
  const declarable = dette.etape === "DECIDE" && dette.initiee;

  async function declarer() {
    setEnvoi(true);
    setEchec(null);
    const resultat = await appeler<{ issue: string }>(
      `/api/admin/paiements/${dette.reference}/remboursement/manuel`,
      { corps: { referenceFournisseur: saisie } },
    );
    setEnvoi(false);
    if (!resultat.ok) {
      setEchec(resultat.echec);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-ink-300 bg-white p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-14 text-ink-900">{dette.reference}</span>
        <span className="text-13 text-ink-500">
          {formatMontant(dette.montant, dette.devise)} · {dette.compte}
        </span>
      </div>
      <p className="text-14 font-medium text-ink-900">
        {LIBELLE_ETAPE[dette.etape]}
        {dette.referenceFournisseur ? (
          <span className="font-normal text-ink-700">
            {" "}
            — référence {dette.referenceFournisseur}
            {dette.demandeeLe ? `, déclarée le ${jourEnFrancais(dette.demandeeLe)}` : ""}
          </span>
        ) : null}
      </p>
      <p className="text-13 text-ink-500">
        Remboursement décidé le {jourEnFrancais(dette.decideeLe)}
        {dette.motif ? ` — ${dette.motif}` : ""}
      </p>
      <p className="text-pretty text-14 text-ink-700">{consigneFedaPay(dette)}</p>

      {declarable ? (
        <>
          {echec ? <BlocEchec echec={echec} annonce /> : null}
          <Input
            libelle="Référence du remboursement chez FedaPay"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            erreur={echec?.champs?.referenceFournisseur}
            aide="Telle que la liste des remboursements du tableau de bord FedaPay l'affiche. Ta déclaration est tracée à ton nom dans le journal d'audit."
          />
          <Button
            chargement={envoi}
            disabled={obstacle !== null}
            raisonDesactivation={obstacle ?? undefined}
            onClick={() => void declarer()}
            className="self-start"
          >
            Déclarer le remboursement fait
          </Button>
        </>
      ) : null}
    </div>
  );
}
