import type { CompletenessPublic } from "@/domain/completeness/score";
import { momentRelatif } from "@/domain/format/moment";
import { libelleDelai } from "@/domain/dossiers/echeancier";

/**
 * Alertes — T-01, WF-11.
 *
 * Une alerte dit ce qui a changé, ce que ça implique pour le dossier, et
 * d'où l'information vient (INV-8). Une alerte qui annonce un changement
 * sans dire s'il concerne le candidat le fait rouvrir son dossier pour
 * rien, et il finit par ne plus les lire.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/**
 * Les genres de `NotificationKind`, repris tels quels — un test les tient
 * alignés. `INACTIVITE` est arrivée avec RG-04.2 : un brouillon qu'on
 * laisse de côté est relancé, puis clos.
 */
export type GenreAlerte =
  | "REGLEMENTATION"
  | "ECHEANCE"
  | "ANALYSE"
  | "PAIEMENT"
  | "VEILLE"
  | "INACTIVITE";

export interface Alerte {
  id: string;
  genre: GenreAlerte;
  titre: string;
  /** Ce que le changement implique pour ce dossier-ci. Jamais un constat nu. */
  corps: string;
  /** Horodatage ISO. */
  emiseLe: string;
  /** Dossier concerné, quand l'alerte en vise un. */
  dossier?: string;
  /** Source réglementaire, quand l'alerte en cite une (INV-8). */
  source?: string;
  lue: boolean;
  /** Arbitrage à rendre : l'alerte ouvre T-02 au lieu de se contenter d'informer. */
  arbitrage?: string;
  /**
   * Date de l'échéance annoncée, ISO. Le délai est calculé à l'affichage et
   * jamais écrit dans le titre : « Échéance dans 7 jours » figé dans le texte
   * reste affiché le jour de l'échéance, puis une semaine après.
   */
  echeanceLe?: string;
}

/**
 * Onglets de T-01. « Toutes » n'est pas un genre : c'est l'absence de filtre.
 *
 * Il n'y a pas d'onglet par genre, et c'est voulu : trois genres sur six
 * n'en ont pas. Une relance de brouillon se lit sous « Toutes », là où
 * elle est le plus visible — l'onglet qui compte pour elle est celui que
 * le candidat ouvre en revenant, pas celui qu'il choisit.
 */
export type FiltreAlerte = "TOUTES" | "REGLEMENTATION" | "ECHEANCE";

export const LIBELLE_FILTRE: Record<FiltreAlerte, string> = {
  TOUTES: "Toutes",
  REGLEMENTATION: "Réglementation",
  ECHEANCE: "Échéances",
};

export const FILTRES: readonly FiltreAlerte[] = ["TOUTES", "REGLEMENTATION", "ECHEANCE"];

export function filtrer(alertes: readonly Alerte[], filtre: FiltreAlerte): Alerte[] {
  const retenues =
    filtre === "TOUTES" ? [...alertes] : alertes.filter((a) => a.genre === filtre);
  return retenues.sort((a, b) => b.emiseLe.localeCompare(a.emiseLe));
}

export const compterNonLues = (alertes: readonly Alerte[]): number =>
  alertes.filter((a) => !a.lue).length;

export const toutMarquerLu = (alertes: readonly Alerte[]): Alerte[] =>
  alertes.map((a) => (a.lue ? a : { ...a, lue: true }));

/** Durée de conservation des alertes (T-01, aligné sur WF-11). */
export const CONSERVATION_MOIS = 6;

export const MENTION_PORTEE =
  `Les alertes réglementaires ne concernent que tes dossiers ouverts. Elles sont conservées ${CONSERVATION_MOIS} mois.`;

const FORMAT_JOUR = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** « Il y a 2 heures », « Hier à 8 h 00 », « 9 septembre ». */
export const libelleMoment = (iso: string, maintenant: Date): string =>
  momentRelatif(iso, maintenant, { formatAbsolu: FORMAT_JOUR, capitale: true });

/**
 * Titre affiché. Une alerte d'échéance porte son délai, recalculé à chaque
 * affichage depuis la date qu'elle vise.
 */
export function titreAlerte(alerte: Alerte, aujourdhui: string): string {
  if (!alerte.echeanceLe) return alerte.titre;
  const delai = libelleDelai(
    { id: alerte.id, date: alerte.echeanceLe, titre: alerte.titre, detail: alerte.corps },
    aujourdhui,
  );
  return `${alerte.titre} · ${delai.toLowerCase()}`;
}

/** Ligne de contexte sous l'alerte : quand, puis d'où ça vient. */
export function libelleContexte(alerte: Alerte, maintenant: Date): string {
  const parties = [libelleMoment(alerte.emiseLe, maintenant)];
  if (alerte.source) parties.push(`source : ${alerte.source}`);
  else if (alerte.dossier) parties.push(`dossier ${alerte.dossier}`);
  return parties.join(" · ");
}

type Compteurs = CompletenessPublic["compteurs"];

/**
 * Progression du dossier annoncée par une alerte.
 *
 * Le prototype écrivait « Complétude passée de 58 à 68 sur 100 ». C'est le
 * dernier endroit où la note survivait à l'arbitrage C-09, et le plus
 * tenace : retirer le chiffre ne suffisait pas, il fallait dire ce qu'une
 * progression annonce sans nombre d'ensemble.
 *
 * Ce qu'elle annonce, c'est une pièce de moins à réunir, et combien il en
 * reste — ce que le candidat peut vérifier sur sa checklist, et qui ne se
 * relit pas comme une probabilité.
 */
export function libelleProgression(avant: Compteurs, apres: Compteurs): string {
  const obligatoires = avant.obligatoiresManquantes - apres.obligatoiresManquantes;
  if (obligatoires > 0) {
    if (apres.obligatoiresManquantes === 0) {
      return "Plus aucune pièce obligatoire ne manque à ton dossier.";
    }
    const reste = apres.obligatoiresManquantes;
    return `${obligatoires > 1 ? `${obligatoires} pièces obligatoires` : "Une pièce obligatoire"} de moins à réunir : il en reste ${reste}.`;
  }

  const complementaires = avant.facultativesManquantes - apres.facultativesManquantes;
  if (complementaires > 0) {
    const reste = apres.facultativesManquantes;
    const debut =
      complementaires > 1
        ? `${complementaires} pièces complémentaires`
        : "Une pièce complémentaire";
    return reste === 0
      ? `${debut} de moins à traiter : il n'en reste aucune.`
      : `${debut} de moins à traiter : il en reste ${reste}.`;
  }

  return "";
}
