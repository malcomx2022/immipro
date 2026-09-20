/**
 * Aide contextuelle à l'étape — K.A, tranché le 20/09/2026.
 *
 * RG-13.1 demandait une proposition « contextuelle à l'étape » de
 * checklist ; RG-13.2 interdisait « toute proposition commerciale dans
 * l'espace dossier ». L'étape de checklist *est* l'espace dossier : les
 * deux règles se contredisaient, et le lot précédent avait retenu la
 * lecture la plus restrictive en attendant l'arbitrage.
 *
 * La décision tranche pour la règle la plus protectrice, et déplace la
 * frontière au bon endroit. Elle ne passe pas entre « une proposition » et
 * « plusieurs », mais entre deux natures :
 *
 * - **une aide fonctionnelle** — expliquer quoi faire. Elle reste, parce
 *   que c'est le métier de l'espace dossier ;
 * - **une offre commerciale** — vendre une prestation. Elle part, sur les
 *   surfaces qui lui sont dédiées.
 *
 * Ce module porte la première. Rien de ce qu'il écrit ne nomme un
 * prestataire, un tarif ou une commission : l'espace dossier est une
 * surface d'exécution, et une recommandation rémunérée posée au moment où
 * une pièce manque se lit comme un péage, quelle que soit sa rédaction.
 *
 * Le manque comblé n'est pas théorique. Sur ces quatre étapes, la
 * plateforme ne fournit pas la pièce, et la checklist ne le disait nulle
 * part : elle proposait un partenaire, et c'est tout. Retirer la carte sans
 * écrire l'aide aurait laissé « Assurance maladie — à obtenir » sans dire
 * où ni comment, c'est-à-dire un candidat qui attend la plateforme.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export interface AideDeLEtape {
  /**
   * La pièce concernée, telle que la checklist la nomme.
   *
   * Sans elle, l'aide se lisait comme la suite de la prochaine action : à
   * l'écran, « Prochaine action : ajouter ton passeport » était suivi de
   * « Cette attestation s'obtient auprès d'un assureur », et le lecteur
   * rapportait la seconde phrase à la première. Une aide qui ne dit pas de
   * quelle étape elle parle en désigne une autre.
   */
  piece: string;
  /** Le fait : ce que la plateforme ne fait pas. */
  titre: string;
  /** Ce qu'il y a à faire, et ce que l'autorité regardera. */
  corps: string;
}

/** Le texte d'une aide, avant qu'on lui rattache le libellé de la pièce. */
type Texte = Omit<AideDeLEtape, "piece">;

/**
 * Les étapes qu'ImmiPro ne peut pas franchir à la place du candidat.
 *
 * Les codes sont ceux du référentiel — c'est lui qui dit à quel moment la
 * question se pose. Une destination qui n'exige pas d'assurance n'a pas
 * d'étape `assurance_maladie`, et l'aide ne s'affiche jamais.
 *
 * Chaque texte dit trois choses et s'arrête là : que la pièce s'obtient
 * ailleurs, auprès de qui, et ce qui la rend recevable. Ce dernier point
 * est le plus utile — c'est celui sur lequel une pièce revient à corriger.
 */
export const AIDES: Readonly<Record<string, Texte>> = {
  assurance_maladie: {
    titre: "Cette attestation s'obtient auprès d'un assureur",
    corps:
      "ImmiPro ne la délivre pas. Demande-la à un assureur, puis vérifie deux points avant de la déposer : la couverture doit courir sur toute la durée du séjour, et le document doit porter ton nom tel qu'il figure sur ton passeport.",
  },
  logement: {
    titre: "Ce justificatif vient de ton hébergeur",
    corps:
      "ImmiPro ne le produit pas. Il vient du bailleur, de la résidence étudiante ou de la personne qui t'héberge, et il doit porter l'adresse complète et la période couverte. Une réservation annulable ne suffit généralement pas.",
  },
  diplome: {
    titre: "L'équivalence est délivrée par un organisme agréé",
    corps:
      "ImmiPro ne l'établit pas. Elle se demande à l'organisme reconnu par la destination, et le délai se compte en semaines : c'est la pièce à lancer en premier. L'échéancier de ton dossier porte la date à partir de laquelle il devient tendu.",
  },
  preuve_fonds: {
    titre: "Cette preuve vient de ta banque",
    corps:
      "ImmiPro ne l'établit pas. Demande à ta banque un relevé ou une attestation de solde daté, à ton nom. Le montant exigé et la période sur laquelle il doit être visible sont indiqués sur la ligne de ta checklist.",
  },
};

/** L'aide d'une étape, s'il y en a une. `null` partout ailleurs. */
export function aideDeLEtape(code: string, libelle: string): AideDeLEtape | null {
  const texte = AIDES[code];
  return texte ? { piece: libelle, ...texte } : null;
}

/** Une étape de checklist, réduite à ce dont l'aide a besoin. */
export interface Etape {
  /** Code du référentiel — `assurance_maladie`, et non la pastille `ASS`. */
  code: string;
  /** Libellé affiché par la checklist — « Assurance maladie ». */
  libelle: string;
  conforme: boolean;
}

/**
 * L'aide à montrer sur la checklist : celle de la première étape qui reste
 * à traiter et qui en a une.
 *
 * Une seule à la fois, et pas une liste. Quatre encadrés affichés ensemble
 * redeviennent un mur qu'on ne lit pas, et la checklist a déjà son ordre de
 * priorité — on suit le sien plutôt que d'en inventer un second.
 */
export function aidePourLaChecklist(etapes: readonly Etape[]): AideDeLEtape | null {
  for (const etape of etapes) {
    if (etape.conforme) continue;
    const aide = aideDeLEtape(etape.code, etape.libelle);
    if (aide) return aide;
  }
  return null;
}
