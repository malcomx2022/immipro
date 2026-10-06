/**
 * Le rail de remboursement sortant — arbitrage du 21/09/2026.
 *
 * **Trois faits, et le produit n'en écrivait que deux.** K.C ouvrait la
 * décision de rembourser, M.B enregistrait la confirmation que l'argent
 * était reparti. Entre les deux manquait la demande envoyée au
 * fournisseur : une obligation ouverte et une demande acceptée se
 * lisaient pareil, et une tentative échouée ne laissait aucune trace.
 *
 * Les trois, dans l'ordre, et aucun ne se substitue à un autre :
 *
 * 1. **décidé** — on doit rendre cette somme, et pourquoi (K.C) ;
 * 2. **demandé** — le fournisseur a accepté la demande ; c'est un accusé
 *    de réception, pas un virement ;
 * 3. **versé** — sa notification signée le dit, et elle seule (M.B,
 *    INV-7).
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

import { formatMineur, versMineur } from "@/domain/facturation/montants";

export type EtapeRemboursement = "DECIDE" | "DEMANDE" | "VERSE";

export const LIBELLE_ETAPE: Record<EtapeRemboursement, string> = {
  DECIDE: "Décidé, pas encore demandé",
  DEMANDE: "Demandé au fournisseur, en attente de confirmation",
  VERSE: "Versé et confirmé",
};

export interface EtatRemboursement {
  dueAt: Date | null;
  requestedAt: Date | null;
  refundedAt: Date | null;
}

/** Où en est un remboursement, ou `null` s'il n'en a jamais été question. */
export function etapeDe(etat: EtatRemboursement): EtapeRemboursement | null {
  if (etat.refundedAt) return "VERSE";
  if (etat.requestedAt) return "DEMANDE";
  if (etat.dueAt) return "DECIDE";
  return null;
}

/**
 * Ce qu'il reste à faire, dit à l'opérateur qui regarde la file.
 *
 * Une demande partie et non confirmée n'est pas une affaire classée :
 * c'est le cas le plus facile à oublier, parce qu'il ressemble à un
 * succès. Il doit se voir comme une obligation en attente, et non comme
 * un remboursement fait.
 */
export const RESTE_A_FAIRE: Record<EtapeRemboursement, string> = {
  DECIDE: "La demande n'est pas partie. Relance l'envoi.",
  DEMANDE:
    "Le fournisseur a accepté la demande, sans confirmer le versement. Tant que sa notification signée n'est pas arrivée, la somme n'est pas rendue.",
  VERSE: "Rien : la notification signée du fournisseur a confirmé le versement.",
};

/**
 * La clé d'idempotence d'une demande de remboursement.
 *
 * Dérivée de la référence, et non tirée au sort : deux tentatives sur la
 * même transaction portent la même clé, et le fournisseur reconnaît la
 * seconde comme un rejeu plutôt que d'envoyer l'argent deux fois. C'est
 * la propriété qui rend une nouvelle tentative sûre après un échec
 * d'appel — et un échec d'appel est le cas ordinaire, pas l'exception.
 *
 * Elle ne se stocke pas : une valeur dérivée qu'on enregistre finit par
 * diverger de ce dont elle est dérivée.
 */
export const cleDIdempotence = (reference: string): string => `remboursement:${reference}`;

// ── Ce que le fournisseur répond, et ce qu'on en fait ────────────────────

/**
 * Les cinq issues d'une demande de remboursement.
 *
 * Elles se distinguent parce qu'elles n'appellent pas la même suite, et
 * les confondre coûte cher dans les deux sens : traiter un refus
 * définitif comme une erreur passagère fait relancer indéfiniment une
 * demande que le fournisseur n'exécutera jamais ; traiter une panne
 * réseau comme un refus classe une dette que personne n'a payée.
 *
 * - **`acceptee`** — le fournisseur a pris la demande. Un accusé de
 *   réception, pas un virement (INV-7) ;
 * - **`refusee_definitivement`** — il refuse, et réessayer ne changera
 *   rien : somme déjà rendue de son côté, transaction trop ancienne,
 *   compte fermé. Il faut un humain ;
 * - **`temporaire`** — réseau, délai, panne. On ne sait pas si la demande
 *   est passée : la clé d'idempotence est faite pour ça ;
 * - **`reponse_illisible`** — il a répondu quelque chose qui n'est pas
 *   au schéma. On ne devine pas : ni accepté, ni refusé ;
 * - **`non_configure`** — aucune clé, ou adaptateur non opérationnel.
 *   Rien n'est parti, et c'est dit ;
 * - **`procedure_manuelle`** — le fournisseur n'a pas d'API de
 *   remboursement (FedaPay, arbitrage S.91). Rien n'est parti, et rien ne
 *   partira par ce chemin : un opérateur rembourse au tableau de bord du
 *   fournisseur, puis déclare la référence en B-04.
 */
