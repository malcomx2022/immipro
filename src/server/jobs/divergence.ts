import type { VisaRule } from "@prisma/client";
import { db } from "@/lib/db";
import { payload } from "@/server/acces/regles";
import {
  comparerLesVersions,
  mentionDuDelai,
  type Changement,
  type EvolutionDuDelai,
  type Impact,
} from "@/domain/rules/comparaison";
import { envoyerAlerteCritique } from "@/server/courrier";
import { suiteDeLEnvoi } from "@/domain/courrier/transport";
import { ETATS_A_PREVENIR, miseEnEtat } from "@/domain/dossiers/etat";
import { editorialDe } from "@/lib/contenu/destinations";
import { COMPTE_JOIGNABLE } from "@/server/acces/suppression";
import { autorisationAccordee } from "@/server/acces/consentements";

/**
 * Divergence réglementaire — WF-11.
 *
 * À la publication d'une version N+1, les dossiers rattachés à la version N
 * reçoivent une ligne `RuleMigration` à arbitrer. **Rien n'est migré
 * d'office** : INV-3 dit qu'un dossier fige sa version, et migrer à sa place
 * reviendrait à changer sa checklist sous ses yeux.
 *
 * L'impact décide du traitement, pas de la migration :
 * — mineur : information, le dossier ne bouge pas ;
 * — majeur : notification et proposition de migration ;
 * — critique : le dossier passe en `SUSPENDU` et un email nominatif part
 *   (RG-11.3), parce qu'une notification dans l'application n'est pas lue
 *   par quelqu'un qui n'ouvre pas l'application.
 *
 * ── L'email suit l'autorisation, et il ne la suivait pas ────────────
 *
 * A-05 propose « Alertes de changement de règles — **email** quand une
 * exigence de ta destination change ». Ce job n'a jamais lu le registre
 * des autorisations : l'email partait pour qui l'avait refusé comme pour
 * qui l'avait accordé, et l'interrupteur ne commandait rien. Constaté en
 * exécution : un candidat dont la ligne `ALERTES_REGLES` valait
 * `granted: false` recevait l'alerte critique.
 *
 * Le refus porte sur le **courrier**, et sur lui seul : la notification
 * dans l'application, la ligne d'arbitrage et la mise en pause ont lieu
 * de toute façon. Un consentement de communication ne décide pas de
 * l'état d'un dossier — l'exigence a changé, que le candidat ait voulu
 * l'apprendre par email ou non.
 *
 * Une autorisation jamais donnée ne vaut pas accord, comme partout
 * ailleurs dans le produit (`offresDuDossier` applique la même règle) :
 * A-05 dit qu'aucune autorisation n'est active par défaut. Ce que le
 * refus coûte est écrit sur l'écran, à côté de l'interrupteur.
 */
export type { Impact, Changement } from "@/domain/rules/comparaison";

/**
 * Comparaison de deux versions.
 *
 * La comparaison elle-même vit dans `domain/rules/comparaison.ts` : elle
 * est pure, et **deux appelants en dépendent** — cette propagation, et le
 * contrôle de relecture de WF-14 §4 à la publication. Une seule définition
 * de « une condition bloquante a bougé », pour les mêmes raisons qui ont
 * fait descendre le rattachement d'une condition à sa pièce (S.42).
 *
 * Ce qui reste ici : lire les deux payloads, ce qui demande Prisma.
 */
export function comparer(
  avant: VisaRule,
  apres: VisaRule,
): { impact: Impact; diff: Changement[]; delaiDInstruction: EvolutionDuDelai | null } {
  const { impact, diff, delaiDInstruction } = comparerLesVersions(
    payload(avant),
    payload(apres),
  );
  return { impact, diff, delaiDInstruction };
}

