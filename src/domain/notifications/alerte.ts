import type { CompletenessPublic } from "@/domain/completeness/score";
import { momentRelatif } from "@/domain/format/moment";
import { libelleDelai } from "@/domain/dossiers/echeancier";
import { FUSEAU_AFFICHAGE } from "@/domain/format/fuseau";

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
 * laisse de côté est relancé, puis clos. `CONSERVATION` avec l'arbitrage
 * S.78 : l'invitation à confirmer l'instruction d'un dossier soumis, le
 * préavis de purge, l'avertissement d'un dossier suspendu. `SUIVI_DEPOT`
 * avec S.89 : les relances J+30 et J+60 après la date réelle du dépôt.
 */
export type GenreAlerte =
  | "REGLEMENTATION"
  | "ECHEANCE"
  | "ANALYSE"
  | "PAIEMENT"
  | "VEILLE"
  | "INACTIVITE"
  | "CONSERVATION"
  | "SUIVI_DEPOT";

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
  /**
   * Mention de source — INV-8, quand l'alerte en cite une.
   *
   * ── Ce que le champ précédent laissait passer ───────────────────────
   *
   * Il s'appelait `source` et ne portait qu'un nom d'hôte. L'écran
   * affichait donc, sur celui qui annonce précisément qu'une règle a
   * changé :
   *
   *     Il y a 1 heure · source : make-it-in-germany.com
   *
   * La source sans sa date de vérification. INV-8 demande les deux, et
   * tous les autres écrans les donnent — `SourceNote` en fait deux
   * propriétés obligatoires, `mentionDe` les construit ensemble depuis la
   * règle. La lecture des alertes, elle, refabriquait la source toute
   * seule avec un petit `hote()` local, et c'est en la refabriquant
   * qu'elle a perdu la date.
   *
   * Un objet, donc, et non deux champs facultatifs : une alerte cite une
   * source complète ou n'en cite pas.
   */
  mention?: { source: string; verifieeLe: string };
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

/**
 * Ce que la page ne montre pas, dit à qui la lit.
 *
 * Une liste coupée qui ne dit pas qu'elle est coupée se lit comme une
 * liste complète. La phrase nomme donc l'ordre de la coupe — non lues
 * d'abord, puis les plus récentes — pour que le candidat sache ce qui
 * manque, et non seulement qu'il manque quelque chose.
 *
 * `null` quand rien n'est coupé : une ligne qui dirait « 0 alerte de plus »
 * est du bruit sur l'écran de tout le monde.
 */
export function mentionDeLaCoupe(affichees: number, total: number): string | null {
  const reste = total - affichees;
  if (reste <= 0) return null;
  return reste > 1
    ? `${reste} alertes plus anciennes ne sont pas affichées. Les non lues sont montrées en premier, puis les plus récentes.`
    : "1 alerte plus ancienne n'est pas affichée. Les non lues sont montrées en premier, puis les plus récentes.";
}

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
  timeZone: FUSEAU_AFFICHAGE,
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

const FORMAT_DATE = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Ligne de contexte sous l'alerte : quand, puis d'où ça vient.
 *
 * La provenance se dit comme partout ailleurs — source **et** date de
 * vérification (INV-8). L'ordre suit `SourceNote` : ce qui a été vérifié,
 * puis quand.
 */
export function libelleContexte(alerte: Alerte, maintenant: Date): string {
  const parties = [libelleMoment(alerte.emiseLe, maintenant)];
  if (alerte.mention) {
    parties.push(
      `source : ${alerte.mention.source}, vérifiée le ${FORMAT_DATE.format(
        new Date(alerte.mention.verifieeLe),
      )}`,
    );
  } else if (alerte.dossier) parties.push(`dossier ${alerte.dossier}`);
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