export type IssueDeDemande =
  | "acceptee"
  | "refusee_definitivement"
  | "temporaire"
  | "reponse_illisible"
  | "non_configure"
  | "procedure_manuelle";

export interface SuiteDeLaTentative {
  /**
   * La demande est-elle acceptée ? Seul ce cas pose `refundRequestedAt`.
   * Tous les autres laissent la dette exactement où elle était.
   */
  acceptee: boolean;
  /**
   * Faut-il un humain ? Un refus définitif et une réponse illisible, oui :
   * dans les deux cas la relance automatique tournerait à vide. Une panne
   * et une absence de clé, non — la première se reprend, la seconde se
   * configure.
   */
  exigeUnHumain: boolean;
  /** Ce que l'opérateur lit dans la file. */
  message: string;
}

/**
 * La suite d'une tentative, par issue — `switch` exhaustif à dessein.
 *
 * Une sixième issue ne compilera pas tant qu'on n'aura pas répondu aux
 * deux questions qui décident du sort d'une dette : est-elle demandée, et
 * faut-il quelqu'un ?
 *
 * **Aucune issue ne solde la dette.** Elle ne s'éteint que sur
 * `refundedAt`, écrit par la notification signée — pas ici.
 */
export function suiteDeLaTentative(issue: IssueDeDemande): SuiteDeLaTentative {
  switch (issue) {
    case "acceptee":
      return {
        acceptee: true,
        exigeUnHumain: false,
        message:
          "Le fournisseur a accepté la demande. Tant que sa notification signée n'est pas arrivée, la somme n'est pas rendue.",
      };
    case "refusee_definitivement":
      return {
        acceptee: false,
        exigeUnHumain: true,
        message:
          "Le fournisseur refuse la demande, et une relance ne changera rien. À reprendre à la main : vérifier si la somme a déjà été rendue de son côté.",
      };
    case "temporaire":
      return {
        acceptee: false,
        exigeUnHumain: false,
        message:
          "Le fournisseur n'a pas répondu. On ne sait pas si la demande est passée : la reprise portera la même clé, et il y reconnaîtra un rejeu.",
      };
    case "reponse_illisible":
      return {
        acceptee: false,
        exigeUnHumain: true,
        message:
          "Le fournisseur a répondu quelque chose d'inattendu. Rien n'est conclu — ni accepté, ni refusé — et la demande est à vérifier chez lui.",
      };
    case "non_configure":
      return {
        acceptee: false,
        exigeUnHumain: false,
        message:
          "Aucune demande n'est partie : le rail de remboursement n'est pas configuré pour ce fournisseur. La dette reste due.",
      };
    /*
      Un humain, tout de suite, et pas après cinq relances : relancer un
      rail sans API ne ferait que compter des tentatives qui n'ont pas eu
      lieu, puis accuser le fournisseur d'un silence qui est le nôtre.
      L'écart ouvert sort la dette de la passe de relance et la pose dans
      la file de B-04, avec le geste à faire.
    */
    case "procedure_manuelle":
      return {
        acceptee: false,
        exigeUnHumain: true,
        message: A_REMBOURSER_A_LA_MAIN,
      };
    default: {
      const jamais: never = issue;
      throw new Error(`Issue de remboursement non arbitrée : ${JSON.stringify(jamais)}`);
    }
  }
}

/* ── Le remboursement FedaPay, fait à la main — arbitrage S.91 ─────────── */

