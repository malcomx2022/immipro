import type { Metadata } from "next";
import { Paiements } from "./Paiements";
import { etatOperateur, paiements } from "@/server/lecture/backoffice";
import { exigerAdmin } from "@/server/securite/page";
import { jourEnFrancais } from "@/domain/format/moment";

/** B-04 — Paiements et réconciliation. WF-15, INV-7. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Paiements",
  description: "Rapprochement des paiements et traitement des écarts.",
};

export default async function PagePaiements() {
  await exigerAdmin("/paiements");
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const [lignes, operateur] = await Promise.all([paiements(aujourdhui), etatOperateur()]);

  return (
    <Paiements
      paiements={lignes}
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
    />
  );
}
