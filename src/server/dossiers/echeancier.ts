import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { echeancesDepuis } from "@/server/acces/dossiers";
import type { VisaRulesPayload } from "@/domain/rules/schema";

/**
 * Remplacement de l'échéancier d'un dossier — WF-09, RG-09.3.
 *
 * ── Deux appelants, et un seul le faisait ───────────────────────────
 *
 * L'ouverture d'un dossier dérive sa checklist **et** son échéancier du
 * même payload, « pour que les trois soient cohérents entre eux ». La
 * replanification les recalcule depuis la version figée. La migration
 * d'une divergence, elle, ajoutait les pièces de la nouvelle version et
 * laissait l'échéancier de l'ancienne.
 *
 * Le dossier se retrouvait donc rattaché à une version annonçant 150
 * jours d'instruction, avec des dates calculées sur 90. Exécuté avant
 * correction, sur un dossier visant le 1er septembre 2027 qui migre :
 *
 *     arbitrage : {"decision":"MIGRER",…}
 *     version figée = v2
 *     2027-06-03  depot   Dépôt de la demande
 *     dépôt toujours inchangé ? true
 *
 * Le candidat a fait le geste, et son calendrier ment quand même : il
 * déposerait le 3 juin pour une instruction de 150 jours, soit deux mois
 * après la date qui aurait permis d'être fixé à la rentrée.
 *
 * ── Ce que « intégral » veut dire ───────────────────────────────────
 *
 * RG-09.3 dit « recalcul intégral », et c'est le bon mot : ce ne sont pas
 * seulement les dates qui dépendent du délai d'instruction. Les
 * `delai_obtention_jours` des pièces ont pu changer, une pièce périssable
 * apparaître, une autre disparaître. L'échéancier se **remplace**, il ne
 * se retouche pas.
 *
 * `doneAt` est la seule chose qui traverse : une échéance déjà faite le
 * reste, et une donnée détruite par un recalcul ne se retrouve pas. Le
 * rapprochement se fait par `code`, qui est ce que la ligne a de stable —
 * son libellé, lui, vient du référentiel et change avec lui.
 *
 * `remindedAt` ne traverse pas, et c'est voulu : la date a bougé, le
 * rappel qui portait l'ancienne ne vaut plus. Le laisser ferait taire le
 * seul rappel qui compte, celui de la date qui vient de changer.
 *
 * ── Pourquoi des opérations, et non une écriture ────────────────────
 *
 * La fonction rend ce qu'il faut exécuter, elle ne l'exécute pas : ses
 * deux appelants remplacent l'échéancier **dans la même transaction** que
 * ce qui le motive — une date cible pour la replanification, une version
 * figée pour la migration. Écrire ici séparément laisserait, sur une
 * coupure, un dossier dont l'échéancier ne correspond ni à l'ancienne
 * version ni à la nouvelle.
 */
export async function remplacementDeLEcheancier(
  applicationId: string,
  p: VisaRulesPayload,
  dateCible: Date | null,
): Promise<Prisma.PrismaPromise<unknown>[]> {
  const faites = new Map(
    (
      await db.deadline.findMany({
        where: { applicationId, doneAt: { not: null } },
        select: { code: true, doneAt: true },
      })
    ).map((e) => [e.code, e.doneAt]),
  );

  const operations: Prisma.PrismaPromise<unknown>[] = [
    db.deadline.deleteMany({ where: { applicationId } }),
  ];

  /*
    Sans date cible, il n'y a rien à calculer à rebours — et l'ouverture
    n'en pose aucune dans ce cas. La suppression reste : un dossier qui
    perdrait sa date cible garderait sinon des dates calculées depuis
    elle.
  */
  if (dateCible === null) return operations;

  const nouvelles = echeancesDepuis(p, dateCible).map((e) => {
    const faite = faites.get(e.code as string);
    return { ...e, applicationId, ...(faite ? { doneAt: faite } : {}) };
  });
  if (nouvelles.length > 0) {
    operations.push(db.deadline.createMany({ data: nouvelles }));
  }
  return operations;
}