/**
 * Ce que l'opérateur lit, et doit faire.
 *
 * FedaPay n'expose aucune API de remboursement : sa documentation (lue le
 * 22/09/2026, relue le 25/09/2026) décrit un geste au tableau de bord,
 * possible par MTN Mobile Money seulement. Le message le dit, et dit la
 * suite — sans quoi la dette resterait « décidée » sans que personne ne
 * sache qui doit bouger.
 */
export const A_REMBOURSER_A_LA_MAIN =
  "FedaPay n'a pas d'API de remboursement. Rembourse cette transaction depuis le tableau de bord FedaPay (MTN Mobile Money uniquement), puis saisis ici la référence du remboursement qu'il affiche. La somme ne sera tenue pour rendue qu'à la notification signée de FedaPay.";

/**
 * La référence d'un remboursement fait au tableau de bord, telle que
 * l'opérateur la saisit.
 *
 * Préfixée comme les identifiants de transaction (`fedapay:`), pour
 * qu'une même colonne puisse porter un jour la référence d'un autre rail
 * sans collision. Le préfixe est accepté s'il est recopié, et ajouté
 * sinon : l'opérateur colle ce que le tableau de bord montre.
 *
 * Refusée plutôt que nettoyée au-delà des espaces : une référence
 * corrigée en silence ne retrouverait plus la ligne chez le fournisseur,
 * et c'est sa seule fonction.
 */
export type LectureDeReference =
  | { valide: true; reference: string }
  | { valide: false; message: string };

const FORME_DE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;

export function lireLaReferenceDeRemboursement(saisie: string): LectureDeReference {
  const brute = saisie.trim().replace(/^fedapay:/iu, "");
  if (brute === "") {
    return {
      valide: false,
      message:
        "Saisis la référence du remboursement affichée par le tableau de bord FedaPay, dans la liste des remboursements.",
    };
  }
  if (!FORME_DE_REFERENCE.test(brute)) {
    return {
      valide: false,
      message:
        "Cette référence ne ressemble pas à celle d'un remboursement FedaPay : recopie-la telle que le tableau de bord l'affiche, sans espace ni ponctuation (lettres, chiffres, tiret, soulignement, 64 caractères au plus).",
    };
  }
  return { valide: true, reference: `${PREFIXE_FOURNISSEUR.FEDAPAY}${brute}` };
}

/**
 * Peut-on déclarer, sur cette transaction, un remboursement fait à la main ?
 *
 * Trois conditions, et chacune garde une règle déjà écrite :
 *
 * - **la dette existe et n'est pas soldée** — on ne déclare pas le
 *   remboursement d'une somme que personne ne doit ;
 * - **l'initiation a eu lieu** (`refundAttemptedAt`) — c'est elle qui
 *   retire les droits non consommés (K.C) et fige la somme à rendre
 *   (RG-15.2). Déclarer avant rendrait l'argent en laissant le pack
 *   utilisable ; et un pack envoyé en revue manuelle — dossier déposé ou
 *   clos — n'est jamais initié : la question se tranche avant, pas par
 *   ce formulaire ;
 * - **aucune demande n'est déjà déclarée** — la même référence redite est
 *   un rejeu sans effet, une autre est un conflit (voir l'appelant).
 */
export type DefautDeDeclaration =
  | "sans_dette"
  | "deja_rendue"
  | "autre_rail"
  | "non_initiee";

export function defautDeDeclaration(t: {
  provider: "FEDAPAY" | "STRIPE";
  refundDueAt: Date | null;
  refundedAt: Date | null;
  refundAttemptedAt: Date | null;
}): DefautDeDeclaration | null {
  if (t.refundDueAt === null) return "sans_dette";
  if (t.refundedAt !== null) return "deja_rendue";
  if (t.provider !== "FEDAPAY") return "autre_rail";
  if (t.refundAttemptedAt === null) return "non_initiee";
  return null;
}

export const MOTIF_DE_REFUS_DE_DECLARATION: Record<DefautDeDeclaration, string> = {
  sans_dette: "aucun remboursement n'est dû sur ce paiement",
  deja_rendue:
    "la notification signée du fournisseur a déjà confirmé ce remboursement, il n'y a plus rien à déclarer",
  autre_rail:
    "ce paiement a été encaissé par Stripe, dont le remboursement part par API : utilise « Relancer l'envoi » plutôt qu'une déclaration manuelle",
  non_initiee:
    "le remboursement n'a pas encore été initié, donc les droits non consommés du pack n'ont pas été retirés. Lance d'abord le remboursement, puis déclare la référence",
};

