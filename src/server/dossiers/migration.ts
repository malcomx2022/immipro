import type { Application } from "@prisma/client";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { miseEnEtat, REPRISE_APRES_PAUSE } from "@/domain/dossiers/etat";
import { checklistDepuis, recalculerCompletude } from "@/server/acces/dossiers";
import { remplacementDeLEcheancier } from "@/server/dossiers/echeancier";
import { payload } from "@/server/acces/regles";

/**
 * Arbitrage d'une divergence réglementaire — T-02, WF-11 étape 4.
 *
 * « Le candidat décide de migrer ou non. » INV-3 tient ici : la
 * publication d'une version n'a rien changé à son dossier, et c'est ce
 * choix qui change quelque chose. Une migration d'office aurait rendu ce
 * modèle inutile.
 *
 * ── Deux défauts, et le même mot en cause ───────────────────────────
 *
 * Le courrier et la notification d'une divergence critique disent : « Ton
 * dossier est mis en pause **le temps que tu regardes**. » La pause
 * finit donc quand il a regardé — migrer ou conserver, la question est
 * tranchée dans les deux cas. Elle ne finissait pas : « je conserve »
 * n'écrivait que l'arbitrage, et le dossier restait `SUSPENDU`. Un état
 * dont ni les rappels d'échéance (`ETATS_RAPPELABLES`) ni le passage en
 * `PRET` ne sortent. Le candidat qui choisissait de garder sa version
 * gelait son dossier pour de bon.
 *
 * Et « je migre » écrivait `ACTIF` sans poser `readyAt` : sur un dossier
 * prêt — celui qui a le plus à perdre à changer de version — la base
 * refusait la transaction entière, et le bouton ne faisait rien.
 *
 * ── Ce que « migrer » laissait derrière ─────────────────────────────
 *
 * La checklist de la nouvelle version, oui. L'échéancier, non — RG-09.3
 * demande pourtant « un recalcul intégral » dès qu'un délai réglementaire
 * change, et c'est exactement ce qu'une migration fait changer. Le dossier
 * repartait donc sur une version annonçant 150 jours d'instruction, avec
 * des dates calculées sur 90 : deux mois de retard, invisibles, sur le
 * geste même par lequel le candidat venait d'accepter la nouvelle règle.
 *
 * Le remplacement est partagé avec la replanification de WF-09 — une
 * implémentation, pas deux — et il est **dans la transaction** : un
 * dossier dont la version figée aurait changé sans son échéancier serait
 * exactement l'état qu'on vient de corriger.
 */

export type Decision = "MIGRER" | "CONSERVER";

export interface Arbitrage {
  decision: Decision;
  /** Libellés des pièces ajoutées par la nouvelle version. Vide si on conserve. */
  piecesAjoutees: readonly string[];
  mention: string;
}

const MENTION_CONSERVEE =
  "Ton dossier reste régi par la version que tu as figée à son ouverture. Rien ne change dans ta checklist, et il reprend son cours.";
const MENTION_MIGREE = "Aucune pièce déjà validée n'a été retirée.";

export async function arbitrerLaDivergence(
  dossier: Application,
  migrationId: string,
  decision: Decision,
  maintenant: Date = new Date(),
): Promise<Arbitrage> {
  const migration = await db.ruleMigration.findFirst({
    where: { id: migrationId, applicationId: dossier.id },
    include: { toRule: true },
  });
  if (!migration) throw echec("introuvable");
  if (migration.decision) {
    throw echec("etat_incompatible", { corps: "Cette divergence a déjà été arbitrée." });
  }

  /*
    La pause prend fin dans les deux branches, et seulement si elle avait
    lieu : un dossier que la divergence n'a pas suspendu — impact majeur,
    donc notification sans mise en pause — garde son état, et un dossier
    prêt reste prêt. Remettre tout le monde à `ACTIF` ferait redescendre
    un dossier complet sur un arbitrage qui ne touche rien.
  */
  const repris =
    dossier.status === "SUSPENDU" ? REPRISE_APRES_PAUSE : dossier.status;

  if (decision === "CONSERVER") {
    await db.$transaction([
      db.application.update({
        where: { id: dossier.id },
        data: miseEnEtat(repris, dossier.readyAt, maintenant),
      }),
      db.ruleMigration.update({
        where: { id: migration.id },
        data: { decision: "CONSERVER", decidedAt: maintenant },
      }),
    ]);
    // Le dossier peut être redevenu complet pendant la pause : le calcul
    // décide, la reprise ne fait que lui rendre la main.
    await recalculerCompletude(dossier.id);
    return { decision: "CONSERVER", piecesAjoutees: [], mention: MENTION_CONSERVEE };
  }

  const nouvelles = checklistDepuis(payload(migration.toRule));
  const existantes = await db.document.findMany({
    where: { applicationId: dossier.id },
    select: { code: true },
  });
  const connus = new Set(existantes.map((d) => d.code));
  const ajoutees = nouvelles.filter((p) => !connus.has(p.code));

  /*
    L'échéancier se recalcule sur la **date cible du dossier**, qui ne
    change pas : migrer accepte une autre règle, pas une autre rentrée. Ce
    sont les délais qui bougent sous elle.
  */
  const echeancier = await remplacementDeLEcheancier(
    dossier.id,
    payload(migration.toRule),
    dossier.targetDate,
  );

  await db.$transaction([
    // RG-11.1 — on ajoute, on ne retire pas.
    db.document.createMany({
      data: ajoutees.map((p) => ({ ...p, applicationId: dossier.id })),
    }),
    ...echeancier,
    db.application.update({
      where: { id: dossier.id },
      data: {
        visaRuleId: migration.toRuleId,
        // Une pièce vient peut-être d'être ajoutée à l'état « attendue » :
        // le dossier n'est plus prêt tant que le calcul n'a pas conclu.
        ...miseEnEtat(REPRISE_APRES_PAUSE, dossier.readyAt, maintenant),
      },
    }),
    db.ruleMigration.update({
      where: { id: migration.id },
      data: { decision: "MIGRER", decidedAt: maintenant },
    }),
  ]);

  await recalculerCompletude(dossier.id);

  return {
    decision: "MIGRER",
    piecesAjoutees: ajoutees.map((p) => p.label),
    mention: MENTION_MIGREE,
  };
}