export interface Bilan {
  /**
   * Dossiers rattachés à **une** version antérieure, donc concernés.
   *
   * Pas seulement celle que cette publication remplace : un dossier qui
   * n'a pas arbitré la fois d'avant est resté plus loin en arrière, et
   * c'est précisément lui qu'on perdait.
   */
  dossiers: number;
  /** Dossiers alertés par cette passe. */
  alertes: number;
  /** Dossiers mis en pause (impact critique). */
  critiques: number;
  /** Déjà alertés par une passe précédente : rien n'est réécrit. */
  dejaAlertes: number;
  /**
   * Alertes remises à la passe suivante — le courrier critique n'a pas pu
   * partir et une coupure se dissipe. **Rien n'est marqué** : marquer
   * ferait de la panne la plus banale de la chaîne une alerte perdue.
   */
  aReprendre: number;
  /** Ce qui a empêché un dossier d'être prévenu, dossier par dossier. */
  incidents: readonly string[];
}

/**
 * La passe rend son bilan ; c'est l'ouvrier qui décide de rejouer.
 *
 * Séparer les deux est ce qui permet d'éprouver la règle : une fonction
 * qui lève enfouit son compte dans un message d'erreur, et la fumée ne
 * peut plus vérifier que **les autres dossiers ont bien été prévenus**,
 * ce qui est tout l'objet du correctif.
 */
export const doitRejouer = (bilan: Bilan): boolean => bilan.aReprendre > 0;

const BILAN_VIDE: Bilan = {
  dossiers: 0,
  alertes: 0,
  critiques: 0,
  dejaAlertes: 0,
  aReprendre: 0,
  incidents: [],
};

/**
 * RG-11.2 : les alertes sont ciblées par dossier, jamais diffusées à toute
 * la base. La requête part donc des dossiers rattachés à la version
 * précédente, et non des candidats intéressés par la destination.
 *
 * ── La passe s'arrêtait au premier dossier prêt ─────────────────────
 *
 * `status: "SUSPENDU"` s'écrivait sans poser `readyAt` : sur un dossier
 * `PRET` — celui qu'une condition d'éligibilité perdue touche le plus,
 * puisqu'il allait déposer —, la garde de la base refusait la ligne, le
 * job levait, et **tous les dossiers suivants de la liste ne recevaient
 * rien**. Ni notification, ni email, ni arbitrage à trancher. Le premier,
 * lui, restait à moitié traité : une notification lui disant « ton
 * dossier est mis en pause » devant un dossier toujours prêt.
 *
 * La file rejouait, et la reprise butait au même endroit — en ajoutant au
 * passage une seconde notification identique au premier dossier.
 *
 * Trois choses en découlent, et elles tiennent ensemble :
 *
 * 1. l'état s'écrit par `miseEnEtat`, comme partout ailleurs désormais ;
 * 2. **un dossier ne fait plus tomber les autres** : chacun est traité
 *    pour lui-même, et ce qui a échoué est compté puis relevé à la fin,
 *    pour que la file rejoue ;
 * 3. **la passe est reprenable** : `RuleMigration.alertedAt` marque le
 *    dossier prévenu, et une reprise le saute au lieu de le prévenir deux
 *    fois.
 */
