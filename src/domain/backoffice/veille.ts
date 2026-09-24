/**
 * Veille réglementaire — B-01, WF-14.
 *
 * Deux règles tiennent cet écran, et l'une d'elles était écrite à l'envers.
 *
 * **Une source muette ne dépublie rien.** Elle ne vaut pas un changement de
 * règle : la ligne garde sa place et la date de sa dernière collecte
 * réussie, les candidats continuent de voir la règle publiée. C'est
 * l'automatisme que le produit refuse.
 *
 * **Mais une relecture en retard dépublie, et toute seule** — RG-14.1 :
 * « une fiche dont `nextReviewAt` est dépassée repasse automatiquement en
 * `DRAFT` et disparaît de l'affichage utilisateur. Une donnée non relue ne
 * peut pas continuer à se présenter comme fiable. » Un cron l'applique
 * chaque nuit à trois heures.
 *
 * Ce module disait le contraire, et l'écran avec lui : « rien n'est
 * dépublié automatiquement : la décision de retirer une règle appartient à
 * l'opérateur (RG-14.3) ». Trois erreurs en une phrase — l'affirmation est
 * fausse, elle cite RG-14.3 qui parle de périodicité et non de
 * dépublication, et elle rassurait précisément le veilleur que RG-14.1
 * veut alarmer. Celui qui lisait cette ligne ne s'attendait pas à voir ses
 * fiches quitter le site public dans la nuit.
 *
 * Les deux cas sont distincts et l'écran les sépare désormais : une source
 * qui ne répond pas, et une fiche que personne n'a relue.
 *
 * **Une file vide est un état normal.** La date du dernier relevé le prouve,
 * et l'écran l'affiche : sans elle, une file vide se lit comme une panne de
 * collecte.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */
import type { NiveauSource } from "./regle";

export type StatutFiche = "PUBLIE" | "BROUILLON" | "ARCHIVE";

export const LIBELLE_STATUT_FICHE: Record<StatutFiche, string> = {
  PUBLIE: "Publié",
  BROUILLON: "Brouillon",
  ARCHIVE: "Archivé",
};

export interface FicheSuivie {
  id: string;
  /** Code pays à deux lettres, en pastille monospace. */
  code: string;
  pays: string;
  procedure: string;
  niveauSource: NiveauSource;
  source: string;
  /** Dernière vérification réussie, ISO. */
  verifieeLe: string;
  /** Échéance de relecture programmée, ISO. */
  relectureLe: string;
  version: number;
  statut: StatutFiche;
  /** Écart constaté à la dernière collecte, quand il y en a un. */
  ecart?: string;
}

export type FiltreVeille = "EN_RETARD" | "TOUTES" | "OFFICIEL" | "BROUILLON";

export const LIBELLE_FILTRE_VEILLE: Record<FiltreVeille, string> = {
  EN_RETARD: "En retard",
  TOUTES: "Toutes",
  OFFICIEL: "Officiel",
  BROUILLON: "Brouillon",
};

export const FILTRES_VEILLE: readonly FiltreVeille[] = [
  "EN_RETARD",
  "TOUTES",
  "OFFICIEL",
  "BROUILLON",
];

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

const jour = (iso: string): number => {
  const [a, m, j] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(a!, m! - 1, j!);
};

export const joursDeRetard = (fiche: FicheSuivie, aujourdhui: string): number =>
  Math.round((jour(aujourdhui) - jour(fiche.relectureLe)) / MS_PAR_JOUR);

export const enRetard = (fiche: FicheSuivie, aujourdhui: string): boolean =>
  joursDeRetard(fiche, aujourdhui) > 0;

/** « En retard de 3 j » ou « Dans 90 j » — l'écart, jamais la seule date. */
export function libelleRelecture(fiche: FicheSuivie, aujourdhui: string): string {
  const retard = joursDeRetard(fiche, aujourdhui);
  if (retard > 0) return `En retard de ${retard} j`;
  if (retard === 0) return "À relire aujourd'hui";
  return `Dans ${-retard} j`;
}

/** Le plus en retard d'abord : c'est l'ordre du travail, pas l'ordre alphabétique. */
export function trierParEcheance(
  fiches: readonly FicheSuivie[],
  aujourdhui: string,
): FicheSuivie[] {
  return [...fiches].sort(
    (a, b) => joursDeRetard(b, aujourdhui) - joursDeRetard(a, aujourdhui),
  );
}