/**
 * Une dette FedaPay telle que B-04 la montre — toutes dates confondues.
 *
 * Le tableau de B-04 ne porte que les paiements de la journée ; une dette
 * FedaPay née d'un achat de la semaine dernière n'y apparaîtrait pas, et
 * c'est précisément celle qu'un humain doit rembourser à la main. Elle a
 * donc sa liste, jusqu'à la notification signée qui la solde.
 */
export interface DetteFedaPay {
  reference: string;
  compte: string;
  /** Le prix payé, en unités entières de la grille, comme `Transaction.amount`. */
  montant: number;
  /**
   * Ce qu'il faut rendre, dans la même unité — RG-15.2. Égal à `montant`
   * sauf pour un pack entamé, remboursé au prorata des analyses restantes.
   */
  montantARendre: number;
  devise: string;
  etape: EtapeRemboursement;
  motif: string | null;
  /** L'initiation a eu lieu : les droits sont retirés, la déclaration est possible. */
  initiee: boolean;
  decideeLe: string;
  demandeeLe: string | null;
  referenceFournisseur: string | null;
}

/**
 * Ce que l'opérateur lit sous une dette FedaPay, selon où elle en est.
 *
 * Un remboursement partiel (RG-15.2) le dit en plus, avec le montant
 * exact : le geste par défaut au tableau de bord rend le prix payé, et
 * c'est précisément l'erreur à ne pas faire.
 */
export function consigneFedaPay(
  dette: Pick<DetteFedaPay, "etape" | "initiee"> &
    Partial<Pick<DetteFedaPay, "montant" | "montantARendre" | "devise">>,
): string {
  if (dette.etape === "DEMANDE") {
    return "Remboursement déclaré. La somme n'est tenue pour rendue qu'à la notification signée de FedaPay : si elle n'arrive pas, vérifie l'état du remboursement dans son tableau de bord.";
  }
  if (!dette.initiee) {
    return "Le remboursement n'est pas encore initié : les droits non consommés du pack n'ont pas été retirés. S'il a été envoyé en revue manuelle, la question se tranche d'abord dans la file des écarts.";
  }
  if (
    dette.montant !== undefined &&
    dette.montantARendre !== undefined &&
    dette.devise !== undefined &&
    dette.montantARendre < dette.montant
  ) {
    return `${A_REMBOURSER_A_LA_MAIN} ${consignePartielle(
      versMineur(dette.montantARendre, dette.devise),
      versMineur(dette.montant, dette.devise),
      dette.devise,
    )}`;
  }
  return A_REMBOURSER_A_LA_MAIN;
}

/**
 * Le montant exact d'un remboursement partiel fait à la main, et ce qu'il
 * faut faire si le tableau de bord ne permet pas de le saisir : ne rien
 * rembourser. Un remboursement intégral rendrait plus que dû, et ne se
 * reprend pas.
 */
export const consignePartielle = (aRendreMineur: number, payeMineur: number, devise: string): string =>
  `Remboursement partiel, au prorata des analyses restantes (RG-15.2) : rembourse exactement ${formatMineur(aRendreMineur, devise)}, et non les ${formatMineur(payeMineur, devise)} payés. Si le tableau de bord ne permet pas de saisir ce montant, ne rembourse rien et signale la dette à la direction : un remboursement intégral ne se reprend pas.`;

/**
 * La somme à rendre, dite à l'opérateur dans un écart ou une note — avec
 * le prix payé quand elle en diffère.
 */
export const libelleDeLaSommeARendre = (
  aRendreMineur: number,
  payeMineur: number,
  devise: string,
): string =>
  aRendreMineur < payeMineur
    ? `Montant à rembourser : ${formatMineur(aRendreMineur, devise)} sur ${formatMineur(payeMineur, devise)} payés (prorata des analyses restantes, RG-15.2).`
    : `Montant à rembourser : ${formatMineur(aRendreMineur, devise)}, le prix payé.`;

