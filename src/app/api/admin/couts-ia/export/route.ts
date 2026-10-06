import { z } from "zod";
import { route } from "@/server/http/route";
import { SANS_CACHE } from "@/server/http/reponse";
import { echec } from "@/server/http/echecs";
import { journaliser } from "@/server/acces/journal";
import { appelsDeLaPeriode } from "@/server/lecture/backoffice";
import { fichierCsv, TYPE_MIME } from "@/domain/format/csv";
import { tarifDu } from "@/domain/ia/fournisseurs";
import {
  exportDesAppels,
  nomDesAppels,
  obstacleALaPeriode,
} from "@/domain/backoffice/appels-ia";

/**
 * Export du détail des appels IA — B-07, WF-16.
 *
 * Même régime que les deux autres exports : `sensible`, réservé à
 * l'administration, **journalisé avant** que le fichier existe. La réponse
 * rassemble toute la consommation d'une période ; c'est ce qu'un accès volé
 * chercherait à emporter d'un seul appel.
 *
 * Le fichier ne porte rien que B-07 ne montre déjà : voir
 * `domain/backoffice/appels-ia.ts`. La sélection du lecteur n'a ni compte
 * ni nature d'opération — la propriété tient à la requête, pas à un tri
 * fait après coup.
 *
 * Une période trop longue est refusée avec ce qu'il faut faire, et jamais
 * plafonnée en silence : un fichier de trois mois qui n'en couvrirait que
 * deux serait une attestation fausse.
 */
const JOUR = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Date attendue au format AAAA-MM-JJ");

export const GET = route({
  nom: "admin.couts.export",
  acces: "admin",
  limite: "sensible",
  requete: z.object({ du: JOUR, au: JOUR }),
  async traiter({ requete, acteur }) {
    const periode = { du: requete.du, au: requete.au };
    const obstacle = obstacleALaPeriode(periode);
    if (obstacle) {
      throw echec("champs_invalides", { corps: obstacle, champs: { du: obstacle } });
    }

    const appels = await appelsDeLaPeriode(periode);

    await journaliser({
      acteurId: acteur!.id,
      action: "couts-ia.export",
      cible: `appels-ia:${periode.du}_${periode.au}`,
      motif: `Export du détail des appels IA, ${appels.length} appel${appels.length > 1 ? "s" : ""} sur la période`,
      details: { du: periode.du, au: periode.au, appels: appels.length },
    });

    const tarifs = (fournisseur: Parameters<typeof tarifDu>[1]) => tarifDu(process.env, fournisseur);
    return new Response(fichierCsv(exportDesAppels(periode, appels, tarifs)), {
      status: 200,
      headers: {
        "content-type": TYPE_MIME,
        "content-disposition": `attachment; filename="${nomDesAppels(periode)}"`,
        "cache-control": SANS_CACHE,
      },
    });
  },
});
