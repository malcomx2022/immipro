/**
 * Les tarifs d'IA tels que la configuration déployée les porte, et leur
 * échéance — S.213.
 *
 * ── Pourquoi une échéance ───────────────────────────────────────────
 *
 * Le tarif officiel de Gemini 3.8 Flash hors `global` (0,825 $ en entrée,
 * 4,125 $ en sortie par million) est annoncé **jusqu'au 31/12/2026**
 * (relevé du 16/10, S.181). Au 1er janvier, B-07 continuerait de calculer
 * au prix de 2026 sans que rien ne le dise : un coût faux et rassurant,
 * l'erreur que `couts.ts` refuse depuis le premier jour. L'exploitant
 * déclare donc la date de fin du tarif qu'il saisit, et l'état de service
 * l'annonce trente jours avant.
 *
 * ── Ce que ce module ne fait pas ────────────────────────────────────
 *
 * Il ne coupe aucun appel et ne rend pas l'instance inapte : un tarif échu
 * fausse un coût, il n'empêche pas de servir. Il ne remplace pas non plus
 * le tarif : la nouvelle grille se relève sur la page officielle et se
 * saisit, avec sa nouvelle échéance.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */
import { FOURNISSEURS, tarifDu, type CodeFournisseur } from "./fournisseurs";

type Environnement = Readonly<Record<string, string | undefined>>;

/** Le nom de la date de fin du tarif de chaque fournisseur. */
export const VARIABLE_ECHEANCE_DU_TARIF: Readonly<Record<CodeFournisseur, string>> = {
  anthropic: "AI_TARIF_VALIDE_JUSQU_AU",
  openai_compatible: "AI_TARIF_OPENAI_COMPATIBLE_VALIDE_JUSQU_AU",
};

/** L'annonce part trente jours avant la fin du tarif. */
export const PREAVIS_TARIF_JOURS = 30;

export type StatutDuTarif =
  | "NON_TARIFE"
  | "SANS_ECHEANCE"
  | "ECHEANCE_ILLISIBLE"
  | "EN_VIGUEUR"
  | "EXPIRE_BIENTOT"
  | "EXPIRE";

export interface EtatDuTarif {
  fournisseur: CodeFournisseur;
  libelle: string;
  /** Les prix lus, par million de jetons ; `null` sans tarif complet. */
  entreeParMillion: number | null;
  sortieParMillion: number | null;
  devise: string | null;
  /** AAAA-MM-JJ, dernier jour de validité, tel que déclaré. */
  valideJusquAu: string | null;
  joursRestants: number | null;
  statut: StatutDuTarif;
  /** Ce qu'il faut faire, ou `null` quand rien n'est à faire. */
  alerte: string | null;
}

const JOUR = /^(\d{4})-(\d{2})-(\d{2})$/u;
const instant = (jour: string): number | null => {
  const m = JOUR.exec(jour);
  if (!m) return null;
  const [a, mo, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(a, mo - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === mo - 1 && d.getUTCDate() === j ? d.getTime() : null;
};

/**
 * L'état du tarif d'un fournisseur au jour civil donné (AAAA-MM-JJ, celui
 * de Cotonou). Le dernier jour de validité est compris : un tarif valable
 * jusqu'au 31/12 l'est encore le 31/12.
 */
export function etatDuTarif(env: Environnement, code: CodeFournisseur, aujourdhui: string): EtatDuTarif {
  const tarif = tarifDu(env, code);
  const variable = VARIABLE_ECHEANCE_DU_TARIF[code];
  const brut = (env[variable] ?? "").trim();
  const base = {
    fournisseur: code,
    libelle: FOURNISSEURS[code].libelle,
    entreeParMillion: tarif?.entreeParMillion ?? null,
    sortieParMillion: tarif?.sortieParMillion ?? null,
    devise: tarif?.devise ?? null,
    valideJusquAu: brut.length > 0 ? brut : null,
    joursRestants: null,
  };
  if (!tarif) {
    return {
      ...base,
      statut: "NON_TARIFE",
      alerte: `Aucun tarif complet pour ${FOURNISSEURS[code].libelle} : saisir entrée, sortie et devise (${FOURNISSEURS[code].tarif.join(", ")}) ; sans eux, aucun coût n'est calculé.`,
    };
  }
  if (brut.length === 0) {
    return {
      ...base,
      statut: "SANS_ECHEANCE",
      alerte: `Le tarif de ${FOURNISSEURS[code].libelle} n'a pas de date de fin : saisir ${variable} (AAAA-MM-JJ) depuis la page officielle des prix, pour être prévenu avant qu'il change.`,
    };
  }
  const fin = instant(brut);
  const jour = instant(aujourdhui);
  if (fin === null || jour === null) {
    return {
      ...base,
      statut: "ECHEANCE_ILLISIBLE",
      alerte: `${variable} vaut « ${brut} », qui n'est pas une date AAAA-MM-JJ du calendrier : la corriger, l'échéance du tarif n'est pas surveillée.`,
    };
  }
  const joursRestants = Math.round((fin - jour) / 86_400_000);
  if (joursRestants < 0) {
    return {
      ...base,
      joursRestants,
      statut: "EXPIRE",
      alerte: `Le tarif de ${FOURNISSEURS[code].libelle} a pris fin le ${brut}, il y a ${-joursRestants} jour(s) : B-07 calcule les coûts à un prix échu. Relever la grille en vigueur sur la page officielle, puis saisir les nouveaux prix et leur échéance.`,
    };
  }
  if (joursRestants <= PREAVIS_TARIF_JOURS) {
    return {
      ...base,
      joursRestants,
      statut: "EXPIRE_BIENTOT",
      alerte: `Le tarif de ${FOURNISSEURS[code].libelle} prend fin le ${brut}, dans ${joursRestants} jour(s) : relever la grille suivante sur la page officielle avant cette date.`,
    };
  }
  return { ...base, joursRestants, statut: "EN_VIGUEUR", alerte: null };
}

/** Les tarifs des fournisseurs donnés, et les seules alertes à lire. */
export function etatDesTarifs(
  env: Environnement,
  codes: readonly CodeFournisseur[],
  aujourdhui: string,
): { preavisJours: number; fournisseurs: readonly EtatDuTarif[]; alertes: readonly string[] } {
  const fournisseurs = codes.map((c) => etatDuTarif(env, c, aujourdhui));
  return {
    preavisJours: PREAVIS_TARIF_JOURS,
    fournisseurs,
    alertes: fournisseurs.flatMap((f) => (f.alerte ? [f.alerte] : [])),
  };
}
