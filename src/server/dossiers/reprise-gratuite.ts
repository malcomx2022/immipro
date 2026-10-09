import { db } from "@/lib/db";
import { consommeUneAnalyse, type VerdictAnalyse } from "@/domain/dossiers/analyse";
import { solde } from "@/server/acces/quota";

/**
 * Cette lecture se paie-t-elle ? — RF-3, FON-03, 09/10/2026.
 *
 * La reprise après un verdict illisible ne se paie pas (WF-06, cas
 * limites) : c'est une lecture que *nous* n'avons pas su faire. Le worker
 * le savait depuis S.97 ; la promotion, elle, ne lançait l'analyse qu'avec
 * un solde positif, sans regarder le verdict d'avant, et le dépôt
 * annonçait la même chose. Exécuté avant correction : une meilleure
 * photo déposée à solde nul après « illisible » était conservée sans
 * lecture, alors que l'écran C-08 promettait « Cette reprise ne consomme
 * pas d'analyse ».
 *
 * Une décision, lue par les trois : le dépôt qui l'annonce, le balayage
 * qui lance la lecture, l'analyse qui débite. Le retrait d'autorisation
 * se décide ailleurs, et avant elle : il bloque toujours.
 */
export async function lectureAPayer(documentId: string, rang: number): Promise<boolean> {
  return consommeUneAnalyse(await verdictPrecedent(documentId, rang));
}

/**
 * Ce que le dépôt annonce (RG-06.5) : la pièce sera-t-elle lue ? Oui si la
 * lecture est gratuite, ou si le solde la couvre. Sans rang, c'est la
 * version à venir, après toutes celles qui existent.
 */
export async function analyseAnnoncee(
  applicationId: string,
  documentId: string,
  rang: number = Number.MAX_SAFE_INTEGER,
): Promise<boolean> {
  if (!(await lectureAPayer(documentId, rang))) return true;
  return (await solde(applicationId)) > 0;
}

/**
 * Le verdict rendu sur la version précédente de cette pièce, ou `null`
 * quand c'est le premier dépôt.
 *
 * Sur la version d'avant, et non sur `document.status` : le dépôt d'une
 * nouvelle version remet la pièce en analyse, si bien que l'état de la
 * pièce a déjà oublié pourquoi le candidat revient. Et sur le **rang**,
 * qui est ce que la version a de stable — une date d'analyse peut
 * manquer, une reprise peut être rejouée.
 */
export async function verdictPrecedent(
  documentId: string,
  rang: number,
): Promise<VerdictAnalyse | null> {
  const precedente = await db.documentVersion.findFirst({
    where: { documentId, rank: { lt: rang } },
    orderBy: { rank: "desc" },
    select: {
      analyses: {
        orderBy: { analyzedAt: "desc" },
        take: 1,
        select: { verdict: true },
      },
    },
  });
  const verdict = precedente?.analyses[0]?.verdict ?? null;
  /*
    `HORS_SUJET` n'est pas dans les verdicts du domaine : il est écrit par
    le chemin de reclassement, après une lecture débitée comme les autres.
    Une reprise après lui est donc payante — le candidat a déposé le
    mauvais fichier, la lecture a bien eu lieu et elle a bien rendu
    quelque chose.
  */
  return verdict === "CONFORME" || verdict === "A_CORRIGER" || verdict === "ILLISIBLE"
    ? verdict
    : null;
}
