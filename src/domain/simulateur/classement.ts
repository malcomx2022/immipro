import { MENTION_HORS_CLASSEMENT } from "../format/change";
import type { Reponses } from "./questions";

/**
 * Classement des destinations — WF-01, étapes 2 à 4.
 *
 * Deux temps, et l'ordre compte. D'abord un **filtrage strict** : une
 * destination dont une condition bloquante échoue sort, quel que soit le
 * reste. Ensuite une **pondération** sur celles qui restent, pour les
 * ordonner. Pondérer d'abord reviendrait à compenser une condition
 * éliminatoire par un bon budget, ce qui donnerait un premier rang à une
 * destination inaccessible.
 *
 * **Ce que le classement n'est pas.** Le rang dit « cette destination
 * correspond mieux à ce que tu as déclaré », jamais « tu as plus de
 * chances ici » (INV-1). Le nombre pondéré n'est donc pas exposé : il
 * ordonne, comme le barème de complétude, et reste dans `interne`
 * (arbitrage C-09). L'écran affiche un rang et des raisons chiffrées.
 *
 * **Ce que le classement ne sait pas encore faire.** DOC-11 §WF-01 donne six
 * composantes : langue 30 %, budget 20 %, facilité administrative 20 %,
 * débouchés post-visa 15 %, qualité de vie 10 %, coût de la vie 5 %. Les
 * quatre premières se calculent depuis le référentiel. Les deux dernières
 * n'y sont pas, et rien ne les y met : il faudrait un indice par pays, avec
 * sa source et sa date de vérification comme tout le reste (INV-8).
 * Fabriquer ces notes serait une information sans source sur une plateforme
 * dont c'est la promesse inverse. Les quatre composantes disponibles sont
 * donc renormalisées sur 100, et `composantesAbsentes` le dit à l'appelant
 * plutôt que de le taire.
 *
 * **La renormalisation vaut aussi destination par destination** — arbitrage
 * I.B. Un coût publié dans une monnaie à cours variable n'est pas converti ;
 * le budget sort alors du classement de cette destination-là, au lieu d'y
 * entrer pour une valeur moyenne inventée.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type Categorie = "ETUDES" | "EMPLOI" | "FAMILLE" | "RECHERCHE_EMPLOI";

export interface DestinationEvaluable {
  code: string;
  slug: string;
  pays: string;
  categorie: Categorie;
  /** Niveau minimal exigé, dans l'échelle du référentiel : « B2 », « IELTS 6.5 ». */
  niveauLangueMin: string | null;
  languesAcceptees: readonly string[];
  /**
   * Coût de la première année, en francs CFA : scolarité minimale plus les
   * ressources à prouver ramenées à douze mois. C'est la grandeur que la
   * question de budget interroge, et la seule comparable d'un pays à
   * l'autre.
   */
  coutPremiereAnneeXOF: number | null;
  delaiTraitementJours: number | null;
  permisEmployeurRequis: boolean;
  dispositifApresDiplome: string | null;
  dureeApresDiplomeMois: number | null;
}

/** Poids de DOC-11, réduits aux composantes que le référentiel porte. */
export const POIDS = {
  langue: 30,
  budget: 20,
  facilite: 20,
  debouches: 15,
} as const;

/** Ce que DOC-11 demande et que le référentiel ne porte pas. */
export const COMPOSANTES_ABSENTES: readonly string[] = ["qualité de vie", "coût de la vie"];

/** Échelle de langue, du plus faible au plus fort. L'index sert la comparaison. */
const ECHELLE = ["Débutant", "A2", "B1", "B2", "C1", "C2"];

const NIVEAU_DECLARE: Record<string, number> = {
  Débutant: 0,
  "B1 — intermédiaire": 2,
  "B2 — avancé": 3,
  "C1 et plus": 4,
};

/** Milieu de fourchette des tranches de budget de P-02, en francs CFA. */
const BUDGET_DECLARE: Record<string, number> = {
  "Moins de 4 millions F": 3_000_000,
  "4 à 8 millions F": 6_000_000,
  "8 à 12 millions F": 10_000_000,
  "Plus de 12 millions F": 15_000_000,
};

