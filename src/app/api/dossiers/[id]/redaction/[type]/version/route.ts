import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { pieceARediger, reponsesDeLEntretien } from "@/server/lecture/redaction";
import { debiterUneAnalyse, rendreUneTentative } from "@/server/acces/quota";
import { redactionConfiguree } from "@/server/redaction/redacteur";
import { leRedacteur } from "@/server/redaction/service";
import { compterMotsTexte } from "@/domain/redaction/versions";
import { MOTIF_DAPPEL } from "@/domain/ia/appel";
import { noterLesJetons } from "@/server/redaction/usage";
import {
  MOTIF_PREMIERE_VERSION,
  MOTIF_REECRITURE,
  REPONSES_MINIMUM,
  motifDeRestauration,
} from "@/domain/redaction/versions";

/**
 * Les versions d'une pièce rédigée — R-03, WF-08 étapes 3 et 5.
 *
 * L'écran portait un onglet « Éditeur » et un onglet « Versions », et
 * aucune route ne créait de version : `versionCourante` rendait toujours
 * `undefined`, l'éditeur n'avait rien à montrer, et « Restaurer » n'était
 * relié à rien. L'onglet ne savait d'ailleurs pas éditer — il rendait des
 * paragraphes en lecture seule, sans champ de saisie.
 *
 * ── Trois écritures, une route ─────────────────────────────────────────
 *
 * `z.discriminatedUnion` sur le geste, comme en B-02 : les trois créent une
 * version, aucune n'en modifie une existante. Une version est un état
 * passé — la réécrire enlèverait au candidat le retour en arrière qui le
 * décide à accepter une suggestion.
 *
 *  - `mise-en-forme` part des réponses. Elle seule appelle le modèle, elle
 *    seule débite le quota (RG-08.4, INV-6).
 *  - `reecriture` enregistre le texte du candidat. Aucun appel, aucun
 *    débit : c'est son texte dans son dossier.
 *  - `restauration` recopie une version antérieure en tête. L'historique
 *    n'est pas tronqué : revenir en arrière est un geste de plus, pas
 *    l'effacement des suivants.
 *
 * ── Ce que l'absence du service produit ────────────────────────────────
 *
 * Sans clé, la route répond `produite: false, disponible: false` sans rien
 * créer ni rien débiter. Avec une clé, l'appel peut encore ne pas aboutir,
 * et alors `disponible: true` : la nuance porte le message à l'écran — « ce
 * service n'existe pas ici » et « il n'a pas répondu cette fois » ne
 * demandent pas la même chose au candidat.
 *
 * Dans les deux cas, aucun texte n'est fabriqué ici. C'est la règle d'I.C :
 * il serait déposé en son nom par quelqu'un qui croirait l'avoir relu.
 */
const GESTE = z.discriminatedUnion("geste", [
  z.object({ geste: z.literal("mise-en-forme") }),
  z.object({ geste: z.literal("reecriture"), texte: z.string().min(1).max(40_000) }),
  z.object({ geste: z.literal("restauration"), rang: z.number().int().min(1) }),
]);

