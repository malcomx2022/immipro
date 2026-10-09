import { Prisma, type Application } from "@prisma/client";
import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { ETATS_FIGES, estFige, miseEnEtat, REPRISE_APRES_PAUSE } from "@/domain/dossiers/etat";
import { recalculerCompletude } from "@/server/acces/dossiers";
import { remplacementDeLEcheancier } from "@/server/dossiers/echeancier";
import { realignementDeLaChecklist, rejugementDesPieces } from "@/server/dossiers/checklist";
import { filtrePourCandidat, payload, reglePubliee } from "@/server/acces/regles";

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
 *
 * ── Migrer vers une version que la plateforme a retirée ─────────────
 *
 * RG-14.1 : « une fiche dont `nextReviewAt` est dépassée repasse
 * automatiquement en DRAFT et disparaît de l'affichage utilisateur. Une
 * donnée non relue ne peut pas continuer à se présenter comme fiable. »
 *
 * La veille dépubliait, et l'arbitrage proposait quand même. Exécuté avant
 * correction :
 *
 *     fiches dépubliées : 1
 *     v2 : relecture au 2027-01-01, statut DRAFT
 *     version proposée  : 2
 *     arbitrage : {"decision":"MIGRER",…}
 *     son dossier est désormais figé sur la v2, statut DRAFT
 *
 * `ouvrirDossier` **refuse** d'ouvrir un dossier sur cette règle — elle
 * passe par `reglePubliee`, qui porte le filtre candidat. La plateforme
 * refusait donc d'y commencer et acceptait d'y aller. Le même filtre garde
 * désormais les deux chemins.
 *
 * Il couvre plus que la relecture dépassée : une version archivée depuis
 * qu'une v3 est parue en sort aussi, et migrer vers elle aurait figé le
 * dossier sur une règle que la suivante a déjà remplacée.
 *
 * « Conserver » reste ouvert, toujours : c'est le choix sûr, et il met fin
 * à la pause. Refuser les deux laisserait le dossier suspendu pour une
 * relecture que le candidat ne peut pas faire avancer.
 */

export type Decision = "MIGRER" | "CONSERVER";

export interface Arbitrage {
  decision: Decision;
  /**
   * Libellés des pièces que la nouvelle version ajoute **ou** durcit —
   * une pièce complémentaire devenue obligatoire n'est pas « ajoutée » au
   * sens de la base, sa ligne existait, mais c'est bien elle que l'écran
   * a annoncée et c'est elle qui change le travail du candidat.
   * Vide si on conserve.
   */
  piecesAjoutees: readonly string[];
  /** Libellés des pièces que la nouvelle version ne demande plus. */
  piecesLiberees: readonly string[];
  mention: string;
}

const MENTION_CONSERVEE =
  "Ton dossier reste régi par la version que tu as figée à son ouverture. Rien ne change dans ta checklist, et il reprend son cours.";
const MENTION_MIGREE = "Aucune pièce déjà validée n'a été retirée.";

/**
 * Un dossier déposé ou clôturé — RF-1, FON-04, choix A-3 du 09/10/2026.
 *
 * L'alerte reste consultable, et « je conserve » s'enregistre à titre
 * historique : il ne change ni l'état ni la règle. « Je migre » est
 * refusé, et le refus dit pourquoi et ce qui reste possible.
 */
export const MENTION_CONSERVEE_FIGE =
  "Ta décision est enregistrée. Ton dossier garde la version figée à son ouverture, et rien ne change dans ce qui a été déposé.";
export const MENTION_MIGRATION_FIGEE =
  "Ton dossier est déposé ou clôturé : il garde la version figée à son ouverture et tout son historique. La nouvelle version ne s'applique pas à une démarche déjà partie. Tu peux enregistrer que tu conserves ta version.";

const DEJA_ARBITREE = "Cette divergence a déjà été arbitrée.";

const estIntrouvable = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025";

/**
 * Une écriture conditionnelle n'a rien trouvé : le dossier ou l'arbitrage
 * a changé depuis la lecture. La relecture dit lequel, et le refus le
 * nomme ; tout autre cas remonte tel quel.
 */
async function refusApresCourse(
  dossierId: string,
  migrationId: string,
  e: unknown,
): Promise<never> {
  if (!estIntrouvable(e)) throw e;
  const [dossier, migration] = await Promise.all([
    db.application.findUnique({ where: { id: dossierId }, select: { status: true } }),
    db.ruleMigration.findUnique({ where: { id: migrationId }, select: { decision: true } }),
  ]);
  if (migration?.decision) throw echec("etat_incompatible", { corps: DEJA_ARBITREE });
  if (dossier && estFige(dossier.status)) {
    throw echec("dossier_fige", { corps: MENTION_MIGRATION_FIGEE });
  }
  throw e;
}