const CATEGORIE_VISEE: Record<string, Categorie> = {
  Étudier: "ETUDES",
  Travailler: "EMPLOI",
  "Rejoindre ma famille": "FAMILLE",
  "Créer une activité": "EMPLOI",
};

/** Un niveau exigé peut être écrit « B2 » ou « IELTS 6.5 ». On lit ce qu'on sait lire. */
function exigence(niveau: string | null): number {
  if (!niveau) return 0;
  const direct = ECHELLE.indexOf(niveau.trim().toUpperCase());
  if (direct >= 0) return direct;
  const cadre = niveau.match(/\b([ABC][12])\b/iu);
  return cadre ? ECHELLE.indexOf(cadre[1]!.toUpperCase()) : 3;
}

export interface Motif {
  /** Raison chiffrée, affichée sous la destination : « B2 exigé, tu déclares B2 ». */
  texte: string;
  /** Vrai quand elle joue en faveur de la destination. */
  favorable: boolean;
}

export interface Retenue {
  destination: DestinationEvaluable;
  /** Les trois raisons principales, chiffrées (WF-01, étape 4). */
  motifs: Motif[];
  /**
   * Ordonne, ne s'affiche pas.
   *
   * Une composante à `null` n'a pas été pesée pour cette destination-là,
   * et la note est renormalisée sur celles qui l'ont été — I.B.
   */
  interne: { note: number; detail: Record<keyof typeof POIDS, number | null> };
  /**
   * Pourquoi le budget n'est pas entré dans le classement de cette
   * destination, ou `null` quand il y est entré.
   *
   * Le champ s'appelait `nonPesees` et portait un libellé — « le budget » —
   * sans dire laquelle des deux causes l'avait retiré. Aucun écran ne
   * l'affichait : l'API le lisait pour redeviner la cause, et la redevinait
   * mal. La cause est nommée, la phrase en découle, et le libellé disparaît
   * avec le dernier lecteur qui le reconstituait.
   */
  causeBudget: CauseBudgetNonPese | null;
  /**
   * La réserve à afficher sous le rang, ou `null` quand le budget a été pesé.
   *
   * `causeBudget` est le fait, celle-ci en est la phrase : un appelant qui
   * n'affiche pas — un export, un comparateur — lit la cause sans avoir à la
   * relire dans une chaîne. La phrase, elle, se calcule ici une fois, parce
   * que c'est la seule forme où l'appelant ne peut pas en retirer un cas.
   */
  reserve: string | null;
}

/**
 * Les deux raisons pour lesquelles le budget sort du classement d'une
 * destination. La conséquence est la même — la composante n'est pas pesée —
 * mais la phrase à écrire ne l'est pas : l'une tient au référentiel et le
 * candidat n'y peut rien, l'autre tient à une question qu'il n'a pas
 * remplie et qu'il peut remplir.
 */
export type CauseBudgetNonPese = "monnaie" | "non-declare";

export interface Ecartee {
  destination: DestinationEvaluable;
  /** Fait vérifiable, jamais « profil non adapté ». */
  motif: string;
  /** Ce qui manque, chiffré, pour que l'écart soit franchissable. */
  ecart: string;
}

export interface Resultat {
  retenues: Retenue[];
  ecartees: Ecartee[];
  /**
   * RG-01.3 : quand rien ne passe le filtrage strict, les destinations les
   * plus proches sont montrées avec ce qui leur manque, plutôt qu'un écran
   * vide. C'est le moment où le candidat comprend ce qui lui manque.
   */
  aucuneNePasse: boolean;
  composantesAbsentes: readonly string[];
}

