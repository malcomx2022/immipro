import type { Application, Document } from "@prisma/client";
import type { Piece } from "@/domain/dossiers/piece";
import { completudeDesPieces, premiereATraiter, libelleAction } from "@/domain/dossiers/piece";
import type { Dossier, StatutDossier } from "@/domain/dossiers/dossier";
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

export function versPiece(document: Document): Piece {
  return {
    id: document.id,
    code: codeCourt(document.code),
    libelle: document.label,
    famille: document.family,
    etat: document.status,
    remede: document.remedy,
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
    case "SUSPENDU":
      return "ACTIF";
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

export function versDossier(
  dossier: Application,
  documents: readonly Document[],
  destination: FicheDestination,
): Dossier {
  const pieces = documents.map(versPiece);
  const suivante = premiereATraiter(pieces);
  return {
    id: dossier.id,
    destination,
    statut: versStatut(dossier.status),
    ...(dossier.targetDate
      ? { depotVise: dossier.targetDate.toISOString().slice(0, 10) }
      : {}),
    completude: completudeDesPieces(pieces),
    prochaineAction: suivante
      ? `${libelleAction(suivante)} : ${suivante.libelle.toLowerCase()}`
      : "Rien ne bloque un dépôt.",
  };
}
