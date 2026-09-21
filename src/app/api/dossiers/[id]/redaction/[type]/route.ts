import { z } from "zod";
import { route } from "@/server/http/route";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { pieceARediger } from "@/server/lecture/redaction";
import { reponseAConserver } from "@/domain/redaction/entretien";

/**
 * Réponses de l'entretien guidé — R-02, WF-08.
 *
 * L'écran promettait depuis le début que les réponses étaient
 * « conservées à mesure », et rien ne quittait le navigateur :
 * `InterviewAnswer` n'était écrite nulle part, seule la purge la
 * connaissait pour l'effacer. Un candidat qui répondait à huit questions
 * puis fermait l'onglet perdait tout, après avoir lu qu'il pouvait
 * s'interrompre.
 *
 * **Le client n'envoie que le rang et le texte.** L'intitulé et la
 * section de la question viennent du référentiel, résolus ici : ils
 * décrivent la question posée, pas la réponse donnée, et les laisser
 * voyager permettrait d'enregistrer une réponse sous une question qui
 * n'a jamais été posée. C'est la règle de B-02 — l'écran envoie ce qu'il
 * édite, le serveur recolle le reste.
 *
 * `pieceARediger` porte la garde : elle filtre sur `application.userId`
 * et ne rend que les pièces dont le remède est « rédiger ». Un dossier
 * qui n'est pas le sien, ou une pièce qui ne se rédige pas, tombent donc
 * en « introuvable » sans qu'une seconde vérification soit écrite ici —
 * deux copies d'une règle d'accès finissent par diverger.
 */
export const PUT = route({
  nom: "dossier.entretien.reponse",
  acces: "candidat",
  /**
   * `lecture`, et non `sensible`. Le régime `sensible` couvre « ce qui
   * coûte de l'argent ou du quota, et ce qui devine un secret » : une
   * réponse d'entretien ne fait ni l'un ni l'autre, c'est le texte du
   * candidat dans son propre dossier. Et « conservées à mesure » veut
   * dire une écriture par question quittée — dix appels par minute
   * couperaient l'entretien au milieu, ce que `lecture` est justement
   * large pour éviter.
   */
  limite: "lecture",
  corps: z.object({
    rang: z.number().int().min(0).max(50),
    reponse: z.string().max(5000),
  }),
  async traiter({ corps, params, acteur }) {
    const piece = await pieceARediger(params.id!, params.type!, acteur!.id);
    const question = piece.questions[corps.rang];
    if (!question) {
      throw echec("introuvable", {
        corps: "Cette question n'existe pas dans l'entretien de cette pièce.",
      });
    }

    const reponse = reponseAConserver(corps.reponse);

    if (!reponse) {
      // `deleteMany` et non `delete` : effacer un champ jamais rempli est
      // un geste ordinaire, pas une erreur, et n'a rien à faire échouer.
      await db.interviewAnswer.deleteMany({
        where: { documentId: piece.documentId, rank: corps.rang },
      });
      return { conservee: false, repondues: await compter(piece.documentId) };
    }

    await db.interviewAnswer.upsert({
      where: { documentId_rank: { documentId: piece.documentId, rank: corps.rang } },
      update: { answer: reponse, section: question.section, question: question.intitule },
      create: {
        documentId: piece.documentId,
        rank: corps.rang,
        section: question.section,
        question: question.intitule,
        answer: reponse,
      },
    });

    return { conservee: true, repondues: await compter(piece.documentId) };
  },
});

const compter = (documentId: string) => db.interviewAnswer.count({ where: { documentId } });
