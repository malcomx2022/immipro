import type { Metadata } from "next";
import { TableauDeBord } from "./TableauDeBord";
import { db } from "@/lib/db";
import { tableauDeBord } from "@/server/lecture/dossiers";
import { exigerCandidat } from "@/server/securite/page";

/**
 * C-01 — Tableau de bord. WF-09.
 *
 * La page lit, `TableauDeBord` rend. Les trois lectures partent ensemble :
 * elles ne dépendent pas les unes des autres, et les enchaîner ajouterait
 * deux allers-retours pour rien sur une connexion lente.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mes dossiers",
  description: "Vos dossiers en cours et la prochaine action de chacun.",
};

export default async function PageTableauDeBord() {
  const acteur = await exigerCandidat("/tableau-de-bord");
  const [dossiers, compte, aArbitrer] = await Promise.all([
    tableauDeBord(acteur.id),
    db.user.findUnique({ where: { id: acteur.id }, select: { firstName: true } }),
    db.ruleMigration.count({
      where: { decision: null, application: { userId: acteur.id } },
    }),
  ]);

  return (
    <TableauDeBord
      dossiers={dossiers}
      prenom={compte?.firstName}
      aArbitrer={aArbitrer}
    />
  );
}
