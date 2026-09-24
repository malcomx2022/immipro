import type { Application, Document, DocumentVersion, VisaRule } from "@prisma/client";
import { db } from "@/lib/db";
import { aidePourLaChecklist, type AideDeLEtape } from "@/domain/dossiers/aide-de-letape";
import { echec } from "@/server/http/echecs";
import { versFiche, payload, mentionDe } from "@/server/acces/regles";
import { versDossier, versPiece } from "@/server/vue/dossier";
import { compteur } from "@/server/acces/quota";
import type { Dossier } from "@/domain/dossiers/dossier";
import { trierDossiers } from "@/domain/dossiers/dossier";
import type { Piece } from "@/domain/dossiers/piece";
import { grouperPourCompletude } from "@/domain/dossiers/piece";
import type { Echeance } from "@/domain/dossiers/echeancier";
import { dateAuPlusTot } from "@/domain/dossiers/echeancier";
import type { CalendrierAEvaluer } from "@/domain/dossiers/faisabilite";
import type { ChampLu, ResultatAnalyse, VerdictAnalyse } from "@/domain/dossiers/analyse";
import { exigencesDeLaPiece } from "@/domain/dossiers/verification";
import type { Quota } from "@/domain/dossiers/televersement";
import { getPack } from "@/domain/payments/pricing";

/**
 * Lecture des dossiers, partagée par les pages serveur et les routes.
 *
 * Les fonctions rendent les types du domaine que les écrans consomment déjà
 * — `Dossier`, `Piece`, `Echeance`, `ResultatAnalyse`, `Quota`. C'est la
 * condition pour que le branchement soit une substitution : un écran change
 * l'origine de sa donnée, pas sa forme.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);

type DossierComplet = Application & { documents: Document[]; visaRule: VisaRule | null };

/**
 * Tableau de bord — C-01.
 *
 * Un dossier dont la règle figée ne se relit plus n'est pas masqué : il
 * serait invisible sans explication, et le candidat a payé pour lui. Il
 * remonte avec sa destination réduite à ce que la base sait encore en dire.
 */
export async function tableauDeBord(userId: string): Promise<Dossier[]> {
  const dossiers = await db.application.findMany({
    where: { userId },
    include: { documents: true, visaRule: true },
    orderBy: { createdAt: "desc" },
  });

  const vues = dossiers.flatMap((d) => {
    const fiche = d.visaRule ? versFiche(d.visaRule) : null;
    return fiche ? [versDossier(d, d.documents, fiche, d.visaRule)] : [];
  });
  return trierDossiers(vues);
}

async function charger(id: string, userId: string): Promise<DossierComplet> {
  const dossier = await db.application.findFirst({
    where: { id, userId },
    include: {
      documents: { orderBy: [{ family: "asc" }, { createdAt: "asc" }] },
      visaRule: true,
    },
  });
  if (!dossier) throw echec("introuvable");
  return dossier;
}

export interface VueDossier {
  dossier: Dossier;
  pieces: Piece[];
  checklist: ReturnType<typeof grouperPourCompletude>;
  quota: { restantes: number; total: number };
  /**
   * Aide fonctionnelle de l'étape en cours, s'il y en a une (K.A). Elle se
   * calcule ici et non dans `versPiece` : elle se lit sur le code du
   * référentiel — `assurance_maladie` — que la pastille de l'écran a déjà
   * réduit à trois lettres.
   */
  aide: AideDeLEtape | null;
}

/** Checklist d'un dossier — C-06. */
export async function vueDuDossier(id: string, userId: string): Promise<VueDossier> {
  const brut = await charger(id, userId);
  const fiche = brut.visaRule ? versFiche(brut.visaRule) : null;
  if (!fiche) throw echec("regle_indisponible");

  // Un seul jour pour toute la lecture — et jamais l'index du tableau.
  const aujourdhui = iso(new Date());
  const pieces = brut.documents.map((d) => versPiece(d, aujourdhui));
  return {
    dossier: versDossier(brut, brut.documents, fiche, brut.visaRule),
    pieces,
    checklist: grouperPourCompletude(pieces),
    quota: await compteur(brut.id),
    aide: aidePourLaChecklist(
      brut.documents.map((d) => ({
        code: d.code,
        libelle: d.label,
        conforme: d.status === "CONFORME",
      })),
    ),
  };
}

