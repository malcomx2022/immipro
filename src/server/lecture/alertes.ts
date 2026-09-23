import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { filtrePourCandidat, payload, reglePubliee } from "@/server/acces/regles";
import { editorialDe } from "@/lib/contenu/destinations";
import type { Alerte } from "@/domain/notifications/alerte";
import type {
  BlocageDeMigration,
  VersionRegle,
} from "@/domain/notifications/divergence";
import {
  comparerLesVersions,
  type EvolutionDesPieces,
} from "@/domain/rules/comparaison";

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
    /*
      INV-8 : source et date de vérification, ou rien. Elles sont écrites
      ensemble par la propagation, depuis la règle qui a changé ; les
      relire ensemble est la seule façon de ne pas répéter le défaut —
      cette lecture refabriquait la source avec un `hote()` local et
      laissait la date en base.
    */
    ...(a.sourceUrl && a.sourceVerifiedAt
      ? { mention: { source: hote(a.sourceUrl), verifieeLe: iso(a.sourceVerifiedAt) } }
      : {}),
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
  /**
   * Les pièces obligatoires que la nouvelle version ajoute ou retire,
   * nommées. Elles viennent de la comparaison des deux payloads et non du
   * `diff` stocké : celui-ci ne porte que des codes de référentiel, et un
   * code ne se montre pas à un candidat.
   */
  pieces: EvolutionDesPieces;
  /**
   * Ce qui empêche de migrer, quand quelque chose l'empêche — RG-14.1.
   *
   * Un booléen ne suffisait pas : `reglePubliee` rend `null` pour deux
   * raisons qui ne se disent pas de la même façon. Une version **remplacée**
   * ne reviendra jamais en vigueur ; une version **en relecture**
   * reviendra. Les confondre faisait attendre une vérification qui n'a pas
   * lieu.
   *
   * L'écran doit le dire **avant** le clic : proposer un bouton que le
   * serveur refusera est la même faute qu'un bouton qui ne fait rien.
   */
  blocage: BlocageDeMigration;
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
    pieces: comparerLesVersions(payload(migration.fromRule), payload(migration.toRule))
      .piecesTouchees,
    // Le même filtre qu'à l'ouverture d'un dossier, et que l'arbitrage
    // applique côté écriture : une seule définition de « en vigueur ».
    blocage: await blocageDeLaMigration(migration.toRule),
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
    // Ce qui décide de la date de dépôt de l'échéancier : l'arbitrage le
    // montre, sans quoi une version qui ne change que lui s'affiche à
    // l'identique de l'autre.
    delai: p.delai_traitement_jours,
    ...(regle.effectiveTo ? { applicableJusquau: iso(regle.effectiveTo) } : {}),
    applicableDepuis: iso(regle.effectiveFrom),
  };
}


/**
 * Pourquoi cette version n'est plus applicable, et laquelle des deux
 * raisons c'est — RG-14.1.
 *
 * Une version **remplacée** ne reviendra pas : une plus récente est en
 * vigueur, et c'est elle que le candidat se verra proposer. Une version
 * **en relecture** reviendra dès que nos veilleurs l'auront revérifiée.
 * Dire l'une pour l'autre fait attendre pour rien.
 */
async function blocageDeLaMigration(visee: {
  id: string;
  countryCode: string;
  visaType: string;
  version: number;
}): Promise<BlocageDeMigration> {
  if ((await reglePubliee(visee.id)) !== null) return "AUCUN";
  const plusRecente = await db.visaRule.count({
    where: {
      countryCode: visee.countryCode,
      visaType: visee.visaType,
      version: { gt: visee.version },
      ...filtrePourCandidat(new Date()),
    },
  });
  return plusRecente > 0 ? "REMPLACEE" : "EN_RELECTURE";
}