export async function propagerLaPublication(
  nouvelleId: string,
  maintenant: Date = new Date(),
): Promise<Bilan> {
  const nouvelle = await db.visaRule.findUnique({ where: { id: nouvelleId } });
  if (!nouvelle) return { ...BILAN_VIDE };

  /*
    Toutes les versions antérieures, et pas seulement celle que cette
    publication remplace. Un dossier qui n'a pas arbitré la fois d'avant
    est resté sur v1 ; viser les seuls dossiers de v2 le laissait sans
    rien — et depuis que migrer vers une version archivée est refusé
    (RG-14.1), sans issue.

    Le filtre de compte est celui des passes de nuit : une alerte
    réglementaire part par courrier, et on n'écrit pas à qui a demandé
    l'oubli.
  */
  const dossiers = await db.application.findMany({
    where: {
      /*
        Trois états, et le dernier est celui que cette passe écrit
        elle-même : un dossier mis en pause par une divergence critique
        qu'il n'a pas encore arbitrée. Il en sortait de la liste, et la
        publication suivante ne le voyait plus — sa seule divergence
        visant une version que celle-ci venait d'archiver, il restait sans
        issue. La liste des états vit dans le domaine, avec le
        raisonnement.
      */
      status: { in: [...ETATS_A_PREVENIR] },
      user: COMPTE_JOIGNABLE,
      visaRule: {
        countryCode: nouvelle.countryCode,
        visaType: nouvelle.visaType,
        version: { lt: nouvelle.version },
      },
    },
    include: { user: { select: { email: true } }, visaRule: true },
  });

  const edito = editorialDe(nouvelle.countryCode, nouvelle.visaType);
  const destination = edito?.pays ?? nouvelle.countryCode;

  const bilan: Bilan = { ...BILAN_VIDE, dossiers: dossiers.length };
  const incidents: string[] = [];

  for (const dossier of dossiers) {
    try {
      if (!dossier.visaRule) continue;
      /*
        La comparaison se fait depuis **sa** version, pas depuis celle que
        la publication remplace. Un dossier resté sur v1 doit lire ce qui
        sépare v1 de v3 : lui montrer le diff v2→v3 lui cacherait la
        moitié de ce qui a changé pour lui.
      */
      const { impact, diff, delaiDInstruction } = comparer(dossier.visaRule, nouvelle);
      if (impact === "MINEUR" && diff.length === 0) continue;

      const migration = await db.ruleMigration.upsert({
        where: { applicationId_toRuleId: { applicationId: dossier.id, toRuleId: nouvelle.id } },
        create: {
          applicationId: dossier.id,
          fromRuleId: dossier.visaRule.id,
          toRuleId: nouvelle.id,
          impact,
          diff: diff as never,
        },
        update: {},
      });

      // Déjà prévenu par une passe précédente. La ligne d'arbitrage existe,
      // la notification aussi : la refaire écrirait un doublon dans la
      // liste d'alertes du candidat.
      if (migration.alertedAt !== null) {
        bilan.dejaAlertes += 1;
        continue;
      }

      /*
        Le courrier part **avant** la marque, comme pour les rappels
        d'échéance : une coupure ne doit rien laisser derrière elle, sans
        quoi le dossier passerait pour prévenu sans l'avoir été.

        Et il ne se perd plus dans un `catch` qui journalise : RG-11.3
        demande un email nominatif, et « l'email n'est pas parti » écrit
        sur la sortie d'erreur n'est pas un traitement.
      */
      /*
        Deux conditions, et la seconde manquait. Sans elle, un refus
        d'autorisation n'empêchait rien ; avec elle placée ailleurs — sur
        le `suite` plutôt qu'ici —, un dossier sans courrier à envoyer
        aurait été compté « à reprendre » et la passe suivante l'aurait
        repris sans fin, sans jamais rien envoyer.
      */
      const parCourrier =
        impact === "CRITIQUE" &&
        (await autorisationAccordee(dossier.userId, "alertes_regles"));
      const envoi = parCourrier
        ? await envoyerAlerteCritique(dossier.user.email, destination).catch(() => null)
        : null;
      const suite = envoi
        ? suiteDeLEnvoi(envoi.issue)
        : parCourrier
          ? { parti: false, renvoyable: true }
          : { parti: true, renvoyable: false };
      if (!suite.parti && suite.renvoyable) {
        bilan.aReprendre += 1;
        continue;
      }

      await db.$transaction([
        db.notification.create({
          data: {
            userId: dossier.userId,
            applicationId: dossier.id,
            kind: "REGLEMENTATION",
            title: titreDeLAlerte(impact, destination),
            body: corpsDeLAlerte(impact, delaiDInstruction),
            /*
              INV-8 : l'alerte cite la source de la règle qui a changé, et
              la date à laquelle elle a été vérifiée. Les deux sortent du
              même objet, dans la même expression : elles ne peuvent pas
              désigner deux versions différentes.
            */
            sourceUrl: nouvelle.sourceUrl,
            sourceVerifiedAt: nouvelle.verifiedAt,
            migrationId: migration.id,
          },
        }),
        ...(impact === "CRITIQUE"
          ? [
              db.application.update({
                where: { id: dossier.id },
                data: {
                  /*
                    Arbitrage S.78 : la date de la pause décide de la purge
                    de ses pièces, et l'état qu'elle interrompt reste
                    conservé. Une seconde divergence critique sur un
                    dossier déjà suspendu ne renouvelle ni l'une ni
                    l'autre : la pause court depuis le premier jour, et
                    l'état interrompu n'est pas « SUSPENDU ».
                  */
                  ...miseEnEtat("SUSPENDU", dossier, maintenant),
                  statusBeforeSuspension:
                    dossier.status === "SUSPENDU"
                      ? dossier.statusBeforeSuspension
                      : dossier.status,
                },
              }),
            ]
          : []),
        db.ruleMigration.update({
          where: { id: migration.id },
          data: { alertedAt: maintenant },
        }),
      ]);

      bilan.alertes += 1;
      if (impact === "CRITIQUE") bilan.critiques += 1;
    } catch (erreur) {
      /*
        Un dossier qui échoue ne fait plus tomber les autres — c'est tout
        le défaut. Il est compté, et la passe **lève à la fin** : la file
        rejoue, et la reprise saute ceux qui sont déjà prévenus.
      */
      bilan.aReprendre += 1;
      incidents.push(`${dossier.id} : ${cause(erreur)}`);
    }
  }

  return { ...bilan, incidents };
}

