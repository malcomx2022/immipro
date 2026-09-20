import { db } from "@/lib/db";
import {
  DEPENDANCES,
  configuree,
  etatDesDependances,
  fileTenue,
  messageDeSurveillance,
} from "@/domain/exploitation/dependances";
import { DELAI_CIBLE_HEURES } from "@/domain/backoffice/revue";

/**
 * État de service — I.C, tranché le 20/09/2026.
 *
 * L'adresse rendait « ok » dès que la base répondait. Elle répondait donc
 * « ok » à une installation sans messagerie, dont aucun courrier de
 * vérification ne part — et un répartiteur de charge y aurait envoyé du
 * public.
 *
 * Trois dépendances, trois statuts. Une bloquante absente rend l'instance
 * inapte, et le 503 le dit à qui surveille plutôt qu'à personne. Une
 * dépendance facultative absente laisse l'instance en service, sous le nom
 * qui convient : pilote.
 *
 * **La file de revue est ici parce que c'est la condition de l'exception.**
 * L'extraction IA peut manquer tant que la revue humaine tient son délai.
 * Un écran de back-office ne surveille que ceux qui l'ouvrent ; une adresse
 * d'état se surveille depuis l'extérieur, et c'est ce que « file
 * surveillée » demande.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  let base = "up";
  let enAttente = 0;
  let horsDelai = 0;

  try {
    await db.$queryRaw`SELECT 1`;
    const limite = new Date(Date.now() - DELAI_CIBLE_HEURES * 3_600_000);
    [enAttente, horsDelai] = await Promise.all([
      db.manualReview.count({ where: { decidedAt: null } }),
      db.manualReview.count({ where: { decidedAt: null, queuedAt: { lt: limite } } }),
    ]);
  } catch {
    base = "down";
  }

  const etat = etatDesDependances(process.env);
  const surveillance = { enAttente, horsDelai };

  // Une base muette est une panne ; une dépendance bloquante absente est une
  // inaptitude. Les deux se répondent 503, et le corps dit laquelle.
  const enService = base === "up" && etat.aptitude !== "INAPTE";

  return Response.json(
    {
      status: enService ? (etat.aptitude === "PILOTE" ? "pilote" : "ok") : "indisponible",
      db: base,
      dependances: Object.fromEntries(
        DEPENDANCES.map((d) => [
          d.cle,
          { statut: d.statut, configuree: configuree(d, process.env) },
        ]),
      ),
      revue: {
        ...surveillance,
        delaiCibleHeures: DELAI_CIBLE_HEURES,
        tenue: fileTenue(surveillance),
        message: messageDeSurveillance(surveillance, DELAI_CIBLE_HEURES),
      },
    },
    { status: enService ? 200 : 503 },
  );
}
