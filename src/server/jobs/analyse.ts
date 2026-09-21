import type { VisaRulesPayload } from "@/domain/rules/schema";
import { db } from "@/lib/db";
import { payload } from "@/server/acces/regles";
import { debiterUneAnalyse, rendreUneAnalyse } from "@/server/acces/quota";
import { recalculerCompletude } from "@/server/acces/dossiers";
import { evaluerConditions, type ChampsExtraits } from "@/domain/dossiers/verification";
import { transmissibleALAnalyse } from "@/domain/dossiers/quarantaine";
import {
  coutMicrosDesJetons,
  tarifDepuisEnvironnement,
} from "@/domain/backoffice/couts";

/**
 * Analyse d'une pièce — WF-06.
 *
 * RG-06.1 tient l'architecture de ce fichier : « tout ce qui est vérifiable
 * sans IA l'est sans IA. L'IA n'intervient que sur l'extraction et la
 * cohérence narrative. » L'ordre est donc : lire les champs, puis les
 * confronter aux conditions en TypeScript. Le verdict ne sort jamais du
 * modèle — il sort de la comparaison.
 *
 * Cette séparation n'est pas une élégance. Une exigence de six mois de
 * validité de passeport est une soustraction de dates : la confier à un
 * modèle, c'est accepter qu'elle soit fausse une fois sur mille, sur une
 * décision qui fait rater un départ.
 *
 * **L'extraction n'est pas branchée.** `ANTHROPIC_API_KEY` est vide, et un
 * appel écrit à l'aveugle ne se vérifie pas. `extraire` est le point de
 * branchement, unique, et le job traite correctement son absence : la pièce
 * part en revue manuelle plutôt que d'être déclarée conforme sans lecture.
 */

export interface Tache {
  applicationId: string;
  documentId: string;
  versionId: string;
}

export type Extracteur = (
  objectKey: string,
  attendu: string,
) => Promise<{ champs: ChampsExtraits; jetonsEntree: number; jetonsSortie: number } | null>;

const NON_BRANCHE: Extracteur = async () => null;

export async function analyserUnePiece(
  tache: Tache,
  extraire: Extracteur = NON_BRANCHE,
): Promise<void> {
  const version = await db.documentVersion.findUnique({
    where: { id: tache.versionId },
    include: { document: { include: { application: { include: { visaRule: true } } } } },
  });
  if (!version || !version.objectKey) return;
  // I.D — aucun fichier non balayé n'est transmis à l'extraction. Le job
  // n'est mis en file qu'après promotion ; la condition est là pour le jour
  // où un autre appelant l'oubliera.
  if (!transmissibleALAnalyse(version.scanState)) return;

  const document = version.document;
  const regle = document.application.visaRule;

  // INV-6 — le débit précède l'appel. Débiter après laisserait une analyse
  // gratuite à chaque interruption, et l'invariant dit « jamais de
  // dépassement silencieux », pas « le plus souvent ».
  await debiterUneAnalyse(tache.applicationId);

  const lu = await extraire(version.objectKey, document.code);

  if (!lu) {
    // Aucune lecture : la pièce ne peut pas être déclarée conforme, et elle
    // ne peut pas être déclarée non conforme non plus. Elle part en revue
    // humaine, et l'analyse est rendue — elle n'a rien rendu.
    const analyse = await db.documentAnalysis.create({
      data: {
        versionId: version.id,
        verdict: "ILLISIBLE",
        title: "Cette pièce demande une relecture",
        body: "La lecture automatique n'a pas abouti. Un opérateur regarde ta pièce, tu n'as rien à refaire pour l'instant.",
        engineLog: "extracteur non branché",
        creditConsumed: false,
      },
    });
    await db.manualReview.create({
      data: { analysisId: analyse.id, reason: "ECHEC_TECHNIQUE" },
    });
    await db.document.update({
      where: { id: document.id },
      data: { status: "ILLISIBLE", feedback: analyse.body, analyzedAt: new Date() },
    });
    await rendreUneAnalyse(tache.applicationId, analyse.id, "Lecture automatique sans résultat");
    await recalculerCompletude(tache.applicationId);
    return;
  }

  const conditions = regle ? conditionsDeLaPiece(payload(regle), document.code) : [];
  const verdict = evaluerConditions(conditions, lu.champs);

  const analyse = await db.documentAnalysis.create({
    data: {
      versionId: version.id,
      verdict: verdict.verdict,
      fields: lu.champs as never,
      title: verdict.titre,
      body: verdict.corps,
      inputTokens: lu.jetonsEntree,
      outputTokens: lu.jetonsSortie,
    },
  });

  // Les jetons sont mesurés ; le prix du jeton ne l'est pas tant qu'aucun
  // tarif n'est configuré. `costMicros` porte alors zéro, et B-07 ne le lit
  // pas : il recalcule le coût depuis les jetons et le tarif du jour, pour
  // qu'une ligne écrite avant le tarif ne compte pas comme gratuite.
  await db.aiUsage.create({
    data: {
      userId: document.application.userId,
      applicationId: tache.applicationId,
      operation: `analyse:${document.code}`,
      inputTokens: lu.jetonsEntree,
      outputTokens: lu.jetonsSortie,
      costMicros:
        coutMicrosDesJetons(
          tarifDepuisEnvironnement(process.env),
          lu.jetonsEntree,
          lu.jetonsSortie,
        ) ?? 0,
    },
  });

  await db.document.update({
    where: { id: document.id },
    data: {
      status: verdict.verdict,
      feedback: verdict.corps,
      finding: verdict.constat,
      extracted: lu.champs as never,
      analyzedAt: new Date(),
      // Le remède suit l'état réel : une pièce déjà déposée se **remplace**,
      // elle ne s'ajoute pas. « Ajouter » sur une ligne où un fichier existe
      // déjà fait croire qu'il manque, et fait chercher ce qu'on a déjà
      // envoyé. C'est le remède qui commande le libellé du bouton.
      ...(verdict.verdict === "A_CORRIGER" && document.remedy === "TELEVERSER"
        ? { remedy: "REMPLACER" as const }
        : {}),
    },
  });

  await db.notification.create({
    data: {
      userId: document.application.userId,
      applicationId: tache.applicationId,
      kind: "ANALYSE",
      title: verdict.titre,
      body: verdict.corps,
    },
  });

  await recalculerCompletude(tache.applicationId);
  void analyse;
}

/**
 * Conditions qui portent sur cette pièce. Le rapprochement se fait par
 * préfixe de code — `passeport_validite_min` porte sur `passeport` — parce
 * que le référentiel nomme ses conditions d'après la pièce qu'elles
 * contraignent. Une condition qui ne se rattache à aucune pièce reste
 * évaluée au niveau du dossier, par le calcul de complétude.
 */
function conditionsDeLaPiece(p: VisaRulesPayload, codePiece: string) {
  return p.conditions.filter(
    (c) => c.code.startsWith(codePiece) || codePiece.startsWith(c.code.split("_")[0] ?? ""),
  );
}