const titreDeLAlerte = (impact: Impact, destination: string): string => {
  switch (impact) {
    case "CRITIQUE":
      return `Une condition d'éligibilité a changé — ${destination}`;
    case "MAJEUR":
      return `Une exigence a changé — ${destination}`;
    default:
      return `Mise à jour de la réglementation — ${destination}`;
  }
};

/**
 * Le corps de l'alerte, et ce que RG-09.3 y ajoute.
 *
 * « Une notification explicite » : quand le délai d'instruction a bougé,
 * la phrase générique ne dit rien de ce qui compte. Le candidat ne perd
 * aucune exigence, il perd — ou gagne — des semaines sur un calendrier
 * qu'il a construit à rebours d'une rentrée. La mention est donc posée en
 * tête, avant le rappel que rien ne bouge sans son accord.
 */
const corpsDeLAlerte = (impact: Impact, delai: EvolutionDuDelai | null): string => {
  const calendrier = delai ? `${mentionDuDelai(delai)} ` : "";
  switch (impact) {
    case "CRITIQUE":
      return `${calendrier}Ton dossier est mis en pause le temps que tu regardes. Rien n'est supprimé, et ta checklist reste celle de la version figée à l'ouverture.`;
    case "MAJEUR":
      return `${calendrier}Ta checklist actuelle ne change pas. Tu peux comparer les deux versions et décider de migrer ou de conserver la tienne.`;
    default:
      return `${calendrier}Aucune condition bloquante n'est touchée. Ta checklist ne change pas.`;
  }
};

/**
 * La cause, en une ligne utilisable.
 *
 * Les erreurs de Prisma commencent par une ligne vide et recopient la
 * requête sur dix lignes : prendre `split("\n")[0]` rendait un incident
 * sans motif, ce qui est exactement ce qu'un incident ne doit pas être.
 */
const cause = (erreur: unknown): string => {
  const texte = erreur instanceof Error ? erreur.message : String(erreur);
  return texte.split("\n").map((l) => l.trim()).filter(Boolean).at(-1) ?? "cause inconnue";
};
