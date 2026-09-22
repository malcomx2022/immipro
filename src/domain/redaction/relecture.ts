/**
 * Analyse critique d'une pièce rédigée — R-04, WF-08.
 *
 * La relecture relève des incohérences et des imprécisions. Elle ne note pas
 * le texte et ne prédit pas la décision de l'administration (INV-1) : une
 * note portée sur une lettre se retiendrait comme un pronostic sur la
 * décision, exactement ce que l'arbitrage C-09 a retiré du dossier.
 *
 * L'apport réel est le croisement : une date qui diffère entre la lettre et
 * le relevé de notes ne se voit sur aucune des deux pièces prise seule.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/**
 * `INCOHERENCE_DOSSIER` n'existe pas dans l'énumération Prisma, et c'est
 * voulu : les recoupements déterministes de RG-08.3 se recalculent à
 * chaque lecture et ne sont jamais stockés. Le genre existe pour ne pas
 * mentir sur l'origine de l'écart — « entre pièces » annoncerait une
 * comparaison avec un document joint, et aucun n'a été lu.
 */
export type GenreRemarque =
  | "INCOHERENCE"
  | "INCOHERENCE_DOSSIER"
  | "A_RENFORCER"
  | "FORME";

export const LIBELLE_GENRE: Record<GenreRemarque, string> = {
  INCOHERENCE: "Incohérence entre pièces",
  INCOHERENCE_DOSSIER: "Écart avec ton dossier",
  A_RENFORCER: "À renforcer",
  FORME: "Remarque de forme",
};

/** Les deux valeurs qui divergent, chacune avec la pièce qui la porte. */
export interface Ecart {
  source: string;
  valeur: string;
}

export interface Remarque {
  id: string;
  genre: GenreRemarque;
  titre: string;
  /** Constat puis conséquence, puis ce qu'il y a à faire (RG-06.3). */
  corps: string;
  /** Présent sur une incohérence : ce qui diffère, et où. */
  ecarts?: readonly [Ecart, Ecart];
  /** Libellé de l'action principale. */
  action: string;
  /** Action secondaire, quand voir l'autre pièce a du sens. */
  actionSecondaire?: string;
}

/** L'incohérence passe avant le reste : c'est la seule qui se voit de l'extérieur. */
const RANG: Record<GenreRemarque, number> = {
  INCOHERENCE: 0,
  INCOHERENCE_DOSSIER: 1,
  A_RENFORCER: 2,
  FORME: 3,
};

export const trierRemarques = (remarques: readonly Remarque[]): Remarque[] =>
  [...remarques].sort((a, b) => RANG[a.genre] - RANG[b.genre]);

export const compterBloquantes = (remarques: readonly Remarque[]): number =>
  remarques.filter((r) => r.genre === "INCOHERENCE").length;

/** Les écarts trouvés sans lire aucune pièce jointe (RG-08.3). */
export const compterRecoupements = (remarques: readonly Remarque[]): number =>
  remarques.filter((r) => r.genre === "INCOHERENCE_DOSSIER").length;

/**
 * « Trois points à traiter, dont une incohérence avec une autre pièce de ton
 * dossier. » Le résumé dit le nombre et nomme ce qui compte le plus.
 */
export function resumeRelecture(remarques: readonly Remarque[]): string {
  if (remarques.length === 0) {
    return "Rien à reprendre sur cette version.";
  }
  const points = `${remarques.length} ${remarques.length > 1 ? "points à traiter" : "point à traiter"}`;
  const pieces = compterBloquantes(remarques);
  const dossier = compterRecoupements(remarques);
  /*
    Les deux origines se comptent séparément parce qu'elles ne disent pas
    la même chose. « Une incohérence avec une autre pièce » affirme qu'une
    pièce a été lue ; un recoupement n'en lit aucune. Les confondre
    remettrait dans le résumé le mensonge que le genre vient d'en sortir.
  */
  const morceaux: string[] = [];
  if (pieces > 0) {
    morceaux.push(
      pieces > 1
        ? `${pieces} incohérences avec d'autres pièces de ton dossier`
        : "une incohérence avec une autre pièce de ton dossier",
    );
  }
  if (dossier > 0) {
    morceaux.push(
      dossier > 1
        ? `${dossier} écarts avec les informations de ton dossier`
        : "un écart avec les informations de ton dossier",
    );
  }
  if (morceaux.length === 0) return `${points}, aucune incohérence avec tes autres pièces.`;
  return `${points}, dont ${morceaux.join(" et ")}.`;
}