/**
 * Le refus, et il est actionnable : il dit ce qui bloque, ce qui ne change
 * pas, et le geste qui reste possible. « Migration impossible » seul
 * laisserait chercher ce qu'on a mal fait.
 */
/**
 * Une version plus récente est déjà en vigueur : celle-ci ne reviendra
 * pas, et la divergence qui compte est ailleurs. Le dire évite d'attendre
 * une vérification qui n'aura pas lieu.
 */
export const MENTION_REMPLACEE =
  "Une version plus récente est entrée en vigueur depuis : c'est elle qui t'est proposée. Ton dossier garde la sienne et rien n'est perdu ; tu peux conserver ta version, ou appliquer la plus récente.";

export const MENTION_VERSION_RETIREE =
  "Cette version n'est plus celle en vigueur : nos veilleurs la revérifient. Ton dossier garde la sienne et rien n'est perdu. Tu peux conserver ta version dès maintenant ; si une nouvelle est mise en vigueur, elle te sera proposée.";

/**
 * Ce que la levée d'une pause défait — arbitrage S.78.
 *
 * Un dossier suspendu depuis onze mois a reçu l'annonce de la purge de ses
 * pièces ; à douze, elles sont parties. Lever la pause annule une purge
 * annoncée et pas encore faite. Après une purge faite, le dossier ne se dit
 * plus purgé : les pièces encore nécessaires sont redemandées — une pièce
 * `PURGEE` compte déjà comme manquante — et celles qu'il déposera suivront
 * les règles d'un dossier en cours, ce qu'un `purgedAt` resté posé
 * empêcherait, puisque la purge ne regarde que les dossiers non purgés.
 *
 * Rien d'autre : la date de la pause s'efface par `miseEnEtat`, l'état
 * interrompu reste noté, l'historique et les verdicts ne bougent pas.
 */
