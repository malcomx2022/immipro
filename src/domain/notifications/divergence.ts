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


export interface VersionRegle {
  /** Rang de version du référentiel `visa_rules` (`Application.visaRuleId`). */
  numero: number;
  /** Montant exigé, dans la devise de la règle. */
  montant: number;
  devise: string;
  /** Ce que le montant couvre : « sur compte bloqué ». */
  intitule: string;
  publieeLe: string;
  /** Bornes d'application, ISO. Au moins une des deux est posée. */
  applicableJusquau?: string;
  applicableDepuis?: string;
}

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
  depotVise?: string,
): string {
  const application = nouvelle.applicableDepuis
    ? `à partir du ${formaterJour(nouvelle.applicableDepuis)}`
    : "dès sa publication";

  if (!depotVise) {
    return `Ta date de dépôt n'est pas fixée. Si tu déposes ${application}, c'est la version ${nouvelle.numero} qui s'applique et il te faut ${ecartFormate} de plus.`;
  }

  const sousNouvelle =
    nouvelle.applicableDepuis !== undefined && depotVise >= nouvelle.applicableDepuis;

  return sousNouvelle
    ? `Ton dépôt est visé au ${formaterJour(depotVise)} : c'est la version ${nouvelle.numero} qui s'appliquera, et il te faut ${ecartFormate} de plus.`
    : `Ton dépôt est visé au ${formaterJour(depotVise)}, avant l'entrée en vigueur : la version ${ancienne.numero} reste celle de ton dossier.`;
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

  return [
    {
      cle: "MIGRER",
      titre: `Migrer vers la version ${nouvelle.numero}`,
      detail: `Ta checklist et tes montants passent à ${montantNouveau}.${entree}`,
    },
    {
      cle: "CONSERVER",
      titre: `Conserver la version ${ancienne.numero}`,
      detail: `Ta checklist reste à ${montantAncien}.${limite}`,
    },
  ];
}

export const mentionArbitrage = (choix: Arbitrage, pays: string): string =>
  choix === "MIGRER"
    ? `Ta checklist ${pays} sera mise à jour.`
    : `Ta checklist ${pays} restera en version antérieure.`;

export const MENTION_SANS_ACCORD = "Nous ne modifions rien sans ton accord.";

export const MENTION_HISTORIQUE =
  "L'ancienne version reste consultable dans l'historique de la fiche.";

