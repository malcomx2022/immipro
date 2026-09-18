import type { Metadata } from "next";
import { Alertes } from "./Alertes";
import {
  ALERTES,
  DIVERGENCE,
  REGLE_ANCIENNE,
  REGLE_NOUVELLE,
} from "@/lib/contenu/alertes";
import { dossierParId } from "@/lib/contenu/dossiers";

/**
 * T-01 — Alertes, et T-02 en surface d'arbitrage. WF-11.
 *
 * Rendu à la demande : les alertes se datent en relatif — « Il y a 2 heures »
 * figé au build vieillirait d'un jour par jour.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Alertes",
  description:
    "Ce qui a changé sur vos dossiers, ce que cela implique, et d'où vient l'information.",
};

export default function PageNotifications() {
  const dossierAllemand = dossierParId("de-8820");

  return (
    <Alertes
      alertes={ALERTES}
      maintenant={new Date().toISOString()}
      divergence={{
        pays: DIVERGENCE.pays,
        ancienne: REGLE_ANCIENNE,
        nouvelle: REGLE_NOUVELLE,
        depotVise: dossierAllemand?.depotVise,
        detecteeLe: DIVERGENCE.detecteeLe,
        verifieeLe: DIVERGENCE.verifieeLe,
        source: DIVERGENCE.source,
      }}
    />
  );
}
