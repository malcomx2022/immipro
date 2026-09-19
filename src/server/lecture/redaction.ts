import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import type { PieceRedigeable } from "@/domain/redaction/entretien";
import type { Version, Paragraphe } from "@/domain/redaction/versions";
import type { Remarque, GenreRemarque, Ecart } from "@/domain/redaction/relecture";
import { PIECES_REDIGEABLES, pieceRedigeable } from "@/lib/contenu/redaction";

/**
 * Lecture de la rédaction assistée — R-01 à R-04, WF-08.
 *
 * Deux origines, et le partage n'est pas arbitraire. Les **questions de
 * l'entretien** sont éditoriales : elles ne se vérifient sur le site
 * d'aucune autorité, elles relèvent du métier de la plateforme, et elles
 * restent donc dans le contenu. **Ce que ce dossier-ci a à rédiger** vient
 * de sa checklist : ce sont les pièces dont le remède est « rédiger », et
 * elles dépendent de la règle figée à l'ouverture (INV-3).
 *
 * Le prototype écrivait « Exigée par Hanze University » en dur, pour tous
 * les dossiers. L'exigence suit maintenant la pièce : obligatoire ou
 * complémentaire, telle que le référentiel la classe.
 */

export interface PieceARediger extends PieceRedigeable {
  /** Identifiant du `Document` correspondant dans ce dossier. */
  documentId: string;
  /** Nombre de réponses déjà enregistrées : l'entretien se reprend. */
  reponsesEnregistrees: number;
  /** Version la plus récente, s'il y en a une. */
  dernierRang: number | null;
}

/**
 * Le type de route (`redaction/[type]`) est rapproché du code de la pièce en
 * base. Le référentiel nomme `lettre_motivation`, la route `lettre-motivation` :
 * un tiret contre un souligné, et rien d'autre.
 */
const versType = (code: string) => code.replace(/_/gu, "-");

export async function piecesARediger(
  applicationId: string,
  userId: string,
): Promise<PieceARediger[]> {
  const documents = await db.document.findMany({
    where: { applicationId, application: { userId }, remedy: "REDIGER" },
    include: {
      _count: { select: { interview: true } },
      versions: { orderBy: { rank: "desc" }, take: 1, select: { rank: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return documents.flatMap((d) => {
    const modele = pieceRedigeable(versType(d.code));
    // Une pièce à rédiger sans jeu de questions ne s'ouvre pas à moitié :
    // l'entretien guidé est ce qui la distingue d'un champ de texte libre.
    if (!modele) return [];
    return [
      {
        ...modele,
        libelle: d.label,
        exigence: d.required ? "Exigée par la destination" : "Recommandée",
        documentId: d.id,
        reponsesEnregistrees: d._count.interview,
        dernierRang: d.versions[0]?.rank ?? null,
      },
    ];
  });
}

export async function pieceARediger(
  applicationId: string,
  type: string,
  userId: string,
): Promise<PieceARediger> {
  const trouvee = (await piecesARediger(applicationId, userId)).find((p) => p.type === type);
  if (!trouvee) throw echec("introuvable");
  return trouvee;
}

/** Réponses déjà données, pour que l'entretien reprenne où il s'est arrêté. */
export async function reponsesDeLEntretien(
  documentId: string,
): Promise<Record<number, string>> {
  const lignes = await db.interviewAnswer.findMany({
    where: { documentId },
    orderBy: { rank: "asc" },
  });
  return Object.fromEntries(lignes.map((l) => [l.rank, l.answer]));
}

export async function versionsDeLaPiece(documentId: string): Promise<Version[]> {
  const versions = await db.documentVersion.findMany({
    where: { documentId, body: { not: null } },
    orderBy: { rank: "desc" },
  });
  return versions.map((v) => ({
    rang: v.rank,
    enregistreeLe: v.uploadedAt.toISOString(),
    paragraphes: enParagraphes(v.body ?? ""),
    motif: v.changeNote ?? "Enregistrement",
  }));
}

/**
 * Le texte est stocké entier et redécoupé à la lecture. Stocker les
 * paragraphes séparément obligerait à les recoller pour l'export PDF, et
 * une version se relit comme un texte, pas comme un tableau de morceaux.
 *
 * L'intertitre d'un paragraphe est sa première ligne quand elle est courte
 * et sans ponctuation finale — c'est la forme que produit la génération.
 */
export function enParagraphes(texte: string): Paragraphe[] {
  return texte
    .split(/\n{2,}/u)
    .map((bloc) => bloc.trim())
    .filter((bloc) => bloc.length > 0)
    .map((bloc) => {
      const [premiere, ...reste] = bloc.split("\n");
      const estIntertitre =
        premiere !== undefined && premiere.length <= 40 && !/[.!?]$/u.test(premiere.trim());
      return estIntertitre && reste.length > 0
        ? { section: premiere.trim(), texte: reste.join("\n").trim() }
        : { section: "", texte: bloc };
    });
}

export async function remarquesDeLaVersion(versionId: string): Promise<Remarque[]> {
  const findings = await db.critiqueFinding.findMany({
    where: { versionId, resolvedAt: null },
    orderBy: { createdAt: "asc" },
  });

  return findings.map((f) => ({
    id: f.id,
    genre: f.kind as GenreRemarque,
    titre: f.title,
    corps: f.body,
    ...(ecartsDe(f.gaps) ? { ecarts: ecartsDe(f.gaps)! } : {}),
    action: f.kind === "INCOHERENCE" ? "Corriger le passage" : "Reprendre ce paragraphe",
    ...(f.kind === "INCOHERENCE" ? { actionSecondaire: "Voir la pièce citée" } : {}),
  }));
}

/**
 * RG-08.3 : une incohérence nomme les deux valeurs qui divergent **et** la
 * pièce qui les porte. Sans la source, le candidat ne sait pas laquelle des
 * deux corriger.
 */
function ecartsDe(gaps: unknown): readonly [Ecart, Ecart] | null {
  if (!Array.isArray(gaps) || gaps.length !== 2) return null;
  const lus = gaps.map((g) =>
    typeof g === "object" && g !== null && "source" in g && "valeur" in g
      ? { source: String((g as Ecart).source), valeur: String((g as Ecart).valeur) }
      : null,
  );
  return lus[0] && lus[1] ? [lus[0], lus[1]] : null;
}

export { PIECES_REDIGEABLES };
