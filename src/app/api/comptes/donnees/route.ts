import { route } from "@/server/http/route";
import { SANS_CACHE } from "@/server/http/reponse";
import { donneesDuCompte } from "@/server/lecture/portabilite";
import { nomDuFichier } from "@/domain/comptes/portabilite";
import { journaliser } from "@/server/acces/journal";

/**
 * Export des données du compte — A-05, WF-15, droit d'accès et portabilité.
 *
 * La réponse est un **fichier**, pas un objet à afficher : `content-disposition`
 * fait descendre le JSON dans les téléchargements du navigateur plutôt que
 * de l'ouvrir dans un onglet, où il serait illisible sur un téléphone et
 * perdu au premier rechargement.
 *
 * `limite: "sensible"` et non `"lecture"` : la réponse rassemble en un
 * fichier tout ce que le compte contient. C'est exactement ce qu'un accès
 * volé chercherait à obtenir d'un seul appel, et le débit d'une lecture
 * ordinaire — deux cent quarante par minute — n'a aucune raison de
 * s'appliquer ici.
 *
 * L'export est journalisé. Un accès à l'intégralité d'un compte laisse une
 * trace, même quand c'est son titulaire qui le demande : c'est ce qui
 * permettra de dire, après un vol de session, ce qui est parti.
 */
export const GET = route({
  nom: "comptes.donnees",
  acces: "candidat",
  limite: "sensible",
  async traiter({ acteur }) {
    const donnees = await donneesDuCompte(acteur!.id);
    const jour = donnees.meta.genereLe.slice(0, 10);

    await journaliser({
      acteurId: `candidat:${acteur!.id}`,
      action: "compte.export",
      cible: `user:${acteur!.id}`,
      motif: "Export des données demandé par le titulaire du compte (WF-15)",
      details: { dossiers: donnees.dossiers.length },
    }).catch(() => undefined);

    return new Response(JSON.stringify(donnees, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${nomDuFichier(jour)}"`,
        "cache-control": SANS_CACHE,
      },
    });
  },
});
