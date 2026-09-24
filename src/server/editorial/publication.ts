import { echec } from "@/server/http/echecs";
import {
  SUITE_DU_REFUS,
  messageDeRefusEditorial,
  verifierLeDocument,
  type Corps,
} from "@/domain/editorial/document";

/**
 * Le refus du vocabulaire, opposé partout où un texte devient public —
 * B-08, 23/09/2026.
 *
 * ── Trois chemins mettaient en ligne, un seul refusait ──────────────
 *
 * La route de B-08 appelait `revalider` à quatre endroits : l'enregistrement
 * d'un document déjà publié, le retrait, la restauration d'une version, la
 * publication. Le retrait ne met rien en ligne ; les trois autres si. Le
 * refus n'était opposé que sur le dernier.
 *
 * Le fichier disait pourtant les deux moitiés de la contradiction, à
 * quatre-vingts lignes d'écart : « le vocabulaire est vérifié à chaque
 * enregistrement et ne bloque que la publication », puis « **cet
 * enregistrement-là est une publication** — le texte change sous les yeux du
 * public à la seconde, sans passer par le bouton ». La seconde phrase est
 * arrivée avec le versionnement (P.B) et personne n'est retourné à la
 * première.
 *
 * Un veilleur pouvait donc écrire une promesse de résultat dans un guide en
 * ligne et l'enregistrer : la page publique la servait, une version
 * l'archivait, le journal l'enregistrait comme une publication. INV-2 dit
 * « nulle part », et `CLAUDE.md` dit « sa publication est bloquée ».
 *
 * ── Ce que le refus ne touche pas ───────────────────────────────────
 *
 * **Le brouillon.** Un texte en cours d'écriture doit pouvoir être sauvé —
 * le refuser pousserait à rédiger ailleurs et à coller à la fin,
 * c'est-à-dire hors du garde-fou. La distinction n'est donc pas
 * « enregistrer ou publier », elle est « le public le verra-t-il ».
 *
 * ── Pourquoi la décision vit ici ────────────────────────────────────
 *
 * La même raison que `server/regles/publication.ts` : dans sa route, elle
 * était derrière `next/headers`, donc hors de portée de toute fumée et de
 * tout essai. Les quatre assertions qui la tenaient lisaient sa source ;
 * aucune ne l'exécutait, et la mutation qui la rendait muette les passait
 * toutes.
 */
export function exigerUnTexteAffichable(
  document: { titre: string; chapeau: string },
  corps: Corps,
  suite: keyof typeof SUITE_DU_REFUS,
): void {
  const fautes = verifierLeDocument(document, corps);
  if (fautes.length === 0) return;
  // Le refus nomme le fait : la publication est refusée, et les champs ne
  // sont pas « invalides » — le document est bien formé, c'est sa
  // formulation qui ne peut pas s'afficher (DOC-12 §16 règle 1).
  throw echec("publication_refusee", {
    corps: `${messageDeRefusEditorial(fautes[0]!)} ${SUITE_DU_REFUS[suite]}`,
    champs: Object.fromEntries(fautes.map((f) => [f.chemin, messageDeRefusEditorial(f)])),
  });
}
