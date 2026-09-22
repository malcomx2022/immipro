/**
 * Divergence réglementaire — T-02, WF-11.
 *
 * INV-3 : un dossier fige la version de règle utilisée. Une évolution
 * réglementaire ne casse donc jamais une checklist en cours — mais elle ne
 * doit pas non plus rester invisible, sans quoi le candidat prépare un
 * dossier à l'ancienne exigence et le dépose sous la nouvelle.
 *
 * L'écran est un arbitrage, pas une notification : l'application ne tranche
 * pas seule, elle expose les deux versions, ce qui les sépare, et laisse le
 * choix. Migrer d'office trahirait INV-3 ; se taire trahirait INV-8.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */
import { jourEnFrancais as formaterJour } from "@/domain/format/moment";
import {
  delaiLisible,
  type Delai,
  type EvolutionDesPieces,
} from "@/domain/rules/comparaison";

/**
 * ── Un arbitrage entre deux versions qu'on montrait identiques ──────
 *
 * Cet écran a longtemps supposé que ce qui sépare deux versions est le
 * **montant**. C'était vrai des cas qu'il avait vus. Depuis que la
 * comparaison voit aussi le délai d'instruction (RG-09.3), une version
 * peut n'en changer que le délai — et l'écran posait alors deux cartes
 * portant la même somme, annonçait « il te faut 0 € de plus », et offrait
 * le choix entre « tes montants passent à 11 500 € » et « ta checklist
 * reste à 11 500 € ». Exécuté avant correction :
 *
 *     ce que ça change pour ton dossier :
 *       « … c'est la version 2 qui s'appliquera, et il te faut 0 € de plus. »
 *     option : « Ta checklist et tes montants passent à 11 500 €. »
 *     option : « Ta checklist reste à 11 500 €. »
 *     le mot « délai » apparaît-il ? false
 *
 * On demandait de trancher entre deux options qu'on présentait comme la
 * même. Ce module dit désormais ce qui sépare réellement les deux
 * versions, et se tait sur ce qui n'a pas bougé.
 */

export interface VersionRegle {
  /** Rang de version du référentiel `visa_rules` (`Application.visaRuleId`). */
  numero: number;
  /** Montant exigé, dans la devise de la règle. */
  montant: number;
  devise: string;
  /** Ce que le montant couvre : « sur compte bloqué ». */
  intitule: string;
  publieeLe: string;
  /**
   * Délai d'instruction annoncé, qui décide de la date de dépôt de
   * l'échéancier. Facultatif : toutes les procédures n'en annoncent pas.
   */
  delai?: Delai;
  /** Bornes d'application, ISO. Au moins une des deux est posée. */
  applicableJusquau?: string;
  applicableDepuis?: string;
}

/**
 * Ce qui sépare réellement les deux versions.
 *
 * L'écran s'en sert pour ne parler que de ce qui a bougé : une phrase sur
 * un montant inchangé apprend au candidat à ne plus lire les phrases sur
 * les montants.
 */
export interface Ecart {
  montant: boolean;
  delai: boolean;
  pieces: boolean;
}

export const ceQuiSepare = (
  ancienne: VersionRegle,
  nouvelle: VersionRegle,
  pieces: EvolutionDesPieces = AUCUNE_PIECE,
): Ecart => ({
  montant: ancienne.montant !== nouvelle.montant || ancienne.devise !== nouvelle.devise,
  delai:
    (ancienne.delai?.min ?? null) !== (nouvelle.delai?.min ?? null) ||
    (ancienne.delai?.max ?? null) !== (nouvelle.delai?.max ?? null),
  pieces:
    pieces.ajoutees.length > 0 ||
    pieces.retirees.length > 0 ||
    pieces.validites.length > 0,
});

export const AUCUNE_PIECE: EvolutionDesPieces = { ajoutees: [], retirees: [], validites: [] };

/**
 * Ce que la checklist gagne et perd, en toutes lettres — T-02.
 *
 * L'écran disait « ta checklist passe à la version 5 » sans nommer une
 * seule de ses lignes. Le candidat tranchait sans savoir ce qu'il devrait
 * fournir en plus, et le découvrait après coup.
 *
 * Une pièce sort de deux façons, et le mot n'est pas le même : devenue
 * complémentaire, elle reste joignable ; disparue, elle ne se demande
 * plus. Les confondre ferait jeter un document qu'on pouvait encore
 * envoyer.
 */
