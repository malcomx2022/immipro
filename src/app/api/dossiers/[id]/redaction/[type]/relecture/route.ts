import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { pieceARediger, reponsesDeLEntretien } from "@/server/lecture/redaction";
import { debiterUneAnalyse, rendreUneTentative } from "@/server/acces/quota";
import { exigerRedactionAssistee } from "@/server/acces/droits";
import { redactionConfiguree } from "@/server/redaction/redacteur";
import { laCritique } from "@/server/redaction/service";
import { noterLesJetons } from "@/server/redaction/usage";
import { MOTIF_DAPPEL } from "@/domain/ia/appel";

/**
 * L'analyse critique d'une version — R-04, WF-08 étape 4.
 *
 * ── Ce que cette route corrige ─────────────────────────────────────────
 *
 * `laCritique` existait, était comparée par l'état de service, et
 * **n'avait aucun appelant**. Le jour où elle aurait été branchée, rien
 * n'aurait produit la moindre remarque : la capacité serait passée à
 * « branchée » sans qu'un seul texte soit relu. C'est la même forme que la
 * sonde de balayage qui ne commandait rien (S.32) et que `moisEntre` sans
 * appelant (S.37) — une fonction dont le branchement ne change rien.
 *
 * Entre-temps, l'écran donnait son avis quand même : une liste vide lue
 * comme « rien à reprendre ». La date de relecture, posée ici, est ce qui
 * distingue les deux — et elle n'est posée que lorsque l'analyse a
 * réellement abouti.
 *
 * ── Ce qui est relu ────────────────────────────────────────────────────
 *
 * La **dernière** version, et elle seule. Relire un état antérieur
 * daterait un avis d'aujourd'hui sur un texte que le candidat a déjà
 * remplacé. Une version déjà relue ne l'est pas deux fois : l'avis ne
 * changerait pas, et RG-08.4 fait payer chaque itération.
 *
 * Les recoupements déterministes de RG-08.3 ne passent pas par ici. Ils se
 * recalculent à chaque lecture de l'écran, ne coûtent rien et ne dépendent
 * d'aucun service : la règle d'architecture 2 les garde en TypeScript.
 */
export const POST = route({
  nom: "dossier.redaction.relecture",
  acces: "candidat",
  /** Un appel au modèle et un débit de quota : exactement le périmètre du régime. */
  limite: "sensible",
  async traiter({ params, acteur }) {
    const piece = await pieceARediger(params.id!, params.type!, acteur!.id);
    // Arbitrage S.80 : l'analyse critique est un droit des packs Dossier et
    // Dossier Pro. Avant le débit, avant l'appel ; les recoupements
    // déterministes, eux, restent calculés pour tous à la lecture.
    await exigerRedactionAssistee(params.id!);

    if (!piece.pays) {
      throw echec("etat_incompatible", {
        corps:
          "Ce dossier n'a pas encore de procédure figée, et une relecture se fait au regard des attendus de la destination.",
      });
    }

    const derniere = await db.documentVersion.findFirst({
      where: { documentId: piece.documentId, body: { not: null } },
      orderBy: { rank: "desc" },
      select: { id: true, body: true, critiquedAt: true },
    });
    if (!derniere?.body) {
      throw echec("etat_incompatible", {
        corps: "Il n'y a pas encore de texte à relire sur cette pièce.",
      });
    }

    /*
      Déjà relue : rien à refaire, et rien à faire payer. La réponse dit
      `relue: true` plutôt que de lever — l'écran, lui, affiche déjà l'avis.
    */
    if (derniere.critiquedAt) {
      return { relue: true, disponible: true, remarques: null };
    }

    /*
      Service absent : rien n'est débité du tout. Débiter puis rendre
      fonctionne — les deux écritures s'annulent — mais laisse une fenêtre
      où une interruption coûte une analyse au candidat pour un service
      dont on savait d'avance qu'il ne répondrait pas.
    */
    if (!redactionConfiguree()) {
      return { relue: false, disponible: false, remarques: null };
    }

    // INV-6 — le débit précède l'appel, comme partout ailleurs.
    await debiterUneAnalyse(params.id!);

    const reponses = await reponsesDeLEntretien(piece.documentId);
    const avis = await laCritique()(derniere.body, {
      // La pièce et la destination sont nommées : ce qui écrit pour le
      // candidat n'a pas à déchiffrer un segment de route ni un code ISO.
      piece: piece.libelle,
      objet: piece.objet,
      // La règle figée à l'ouverture (INV-3), jamais celle publiée
      // aujourd'hui : on relit au regard de la procédure sur laquelle le
      // dossier a été ouvert.
      pays: piece.pays,
      reponses,
      questions: piece.questions.map((q, rang) => ({
        rang,
        section: q.section,
        intitule: q.intitule,
      })),
    });

    // INV-6 — ce qui a été consommé est écrit, même quand rien n'est rendu.
    await noterLesJetons(
      acteur!.id,
      params.id!,
      `relecture:${piece.type}`,
      avis.jetonsEntree,
      avis.jetonsSortie,
    );

    if (avis.etat === "SANS_AVIS") {
      /*
        Aucune date n'est posée : la version reste non relue, et l'écran
        continuera de dire qu'elle ne l'a pas été. C'est tout l'objet de
        ce lot — une relecture qui n'a pas abouti ne doit pas se lire
        comme une relecture sans remarque.
      */
      await rendreUneTentative(
        params.id!,
        `Relecture non aboutie (${avis.cause}) : aucun avis rendu`,
      );
      console.warn(`[relecture] ${MOTIF_DAPPEL[avis.cause]} — ${avis.detail}`);
      return { relue: false, disponible: true, remarques: null };
    }

    /*
      Les remarques et la date, ensemble ou pas du tout. Séparées, une
      interruption entre les deux écritures laisserait soit des remarques
      qu'aucune relecture ne date — invisibles à l'écran —, soit une
      relecture datée sans ses remarques, qui se lirait « rien à
      reprendre ». Le second cas est celui que ce lot corrige : il ne
      sera pas réintroduit par une transaction manquante.
    */
    await db.$transaction([
      ...avis.remarques.map((r) =>
        db.critiqueFinding.create({
          data: {
            versionId: derniere.id,
            kind: r.genre,
            title: r.titre,
            body: r.corps,
            gaps: r.ecarts ? (r.ecarts as never) : undefined,
          },
        }),
      ),
      db.documentVersion.update({
        where: { id: derniere.id },
        data: { critiquedAt: new Date() },
      }),
    ]);

    return { relue: true, disponible: true, remarques: avis.remarques.length };
  },
});