export function classer(
  destinations: readonly DestinationEvaluable[],
  reponses: Reponses,
): Resultat {
  const visee = reponses.objectif ? CATEGORIE_VISEE[reponses.objectif] : undefined;
  const niveau = reponses.langue ? (NIVEAU_DECLARE[reponses.langue] ?? 0) : 0;
  const budget = reponses.budget ? (BUDGET_DECLARE[reponses.budget] ?? 0) : 0;

  const retenues: Retenue[] = [];
  const ecartees: Ecartee[] = [];

  for (const d of destinations) {
    const refus = filtrageStrict(d, { visee, niveau, budget });
    if (refus) {
      ecartees.push({ destination: d, ...refus });
      continue;
    }
    retenues.push(evaluer(d, { niveau, budget }));
  }

  retenues.sort((a, b) => b.interne.note - a.interne.note);

  // RG-01.3 : plutôt qu'un écran vide, les moins éloignées d'abord.
  if (retenues.length === 0) {
    ecartees.sort((a, b) => a.ecart.length - b.ecart.length);
  }

  return {
    retenues,
    ecartees,
    aucuneNePasse: retenues.length === 0,
    composantesAbsentes: COMPOSANTES_ABSENTES,
  };
}

interface Profil {
  visee?: Categorie;
  niveau: number;
  budget: number;
}

/**
 * Filtrage strict. Trois critères seulement, et c'est délibéré : ce sont les
 * trois que les six questions du simulateur permettent d'évaluer. Les
 * conditions bloquantes du référentiel qui portent sur des pièces —
 * validité de passeport, ancienneté d'un relevé — ne se jugent pas sur une
 * déclaration ; elles arrivent à l'ouverture du dossier, avec la checklist.
 */
function filtrageStrict(
  d: DestinationEvaluable,
  profil: Profil,
): { motif: string; ecart: string } | null {
  if (profil.visee && d.categorie !== profil.visee) {
    return {
      motif: `Cette destination ne couvre pas l'objectif déclaré.`,
      ecart: `Dispositif ouvert pour : ${libelleCategorie(d.categorie)}.`,
    };
  }

  const exige = exigence(d.niveauLangueMin);
  if (exige > profil.niveau) {
    return {
      motif: `Le niveau de langue exigé n'est pas atteint.`,
      ecart: `${d.niveauLangueMin} exigé, tu déclares ${ECHELLE[profil.niveau] ?? "débutant"}.`,
    };
  }

  if (d.coutPremiereAnneeXOF !== null && profil.budget > 0 && d.coutPremiereAnneeXOF > profil.budget) {
    const manque = d.coutPremiereAnneeXOF - profil.budget;
    return {
      motif: `Le budget déclaré ne couvre pas la première année.`,
      ecart: `${francs(d.coutPremiereAnneeXOF)} demandés, ${francs(manque)} au-dessus de ton budget.`,
    };
  }

  return null;
}

function evaluer(d: DestinationEvaluable, profil: Profil): Retenue {
  const exige = exigence(d.niveauLangueMin);
  // Une marge au-dessus de l'exigence compte, mais plafonne : dépasser B2 de
  // deux crans n'ouvre pas deux fois plus de portes.
  const langue = Math.min(1, (profil.niveau - exige + 1) / 2);

  // Deux causes, la même conséquence — une monnaie sans parité sûre, ou un
  // candidat qui n'a pas déclaré de budget. La cause est nommée ici, une
  // fois : tout ce qui en dépend s'en déduit, plutôt que de la reconstituer
  // à partir de ses conséquences.
  const causeBudget = causeDuBudgetNonPese(d, profil);

  // `null`, et non une valeur moyenne : la composante est retirée du calcul,
  // pas remplie au jugé. Le second test n'ajoute pas de règle — une cause
  // existe déjà dès que le coût manque — il donne son type au calcul.
  const budget =
    causeBudget === null && d.coutPremiereAnneeXOF !== null
      ? Math.min(1, profil.budget / d.coutPremiereAnneeXOF - 1 + 0.5)
      : null;

  // Facilité administrative : le délai de traitement, et le permis employeur
  // qui n'est pas une formalité — le droit au travail appartient à
  // l'employeur, pas à l'étudiant (RG-03.3).
  const delai = d.delaiTraitementJours === null ? 0.5 : Math.min(1, 90 / d.delaiTraitementJours);
  const facilite = delai * (d.permisEmployeurRequis ? 0.7 : 1);

  const debouches =
    d.dispositifApresDiplome === null
      ? 0
      : Math.min(1, (d.dureeApresDiplomeMois ?? 12) / 24);

  const detail: Record<keyof typeof POIDS, number | null> = {
    langue: borne(langue) * POIDS.langue,
    budget: budget === null ? null : borne(budget) * POIDS.budget,
    facilite: borne(facilite) * POIDS.facilite,
    debouches: borne(debouches) * POIDS.debouches,
  };

  return {
    destination: d,
    motifs: motifsDe(d, profil, causeBudget).slice(0, 3),
    interne: { note: noteRenormalisee(detail), detail },
    causeBudget,
    reserve: reserveDuBudget(causeBudget, d.coutPremiereAnneeXOF),
  };
}