export interface LignePiece {
  cle: string;
  texte: string;
}

export function lignesDesPieces(pieces: EvolutionDesPieces): readonly LignePiece[] {
  return [
    ...pieces.ajoutees.map((p) => ({
      cle: `+${p.code}`,
      texte: `${p.libelle} — à fournir en plus`,
    })),
    ...pieces.retirees.map((p) => ({
      cle: `-${p.code}`,
      texte: p.encoreDemandee
        ? `${p.libelle} — n'est plus obligatoire, tu peux toujours la joindre`
        : `${p.libelle} — n'est plus demandée`,
    })),
    ...pieces.validites.map((p) => ({
      cle: `~${p.code}`,
      texte: `${p.libelle} — ${texteDeLaValidite(p.avant, p.apres)}`,
    })),
  ];
}

/**
 * Ce qu'une durée de validité qui change veut dire pour le candidat —
 * RG-06.6.
 *
 * Le sens n'est pas symétrique, et la phrase le dit. **Raccourcie** : une
 * pièce demandée à la date qu'annonçait l'échéancier sera périmée le jour
 * du dépôt, donc à demander plus tard. **Allongée** : rien n'est perdu,
 * la marge est simplement plus large.
 *
 * Le nombre de mois est toujours nommé. « Sa durée de validité change »
 * ne dit pas dans quel sens, et c'est précisément le sens qui décide s'il
 * faut refaire une démarche.
 */
const mois = (n: number): string => `${n} mois`;

export function texteDeLaValidite(avant: number | null, apres: number | null): string {
  if (avant === null && apres !== null) {
    return `valable ${mois(apres)}, à demander moins de ${mois(apres)} avant le dépôt`;
  }
  if (apres === null) return "ne périme plus";
  if (avant !== null && apres < avant) {
    return `valable ${mois(apres)} au lieu de ${mois(avant)} : à demander plus tard qu'annoncé`;
  }
  return `valable ${mois(apres)} au lieu de ${mois(avant ?? 0)} : tu peux la demander plus tôt`;
}

/**
 * « 2 pièces de plus à fournir, 1 de moins à réunir » — pour le détail
 * d'une option, qui énumère déjà d'autres changements.
 *
 * Le second membre ne répète pas « pièces » : la phrase composée les
 * enchaîne, et « 2 pièces de plus à fournir et 1 pièce de moins à réunir »
 * se lit deux fois plus lentement pour la même information.
 */