/**
 * Quota tel que l'écran de dépôt l'affiche — C-07.
 *
 * Le libellé du pack vient du dernier achat confirmé. Sans achat, le pack
 * n'a pas de nom : écrire « Essentiel » par défaut annoncerait un quota que
 * personne n'a payé.
 */
export async function quotaDuDossier(applicationId: string): Promise<Quota> {
  const compte = await compteur(applicationId);
  const achat = await db.transaction.findFirst({
    where: { applicationId, status: "CONFIRMEE" },
    orderBy: { confirmedAt: "desc" },
    select: { packCode: true },
  });
  const pack = achat ? getPack(achat.packCode) : undefined;
  return { restantes: compte.restantes, total: compte.total, pack: pack?.libelle ?? "sans pack" };
}

/**
 * Échéancier — C-10, WF-09.
 *
 * Deux origines, et la distinction compte à l'écran. Les échéances en table
 * ont été calculées à l'ouverture depuis les délais du référentiel : ce sont
 * des dates limites. Celles des pièces périssables sont des « au plus tôt »,
 * recalculées à l'affichage depuis le dépôt visé — demander un relevé de
 * trois mois six mois à l'avance le fait redemander deux fois.
 */
export async function echeancierDuDossier(id: string, userId: string): Promise<{
  /** Date cible — rentrée ou prise de poste. Le dépôt s'en déduit. */
  departVise: string | null;
  echeances: Echeance[];
  calendrier: CalendrierAEvaluer;
}> {
  const dossier = await charger(id, userId);
  const enTable = await db.deadline.findMany({
    where: { applicationId: dossier.id },
    orderBy: { dueAt: "asc" },
  });

  const departVise = dossier.targetDate ? iso(dossier.targetDate) : null;

  /**
   * La date de dépôt, et non la date cible.
   *
   * Une pièce valable trois mois doit l'être **le jour du dépôt**, pas le
   * jour de la rentrée : calculée depuis la date cible, la date « au plus
   * tôt » tombait deux jours avant le dépôt, c'est-à-dire trop tard pour
   * une pièce qui met trois semaines à venir. Le dépôt est l'échéance que
   * l'ouverture a calculée en retirant le délai d'instruction (RG-09.1) ;
   * sans elle, on retombe sur la date cible, qui reste une approximation
   * prudente.
   */
  const depot = enTable.find((e) => e.code === "depot");
  const reference = depot ? iso(depot.dueAt) : departVise;

  const limites: Echeance[] = enTable.map((e) => ({
    id: e.code,
    date: iso(e.dueAt),
    titre: e.label,
    detail: detailDeLEcheance(e.code, dossier.visaRule),
    imposee: e.code === "depot",
  }));

  const perissables: Echeance[] = reference
    ? dossier.documents
        .filter((d) => d.validityMonths !== null && d.status !== "CONFORME")
        .map((d) => ({
          id: `${d.code}-au-plus-tot`,
          date: dateAuPlusTot(reference, d.validityMonths!),
          titre: `Demander : ${d.label}`,
          detail: `Cette pièce vaut ${d.validityMonths} mois, et doit être valable le jour du dépôt. Demandée plus tôt, elle sera périmée à ce moment-là et il faudra la redemander.`,
          perissable: true,
        }))
    : [];

  return {
    departVise,
    echeances: [...limites, ...perissables].sort((a, b) => a.date.localeCompare(b.date)),
    calendrier: calendrierAEvaluer(dossier),
  };
}

/**
 * Ce qu'il faut pour répondre à « le calendrier tient-il ? » — WF-09 étape 4.
 *
 * Les délais viennent de la règle **figée** (RG-09.1, INV-3), jamais de la
 * règle publiée du jour : un dossier ouvert sur un délai de 30 jours se
 * juge sur 30 jours, même si l'autorité en annonce 60 depuis.
 *
 * Les pièces à **rédiger** sont hors du calcul. Leur délai ne dépend
 * d'aucune autorité : une lettre de motivation ne met pas quarante-cinq
 * jours à venir, et l'absence de `delai_obtention_jours` sur ces pièces
 * n'est pas une inconnue — c'est un délai qui n'existe pas. Les compter
 * mettrait tous les dossiers en « indéterminé », c'est-à-dire nulle part.
 */
export interface DossierAEvaluer {
  targetDate: Date | null;
  visaRule: VisaRule | null;
  documents: readonly Pick<
    Document,
    "code" | "label" | "status" | "remedy" | "required"
  >[];
}

