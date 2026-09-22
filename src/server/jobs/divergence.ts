import type { VisaRule } from "@prisma/client";
import { db } from "@/lib/db";
import { payload } from "@/server/acces/regles";
import { envoyerAlerteCritique } from "@/server/courrier";
import { suiteDeLEnvoi } from "@/domain/courrier/transport";
import { miseEnEtat } from "@/domain/dossiers/etat";
import { editorialDe } from "@/lib/contenu/destinations";

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
 */
export type Impact = "MINEUR" | "MAJEUR" | "CRITIQUE";

export interface Changement {
  champ: string;
  avant: unknown;
  apres: unknown;
}

/**
 * Comparaison de deux versions.
 *
 * Seules les conditions bloquantes et les pièces obligatoires décident de
 * l'impact : un délai de traitement qui s'allonge gêne, il ne rend pas
 * inéligible. Une condition bloquante qui disparaît est critique au même
 * titre qu'une qui apparaît — un dispositif supprimé fait perdre
 * l'éligibilité aussi sûrement qu'un seuil relevé.
 */
export function comparer(avant: VisaRule, apres: VisaRule): { impact: Impact; diff: Changement[] } {
  const a = payload(avant);
  const b = payload(apres);
  const diff: Changement[] = [];

  const bloquantesAvant = new Set(a.conditions.filter((c) => c.bloquant).map((c) => c.code));
  const bloquantesApres = new Set(b.conditions.filter((c) => c.bloquant).map((c) => c.code));
  const obligatoiresAvant = new Set(a.pieces_requises.filter((p) => p.obligatoire).map((p) => p.code));
  const obligatoiresApres = new Set(b.pieces_requises.filter((p) => p.obligatoire).map((p) => p.code));

  for (const code of bloquantesApres) {
    if (!bloquantesAvant.has(code)) diff.push({ champ: `condition.${code}`, avant: null, apres: "exigée" });
  }
  for (const code of bloquantesAvant) {
    if (!bloquantesApres.has(code)) diff.push({ champ: `condition.${code}`, avant: "exigée", apres: null });
  }
  for (const code of obligatoiresApres) {
    if (!obligatoiresAvant.has(code)) diff.push({ champ: `piece.${code}`, avant: null, apres: "obligatoire" });
  }
  for (const code of obligatoiresAvant) {
    if (!obligatoiresApres.has(code)) diff.push({ champ: `piece.${code}`, avant: "obligatoire", apres: null });
  }

  const fondsAvant = a.preuve_fonds?.valeur ?? null;
  const fondsApres = b.preuve_fonds?.valeur ?? null;
  if (fondsAvant !== fondsApres) {
    diff.push({ champ: "preuve_fonds", avant: fondsAvant, apres: fondsApres });
  }

  const langueAvant = a.niveau_langue_min;
  const langueApres = b.niveau_langue_min;
  if (langueAvant !== langueApres) {
    diff.push({ champ: "niveau_langue_min", avant: langueAvant, apres: langueApres });
  }

  const dispositifPerdu = a.apres_etudes?.dispositif != null && b.apres_etudes?.dispositif == null;
  const conditionPerdue = [...bloquantesAvant].some((c) => !bloquantesApres.has(c));

  const impact: Impact =
    dispositifPerdu || conditionPerdue
      ? "CRITIQUE"
      : diff.length > 0
        ? "MAJEUR"
        : "MINEUR";

  return { impact, diff };
}

export interface Bilan {
  /** Dossiers rattachés à la version précédente, donc concernés. */
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
  ancienneId: string,
  nouvelleId: string,
  maintenant: Date = new Date(),
): Promise<Bilan> {
  const [ancienne, nouvelle] = await Promise.all([
    db.visaRule.findUnique({ where: { id: ancienneId } }),
    db.visaRule.findUnique({ where: { id: nouvelleId } }),
  ]);
  if (!ancienne || !nouvelle) return { ...BILAN_VIDE };

  const { impact, diff } = comparer(ancienne, nouvelle);
  if (impact === "MINEUR" && diff.length === 0) return { ...BILAN_VIDE };

  const dossiers = await db.application.findMany({
    where: { visaRuleId: ancienne.id, status: { in: ["ACTIF", "PRET"] } },
    include: { user: { select: { email: true } } },
  });

  const edito = editorialDe(nouvelle.countryCode, nouvelle.visaType);
  const destination = edito?.pays ?? nouvelle.countryCode;

  const bilan: Bilan = { ...BILAN_VIDE, dossiers: dossiers.length };
  const incidents: string[] = [];

  for (const dossier of dossiers) {
    try {
      const migration = await db.ruleMigration.upsert({
        where: { applicationId_toRuleId: { applicationId: dossier.id, toRuleId: nouvelle.id } },
        create: {
          applicationId: dossier.id,
          fromRuleId: ancienne.id,
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
      const envoi =
        impact === "CRITIQUE"
          ? await envoyerAlerteCritique(dossier.user.email, destination).catch(() => null)
          : null;
      const suite = envoi
        ? suiteDeLEnvoi(envoi.issue)
        : impact === "CRITIQUE"
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
            body: corpsDeLAlerte(impact),
            // INV-8 : l'alerte cite la source de la règle qui a changé.
            sourceUrl: nouvelle.sourceUrl,
            migrationId: migration.id,
          },
        }),
        ...(impact === "CRITIQUE"
          ? [
              db.application.update({
                where: { id: dossier.id },
                data: miseEnEtat("SUSPENDU", dossier.readyAt, maintenant),
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

const corpsDeLAlerte = (impact: Impact): string => {
  switch (impact) {
    case "CRITIQUE":
      return "Ton dossier est mis en pause le temps que tu regardes. Rien n'est supprimé, et ta checklist reste celle de la version figée à l'ouverture.";
    case "MAJEUR":
      return "Ta checklist actuelle ne change pas. Tu peux comparer les deux versions et décider de migrer ou de conserver la tienne.";
    default:
      return "Aucune condition bloquante n'est touchée. Ta checklist ne change pas.";
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