/**
 * Ce qui n'a pas pu être pesé pour une destination donnée — arbitrage I.B,
 * tranché le 20/09/2026.
 *
 * Un coût publié dans une monnaie à cours variable n'est pas converti : le
 * faire avec un taux écrit en dur donnerait une information non sourcée
 * (INV-8). La destination reste présentée — l'écarter serait plus dommageable
 * que de la garder avec sa limite annoncée — mais **le budget sort de son
 * classement**.
 *
 * Il en sortait déjà du filtrage strict ; il entrait encore dans la
 * pondération, et pour une valeur moyenne inventée. Une destination dont le
 * budget n'est pas comparable gagnait ainsi la moitié des points de la
 * composante sans les avoir mérités, pendant qu'une destination au budget
 * réellement mesuré et défavorable en gagnait moins. Le hasard de la monnaie
 * de publication décidait d'un rang.
 *
 * **Deux causes, et la seconde était muette.** Le candidat qui n'a pas
 * répondu à la question du budget n'a rien à comparer non plus : la
 * composante sort pour lui aussi. La monnaie passe d'abord, et l'ordre a une
 * conséquence — quand le coût n'est pas convertible, déclarer un budget n'y
 * changerait rien, et inviter le candidat à le faire serait lui promettre un
 * effet qui ne viendra pas.
 */
function causeDuBudgetNonPese(
  d: DestinationEvaluable,
  profil: Profil,
): CauseBudgetNonPese | null {
  if (d.coutPremiereAnneeXOF === null) return "monnaie";
  if (profil.budget === 0) return "non-declare";
  return null;
}

/**
 * La note ne se calcule que sur ce qui a été pesé.
 *
 * C'est la même opération que celle qui renormalise les quatre composantes
 * disponibles sur les six de DOC-11, appliquée cette fois destination par
 * destination : une composante absente ne vaut ni zéro ni la moyenne, elle
 * ne compte pas.
 */
function noteRenormalisee(detail: Record<keyof typeof POIDS, number | null>): number {
  let points = 0;
  let poids = 0;
  for (const cle of Object.keys(POIDS) as (keyof typeof POIDS)[]) {
    const valeur = detail[cle];
    if (valeur === null) continue;
    points += valeur;
    poids += POIDS[cle];
  }
  // Aucune composante pesée : le cas n'existe pas aujourd'hui — la langue,
  // la facilité et les débouchés sont toujours calculables — et zéro est la
  // seule réponse qui n'invente rien s'il apparaissait.
  return poids === 0 ? 0 : Math.round((points / poids) * 100);
}

const borne = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Raisons chiffrées. Elles citent une valeur du référentiel et la réponse
 * déclarée, pour qu'on puisse les vérifier — « bon profil » ne se vérifie
 * pas. Les défavorables sont dites aussi : une destination retenue qui exige
 * un permis employeur doit le dire au rang où elle apparaît, pas trois
 * écrans plus loin.
 *
 * Un motif est toujours une comparaison faite : `favorable` dit de quel côté
 * elle est tombée, il ne dit pas « on n'a pas comparé ». Une composante qui
 * n'a pas été pesée n'a donc pas de motif — elle a une réserve, où le
 * chiffre est dit sans être compté contre la destination.
 */