export function calendrierAEvaluer(
  dossier: DossierAEvaluer,
  aujourdhui = new Date(),
): CalendrierAEvaluer {
  const regle = dossier.visaRule;
  const p = regle ? payload(regle) : null;
  const delaiDe = (code: string): number | null =>
    p?.pieces_requises.find((r) => r.code === code)?.delai_obtention_jours ?? null;

  return {
    aujourdhui: aujourdhui.toISOString().slice(0, 10),
    dateCible: dossier.targetDate ? iso(dossier.targetDate) : null,
    delaiInstructionJours: p?.delai_traitement_jours?.max ?? null,
    aObtenir: dossier.documents
      .filter((d) => d.status !== "CONFORME" && d.remedy !== "REDIGER")
      .map((d) => ({
        code: d.code,
        libelle: d.label,
        delaiJours: delaiDe(d.code),
        obligatoire: d.required,
      })),
  };
}

/**
 * Le détail dit pourquoi cette date, jamais une date nue. Le délai vient du
 * référentiel (RG-09.1) ; sans lui, la phrase ne prétend pas en connaître un.
 */
function detailDeLEcheance(code: string, regle: VisaRule | null): string {
  if (!regle) return "Date calculée à l'ouverture du dossier.";
  const p = payload(regle);
  if (code === "depot") {
    return p.delai_traitement_jours
      ? `L'instruction prend ${p.delai_traitement_jours.min} à ${p.delai_traitement_jours.max} jours selon l'autorité : au-delà de cette date, la réponse arriverait après ton départ visé.`
      : "Date de dépôt visée.";
  }
  const piece = p.pieces_requises.find((r) => r.code === code);
  if (piece?.delai_obtention_jours) {
    return `Compte ${piece.delai_obtention_jours} jours d'obtention pour cette pièce, délai annoncé par l'autorité.`;
  }
  return "Date calculée à rebours du dépôt visé.";
}

/**
 * Analyse de la dernière version d'une pièce — C-08.
 *
 * Rend `null` quand aucune analyse n'existe : l'écran montre alors son état
 * d'attente, plutôt qu'un résultat vide qui se lirait comme un verdict.
 */
export async function analyseDeLaPiece(
  pieceId: string,
  applicationId: string,
  userId: string,
): Promise<{ piece: Piece; analyse: ResultatAnalyse | null; versions: DocumentVersion[] }> {
  const document = await db.document.findFirst({
    where: { id: pieceId, applicationId, application: { userId } },
    include: {
      versions: {
        orderBy: { rank: "desc" },
        include: { analyses: { orderBy: { analyzedAt: "desc" }, take: 1 } },
      },
      application: { include: { visaRule: true } },
    },
  });
  if (!document) throw echec("introuvable");

  const derniere = document.versions[0];
  const analyse = derniere?.analyses[0];
  const regle = document.application.visaRule;

  return {
    piece: versPiece(document),
    versions: document.versions,
    analyse: analyse
      ? {
          verdict: verdictAffichable(analyse.verdict),
          fichier: nomDuFichier(derniere!),
          analyseeLe: analyse.analyzedAt.toISOString(),
          pages: 1,
          titre: analyse.title,
          corps: analyse.body,
          champs: champsLus(analyse.fields),
          exigences: regle ? exigencesDeLaPiece(payload(regle).conditions, document.code) : [],
          // Pas de règle relisible, pas d'exigence citée — et donc pas de
          // source à porter. INV-8 ne se tient pas avec une mention vide.
          mention: regle ? mentionDe(regle) : null,
        }
      : null,
  };
}

/**
 * `HORS_SUJET` n'est pas un verdict d'écran : C-08 en connaît trois. Un
 * document du mauvais type se présente comme à corriger, avec le
 * reclassement en action — c'est ce que le candidat a à faire.
 */
const verdictAffichable = (v: string): VerdictAnalyse =>
  v === "CONFORME" ? "CONFORME" : v === "ILLISIBLE" ? "ILLISIBLE" : "A_CORRIGER";

const nomDuFichier = (version: DocumentVersion): string =>
  version.objectKey?.split("/").pop() ?? "version rédigée";

function champsLus(fields: unknown): ChampLu[] {
  if (typeof fields !== "object" || fields === null) return [];
  return Object.entries(fields as Record<string, unknown>).map(([intitule, valeur]) => ({
    intitule: intitule.replace(/_/gu, " "),
    valeur: valeur === null || valeur === undefined ? null : String(valeur),
  }));
}
