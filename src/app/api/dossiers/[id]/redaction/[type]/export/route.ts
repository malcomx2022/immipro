import { z } from "zod";
import { route } from "@/server/http/route";
import { SANS_CACHE } from "@/server/http/reponse";
import { echec } from "@/server/http/echecs";
import { pieceARediger, versionsDeLaPiece } from "@/server/lecture/redaction";
import { archiver } from "@/server/redaction/zip";
import {
  TYPE_MIME_DOCX,
  nomDuFichierRedige,
  piecesDuDocument,
} from "@/domain/redaction/docx";
import {
  MENTION_AIDE_A_LA_REDACTION,
  versionCourante,
} from "@/domain/redaction/versions";

/**
 * Export d'une pièce rédigée — WF-08 étape 6.
 *
 * Le DOCX seulement. Le PDF est celui du navigateur, comme pour l'archive
 * d'un dossier (L.3) : la page d'impression rend le texte, « Imprimer »
 * puis « Enregistrer au format PDF » suffit, et aucune bibliothèque de
 * génération n'entre au dépôt pour un document moins fidèle que la page.
 *
 * Ce raisonnement ne couvre pas le DOCX : personne n'imprime un fichier
 * Word, et une université qui demande un document modifiable ne se contente
 * pas d'un PDF. Le format étant une archive de trois fichiers XML, il
 * s'écrit sans dépendance.
 *
 * `limite: "lecture"` : l'export ne coûte ni argent ni quota, ne devine
 * aucun secret, et rend le texte que le candidat vient d'écrire dans son
 * propre dossier. Le régime `sensible` de l'export de portabilité se
 * justifiait par le périmètre — tout le compte en un fichier ; ici c'est
 * une pièce, et c'est la sienne.
 *
 * **La version exportée est datée de la version, pas de la demande.**
 * L'archive porte l'horodatage du texte : un fichier retrouvé plus tard dit
 * quand la lettre a été écrite, et deux exports du même texte rendent les
 * mêmes octets.
 */
export const GET = route({
  nom: "dossier.redaction.export",
  acces: "candidat",
  limite: "lecture",
  requete: z.object({ format: z.literal("docx").default("docx") }),
  async traiter({ params, acteur }) {
    const piece = await pieceARediger(params.id!, params.type!, acteur!.id);
    const courante = versionCourante(await versionsDeLaPiece(piece.documentId));

    if (!courante) {
      throw echec("etat_incompatible", {
        corps:
          "Cette pièce n'a pas encore de texte : il n'y a rien à exporter. L'entretien guidé et l'éditeur produisent la première version.",
      });
    }

    const octets = archiver(
      piecesDuDocument({
        titre: piece.libelle,
        paragraphes: courante.paragraphes,
        // RG-08.1 — la mention voyage dans le fichier. C'est là qu'elle
        // sert : le document sera lu par quelqu'un qui n'a pas vu l'écran.
        mention: MENTION_AIDE_A_LA_REDACTION,
      }),
      new Date(courante.enregistreeLe),
    );

    const nom = nomDuFichierRedige(
      piece.libelle,
      courante.enregistreeLe.slice(0, 10),
      "docx",
    );

    return new Response(new Uint8Array(octets), {
      status: 200,
      headers: {
        "content-type": TYPE_MIME_DOCX,
        "content-disposition": `attachment; filename="${nom}"`,
        "content-length": String(octets.length),
        "cache-control": SANS_CACHE,
      },
    });
  },
});
