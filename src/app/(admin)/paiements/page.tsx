import type { Metadata } from "next";
import { Paiements } from "./Paiements";
import { dettesFedaPay, ecartsAnterieurs, etatOperateur, paiements } from "@/server/lecture/backoffice";
import { exigerAdmin } from "@/server/securite/page";
import { jourEnFrancais } from "@/domain/format/moment";
import { jourCivil } from "@/domain/format/fuseau";
import { piecesEnAttenteDeCertification } from "@/server/facturation/emission";
import { messageDesCertifications } from "@/domain/facturation/facture";

/** B-04 — Paiements et réconciliation. WF-15, INV-7. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Paiements",
  description: "Rapprochement des paiements et traitement des écarts.",
};

export default async function PagePaiements() {
  await exigerAdmin("/paiements");
  const aujourdhui = jourCivil(new Date());
  const [lignes, anterieurs, operateur, dettes, enAttente] = await Promise.all([
    paiements(aujourdhui),
    ecartsAnterieurs(aujourdhui),
    etatOperateur(),
    dettesFedaPay(),
    // S.158 — une lecture qui échoue ne retire pas l'écran : elle se tait.
    piecesEnAttenteDeCertification().catch(() => null),
  ]);
  const maintenant = Date.now();

  return (
    <Paiements
      paiements={lignes}
      ecartsAnterieurs={anterieurs}
      dettesFedaPay={dettes}
      operateur={operateur}
      journee={`Journée du ${jourEnFrancais(aujourdhui)}`}
      // Le jour en ISO à côté du libellé : c'est lui qui nomme le fichier
      // et borne l'export. Le reformater depuis « Journée du 21 septembre
      // 2026 » côté client marcherait jusqu'au premier changement de
      // libellé.
      jourIso={aujourdhui}
      // Le jour courant vient du serveur : le calculer à l'écran le ferait
      // dépendre du fuseau du navigateur, qui n'est pas celui du livre.
      aujourdhuiIso={aujourdhui}
      certifications={
        enAttente && enAttente.nombre > 0
          ? messageDesCertifications({
              lisible: true,
              enAttente: enAttente.nombre,
              depuisHeures: enAttente.plusAncienne
                ? Math.floor((maintenant - enAttente.plusAncienne.getTime()) / 3_600_000)
                : 0,
            })
          : null
      }
    />
  );
}
