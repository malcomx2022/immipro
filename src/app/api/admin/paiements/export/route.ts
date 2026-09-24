import { z } from "zod";
import { route } from "@/server/http/route";
import { SANS_CACHE } from "@/server/http/reponse";
import { journaliser } from "@/server/acces/journal";
import { etatOperateur, paiements } from "@/server/lecture/backoffice";
import { fichierCsv, TYPE_MIME } from "@/domain/format/csv";
import {
  exportDuGrandLivre,
  nomDuGrandLivre,
  totauxDeLExport,
} from "@/domain/backoffice/reconciliation";
import { jourCivil } from "@/domain/format/fuseau";

/**
 * Export du grand livre — B-04, WF-15, INV-7.
 *
 * Ce que cette route tient, et que l'écran seul ne tenait pas : **pendant
 * un incident de l'opérateur, le fichier ne porte aucun total.**
 *
 * La règle était écrite dans le domaine depuis le début — « un chiffre
 * partiel présenté comme un total est une erreur comptable, et elle se
 * propage dans l'export puis dans le rapport ». La phrase désignait
 * l'export comme le lieu où la faute devient durable, et l'export
 * n'existait pas. Un total faux à l'écran disparaît au rechargement ; le
 * même dans un fichier part au comptable et revient six semaines plus
 * tard, sans l'encadré qui disait pourquoi il était faux.
 *
 * Les lignes, elles, partent toujours : chaque paiement est exactement ce
 * qu'il est, et retenir le fichier entier ferait croire que la journée
 * n'existe pas.
 */
export const GET = route({
  nom: "admin.paiements.export",
  acces: "admin",
  limite: "sensible",
  requete: z.object({
    jour: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u, "Date attendue au format AAAA-MM-JJ")
      .optional(),
  }),
  async traiter({ requete, acteur }) {
    const jour = requete.jour ?? jourCivil(new Date());
    /*
      Le jour borne enfin ce qu'il exporte — 24/09/2026. Il nommait le
      fichier et la ligne de journal (`grand-livre:<jour>`) en appelant un
      lecteur qui rendait les cent dernières transactions, toutes dates
      confondues : demander le 15 janvier produisait le livre du jour, sous
      un nom de janvier et une attestation d'audit qui le disait.
    */
    const [lignes, operateur] = await Promise.all([paiements(jour), etatOperateur()]);
    const livre = { paiements: lignes, operateur, journee: jour };
    const totaux = totauxDeLExport(livre);

    await journaliser({
      acteurId: acteur!.id,
      action: "paiements.export",
      cible: `grand-livre:${jour}`,
      motif:
        totaux === null
          ? `Export du grand livre, ${lignes.length} paiements, total non calculé pendant l'incident opérateur`
          : `Export du grand livre, ${lignes.length} paiements`,
      details: { jour, paiements: lignes.length, totalCalcule: totaux !== null },
    });

    return new Response(fichierCsv(exportDuGrandLivre(livre)), {
      status: 200,
      headers: {
        "content-type": TYPE_MIME,
        "content-disposition": `attachment; filename="${nomDuGrandLivre(jour)}"`,
        "cache-control": SANS_CACHE,
      },
    });
  },
});