/**
 * L'identifiant du fournisseur est-il présent, et est-il le sien ?
 *
 * Les deux rails écrivent la même colonne, préfixée : `stripe:cs_…`,
 * `fedapay:1234`. Une demande de remboursement envoyée avec
 * l'identifiant de l'autre rail — ou sans identifiant du tout — ne
 * rembourse rien et peut, au pire, viser une transaction étrangère.
 *
 * On vérifie donc **avant** d'appeler, plutôt que de laisser le
 * fournisseur répondre « inconnu » et compter cela comme une tentative.
 */
export const PREFIXE_FOURNISSEUR: Record<"FEDAPAY" | "STRIPE", string> = {
  FEDAPAY: "fedapay:",
  STRIPE: "stripe:",
};

export type DefautDIdentifiant = "absent" | "autre_fournisseur";

export function defautDIdentifiant(
  providerTxId: string | null,
  fournisseur: "FEDAPAY" | "STRIPE",
): DefautDIdentifiant | null {
  if (!providerTxId || providerTxId.trim() === "") return "absent";
  return providerTxId.startsWith(PREFIXE_FOURNISSEUR[fournisseur]) ? null : "autre_fournisseur";
}

export const MOTIF_IDENTIFIANT: Record<DefautDIdentifiant, string> = {
  absent:
    "Aucun identifiant de transaction chez le fournisseur : aucune session n'a jamais été ouverte, il n'y a rien à rembourser chez lui. À reprendre à la main.",
  autre_fournisseur:
    "L'identifiant enregistré n'est pas celui du fournisseur de cette transaction. Aucune demande n'est partie : elle viserait un paiement étranger.",
};

// ── Le quota d'un pack remboursé ─────────────────────────────────────────

export type SuiteDuQuota =
  /** Rien n'a été consommé : les droits ouverts se retirent en entier. */
  | { suite: "RETRAIT_INTEGRAL"; retire: number }
  /** Une partie a servi : aucun remboursement intégral automatique. */
  | { suite: "REVUE_MANUELLE"; ouvertes: number; consommees: number };

/**
 * Ce qu'il advient des droits quand un remboursement s'initie.
 *
 * **Les droits non consommés partent à l'initiation**, pas à la
 * confirmation : entre les deux il peut s'écouler des jours, et laisser
 * un pack utilisable pendant qu'on rend son prix revient à l'offrir.
 *
 * **Une consommation partielle ne se rembourse pas automatiquement en
 * entier.** Pour une recharge, le cas passe en revue manuelle. Pour un
 * pack, la direction a tranché le 06/10/2026 : le prorata des analyses
 * restantes (`montantDuRemboursement`, RG-15.2), qui remplace cette
 * fonction sur les packs.
 *
 * **Et rien n'est recrédité ni effacé rétroactivement.** Les lignes des
 * analyses consommées restent : le grand livre s'ajoute, il ne se
 * réécrit pas.
 */
export function suiteDuQuota(ouvertes: number, consommees: number): SuiteDuQuota {
  if (consommees > 0) return { suite: "REVUE_MANUELLE", ouvertes, consommees };
  return { suite: "RETRAIT_INTEGRAL", retire: ouvertes };
}

export const MOTIF_REVUE_PARTIELLE =
  "Une partie du pack a déjà été consommée. Le remboursement intégral n'est pas prononcé automatiquement : à trancher à la main.";

/* ── Le pack entamé — RG-15.2, décision du 06/10/2026 ─────────────────── */

