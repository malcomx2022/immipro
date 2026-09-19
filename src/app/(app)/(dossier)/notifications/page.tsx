import type { Metadata } from "next";
import { Alertes } from "./Alertes";
import { db } from "@/lib/db";
import { alertesDuCandidat, divergenceAArbitrer } from "@/server/lecture/alertes";
import { exigerCandidat } from "@/server/securite/page";

/**
 * T-01 — Alertes, et T-02 en surface d'arbitrage. WF-11.
 *
 * Rendu à la demande : les alertes se datent en relatif — « Il y a 2 heures »
 * figé au build vieillirait d'un jour par jour.
 *
 * La divergence affichée est la plus ancienne non arbitrée : s'il y en a
 * plusieurs, c'est celle qui attend depuis le plus longtemps qui passe
 * devant. Aucune n'est affichée quand il n'y en a pas — un écran
 * d'arbitrage permanent ne se lit plus.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Alertes",
  description:
    "Ce qui a changé sur vos dossiers, ce que cela implique, et d'où vient l'information.",
};

export default async function PageNotifications() {
  const acteur = await exigerCandidat("/notifications");

  const [alertes, migration] = await Promise.all([
    alertesDuCandidat(acteur.id),
    db.ruleMigration.findFirst({
      where: { decision: null, application: { userId: acteur.id } },
      orderBy: { createdAt: "asc" },
      include: { application: { select: { targetDate: true } } },
    }),
  ]);

  const divergence = migration
    ? await divergenceAArbitrer(migration.id, acteur.id).then((vue) => ({
        pays: vue.destination,
        ancienne: vue.ancienne,
        nouvelle: vue.nouvelle,
        depotVise: migration.application.targetDate?.toISOString().slice(0, 10),
        detecteeLe: migration.createdAt.toISOString().slice(0, 10),
        verifieeLe: vue.nouvelle.publieeLe,
        source: "référentiel ImmiPro",
      }))
    : undefined;

  return (
    <Alertes
      alertes={alertes}
      maintenant={new Date().toISOString()}
      divergence={divergence}
    />
  );
}