/**
 * Remarque de longueur, calculée sur le texte réel.
 *
 * Le prototype annonçait « 412 mots pour une limite conseillée de 400 »
 * au-dessus d'une lettre qui en comptait 134 : le chiffre venait de la
 * maquette, pas du document. Une relecture qui se trompe sur ce qu'elle
 * vient de compter ne se croit plus sur ce qu'elle a lu.
 *
 * `null` quand le texte tient dans la limite : une remarque de forme qui ne
 * demande rien n'a pas à occuper une place dans la liste.
 */
export function remarqueLongueur(
  mots: number,
  limiteConseillee: number,
  etablissement: string,
): Remarque | null {
  if (mots <= limiteConseillee) return null;
  const ecart = mots - limiteConseillee;
  return {
    id: "longueur",
    genre: "FORME",
    titre: `${mots} mots pour une limite conseillée de ${limiteConseillee}`,
    corps: `${etablissement} ne fixe pas de limite stricte. ${ecart} ${ecart > 1 ? "mots" : "mot"} au-dessus n'est pas un problème : tu peux laisser le texte tel quel.`,
    action: "Laisser tel quel",
  };
}

export const CE_QUE_NOUS_NE_JUGEONS_PAS =
  "Nous relevons les incohérences et les imprécisions. Nous ne notons pas ta lettre et nous ne prédisons pas la décision de l'administration.";

export const MENTION_RELECTURE =
  "Elle ne remplace pas la lecture d'un consultant.";

// ── Relu sans remarque, ou jamais relu ─────────────────────────────────

/**
 * Les deux vides que R-04 confondait, et c'était le plus coûteux des deux
 * sens.
 *
 * `resumeRelecture([])` répondait « Rien à reprendre sur cette version. »
 * Or aucune analyse n'avait jamais tourné : rien ne créait de
 * `CritiqueFinding`, le service qui les produit n'est pas branché, et la
 * page rendait donc **un avis favorable sans avoir lu**. Le candidat
 * repartait rassuré d'une relecture qui n'avait pas eu lieu.
 *
 * C'est le même défaut que le zéro de B-07 : un vide qui se lit comme un
 * constat. Un tiret ne dit rien ; « rien à reprendre » affirme.
 */
export type EtatRelecture =
  /** Analysée, et rien à reprendre. */
  | "RELUE_SANS_REMARQUE"
  /** Analysée, des remarques. */
  | "RELUE"
  /**
   * Le fond n'a pas été analysé, mais les recoupements déterministes de
   * RG-08.3 ont tourné — ils ne dépendent d'aucun service.
   *
   * Cet état existe parce que les deux autres mentaient chacun dans un
   * sens : « analyse indisponible » effaçait des écarts réellement
   * trouvés, et « relue » aurait donné pour lu un texte dont personne
   * n'avait jugé le fond.
   */
  | "RECOUPEE_SEULEMENT"
  /**
   * Le service est là, et cette version-ci n'a pas encore été relue.
   *
   * L'état manquait, et son absence est le défaut que ce lot corrige :
   * faute de lui, une version jamais relue devant un service disponible
   * retombait sur `RELUE_SANS_REMARQUE` — « rien à reprendre » sur un
   * texte que personne n'avait lu. C'est aussi le seul état qui porte un
   * geste que le candidat peut faire.
   */
  | "A_ANALYSER"
  /** Ni analysée ni recoupable : rien n'a été lu, et rien n'était comparable. */
  | "ANALYSE_INDISPONIBLE"
  /** Il n'y a pas encore de texte à analyser. */
  | "SANS_TEXTE";

export function etatDeLaRelecture(options: {
  /** `null` quand aucune analyse n'a tourné — jamais `[]`. */
  remarques: readonly Remarque[] | null;
  /** Une version existe. */
  texteExistant: boolean;
  /**
   * Au moins un recoupement déterministe a pu être fait. Faux quand le
   * dossier n'avait rien à comparer — sans règle figée, un résultat vide
   * ne dit pas « rien ne diverge », il dit qu'on n'a rien regardé.
   */
  recoupementsEffectues?: boolean;
  /**
   * Le service d'analyse peut être appelé sur cette instance.
   *
   * Il ne dit **pas** qu'une analyse a eu lieu — c'est exactement la
   * confusion que ce lot corrige. Il dit seulement qu'il y a un geste à
   * proposer plutôt qu'une absence à expliquer.
   */
  analysePossible?: boolean;
}): EtatRelecture {
  if (!options.texteExistant) return "SANS_TEXTE";
  if (options.remarques === null) {
    if (options.analysePossible) return "A_ANALYSER";
    return options.recoupementsEffectues ? "RECOUPEE_SEULEMENT" : "ANALYSE_INDISPONIBLE";
  }
  return options.remarques.length === 0 ? "RELUE_SANS_REMARQUE" : "RELUE";
}