/**
 * Ce que vaut un pack entamé : la question est tranchée.
 *
 * `suiteDuQuota` disait, jusqu'ici, que le produit ne savait pas ce que
 * vaut une analyse déjà rendue, et envoyait tout pack entamé en revue
 * manuelle. La direction a répondu le 06/10/2026 : **au prorata des
 * analyses restantes**, en unité que le candidat voit et achète — les
 * analyses du pack (`Pack.analyses`), jamais les jetons, qui sont la
 * contrepartie interne.
 *
 *     rendu = prix payé × analyses restantes ÷ analyses du pack
 *
 * Quatre issues — intégral, prorata, revue manuelle, rien à rendre —,
 * et l'ordre des questions est la règle :
 *
 * 1. **rien consommé** → le prix entier, quel que soit l'état du dossier.
 *    C'est le comportement d'avant la règle, et il reste ;
 * 2. **dossier déclaré déposé, ou clos** → revue manuelle, comme avant :
 *    le prorata ne s'applique que tant que le travail est en cours ;
 * 3. **pack servi sur plusieurs dossiers** (un Pro) → revue manuelle. Le
 *    grand livre ne retire les droits que sur un dossier par
 *    remboursement (index unique du retrait) : rendre l'argent en laissant
 *    utilisables les analyses d'un second dossier serait un cadeau
 *    qu'aucune règle n'annonce ;
 * 4. **tout consommé** → rien à rendre, et aucune obligation n'est
 *    ouverte. On le dit, plutôt que d'ouvrir une dette à zéro ;
 * 5. sinon, **le prorata**.
 *
 * La rédaction assistée ne change pas le montant : elle n'ajoute aucune
 * retenue, et ne fait pas passer le cas en revue (contrairement au
 * supplément d'une montée, S.92). Seules comptent les analyses débitées
 * du pack, quelle que soit l'action qui les a débitées.
 *
 * Module pur : les montants entrent et sortent en unités mineures.
 */
export interface PackARembourser {
  /** Le prix effectivement payé, en unités mineures. */
  prixMineur: number;
  /** `Pack.analyses` : la base du prorata, et non ce qu'un dossier a reçu. */
  analysesDuPack: number;
  /** Analyses imputées au pack, nettes des analyses rendues (S.92). */
  consommees: number;
  dossierDepose: boolean;
  dossierClos: boolean;
  /** Dossiers distincts que l'achat a crédités. */
  dossiersServis: number;
}

export type MontantDuRemboursement =
  | { verdict: "integral"; montant: number }
  | { verdict: "prorata"; montant: number; restantes: number; analysesDuPack: number }
  | { verdict: "manuel"; motif: string }
  | { verdict: "rien_a_rendre"; motif: string };

/**
 * Les états d'un dossier **clos** : l'issue est déclarée, il est
 * abandonné, ou archivé. Un dossier suspendu ne l'est pas — il reprend.
 */
export const ETATS_CLOS: ReadonlySet<string> = new Set(["ISSUE_DECLAREE", "ABANDONNE", "ARCHIVE"]);

/**
 * Le prorata, en unités mineures, **arrondi à l'unité inférieure**.
 *
 * Pourquoi vers le bas, et non au plus proche :
 *
 * - **on ne rend jamais une fraction d'analyse consommée.** Arrondir vers
 *   le haut, ou au plus proche quand la fraction dépasse la moitié, ferait
 *   rendre une part de ce qui a servi ; vers le bas, le rendu est toujours
 *   au plus la valeur exacte des analyses restantes ;
 * - **l'écart est borné à une unité mineure** — un franc CFA, un centime
 *   d'euro — et il est le même pour tous, quel que soit le rail ;
 * - **le calcul est entier de bout en bout.** Prix × restantes est un
 *   entier ; une seule division, tronquée. Aucun nombre à virgule
 *   n'intervient, et le même calcul refait par un comptable sur la pièce
 *   tombe sur le même chiffre.
 *
 * Avec la grille actuelle, le cas ne se présente qu'en euros sur Dossier
 * et Pro (29 € et 59 € ne se divisent pas par 30 et 90) : 29 € × 23 ÷ 30
 * = 22,2333… € → 22,23 €.
 */
export function montantAuProrata(
  prixMineur: number,
  restantes: number,
  analysesDuPack: number,
): number {
  if (!Number.isInteger(prixMineur) || prixMineur < 0) {
    throw new RangeError(`Prix invalide : ${prixMineur}. Un prix est un entier positif d'unités mineures.`);
  }
  if (!Number.isInteger(analysesDuPack) || analysesDuPack <= 0) {
    throw new RangeError(`Un pack sans analyse n'a pas de prorata (${analysesDuPack}).`);
  }
  if (!Number.isInteger(restantes) || restantes < 0 || restantes > analysesDuPack) {
    throw new RangeError(
      `Analyses restantes invalides : ${restantes} sur ${analysesDuPack}. Elles vont de 0 au nombre d'analyses du pack.`,
    );
  }
  return Math.floor((prixMineur * restantes) / analysesDuPack);
}

