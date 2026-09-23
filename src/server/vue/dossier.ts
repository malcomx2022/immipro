import type { Application, Document, VisaRule } from "@prisma/client";
import type { Piece } from "@/domain/dossiers/piece";
import { completudeDesPieces, premiereATraiter, libelleAction } from "@/domain/dossiers/piece";
import type { CompletenessPublic } from "@/domain/completeness/score";
import { codesConformes } from "@/domain/completeness/conditions";
import type { Dossier, StatutDossier } from "@/domain/dossiers/dossier";
import { MENTION_EN_PAUSE } from "@/domain/dossiers/dossier";
import { dateDeDepot } from "@/domain/dossiers/faisabilite";
import { estEchue } from "@/domain/dossiers/peremption";

/** Un jour ISO, en UTC — même convention que l'échéancier. */
const iso = (d: Date) => d.toISOString().slice(0, 10);
import type { FicheDestination } from "@/domain/destinations/fiche";

/**
 * Vue candidat d'un dossier.
 *
 * Elle produit exactement les types que les écrans consomment déjà —
 * `Piece`, `Dossier`, `CompletenessPublic`. Ce n'est pas une coïncidence :
 * ces types ont été écrits avec les écrans, avant la base, et le serveur
 * s'aligne sur eux plutôt que l'inverse. Le jour où un écran cesse de lire
 * `src/lib/contenu` pour appeler l'API, il ne change pas de forme.
 *
 * Ce que la vue ne porte pas est aussi important que ce qu'elle porte.
 * `internalScore` n'a pas de champ où atterrir : `Dossier.completude` est un
 * `CompletenessPublic`, dont le barème est absent du type (arbitrage C-09).
 * Il faudrait changer le type du domaine pour faire fuir le chiffre.
 */

/**
 * `aujourdhui` est passé, jamais lu ici : la vue doit se tester sans
 * dépendre du jour où le test tourne, comme l'échéancier.
 */
export function versPiece(document: Document, aujourdhui = iso(new Date())): Piece {
  /*
    Une pièce conforme dont la validité est dépassée n'est plus conforme —
    et l'écran ne doit pas attendre que le travail de fond passe pour le
    dire. Le fait est déjà en base : `expiresAt` est écrit au dépôt. Ce
    n'est donc pas une seconde vérité, c'est la même, évaluée maintenant
    plutôt qu'à trois heures du matin.

    Le travail de fond, lui, reste nécessaire : c'est lui qui écrit l'état
    stocké, refait le barème, redescend le dossier de PRET à ACTIF et
    prévient le candidat. Sans lui, l'écran dirait vrai et la base
    garderait un dossier « prêt ».
  */
  const echue =
    document.status === "CONFORME" &&
    document.expiresAt !== null &&
    estEchue(iso(document.expiresAt), aujourdhui);

  return {
    id: document.id,
    code: codeCourt(document.code),
    libelle: document.label,
    famille: document.family,
    etat: echue ? "EXPIREE" : document.status,
    remede: echue ? "REMPLACER" : document.remedy,
    ...(document.feedback ? { message: document.feedback } : {}),
    ...(document.finding ? { constat: document.finding } : {}),
    ...(document.expiresAt ? { perimeLe: document.expiresAt.toISOString().slice(0, 10) } : {}),
    ...(document.hint ? { astuce: document.hint } : {}),
  };
}

/**
 * Pastille monospace de la checklist : trois lettres tirées du code de la
 * pièce. Le référentiel écrit `releve_bancaire`, l'écran affiche `REL`.
 */
const codeCourt = (code: string): string => code.replace(/[^a-z]/giu, "").slice(0, 3).toUpperCase();

/**
 * Les états de dossier de la base sont plus nombreux que ceux de l'écran :
 * `SUSPENDU`, `ISSUE_DECLAREE`, `ABANDONNE` et `ARCHIVE` n'ont pas de
 * traitement propre sur C-01, où ce qui compte est « demande une action » ou
 * « n'en demande plus ». Le repli est explicite plutôt que muet : un état
 * ajouté en base sans décision d'affichage se verra en revue de code, pas
 * en production.
 */
export function versStatut(statut: Application["status"]): StatutDossier {
  switch (statut) {
    case "BROUILLON":
      return "BROUILLON";
    case "ACTIF":
      return "ACTIF";
    /*
      `SUSPENDU` s'affichait « Actif », et l'écran mentait deux fois : le
      bandeau disait « en cours » sur un dossier en pause, et rien ne
      disait au candidat ce qu'on attendait de lui. La notification, elle,
      le disait déjà — mais elle vit sur l'écran des alertes.
    */
    case "SUSPENDU":
      return "EN_PAUSE";
    case "PRET":
      return "PRET";
    case "SOUMIS":
      return "SOUMIS";
    case "ISSUE_DECLAREE":
    case "ABANDONNE":
    case "ARCHIVE":
      return "CLOTURE";
  }
}

