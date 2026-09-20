import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { payload } from "@/server/acces/regles";
import { editorialDe } from "@/lib/contenu/destinations";
import type { Alerte } from "@/domain/notifications/alerte";
import type { VersionRegle } from "@/domain/notifications/divergence";

/**
 * Lecture des alertes — T-01 et T-02, WF-11.
 *
 * `emiseLe` et `echeanceLe` sortent en brut : le délai se calcule à
 * l'affichage. Écrit ici, « dans 7 jours » resterait affiché le jour même,
 * puis une semaine après — le défaut relevé au lot P1, qui vaut aussi pour
 * la couche qui sert la donnée.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function alertesDuCandidat(userId: string): Promise<Alerte[]> {
  const lignes = await db.notification.findMany({
    where: { userId },
    orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
    take: 50,
    include: { application: { include: { visaRule: true } } },
  });

  return lignes.map((a) => ({
    id: a.id,
    genre: a.kind,
    titre: a.title,
    corps: a.body,
    emiseLe: a.createdAt.toISOString(),
    // Le dossier est nommé, pas identifié : « dossier Pays-Bas » se lit,
    // un identifiant technique se recopie. C'est l'écran d'alertes, pas le
    // journal d'audit.
    ...(a.application ? { dossier: nomDuDossier(a.application) } : {}),
    ...(a.sourceUrl ? { source: hote(a.sourceUrl) } : {}),
    lue: a.readAt !== null,
    ...(a.migrationId ? { arbitrage: a.migrationId } : {}),
    ...(a.dueAt ? { echeanceLe: iso(a.dueAt) } : {}),
  }));
}

function nomDuDossier(application: {
  visaRule: { countryCode: string; visaType: string } | null;
}): string {
  if (!application.visaRule) return "dossier";
  const edito = editorialDe(application.visaRule.countryCode, application.visaRule.visaType);
  return edito?.pays ?? application.visaRule.countryCode;
}

const hote = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return url;
  }
};

export interface VueDivergence {
  ancienne: VersionRegle;
  nouvelle: VersionRegle;
  impact: "MINEUR" | "MAJEUR" | "CRITIQUE";
  destination: string;
  arbitree: boolean;
}

/**
 * Divergence à arbitrer — T-02.
 *
 * Les deux versions sont lues côte à côte depuis le référentiel, et non
 * depuis le diff stocké : le diff dit ce qui a changé, l'écran montre les
 * deux états. Reconstruire un état à partir d'un écart est le genre de
 * calcul qui se trompe d'un signe une fois sur dix.
 */
export async function divergenceAArbitrer(
  migrationId: string,
  userId: string,
): Promise<VueDivergence> {
  const migration = await db.ruleMigration.findFirst({
    where: { id: migrationId, application: { userId } },
    include: { fromRule: true, toRule: true },
  });
  if (!migration) throw echec("introuvable");

  const edito = editorialDe(migration.toRule.countryCode, migration.toRule.visaType);

  return {
    ancienne: versVersion(migration.fromRule),
    nouvelle: versVersion(migration.toRule),
    impact: migration.impact,
    destination: edito?.pays ?? migration.toRule.countryCode,
    arbitree: migration.decision !== null,
  };
}

function versVersion(regle: {
  version: number;
  rules: unknown;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
  countryCode: string;
  visaType: string;
}): VersionRegle {
  const p = payload(regle as never);
  const fonds = p.preuve_fonds;
  return {
    numero: regle.version,
    montant: fonds?.valeur ?? 0,
    devise: fonds?.devise ?? "",
    intitule: fonds
      ? `à prouver, ${fonds.periodicite === "mensuel" ? "par mois" : "pour l'année"}`
      : "aucune ressource à prouver",
    publieeLe: iso(regle.createdAt),
    ...(regle.effectiveTo ? { applicableJusquau: iso(regle.effectiveTo) } : {}),
    applicableDepuis: iso(regle.effectiveFrom),
  };
}