const analyses = (n: number): string => `${n} analyse${n > 1 ? "s" : ""}`;

/**
 * Le motif d'un remboursement refusé faute de reste, écrit pour suivre
 * « Aucun remboursement à ouvrir sur ce paiement : » — d'où la minuscule.
 */
export const motifRienARendre = (analysesDuPack: number): string =>
  `les ${analyses(analysesDuPack)} du pack ont toutes été consommées : au prorata des analyses restantes, il ne reste rien à rembourser (RG-15.2). Un remboursement hors de cette règle se décide avec la direction, pas depuis ce geste`;

export function montantDuRemboursement(p: PackARembourser): MontantDuRemboursement {
  const consommees = Math.max(0, p.consommees);
  if (consommees === 0) return { verdict: "integral", montant: p.prixMineur };

  const entame = `Pack entamé : ${analyses(consommees)} consommée${consommees > 1 ? "s" : ""} sur ${p.analysesDuPack}.`;
  if (p.dossierDepose || p.dossierClos) {
    return {
      verdict: "manuel",
      motif: `${entame} Le dossier est ${p.dossierDepose ? "déclaré déposé" : "clos"} : le prorata automatique ne s'applique plus (RG-15.2). À trancher à la main : fixer le montant avec la direction, puis rembourser chez le fournisseur.`,
    };
  }
  if (p.dossiersServis > 1) {
    return {
      verdict: "manuel",
      motif: `${entame} Le pack sert ${p.dossiersServis} dossiers, et un remboursement ne retire les droits que d'un seul : le prorata n'est pas prononcé automatiquement. À trancher à la main.`,
    };
  }

  const restantes = Math.max(0, p.analysesDuPack - consommees);
  if (restantes === 0) return { verdict: "rien_a_rendre", motif: motifRienARendre(p.analysesDuPack) };
  const montant = montantAuProrata(p.prixMineur, restantes, p.analysesDuPack);
  // Un prix si petit que le prorata tombe à zéro : rien à rendre non plus.
  if (montant === 0) return { verdict: "rien_a_rendre", motif: motifRienARendre(p.analysesDuPack) };
  return { verdict: "prorata", montant, restantes, analysesDuPack: p.analysesDuPack };
}

/**
 * La somme à rendre d'une transaction, en unités mineures.
 *
 * `refundAmount` nul se lit « le montant payé » : c'était vrai de toutes
 * les lignes antérieures à RG-15.2, et cela reste vrai d'une dette en
 * revue manuelle, dont le montant n'est pas encore fixé.
 */
export const sommeARendre = (
  refundAmount: number | null,
  payeMineur: number,
): number => refundAmount ?? payeMineur;

/** Rend-on moins que le prix payé ? */
export const estPartiel = (refundAmount: number | null, payeMineur: number): boolean =>
  refundAmount !== null && refundAmount < payeMineur;

/** Ce que le candidat lit quand la somme est effectivement revenue. */
export const CONFIRMATION_AU_CANDIDAT =
  "Ton remboursement est parti. Selon ta banque ou ton opérateur, il peut mettre quelques jours à apparaître sur ton compte.";

/* ── La reprise d'une dette dont l'envoi n'est pas parti ──────────────── */

/**
 * Ce qui manquait, et que rien ne faisait.
 *
 * `RESTE_A_FAIRE.DECIDE` dit, depuis le premier jour : « La demande n'est
 * pas partie. **Relance l'envoi.** » Personne ne la relançait.
 * `initierLeRemboursement` a trois appelants — l'annulation d'une
 * consultation, la suppression d'un compte, et un bouton du back-office —
 * et les deux premiers avalent l'échec (`.catch(() => null)`), ce qui est
 * juste sur le moment : une panne du fournisseur ne doit faire échouer ni
 * une annulation ni une anonymisation. Mais rien ne revenait ensuite.
 *
 * Constaté en exécution, après une première tentative en échec passager,
 * puis **toutes** les passes que l'ouvrier planifie :
 *
 *     premier envoi : temporaire
 *     refundDueAt=true refundRequestedAt=false refundedAt=false
 *     après réconciliation, péremption, purge, inactivité, rappels :
 *       tentatives       : 1
 *       demandes parties : 1
 *
 * Une somme due à un candidat, jamais redemandée, jusqu'à ce qu'un
 * opérateur la remarque dans B-04 et clique. Tout le reste était là : la
 * clé d'idempotence « faite pour ça », le compteur de tentatives, la date
 * de la dernière — dont le schéma dit « il faut savoir depuis quand on
 * essaie » — et jusqu'à l'index `(refundDueAt, refundedAt)`. Il manquait
 * la passe.
 */

