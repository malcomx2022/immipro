import type { EditorialDoc, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * L'historique des publications — P.B, tranché le 20/09/2026.
 *
 * Une version par publication, jamais par enregistrement de brouillon.
 * L'historique de toutes les frappes coûterait cher et ne répondrait à
 * aucune question ; celui des publications répond à la seule qui compte —
 * quel texte un lecteur pouvait-il lire le 12 mars.
 *
 * **Ce qu'« une publication » recouvre, et c'est le point de ce module.**
 * Le bouton « Publier » n'est pas le seul chemin par lequel le texte
 * public change : enregistrer un document **déjà publié** le change aussi,
 * immédiatement — la route de mise à jour invalide le cache de la page
 * dans la foulée. Ne versionner que le bouton aurait donné un historique
 * troué, qui promet une preuve de ce qui était public et ne la tient pas
 * sur le chemin le plus courant, la correction d'un guide en ligne.
 *
 * La règle appliquée est donc : **une version à chaque fois que ce que le
 * public lit change.** Un brouillon qu'on enregistre n'est lu par personne
 * et n'en crée aucune, ce que la décision demande.
 *
 * Le rang est calculé dans la transaction qui insère, et l'unicité
 * `(docId, rang)` ferme la course : deux publications simultanées ne
 * peuvent pas produire deux fois la version 4.
 */

/** Ce qui vaut motif quand personne n'en a saisi un — voir plus bas. */
export const MOTIF_CORRECTION_EN_LIGNE =
  "Correction enregistrée sur un document déjà publié.";

export interface Publication {
  /** L'identifiant de l'administrateur, tel que le journal le nomme. */
  par: string;
  /** Pourquoi ce texte est devenu public. */
  motif: string;
}

/**
 * Enregistre l'état courant du document comme une version publiée.
 *
 * L'état **courant**, lu dans la même transaction : la version doit être
 * la photographie de ce qui part en ligne, pas des valeurs qu'un appelant
 * aurait recopiées de son côté et qui divergeraient au premier champ
 * oublié.
 *
 * Un document sans source ni date de vérification ne peut pas être publié
 * — la base le refuse déjà, et la colonne de la version est non nulle. Le
 * cas ne se produit donc pas ; s'il se produisait, il vaudrait mieux ne
 * pas écrire de version que d'en écrire une qui ment sur INV-8, et c'est
 * ce que fait le retour `null`.
 */
export async function enregistrerUneVersion(
  docId: string,
  publication: Publication,
): Promise<number | null> {
  return db.$transaction(async (tx) => {
    const doc = await tx.editorialDoc.findUnique({ where: { id: docId } });
    if (!doc || !doc.sourceLabel?.trim() || !doc.verifiedAt) return null;

    const dernier = await tx.editorialVersion.findFirst({
      where: { docId },
      orderBy: { rang: "desc" },
      select: { rang: true },
    });
    const rang = (dernier?.rang ?? 0) + 1;

    await tx.editorialVersion.create({
      data: {
        docId,
        rang,
        title: doc.title,
        standfirst: doc.standfirst,
        body: doc.body as Prisma.InputJsonValue,
        sourceLabel: doc.sourceLabel,
        verifiedAt: doc.verifiedAt,
        countryLabel: doc.countryLabel,
        section: doc.section,
        author: doc.author,
        publishedBy: publication.par,
        reason: publication.motif,
      },
    });
    return rang;
  });
}

/**
 * Les champs d'une version, tels qu'on les réécrit sur le document.
 *
 * Restaurer n'est pas ressusciter : la version restaurée ne redevient pas
 * « la version courante ». Son texte est recopié sur le document, et la
 * publication qui suit crée une version de plus — dont le contenu se
 * trouve être l'ancien. L'histoire s'allonge, elle ne se réécrit pas, et
 * c'est ce qui permet de lire plus tard « le 20 septembre, on est revenu
 * au texte du 3 mars ».
 */
export function champsDeLaVersion(version: {
  title: string;
  standfirst: string;
  body: Prisma.JsonValue;
  sourceLabel: string;
  verifiedAt: Date;
  countryLabel: string | null;
  section: string | null;
  author: string | null;
}): Pick<
  EditorialDoc,
  "title" | "standfirst" | "sourceLabel" | "verifiedAt" | "countryLabel" | "section" | "author"
> & { body: Prisma.InputJsonValue } {
  return {
    title: version.title,
    standfirst: version.standfirst,
    body: version.body as Prisma.InputJsonValue,
    sourceLabel: version.sourceLabel,
    verifiedAt: version.verifiedAt,
    countryLabel: version.countryLabel,
    section: version.section,
    author: version.author,
  };
}
