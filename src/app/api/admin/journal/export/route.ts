import { z } from "zod";
import { route } from "@/server/http/route";
import { SANS_CACHE } from "@/server/http/reponse";
import { journaliser } from "@/server/acces/journal";
import { journalDeLaPeriode } from "@/server/lecture/backoffice";
import { fichierCsv, TYPE_MIME } from "@/domain/format/csv";
import {
  CATEGORIES,
  exportDuJournal,
  filtrerAudit,
  nomDeLExport,
  type CategorieAudit,
} from "@/domain/backoffice/audit";

/**
 * Export du journal d'audit — B-06, WF-15.
 *
 * `limite: "sensible"` et non `"lecture"`, pour la raison de l'export de
 * portabilité : la réponse rassemble en un fichier tout ce qu'un périmètre
 * contient. C'est ce qu'un accès volé chercherait à obtenir d'un seul
 * appel, et deux cent quarante requêtes par minute n'ont aucune raison de
 * s'appliquer ici.
 *
 * **L'export est lui-même journalisé**, et avant d'être produit. Un accès à
 * l'intégralité du journal laisse une trace comme les autres — c'est ce qui
 * permettra de dire, après coup, qui a emporté quoi. Le journaliser après
 * coup laisserait sans trace l'export qui échoue à l'écriture du fichier,
 * et c'est celui-là qu'on voudrait voir.
 *
 * La période n'est pas plafonnée à deux cents lignes comme la lecture
 * d'écran : un export tronqué en silence serait une attestation fausse,
 * et c'est précisément le contraire de ce qu'un contrôle demande.
 */
const PERIODE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Date attendue au format AAAA-MM-JJ");

export const GET = route({
  nom: "admin.journal.export",
  acces: "admin",
  limite: "sensible",
  requete: z.object({
    du: PERIODE,
    au: PERIODE,
    /** Répétable : `?categorie=PAIEMENT&categorie=REGLE`. */
    categorie: z
      .union([z.enum(CATEGORIES as unknown as [CategorieAudit, ...CategorieAudit[]]), z.array(z.enum(CATEGORIES as unknown as [CategorieAudit, ...CategorieAudit[]]))])
      .optional(),
  }),
  async traiter({ requete, acteur }) {
    const periode = { du: requete.du, au: requete.au };
    const categories =
      requete.categorie === undefined
        ? []
        : Array.isArray(requete.categorie)
          ? requete.categorie
          : [requete.categorie];

    const ecritures = await journalDeLaPeriode(periode);
    const retenues = filtrerAudit(ecritures, periode, categories);

    await journaliser({
      acteurId: acteur!.id,
      action: "journal.export",
      cible: `journal:${periode.du}_${periode.au}`,
      motif: `Export du journal d'audit, ${retenues.length} écriture${retenues.length > 1 ? "s" : ""} sur la période`,
      details: { du: periode.du, au: periode.au, categories, ecritures: retenues.length },
    });

    return new Response(fichierCsv(exportDuJournal(ecritures, periode, categories)), {
      status: 200,
      headers: {
        "content-type": TYPE_MIME,
        "content-disposition": `attachment; filename="${nomDeLExport(periode)}"`,
        "cache-control": SANS_CACHE,
      },
    });
  },
});