/** Le repos entre deux envois. Assez pour laisser passer une panne. */
export const REPOS_AVANT_RELANCE_MINUTES = 30;

/**
 * Au-delà, on arrête et on appelle quelqu'un.
 *
 * Une relance qui ne passe jamais ne se corrigera pas en insistant : au
 * bout de cinq, la cause n'est plus passagère même si chaque réponse
 * disait le contraire. Même forme que `TENTATIVES_AVANT_REVUE` pour la
 * lecture d'une pièce, et pour la même raison — rejouer sans fin une
 * tâche qui ne peut pas aboutir masque le problème au lieu de le
 * signaler.
 */
export const TENTATIVES_AVANT_HUMAIN = 5;

export type SuiteDeLaDette =
  /** L'envoi repart maintenant. */
  | "RELANCER"
  /** Il repartira : le repos n'est pas écoulé. */
  | "ATTENDRE"
  /** Cinq envois n'ont pas abouti. La passe s'arrête et ouvre un écart. */
  | "APPELER_UN_HUMAIN"
  /** Rien à faire : soldée, déjà demandée, ou déjà entre les mains d'un humain. */
  | "RIEN";

export interface DetteARelancer {
  dueAt: Date | null;
  requestedAt: Date | null;
  refundedAt: Date | null;
  /** Nombre d'envois déjà tentés, réussis ou non. */
  tentatives: number;
  derniereTentative: Date | null;
  /** Un écart est ouvert sur cette transaction : quelqu'un s'en occupe. */
  ecartOuvert: boolean;
}

/**
 * Que faire de cette dette aujourd'hui ?
 *
 * L'ordre des questions n'est pas neutre. `refundedAt` d'abord : une somme
 * rendue ne se redemande pas, quoi que disent les autres colonnes. Puis
 * `requestedAt` — **une demande acceptée n'est pas notre affaire** : elle
 * attend la notification signée du fournisseur, et la relancer enverrait
 * une seconde demande sur une première qui a abouti. C'est la distinction
 * que ce module existe pour tenir. La requête de la passe la filtre déjà,
 * et la règle est ici aussi : deux gardes valent mieux qu'une sur une
 * question d'argent, et la seconde survivra à une requête réécrite.
 *
 * L'écart ouvert passe avant le compteur : une dette qu'un humain regarde
 * déjà n'a pas besoin qu'on lui en ouvre un second, et la relancer
 * pendant qu'il l'examine brouillerait ce qu'il voit.
 */
export function suiteDeLaDette(dette: DetteARelancer, maintenant: Date): SuiteDeLaDette {
  if (dette.refundedAt !== null) return "RIEN";
  if (dette.requestedAt !== null) return "RIEN";
  if (dette.dueAt === null) return "RIEN";
  if (dette.ecartOuvert) return "RIEN";
  if (dette.tentatives >= TENTATIVES_AVANT_HUMAIN) return "APPELER_UN_HUMAIN";
  if (dette.derniereTentative === null) return "RELANCER";
  const repos = maintenant.getTime() - dette.derniereTentative.getTime();
  return repos >= REPOS_AVANT_RELANCE_MINUTES * 60_000 ? "RELANCER" : "ATTENDRE";
}

/**
 * Ce que l'opérateur lit quand la passe abandonne. Actionnable : il dit ce
 * qui a été tenté, combien de fois, et que la somme reste due.
 */
export const MOTIF_RELANCES_EPUISEES = (tentatives: number): string =>
  `La demande de remboursement n'est pas passée après ${tentatives} envois. La somme reste due et la relance automatique s'arrête : à reprendre à la main auprès du fournisseur.`;