const leveeDeLaPause = (dossier: Application) =>
  dossier.status === "SUSPENDU" ? { purgeDueAt: null, purgedAt: null } : {};

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
  if (migration.decision) throw echec("etat_incompatible", { corps: DEJA_ARBITREE });

  /*
    ── Un dossier déposé ne se rouvre pas — RF-1, FON-04, 09/10/2026 ───

    La branche « migrer » posait `ACTIF` et changeait `visaRuleId` quel
    que soit l'état. Une divergence majeure prévient sans mettre en
    pause ; le candidat peut donc déposer avant de répondre, puis migrer
    depuis un ancien onglet. Exécuté avant correction : le dossier déposé
    repassait `ACTIF`, sur la nouvelle version, sa checklist réalignée.

    Le refus est ici, dans le service que la route appelle, et pas
    seulement à l'écran. Et il ne suffit pas de lire l'état en tête : un
    dépôt peut s'écrire entre cette lecture et l'écriture. Les écritures
    sont donc **conditionnelles** — l'état et l'arbitrage relus par la
    base au moment d'écrire —, et un dépôt concurrent fait échouer la
    transaction entière plutôt que d'être recouvert.

    Choix A-3 : « je conserve » reste ouvert sur un dossier figé. Il
    s'enregistre à titre historique, sans toucher au dossier.
  */
  const libre = { id: migration.id, decision: null };

  if (decision === "CONSERVER") {
    try {
      if (estFige(dossier.status)) {
        await db.ruleMigration.update({
          where: libre,
          data: { decision: "CONSERVER", decidedAt: maintenant },
        });
        return {
          decision: "CONSERVER",
          piecesAjoutees: [],
          piecesLiberees: [],
          mention: MENTION_CONSERVEE_FIGE,
        };
      }
      /*
        La pause prend fin, et seulement si elle avait lieu : un dossier
        que la divergence n'a pas suspendu — impact majeur, donc
        notification sans mise en pause — garde son état, et un dossier
        prêt reste prêt. Il n'est même pas réécrit : réécrire l'état lu
        en tête recouvrirait un dépôt déclaré entre-temps.
      */
      await db.$transaction([
        ...(dossier.status === "SUSPENDU"
          ? [
              db.application.update({
                where: { id: dossier.id, status: "SUSPENDU" },
                data: {
                  ...miseEnEtat(REPRISE_APRES_PAUSE, dossier, maintenant),
                  ...leveeDeLaPause(dossier),
                },
              }),
            ]
          : []),
        db.ruleMigration.update({
          where: libre,
          data: { decision: "CONSERVER", decidedAt: maintenant },
        }),
      ]);
    } catch (e) {
      return refusApresCourse(dossier.id, migration.id, e);
    }
    // Le dossier peut être redevenu complet pendant la pause : le calcul
    // décide, la reprise ne fait que lui rendre la main.
    await recalculerCompletude(dossier.id);
    return {
      decision: "CONSERVER",
      piecesAjoutees: [],
      piecesLiberees: [],
      mention: MENTION_CONSERVEE,
    };
  }

  if (estFige(dossier.status)) throw echec("dossier_fige", { corps: MENTION_MIGRATION_FIGEE });

  /*
    RG-14.1. La version visée doit être **en vigueur aujourd'hui**, et pas
    seulement avoir existé le jour de l'alerte : entre les deux, la veille
    a pu la retirer faute de relecture, ou une v3 a pu l'archiver. Le
    filtre est celui de `reglePubliee`, donc le même qu'à l'ouverture d'un
    dossier — refuser d'y commencer et accepter d'y migrer n'avait pas de
    sens.
  */
  if ((await reglePubliee(migration.toRuleId, maintenant)) === null) {
    /*
      La cause décide du message. Une version **remplacée** ne reviendra
      jamais en vigueur ; une version **en relecture** reviendra. Promettre
      une vérification sur la première fait attendre pour rien, alors
      qu'une divergence arbitrable l'attend déjà.
    */
    const plusRecente = await db.visaRule.count({
      where: {
        countryCode: migration.toRule.countryCode,
        visaType: migration.toRule.visaType,
        version: { gt: migration.toRule.version },
        ...filtrePourCandidat(maintenant),
      },
    });
    throw echec("etat_incompatible", {
      corps: plusRecente > 0 ? MENTION_REMPLACEE : MENTION_VERSION_RETIREE,
    });
  }

  /*
    La checklist se réaligne **en entier** sur la nouvelle version : une
    pièce qui survit à la migration gardait sinon le libellé, le caractère
    obligatoire, le remède et la durée de validité de l'ancienne. L'écran
    annonçait « ajoutée » une pièce devenue obligatoire, et la migration
    ne la rendait pas obligatoire.
  */
  const checklist = await realignementDeLaChecklist(dossier.id, payload(migration.toRule));

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

  /*
    Et les pièces déjà lues sont re-jugées sur les conditions de la
    nouvelle version, depuis ce qui est déjà en base : un seuil relevé
    laissait sinon une pièce conforme, et le dossier pouvait être déclaré
    prêt sur une pièce que l'autorité refuserait. Rien n'est redemandé au
    candidat, et aucune analyse n'est débitée (INV-6).
  */
  const rejugement = await rejugementDesPieces(
    dossier.id,
    payload(migration.toRule),
    dossier.targetDate,
  );

  await db
    .$transaction([
      // RG-11.1 — on ajoute et on réaligne, on ne retire pas.
      ...checklist.operations,
      ...echeancier,
      /*
        Après le réalignement, et non avant : celui-ci réécrit le remède
        depuis le référentiel, et le re-jugement le repose sur « remplacer »
        quand la pièce est à corriger.
      */
      ...rejugement.operations,
      /*
        Conditionnelle : un dépôt déclaré depuis la lecture laisse cette
        écriture sans ligne, et toute la migration est annulée — la
        checklist et l'échéancier compris.
      */
      db.application.update({
        where: { id: dossier.id, status: { notIn: [...ETATS_FIGES] } },
        data: {
          visaRuleId: migration.toRuleId,
          // Une pièce vient peut-être d'être ajoutée à l'état « attendue » :
          // le dossier n'est plus prêt tant que le calcul n'a pas conclu.
          ...miseEnEtat(REPRISE_APRES_PAUSE, dossier, maintenant),
          ...leveeDeLaPause(dossier),
        },
      }),
      // Et un second envoi du même arbitrage ne passe pas derrière le premier.
      db.ruleMigration.update({
        where: libre,
        data: { decision: "MIGRER", decidedAt: maintenant },
      }),
    ])
    .catch((e: unknown) => refusApresCourse(dossier.id, migration.id, e));

  await recalculerCompletude(dossier.id);

  /*
    Les pièces réalignées comptent parmi celles que le candidat doit
    regarder : une pièce complémentaire devenue obligatoire n'est pas
    « ajoutée » au sens de la base — sa ligne existait —, mais c'est bien
    ce que l'écran lui a annoncé, et c'est ce qui change son travail.
  */
  return {
    decision: "MIGRER",
    /*
      Une pièce déclassée par le re-jugement compte parmi celles que le
      candidat doit regarder : sa ligne existait et son fichier est là,
      mais ce qu'on en dit a changé, et c'est ce qui change son travail.
    */
    piecesAjoutees: [...checklist.ajoutees, ...checklist.realignees, ...rejugement.declassees],
    piecesLiberees: checklist.liberees,
    mention: MENTION_MIGREE,
  };
}