export function resumeDesPieces(pieces: EvolutionDesPieces): string | null {
  const { ajoutees, retirees } = pieces;
  const parts: string[] = [];
  if (ajoutees.length > 0) {
    parts.push(`${ajoutees.length} pièce${ajoutees.length > 1 ? "s" : ""} de plus à fournir`);
  }
  if (retirees.length > 0) {
    parts.push(
      ajoutees.length > 0
        ? `${retirees.length} de moins à réunir`
        : `${retirees.length} pièce${retirees.length > 1 ? "s" : ""} de moins à réunir`,
    );
  }
  if (pieces.validites.length > 0) {
    const n = pieces.validites.length;
    parts.push(`${n} dont la durée de validité change`);
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

/** « A, B et C ». Trois « et » à la suite ne se lisent pas. */
const enumerer = (parts: readonly string[]): string =>
  parts.length <= 1
    ? (parts[0] ?? "")
    : `${parts.slice(0, -1).join(", ")} et ${parts.at(-1)}`;

/** « 60–90 jours », ou l'absence, sur la carte d'une version. */
export const libelleDelaiVersion = (version: VersionRegle): string =>
  version.delai === undefined
    ? "Délai d'instruction non renseigné"
    : version.delai === null
      ? "Aucun délai d'instruction annoncé"
      : `Instruction : ${delaiLisible(version.delai)}`;

export type Arbitrage = "MIGRER" | "CONSERVER";

export const ecartMontant = (ancienne: VersionRegle, nouvelle: VersionRegle): number =>
  nouvelle.montant - ancienne.montant;

/**
 * Ce que le changement implique, en fonction de la date de dépôt.
 *
 * Le montant supplémentaire arrive déjà mis en forme : la devise est une
 * affaire de présentation, et le domaine ne la met pas en forme.
 *
 * Le prototype ajoutait une conversion — « soit environ 456 000 F ». Le taux
 * de 655,957 F a été retiré de P-06 et de $-02 : afficher une conversion
 * ailleurs le réintroduirait, et donnerait pour un montant opposable ce qui
 * n'est qu'un ordre de grandeur.
 */
export function libelleImpact(
  ancienne: VersionRegle,
  nouvelle: VersionRegle,
  ecartFormate: string,
  /**
   * Date de **dépôt**, jamais la date cible.
   *
   * C'est le jour du dépôt qui décide de la version applicable. Comparer
   * la rentrée à l'entrée en vigueur annonçait la nouvelle version — et
   * donc un montant plus élevé à réunir — sur un dossier qui déposera
   * avant elle : quatre-vingt-dix jours d'écart sur la procédure
   * néerlandaise, largement de quoi enjamber une date d'application.
   */
  depot?: string,
): string {
  const application = nouvelle.applicableDepuis
    ? `à partir du ${formaterJour(nouvelle.applicableDepuis)}`
    : "dès sa publication";

  /*
    Ce que la nouvelle version demande de plus — et rien quand elle ne
    demande rien de plus. « Il te faut 0 € de plus » est la phrase qu'on
    lisait quand seul le délai avait changé : elle donne un chiffre pour
    ne rien dire, et elle éteint la seule qui comptait.
  */
  const ecart = ceQuiSepare(ancienne, nouvelle);
  const enPlus = ecart.montant ? `, et il te faut ${ecartFormate} de plus` : "";
  const calendrier = ecart.delai
    ? ` Son délai d'instruction est de ${delaiLisible(nouvelle.delai ?? null)} : ton échéancier se recalcule sur ce délai.`
    : "";

  if (!depot) {
    return `Ta date de départ n'est pas fixée, et le dépôt s'en déduit. Si tu déposes ${application}, c'est la version ${nouvelle.numero} qui s'applique${enPlus}.${calendrier}`;
  }

  const sousNouvelle =
    nouvelle.applicableDepuis !== undefined && depot >= nouvelle.applicableDepuis;

  return sousNouvelle
    ? `Ton dépôt tombe au ${formaterJour(depot)} : c'est la version ${nouvelle.numero} qui s'appliquera${enPlus}.${calendrier}`
    : `Ton dépôt tombe au ${formaterJour(depot)}, avant l'entrée en vigueur : la version ${ancienne.numero} reste celle de ton dossier.`;
}

export interface OptionArbitrage {
  cle: Arbitrage;
  titre: string;
  /** Ce que le choix change concrètement, et dans quel cas il se défend. */
  detail: string;
  /**
   * Choix affiché mais indisponible, avec sa raison dans `detail`. Le
   * retirer ferait chercher ce qu'on a mal fait, là où il n'y a rien à
   * corriger de son côté.
   */
  desactivee?: boolean;
}

export function optionsArbitrage(
  ancienne: VersionRegle,
  nouvelle: VersionRegle,
  montantAncien: string,
  montantNouveau: string,
  pieces: EvolutionDesPieces = AUCUNE_PIECE,
  /**
   * RG-14.1. Ce qui empêche de migrer, quand quelque chose l'empêche.
   * L'option reste **affichée** et devient indisponible avec sa raison :
   * la retirer ferait chercher ce qu'on a mal fait, là où il n'y a rien à
   * corriger. Et la raison dit la vraie cause — une version remplacée ne
   * reviendra pas, une version en relecture reviendra.
   */
  blocage: BlocageDeMigration = "AUCUN",
): readonly OptionArbitrage[] {
  const limite = ancienne.applicableJusquau
    ? ` À ne garder que si tu déposes avant le ${formaterJour(ancienne.applicableJusquau)}.`
    : "";
  const entree = nouvelle.applicableDepuis
    ? ` C'est le choix cohérent si tu déposes à partir du ${formaterJour(nouvelle.applicableDepuis)}.`
    : "";

  /*
    Chaque option nomme ce que **ce choix-ci** change, et rien d'autre. Un
    détail qui cite un montant identique des deux côtés présente deux
    options comme la même, et c'est précisément l'arbitrage qu'on demande
    de trancher.
  */
  const ecart = ceQuiSepare(ancienne, nouvelle, pieces);
  const surLaChecklist = resumeDesPieces(pieces);
  const migrable = blocage === "AUCUN";
  return [
    {
      cle: "MIGRER",
      titre: `Migrer vers la version ${nouvelle.numero}`,
      detail: migrable
        ? `Ta checklist passe à la version ${nouvelle.numero}${etCeQuiChange(ecart, montantNouveau, nouvelle.delai, surLaChecklist)}.${entree}`
        : mentionDuBlocage(blocage),
      ...(migrable ? {} : { desactivee: true }),
    },
    {
      cle: "CONSERVER",
      titre: `Conserver la version ${ancienne.numero}`,
      /*
        Conserver ne change rien à la checklist : le détail ne cite donc
        aucune pièce. Reprendre « 2 pièces de plus » des deux côtés
        présenterait le choix comme identique — c'est le défaut corrigé
        pour le montant, et il vaut ici mot pour mot.
      */
      detail: `Ta checklist reste à la version ${ancienne.numero}${etCeQuiChange(ecart, montantAncien, ancienne.delai, null)}.${limite}`,
    },
  ];
}

/**
 * « , avec 13 000 € à prouver et un délai de 60–150 jours » — et rien pour
 * ce qui n'a pas bougé.
 */
function etCeQuiChange(
  ecart: Ecart,
  montant: string,
  delai: Delai | undefined,
  surLaChecklist: string | null,
): string {
  const parts: string[] = [];
  if (ecart.montant) parts.push(`${montant} à prouver`);
  if (ecart.delai) parts.push(`un délai d'instruction de ${delaiLisible(delai ?? null)}`);
  if (ecart.pieces && surLaChecklist) parts.push(surLaChecklist);
  if (parts.length === 0) return "";
  return `, avec ${enumerer(parts)}`;
}

export const mentionArbitrage = (choix: Arbitrage, pays: string): string =>
  choix === "MIGRER"
    ? `Ta checklist ${pays} sera mise à jour.`
    : `Ta checklist ${pays} restera en version antérieure.`;

/**
 * Pourquoi une version visée n'est plus applicable — RG-14.1.
 *
 * `reglePubliee` rend `null` pour plusieurs raisons, et elles ne se disent
 * pas de la même façon au candidat. Un premier correctif n'en nommait
 * qu'une, la relecture, et se trompait sur l'autre :
 *
 *     v2 : statut ARCHIVED, relecture au 2029-01-01 — parfaitement à jour
 *     la cause réelle : une version plus récente (v3) l'a remplacée
 *     écran : « nos veilleurs la revérifient. Elle te sera proposée de
 *              nouveau une fois vérifiée. »
 *
 * Elle ne le sera jamais : une version remplacée ne revient pas en
 * vigueur. Le message envoyait attendre une vérification qui n'a pas lieu,
 * au lieu de dire qu'une version plus récente l'attend déjà.
 */
export type BlocageDeMigration = "AUCUN" | "REMPLACEE" | "EN_RELECTURE";

export const MENTION_VERSION_EN_RELECTURE =
  "Cette version n'est plus celle en vigueur : nos veilleurs la revérifient. Elle te sera proposée de nouveau une fois vérifiée.";

/**
 * Une version plus récente est déjà en vigueur. Celle-ci ne reviendra pas,
 * et le dire évite d'attendre pour rien — l'autre divergence, elle, est
 * arbitrable dès maintenant.
 */
export const MENTION_VERSION_REMPLACEE =
  "Une version plus récente est entrée en vigueur depuis. C'est elle qui te sera proposée : cette comparaison-ci n'a plus d'objet.";

export const mentionDuBlocage = (blocage: BlocageDeMigration): string =>
  blocage === "REMPLACEE" ? MENTION_VERSION_REMPLACEE : MENTION_VERSION_EN_RELECTURE;

export const MENTION_SANS_ACCORD = "Nous ne modifions rien sans ton accord.";

export const MENTION_HISTORIQUE =
  "L'ancienne version reste consultable dans l'historique de la fiche.";

