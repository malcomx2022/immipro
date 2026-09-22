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
import { delaiLisible, type Delai } from "@/domain/rules/comparaison";

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
}

export const ceQuiSepare = (ancienne: VersionRegle, nouvelle: VersionRegle): Ecart => ({
  montant: ancienne.montant !== nouvelle.montant || ancienne.devise !== nouvelle.devise,
  delai:
    (ancienne.delai?.min ?? null) !== (nouvelle.delai?.min ?? null) ||
    (ancienne.delai?.max ?? null) !== (nouvelle.delai?.max ?? null),
});

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
}

export function optionsArbitrage(
  ancienne: VersionRegle,
  nouvelle: VersionRegle,
  montantAncien: string,
  montantNouveau: string,
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
  const ecart = ceQuiSepare(ancienne, nouvelle);
  return [
    {
      cle: "MIGRER",
      titre: `Migrer vers la version ${nouvelle.numero}`,
      detail: `Ta checklist passe à la version ${nouvelle.numero}${etCeQuiChange(ecart, montantNouveau, nouvelle.delai)}.${entree}`,
    },
    {
      cle: "CONSERVER",
      titre: `Conserver la version ${ancienne.numero}`,
      detail: `Ta checklist reste à la version ${ancienne.numero}${etCeQuiChange(ecart, montantAncien, ancienne.delai)}.${limite}`,
    },
  ];
}

/**
 * « , avec 13 000 € à prouver et un délai de 60–150 jours » — et rien pour
 * ce qui n'a pas bougé.
 */
function etCeQuiChange(ecart: Ecart, montant: string, delai: Delai | undefined): string {
  const parts: string[] = [];
  if (ecart.montant) parts.push(`${montant} à prouver`);
  if (ecart.delai) parts.push(`un délai d'instruction de ${delaiLisible(delai ?? null)}`);
  if (parts.length === 0) return "";
  return `, avec ${parts.join(" et ")}`;
}

export const mentionArbitrage = (choix: Arbitrage, pays: string): string =>
  choix === "MIGRER"
    ? `Ta checklist ${pays} sera mise à jour.`
    : `Ta checklist ${pays} restera en version antérieure.`;

export const MENTION_SANS_ACCORD = "Nous ne modifions rien sans ton accord.";

export const MENTION_HISTORIQUE =
  "L'ancienne version reste consultable dans l'historique de la fiche.";