function motifsDe(
  d: DestinationEvaluable,
  profil: Profil,
  causeBudget: CauseBudgetNonPese | null,
): Motif[] {
  const motifs: Motif[] = [];

  if (d.niveauLangueMin) {
    motifs.push({
      texte: `${d.niveauLangueMin} exigé, tu déclares ${ECHELLE[profil.niveau] ?? "débutant"}.`,
      favorable: exigence(d.niveauLangueMin) <= profil.niveau,
    });
  } else {
    motifs.push({ texte: "Aucun niveau de langue exigé.", favorable: true });
  }

  // Une destination retenue dont le budget a été pesé est, par construction,
  // dans le budget : `filtrageStrict` a déjà écarté les autres. La marge est
  // donc toujours positive ici, et la seule phrase à écrire est celle-là.
  if (causeBudget === null && d.coutPremiereAnneeXOF !== null) {
    const marge = profil.budget - d.coutPremiereAnneeXOF;
    motifs.push({
      texte: `Première année estimée à ${francs(d.coutPremiereAnneeXOF)}, ${francs(marge)} de marge sur ton budget.`,
      favorable: true,
    });
  }

  if (d.permisEmployeurRequis) {
    motifs.push({
      texte: "Travail étudiant soumis à un permis que l'employeur doit obtenir.",
      favorable: false,
    });
  }

  if (d.dispositifApresDiplome) {
    motifs.push({
      texte: `${d.dispositifApresDiplome} après le diplôme${
        d.dureeApresDiplomeMois ? ` — ${d.dureeApresDiplomeMois} mois` : ""
      }.`,
      favorable: true,
    });
  }

  if (d.delaiTraitementJours !== null) {
    motifs.push({
      texte: `Traitement annoncé en ${d.delaiTraitementJours} jours.`,
      favorable: d.delaiTraitementJours <= 90,
    });
  }

  return motifs;
}

const francs = (n: number) => `${new Intl.NumberFormat("fr-FR").format(Math.round(n))} F`;

const LIBELLE_CATEGORIE: Record<Categorie, string> = {
  ETUDES: "études",
  EMPLOI: "emploi qualifié",
  FAMILLE: "regroupement familial",
  RECHERCHE_EMPLOI: "recherche d'emploi après diplôme",
};

const libelleCategorie = (c: Categorie) => LIBELLE_CATEGORIE[c];

/** Les trois meilleures, comme l'affiche P-03. */
export const TROIS_MEILLEURES = 3;

/**
 * La réserve affichée sous le rang, quand le budget n'est pas entré dans le
 * classement de cette destination — I.B.
 *
 * Elle existait pour une seule des deux causes. L'API la calculait par un
 * prédicat de son cru — « une composante manque **et** le coût n'est pas
 * converti » — qui redisait la monnaie et retirait l'autre cas. Un candidat
 * qui n'avait pas répondu à la question du budget recevait donc un
 * classement où le budget ne comptait pas, sans que rien ne le dise, et son
 * coût de première année lui était présenté comme un point défavorable alors
 * qu'il n'avait été comparé à rien.
 *
 * La phrase se déduit maintenant de la cause, là où la cause est établie.
 * `null` quand le budget a été pesé : il n'y a alors rien à réserver.
 */
function reserveDuBudget(cause: CauseBudgetNonPese | null, coutXOF: number | null): string | null {
  if (cause === null) return null;
  if (cause === "monnaie") return MENTION_HORS_CLASSEMENT;
  // « non-declare » implique un coût connu : `causeDuBudgetNonPese` rend
  // « monnaie » dès qu'il manque, et la monnaie passe d'abord. Le type ne le
  // sait pas ; écrire une branche pour ce cas serait écrire du code mort.
  const montant = francs(coutXOF!);
  // Le chiffre est dit ici, puisqu'il ne l'est plus en motif : le candidat
  // garde le coût sous les yeux, sans qu'il soit compté contre la
  // destination. La phrase nomme l'action, elle n'est pas un simple constat.
  return `Tu n'as pas indiqué de budget : la première année, estimée à ${montant}, n'est pas comparée et n'entre pas dans le classement de cette destination. Modifie tes réponses pour l'y faire entrer.`;
}