export const POST = route({
  nom: "dossier.redaction.version",
  acces: "candidat",
  /**
   * `sensible`, contrairement à la route des réponses d'entretien : la
   * mise en forme coûte du quota et un appel au modèle, ce qui est
   * exactement le périmètre du régime. La réécriture et la restauration
   * n'en coûtent pas, mais elles partagent la route — et dix
   * enregistrements par minute suffisent à réécrire un texte, là où dix
   * suffisaient mal à traverser un entretien.
   */
  limite: "sensible",
  corps: GESTE,
  async traiter({ corps, params, acteur }) {
    const piece = await pieceARediger(params.id!, params.type!, acteur!.id);
    const dernier = piece.dernierRang ?? 0;

    if (corps.geste === "reecriture") {
      return creer(piece.documentId, dernier + 1, corps.texte, MOTIF_REECRITURE);
    }

    if (corps.geste === "restauration") {
      const source = await db.documentVersion.findFirst({
        where: { documentId: piece.documentId, rank: corps.rang, body: { not: null } },
        select: { body: true },
      });
      if (!source?.body) throw echec("introuvable");
      return creer(
        piece.documentId,
        dernier + 1,
        source.body,
        motifDeRestauration(corps.rang),
      );
    }

    // ── Mise en forme ───────────────────────────────────────────────────

    /**
     * Sans pays, pas de mise en forme : les attendus d'une pièce diffèrent
     * fortement d'une destination à l'autre (WF-08 étape 1), et écrire sans
     * les connaître produirait le modèle pré-rempli générique que l'étape 3
     * écarte explicitement.
     */
    if (!piece.pays) {
      throw echec("etat_incompatible", {
        corps:
          "Ce dossier n'a pas encore de procédure figée, et les attendus d'une pièce rédigée dépendent de la destination.",
      });
    }

    const reponses = await reponsesDeLEntretien(piece.documentId);
    const repondues = Object.values(reponses).filter((r) => r.trim().length > 0).length;
    if (repondues < REPONSES_MINIMUM) {
      throw echec("etat_incompatible", {
        corps: `La mise en forme part de tes réponses, et de rien d'autre. Il en faut ${REPONSES_MINIMUM} au moins : tu en as ${repondues}.`,
      });
    }

    /**
     * Service absent : rien n'est débité du tout.
     *
     * Débiter puis rendre fonctionnait — les deux écritures s'annulent —
     * mais c'était du mouvement pour rien, et surtout une fenêtre : entre
     * le débit et le rendu, une interruption du serveur coûtait une
     * analyse au candidat pour un service dont on savait d'avance qu'il ne
     * répondrait pas. Ce qui est prévisible se vérifie avant.
     */
    if (!redactionConfiguree()) {
      return { produite: false, disponible: false, rang: null };
    }

    /**
     * Le débit précède l'appel, comme dans l'analyse d'une pièce : débiter
     * après laisserait une mise en forme gratuite à chaque interruption, et
     * INV-6 dit « jamais de dépassement silencieux », pas « le plus
     * souvent ». Ici l'échec reste imprévisible — le service est branché,
     * et c'est l'appel qui peut ne pas aboutir.
     */
    await debiterUneAnalyse(params.id!);

    const produit = await leRedacteur()({
      type: piece.type,
      objet: piece.objet,
      // Le pays vient de la règle figée à l'ouverture (INV-3), pas de la
      // règle publiée aujourd'hui : les attendus d'une pièce sont ceux de
      // la procédure sur laquelle le dossier a été ouvert.
      pays: piece.pays,
      reponses,
      questions: piece.questions.map((q, rang) => ({
        rang,
        section: q.section,
        intitule: q.intitule,
      })),
    });

    /*
      Les jetons consommés sont enregistrés **quoi qu'il advienne** —
      INV-6. Un appel interrompu au plafond a coûté ; ne pas l'écrire en
      ferait un appel gratuit dans B-07, qui recalcule des coûts à partir
      de ces nombres. C'est aussi la correction d'un `costMicros: 0` posé
      en dur ici, quand l'analyse d'une pièce, elle, le calculait.
    */
    await noterLesJetons(
      acteur!.id,
      params.id!,
      `redaction:${piece.type}`,
      produit.jetonsEntree,
      produit.jetonsSortie,
    );

    if (produit.etat === "SANS_TEXTE") {
      /**
       * Le service était branché et n'a rien rendu. La version n'est pas
       * créée et l'analyse est rendue — elle n'a rien rendu, exactement
       * comme une pièce illisible en WF-06. Sans ce retour, un candidat
       * paierait l'échec d'un appel.
       */
      await rendreUneTentative(
        params.id!,
        `Mise en forme non aboutie (${produit.cause}) : aucun texte rendu`,
      );
      console.warn(`[redaction] ${MOTIF_DAPPEL[produit.cause]} — ${produit.detail}`);
      return { produite: false, disponible: true, rang: null };
    }

    return creer(piece.documentId, dernier + 1, produit.texte, MOTIF_PREMIERE_VERSION);
  },
});

async function creer(documentId: string, rang: number, texte: string, motif: string) {
  const version = await db.documentVersion.create({
    data: {
      documentId,
      rank: rang,
      body: texte,
      wordCount: compterMotsTexte(texte),
      changeNote: motif,
    },
  });
  return { produite: true, disponible: true, rang: version.rank };
}