export const RESUME_ANALYSE_INDISPONIBLE =
  "Cette version n'a pas été analysée. Le service qui relève les incohérences n'est pas branché, et nous ne te disons pas que ton texte est bon sans l'avoir lu.";

/**
 * Le service est disponible, et cette version n'a pas encore été relue.
 *
 * La phrase ne dit rien du texte, et c'est le point : il n'a pas été lu.
 * Elle annonce ce que l'analyse coûte, parce que RG-08.4 la fait payer et
 * qu'un geste qui débite se propose avant de débiter, jamais après.
 */
export const RESUME_A_ANALYSER =
  "Cette version n'a pas encore été analysée. L'analyse relève les incohérences et les points laissés sans appui ; elle décompte une analyse de ton quota.";

export const RESUME_SANS_TEXTE =
  "Il n'y a pas encore de texte à analyser sur cette pièce.";

/**
 * Le recoupement a tourné et n'a rien trouvé. La phrase dit les deux :
 * ce qui a été comparé, et ce qui ne l'a pas été.
 *
 * Sans sa seconde moitié, elle retomberait dans le défaut qu'elle corrige :
 * « rien ne diverge » se lirait comme « ta lettre est bonne », alors que
 * personne n'en a jugé le fond.
 */
export const RESUME_RECOUPEE_SANS_ECART =
  "Nous avons recoupé ta lettre avec ce que ton dossier sait déjà : rien ne diverge. Le fond, lui, n'a pas été analysé — le service qui le fait n'est pas branché, et nous ne te disons pas que ton texte est bon sans l'avoir lu.";

/**
 * Le résumé de l'état `RECOUPEE_SEULEMENT`.
 *
 * Il ne passe pas par `resumeRelecture` : celui-ci parle de « pièces », et
 * le recoupement n'en ouvre aucune. Chaque phrase dit donc ce qui a été
 * comparé, et la seconde ce qui ne l'a pas été.
 */
export function resumeRecoupement(remarques: readonly Remarque[]): string {
  if (remarques.length === 0) return RESUME_RECOUPEE_SANS_ECART;
  const n = remarques.length;
  return `${n} ${n > 1 ? "écarts relevés" : "écart relevé"} en recoupant ta lettre avec les informations de ton dossier. Le fond de ta lettre, lui, n'a pas été analysé : le service qui le fait n'est pas branché.`;
};

/**
 * Le résumé, dans l'état où la pièce se trouve.
 *
 * `resumeRelecture` garde sa signature — elle répond sur une liste de
 * remarques, et c'est juste. Ce qui manquait, c'est qu'on l'appelait avec
 * une liste vide dans un cas où il n'y avait pas de liste du tout.
 */
export function resumeSelonLEtat(
  etat: EtatRelecture,
  remarques: readonly Remarque[] | null,
): string {
  if (etat === "SANS_TEXTE") return RESUME_SANS_TEXTE;
  if (etat === "A_ANALYSER") return RESUME_A_ANALYSER;
  if (etat === "ANALYSE_INDISPONIBLE") return RESUME_ANALYSE_INDISPONIBLE;
  if (etat === "RECOUPEE_SEULEMENT") return resumeRecoupement(remarques ?? []);
  return resumeRelecture(remarques ?? []);
}

/**
 * Ce que le candidat peut faire, dans chaque état.
 *
 * Aucune action quand l'analyse est indisponible : un bouton « Relancer »
 * qui ne relance rien vaut moins qu'une absence (règle de Q.A), et
 * l'absence est expliquée juste au-dessus.
 */
export const ACTION_RELECTURE: Record<EtatRelecture, string | null> = {
  RELUE: "Revenir au texte",
  RELUE_SANS_REMARQUE: "Revenir au texte",
  RECOUPEE_SEULEMENT: "Revenir au texte",
  /** Le seul état où le bouton déclenche quelque chose. */
  A_ANALYSER: "Lancer l'analyse",
  ANALYSE_INDISPONIBLE: null,
  SANS_TEXTE: null,
};