/**
 * `delai_traitement_jours.max`, lu défensivement.
 *
 * `rules` est un `jsonb` : le schéma le garantit à l'écriture, il ne le
 * garantit pas sur une ligne écrite avant lui. Une valeur d'un autre type
 * vaut absence — et l'absence n'est pas zéro, elle fait retomber le dépôt
 * sur la date cible, ce que l'appelant sait lire.
 */
export function delaiInstructionJours(rules: unknown): number | null {
  if (typeof rules !== "object" || rules === null) return null;
  const delai = (rules as Record<string, unknown>).delai_traitement_jours;
  if (typeof delai !== "object" || delai === null) return null;
  const max = (delai as Record<string, unknown>).max;
  return typeof max === "number" && Number.isFinite(max) ? max : null;
}

export function versDossier(
  dossier: Application,
  documents: readonly Document[],
  destination: FicheDestination,
  /** Règle **figée** du dossier (INV-3), d'où vient le délai d'instruction. */
  regle: Pick<VisaRule, "rules"> | null,
  aujourdhui = iso(new Date()),
): Dossier {
  const pieces = documents.map((d) => versPiece(d, aujourdhui));
  /* La règle figée entre dans le calcul : sans elle, les conditions
     déterministes n'y sont pas, et l'écran conclut « rien ne bloque » sur
     un dossier que le serveur refuse de déclarer prêt. */
  const completude = completudeDesPieces(pieces, {
    regle: regle?.rules,
    conformes: codesConformes(documents),
  });
  /*
    Deux dates, et elles ne se confondent plus.

    `targetDate` est la **date cible** — rentrée ou prise de poste : DOC-11
    WF-09 étape 1 construit l'échéancier « à rebours depuis la date cible
    (rentrée, prise de poste) », et `echeancesDepuis` en retire le délai
    d'instruction pour poser l'échéance « dépôt ». La base le confirme :
    cible au 1er septembre, dépôt au 3 juin.

    Le champ s'appelait `depotVise`, et ce nom a fait trois écrans faux et
    deux calculs faux — la péremption d'une pièce et la version de règle
    applicable se décident au jour du **dépôt**. Les deux dates sont donc
    portées séparément, et chaque appelant choisit la sienne.
  */
  const cible = dossier.targetDate?.toISOString().slice(0, 10);
  return {
    id: dossier.id,
    destination,
    statut: versStatut(dossier.status),
    ...(cible
      ? {
          departVise: cible,
          depot: dateDeDepot(cible, delaiInstructionJours(regle?.rules)),
        }
      : {}),
    completude,
    prochaineAction: prochaineAction(pieces, versStatut(dossier.status), completude),
  };
}

/**
 * Une phrase, pas une étiquette.
 *
 * « Ajouter : passeport » se lit comme un intitulé de champ ; « Ajouter ton
 * passeport » se lit comme une consigne, et c'est ce que le tableau de bord
 * demande — une seule chose à faire, écrite comme on la dirait.
 *
 * Quand la pièce porte un constat, il suit : « Remplacer ton passeport : sa
 * validité est trop courte. » Savoir *pourquoi* évite d'ouvrir l'écran pour
 * l'apprendre.
 */
export function prochaineAction(
  pieces: readonly Piece[],
  statut: StatutDossier = "ACTIF",
  /**
   * La complétude, qui voit ce que la checklist ne voit pas : les
   * conditions déterministes de la règle figée. Sans elle, la phrase
   * annonçait « Rien ne bloque un dépôt » sur un dossier dont une
   * condition bloquante n'était pas tenue — donc sur le seul dossier que
   * la plateforme ne laissait pas déposer.
   */
  completude?: CompletenessPublic,
): string {
  /*
    La pause passe avant la checklist, et c'est tout le correctif : sur un
    dossier suspendu par une divergence, toutes les pièces peuvent être
    conformes — la phrase annonçait donc « Rien ne bloque un dépôt » sur le
    seul dossier dont le dépôt était bloqué.
  */
  if (statut === "EN_PAUSE") return MENTION_EN_PAUSE;

  const suivante = premiereATraiter(pieces);
  if (!suivante) {
    /*
      Les pièces ne suffisent pas à conclure. Une exigence que le candidat
      ne peut pas lever par un dépôt reste une exigence, et la nommer vaut
      mieux que de promettre le contraire : son `message_echec` vient du
      référentiel, où il est écrit pour être lu par lui (RG-07.1).
    */
    const bloquant = completude?.missing.find((m) => m.bloquant);
    return bloquant ? bloquant.message : "Rien ne bloque un dépôt.";
  }

  const verbe = libelleAction(suivante).toLowerCase();
  const quoi = `${verbe} ton ${suivante.libelle.toLowerCase()}`;
  return suivante.constat ? `${majuscule(quoi)} : ${minuscule(suivante.constat)}` : `${majuscule(quoi)}.`;
}

const majuscule = (texte: string) => texte.charAt(0).toUpperCase() + texte.slice(1);
const minuscule = (texte: string) => texte.charAt(0).toLowerCase() + texte.slice(1);
