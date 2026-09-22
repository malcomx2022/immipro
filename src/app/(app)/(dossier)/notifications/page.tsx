import type { Metadata } from "next";
import { Alertes } from "./Alertes";
import { db } from "@/lib/db";
import { alertesDuCandidat, divergenceAArbitrer } from "@/server/lecture/alertes";
import { exigerCandidat } from "@/server/securite/page";
import { delaiInstructionJours } from "@/server/vue/dossier";
import { dateDeDepot } from "@/domain/dossiers/faisabilite";

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
    "Ce qui a changé sur tes dossiers, ce que cela implique, et d'où vient l'information.",
};

export default async function PageNotifications() {
  const acteur = await exigerCandidat("/notifications");

  const [alertes, migration] = await Promise.all([
    alertesDuCandidat(acteur.id),
    db.ruleMigration.findFirst({
      where: { decision: null, application: { userId: acteur.id } },
      orderBy: { createdAt: "asc" },
      include: {
        application: {
          select: { targetDate: true, visaRule: { select: { rules: true } } },
        },
      },
    }),
  ]);

  const depart = migration?.application.targetDate?.toISOString().slice(0, 10);
  const delai = delaiInstructionJours(migration?.application.visaRule?.rules);

  const divergence = migration
    ? await divergenceAArbitrer(migration.id, acteur.id).then((vue) => ({
        dossierId: migration.applicationId,
        migrationId: migration.id,
        pays: vue.destination,
        ancienne: vue.ancienne,
        nouvelle: vue.nouvelle,
        pieces: vue.pieces,
        migrable: vue.migrable,
        /*
          Le dépôt, et non la date cible : c'est le jour du dépôt qui
          décide de la version applicable. L'écran annonçait la nouvelle
          version — et le montant supplémentaire à réunir — sur un dossier
          qui déposera avant son entrée en vigueur.
        */
        ...(depart ? { depot: dateDeDepot(depart, delai) } : {}),
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