export function filtrerVeille(
  fiches: readonly FicheSuivie[],
  filtre: FiltreVeille,
  recherche: string,
  aujourdhui: string,
): FicheSuivie[] {
  const q = recherche.trim().toLowerCase();
  return trierParEcheance(fiches, aujourdhui).filter((f) => {
    if (filtre === "EN_RETARD" && !enRetard(f, aujourdhui)) return false;
    if (filtre === "OFFICIEL" && f.niveauSource !== "OFFICIEL") return false;
    if (filtre === "BROUILLON" && f.statut !== "BROUILLON") return false;
    if (q && !`${f.pays} ${f.procedure} ${f.source}`.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });
}

/** « 42 fiches suivies · 5 en retard de relecture · 3 écarts détectés ». */
export function resumeVeille(
  fiches: readonly FicheSuivie[],
  aujourdhui: string,
): string {
  const retard = fiches.filter((f) => enRetard(f, aujourdhui)).length;
  const ecarts = fiches.filter((f) => f.ecart).length;
  return [
    `${fiches.length} ${fiches.length > 1 ? "fiches suivies" : "fiche suivie"}`,
    `${retard} en retard de relecture`,
    `${ecarts} ${ecarts > 1 ? "écarts détectés" : "écart détecté"}`,
  ].join(" · ");
}

/**
 * État d'une source à la dernière collecte. `PERIME` ne veut pas dire que la
 * règle a changé : il dit qu'on ne sait plus, et la règle publiée reste
 * publiée (RG-14.3).
 */
export type EtatSource = "A_JOUR" | "A_ARBITRER" | "PERIME";

export const LIBELLE_ETAT_SOURCE: Record<EtatSource, string> = {
  A_JOUR: "À jour",
  A_ARBITRER: "À arbitrer",
  PERIME: "Périmé",
};

export interface Collecte {
  /** Sources interrogées et sources qui ont répondu. */
  sources: number;
  relevees: number;
  /** Horodatage de la collecte, ISO. */
  faiteLe: string;
  /** Prochaine collecte programmée, ISO. */
  prochaineLe: string;
  /** Source muette, le cas échéant, et sa dernière collecte réussie. */
  injoignable?: { source: string; derniereReussite: string; tentatives: number };
}

export const collecteComplete = (collecte: Collecte): boolean =>
  collecte.relevees === collecte.sources;

/**
 * Ce que l'écran annonce en tête. Une collecte partielle le dit avec le
 * compte exact : « 13 sources sur 14 » se vérifie, « collecte partielle »
 * non.
 */
export function resumeCollecte(collecte: Collecte, formaterMoment: (iso: string) => string): string {
  return collecteComplete(collecte)
    ? `${collecte.sources} sources suivies · dernière collecte ${formaterMoment(collecte.faiteLe)}`
    : `${collecte.relevees} sources sur ${collecte.sources} relevées ${formaterMoment(collecte.faiteLe)}`;
}

/**
 * Message d'incident. Il dit ce qui continue de fonctionner avant ce qui est
 * cassé : l'opérateur a besoin de savoir que les candidats ne voient rien
 * d'erroné, pas seulement qu'une source est muette.
 */
export function messageSourceInjoignable(
  collecte: Collecte,
  formaterMoment: (iso: string) => string,
): string | null {
  if (!collecte.injoignable) return null;
  const { source, derniereReussite, tentatives } = collecte.injoignable;
  return `${source} n'a pas répondu, après ${tentatives} tentatives. Les règles affichées datent de la dernière collecte réussie, ${formaterMoment(derniereReussite)}. Elles restent publiées et les candidats continuent de les voir : une source muette ne vaut pas un changement de règle.`;
}

export const MENTION_FILE_VIDE =
  "Une file vide est un état normal, pas une panne de collecte : la date du dernier relevé le prouve.";

/**
 * Horizon de la file — la fenêtre que la requête de DOC-11 retient.
 *
 * Il vit ici et non dans la lecture serveur parce que l'écran en parle :
 * l'état vide doit dire quand une fiche entrera dans la file, et la seule
 * façon d'en être sûr est de lire le nombre qui filtre la requête. Écrit
 * des deux côtés, il aurait fini par dire trente là où la requête en
 * retenait quarante-cinq.
 */
export const HORIZON_VEILLE_JOURS = 30;

/**
 * L'état vide, et la porte qu'il n'a pas.
 *
 * Il offrait « Voir les règles publiées » vers `/regles/nl-etudes`. Cette
 * adresse ne mène nulle part : `/regles/[id]` attend un `VisaRule.id`, qui
 * est un identifiant technique — la graine en produit quatre, et aucun ne
 * s'appelle ainsi. La page répondait donc 404, et c'était le seul lien de
 * l'écran où le veilleur n'a précisément rien d'autre à cliquer.
 *
 * Le back-office n'a pas d'index des règles : `src/app/(admin)/regles/`
 * ne porte que l'édition d'une fiche, et la navigation n'a pas d'entrée
 * pour elles. Une fiche se relit depuis cette file, où elle entre à
 * l'approche de son échéance. C'est ce que l'état vide dit désormais —
 * nommer le chemin réel vaut mieux qu'un lien vers un index absent, et
 * retirer le lien ne crée pas le manque : il cesse de le cacher.
 */
export const SANS_INDEX_DES_REGLES =
  `Une fiche se relit depuis cette file, où elle entre ${HORIZON_VEILLE_JOURS} jours avant son échéance de relecture. Le back-office n'a pas d'autre index des règles : il n'y a rien à ouvrir tant que la file est vide.`;

/**
 * Ce que l'écran dit du seul automatisme qui dépublie.
 *
 * Il annonçait l'inverse. La phrase est celle que RG-14.1 impose, et elle
 * nomme l'heure : un veilleur qui voit « en retard de 3 j » doit savoir
 * que la fiche est déjà sortie de l'affichage candidat, pas le découvrir.
 */
export const MENTION_DEPUBLICATION_A_LECHEANCE =
  "Une fiche dont la relecture est en retard repasse automatiquement en brouillon, chaque nuit à 3 h, et disparaît de l'affichage candidat : une donnée non relue ne peut pas continuer à se présenter comme fiable (RG-14.1).";

/** Et ce qui, lui, ne dépublie rien : une source qui ne répond pas. */
export const MENTION_SOURCE_MUETTE_SANS_EFFET =
  "Une source injoignable ne dépublie rien. Les règles affichées restent celles de la dernière collecte réussie : un silence de la source ne vaut pas un changement de règle.";

// ── La relecture sans changement ─────────────────────────────────────────

/**
 * WF-14 étape 2, branche « inchangé » : le veilleur consulte la source,
 * compare, et conclut que rien n'a bougé. Pas de nouvelle version —
 * `verifiedAt` et `nextReviewAt` sont mis à jour, et c'est tout.
 *
 * C'est l'issue la plus fréquente de la veille, et le bouton qui la porte
 * n'était relié à rien. Une fiche relue et trouvée identique restait donc
 * en retard, jusqu'à ce que le cron de trois heures la dépublie (RG-14.1) :
 * le travail était fait, et le produit se comportait comme s'il ne l'avait
 * pas été.
 */

/** RG-14.3 : périodicité de relecture par défaut, en jours. */
export const PERIODICITE_RELECTURE_JOURS = 90;

/**
 * RG-14.3, seconde moitié : « ramenée à 30 jours avant une date connue de
 * révision ». Les montants IND changent au 1er janvier, et une fiche
 * relue en novembre ne doit pas dormir jusqu'en février.
 */
export const PERIODICITE_AVANT_REVISION_JOURS = 30;

/**
 * La prochaine échéance, comptée depuis la relecture et non depuis
 * l'ancienne échéance.
 *
 * Repartir de l'ancienne enchaînerait les retards : une fiche relue avec
 * trois semaines de retard serait déjà à relire dans soixante-neuf jours,
 * et le retard se reporterait indéfiniment. La relecture a eu lieu ce
 * jour-là ; c'est de ce jour-là que court la périodicité.
 */
export function prochaineRelecture(
  relueLe: Date,
  revisionConnue: Date | null,
): Date {
  const ordinaire = new Date(relueLe);
  ordinaire.setUTCDate(ordinaire.getUTCDate() + PERIODICITE_RELECTURE_JOURS);
  if (!revisionConnue || revisionConnue > ordinaire) return ordinaire;

  // Une révision connue tombe avant l'échéance ordinaire : on se cale
  // dessus, trente jours avant, sans jamais reculer dans le passé.
  const anticipee = new Date(revisionConnue);
  anticipee.setUTCDate(anticipee.getUTCDate() - PERIODICITE_AVANT_REVISION_JOURS);
  return anticipee > relueLe ? anticipee : ordinaire;
}