/**
 * Ce que le classement a pesé, et ce qu'il n'a pas pu peser — I.A.
 *
 * `composantesAbsentes` existait déjà, et il ne sortait pas de l'API : le
 * serveur savait que deux des six composantes de DOC-11 n'avaient été
 * mesurées par personne, l'appelant le recevait, et P-03 ne le lisait pas.
 * Le candidat voyait donc un classement présenté comme entier alors que le
 * système savait qu'il ne l'était pas. C'est exactement ce qu'INV-8 refuse :
 * une information affichée sans dire d'où elle vient ni jusqu'où elle va.
 *
 * Les deux phrases sont **dérivées**, jamais écrites deux fois : la liste
 * pesée vient de `POIDS`, la liste manquante de l'argument. Brancher demain
 * un indice de coût de la vie avec sa source retire la seconde phrase sans
 * qu'on ait à relire l'écran ; ajouter une composante l'ajoute à la
 * première.
 *
 * Aucun poids n'est cité. Un pourcentage sur un écran candidat est refusé
 * par le vocabulaire interdit, et il le serait de toute façon : la part de
 * chaque critère ordonne, elle ne s'affiche pas (arbitrage C-09).
 */
const INTITULE_COMPOSANTE: Record<keyof typeof POIDS, string> = {
  langue: "le niveau de langue exigé",
  budget: "le budget de la première année",
  facilite: "la facilité administrative",
  debouches: "les débouchés après le diplôme",
};

/** Zéro à six : au-delà, le chiffre est plus lisible que la lettre. */
const EN_TOUTES_LETTRES = ["aucun", "un", "deux", "trois", "quatre", "cinq", "six"];

const nombre = (n: number) => EN_TOUTES_LETTRES[n] ?? String(n);

function enumerer(liste: readonly string[]): string {
  if (liste.length <= 1) return liste[0] ?? "";
  return `${liste.slice(0, -1).join(", ")} et ${liste[liste.length - 1]}`;
}

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface Perimetre {
  /** Ce qui a été comparé, nommé. */
  peses: string;
  /**
   * Ce qui manque, ou `null` quand plus rien ne manque — le jour où les six
   * composantes ont une source, la phrase disparaît d'elle-même.
   */
  absentes: string | null;
}

/**
 * Les composantes pesées, de la plus lourde à la plus légère. L'ordre suit
 * `POIDS` sans le dire : citer « le niveau de langue » en premier est exact,
 * écrire « 30 % » ne l'est pas sur cet écran.
 */
export const COMPOSANTES_PESEES: readonly string[] = (
  Object.keys(POIDS) as (keyof typeof POIDS)[]
)
  .sort((a, b) => POIDS[b] - POIDS[a])
  .map((c) => INTITULE_COMPOSANTE[c]);

export function perimetreDuClassement(absentes: readonly string[]): Perimetre {
  const combien = COMPOSANTES_PESEES.length;
  const pluriel = combien > 1 ? "s" : "";
  return {
    peses: `Ce classement compare ${nombre(combien)} critère${pluriel} publié${pluriel} : ${enumerer(
      COMPOSANTES_PESEES,
    )}.`,
    absentes:
      absentes.length === 0
        ? null
        : `${majuscule(nombre(absentes.length))} critère${absentes.length > 1 ? "s" : ""} prévu${
            absentes.length > 1 ? "s" : ""
          } n'y ${absentes.length > 1 ? "entrent" : "entre"} pas, faute d'une source datée : ${enumerer(
            absentes,
          )}.`,
  };
}
