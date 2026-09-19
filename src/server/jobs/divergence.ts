import type { VisaRule } from "@prisma/client";
import { db } from "@/lib/db";
import { payload } from "@/server/acces/regles";
import { envoyerAlerteCritique } from "@/server/courrier";
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
  dossiers: number;
  critiques: number;
}

/**
 * RG-11.2 : les alertes sont ciblées par dossier, jamais diffusées à toute
 * la base. La requête part donc des dossiers rattachés à la version
 * précédente, et non des candidats intéressés par la destination.
 */
export async function propagerLaPublication(
  ancienneId: string,
  nouvelleId: string,
): Promise<Bilan> {
  const [ancienne, nouvelle] = await Promise.all([
    db.visaRule.findUnique({ where: { id: ancienneId } }),
    db.visaRule.findUnique({ where: { id: nouvelleId } }),
  ]);
  if (!ancienne || !nouvelle) return { dossiers: 0, critiques: 0 };

  const { impact, diff } = comparer(ancienne, nouvelle);
  if (impact === "MINEUR" && diff.length === 0) return { dossiers: 0, critiques: 0 };

  const dossiers = await db.application.findMany({
    where: { visaRuleId: ancienne.id, status: { in: ["ACTIF", "PRET"] } },
    include: { user: { select: { email: true } } },
  });

  const edito = editorialDe(nouvelle.countryCode, nouvelle.visaType);
  const destination = edito?.pays ?? nouvelle.countryCode;

  for (const dossier of dossiers) {
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

    await db.notification.create({
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
    });

    if (impact === "CRITIQUE") {
      await db.application.update({ where: { id: dossier.id }, data: { status: "SUSPENDU" } });
      // RG-11.3 — doublé d'un email nominatif, pas seulement d'une
      // notification dans l'application.
      await envoyerAlerteCritique(dossier.user.email, destination).catch((e) =>
        console.error("[divergence] email critique non parti", e),
      );
    }
  }

  return { dossiers: dossiers.length, critiques: impact === "CRITIQUE" ? dossiers.length : 0 };
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
