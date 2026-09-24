import type { CompletenessPublic, DocumentState } from "@/domain/completeness/score";
import { computeCompleteness, versClient } from "@/domain/completeness/score";
import { conditionsEvaluees } from "@/domain/completeness/conditions";
import { TAILLE_MAXI_MO } from "@/domain/dossiers/televersement";
import { mentionEchue } from "./peremption";

/**
 * Pièce d'une checklist de dossier — C-06, C-07, C-08, C-09 (WF-06, WF-07).
 *
 * Une seule description de pièce sert les quatre écrans. Le prototype les a
 * écrits séparément et a divergé : la même attestation y est « Ajouter » sur
 * la checklist et « Déposer » sur la complétude, la photo d'identité y est
 * illisible sur C-06 et déjà conforme sur C-09. Deux libellés pour une même
 * pièce, c'est déjà un doute pour le candidat ; deux états, c'est une erreur.
 * L'action et le regroupement se déduisent donc de la pièce, ils ne
 * s'écrivent pas dans l'écran.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export type FamillePiece = "OBLIGATOIRE" | "COMPLEMENTAIRE";

/**
 * Ce qui lève le manque. C'est le remède, et non l'état, qui détermine le
 * libellé du bouton : un passeport trop court se remplace à la Direction de
 * l'émigration, pas dans l'application, et « Ajouter » y serait un mensonge
 * sur l'effort demandé.
 */
export type RemedePiece = "TELEVERSER" | "REMPLACER" | "REDIGER" | "DEMARCHE";

export interface Piece {
  /** Segment de route : `dossiers/[id]/pieces/[pieceId]`. */
  id: string;
  /** Code court affiché en pastille monospace : ID, DIP, REL, FIN, ADM. */
  code: string;
  libelle: string;
  famille: FamillePiece;
  etat: DocumentState;
  remede: RemedePiece;
  /** Constat puis action, adressé au candidat (RG-06.3). Absent si conforme. */
  message?: string;
  /** Le même constat en forme brève : mesure constatée, exigence, action. */
  constat?: string;
  /**
   * Date de péremption, ISO. Une pièce conforme aujourd'hui peut ne plus
   * l'être le jour du dépôt : la date vit sur la pièce, l'échéancier la lit.
   */
  perimeLe?: string;
  /**
   * Conseil propre à cette pièce, affiché au moment du dépôt. « Le PDF
   * téléchargé depuis ton application bancaire se lit mieux qu'une photo »
   * ne vaut que pour un relevé : le prototype l'affichait sur l'écran de
   * téléversement, donc sur toutes les pièces, y compris une lettre.
   */
  astuce?: string;
}

export const LIBELLE_FAMILLE: Record<FamillePiece, string> = {
  OBLIGATOIRE: "Obligatoires",
  COMPLEMENTAIRE: "Complémentaires",
};

export const estConforme = (piece: Piece): boolean => piece.etat === "CONFORME";

/**
 * Une pièce que le dossier demande encore — et la seule définition de
 * cette question.
 *
 * Elle porte sur l'état et non sur la vue `Piece`, parce que trois
 * lectures serveur la posent sur une ligne de base : l'échéancier, qui
 * calcule la date « au plus tôt » d'une pièce périssable ; le calendrier,
 * qui juge ce qu'il reste à obtenir ; et les offres de partenaire, qui
 * rattachent chacune à une pièce demandée.
 *
 * Cette dernière ne la posait pas du tout. Elle lisait `code` et `label`,
 * jamais l'état, et proposait donc un prestataire payant pour une pièce
 * déjà déposée, lue et acceptée. Constaté en exécution, sur un dossier
 * dont l'assurance maladie était `CONFORME` :
 *
 *     offre sur « assurance_maladie » — Ton dossier demande une pièce :
 *                                        assurance maladie.
 *
 * C'est exactement ce que l'en-tête de ce chemin-là refuse : « chaque
 * offre se rattache à une pièce que le dossier demande, et le dit. Une
 * liste sans motif serait un annuaire publicitaire. »
 *
 * `PURGEE` reste demandée : la complétude compte déjà la pièce comme
 * manquante — « supprimé conformément à la politique de rétention » —, et
 * deux définitions de ce qui manque finiraient par se contredire.
 */
export const estEncoreDemandee = (etat: DocumentState): boolean => etat !== "CONFORME";

/**
 * Le délai d'obtention de cette pièce a-t-il déjà été dépensé ?
 *
 * ── La question que le calendrier ne posait pas ─────────────────────
 *
 * `evaluerLeCalendrier` compte, pour chaque pièce encore demandée,
 * « demandée aujourd'hui, elle arrive dans N jours ». La phrase qu'il
 * compose le dit mot pour mot. Pour une pièce **déjà déposée**, cette
 * prémisse est fausse : le fichier est sur nos serveurs, et les trente
 * jours d'obtention ont été dépensés avant l'envoi.
 *
 * Constaté en exécution, procédure néerlandaise, départ visé au 5 janvier
 * 2027, dépôt calculé au 7 octobre 2026 — donc **devant nous** :
 *
 *     diplôme déposé, en cours de lecture (EN_ANALYSE)
 *       verdict : INTENABLE — diplome manque 17 j
 *     diplôme pas encore déposé (ATTENDUE)
 *       verdict : INTENABLE — diplome manque 17 j
 *     diplôme accepté (témoin, CONFORME)
 *       verdict : TENABLE
 *
 * Le même verdict pour celui qui a tout envoyé et pour celui qui n'a rien
 * commencé, avec le bandeau d'alerte « Une pièce obligatoire ne peut plus
 * arriver à temps » et le conseil de reculer son départ — à cause d'un
 * document déjà fourni.
 *
 * ── Où passe la frontière, et de quel côté on se trompe ─────────────
 *
 * Les deux erreurs ne se valent pas. Compter un délai déjà dépensé donne
 * une **fausse alerte** ; ne pas compter un délai encore à courir donne
 * une **fausse assurance**, et c'est celle que ce produit refuse partout
 * ailleurs. La frontière est donc placée au plus prudent : seuls les
 * états où le candidat tient certainement le document, et où rien ne
 * l'oblige à retourner devant l'autorité, cessent de compter.
 *
 * `switch` exhaustif, comme `seReprendSeule` pour les causes de
 * balayage : un état nouveau ne compilera pas tant que personne n'aura
 * dit de quel côté il tombe.
 */
export function delaiDobtentionDepense(etat: DocumentState): boolean {
  switch (etat) {
    /* Le fichier est sur nos serveurs et on le lit. Le candidat a fait
       tout ce qu'il pouvait faire. */
    case "EN_ANALYSE":
    /* Obtenu, mais illisible : il faut un nouveau scan, pas une nouvelle
       démarche. Le document est entre ses mains. */
    case "ILLISIBLE":
    /* Acceptée : elle ne figure déjà plus dans les pièces à obtenir. Le
       cas est ici pour que le `switch` reste exhaustif. */
    case "CONFORME":
      return true;

    /* Rien n'a été déposé. */
    case "ATTENDUE":
    /* Un autre document a été envoyé : le bon reste à obtenir. */
    case "HORS_SUJET":
    /* La validité est dépassée : il en faut un nouveau, de l'autorité. */
    case "EXPIREE":
    /* La rétention a effacé le fichier. Le candidat détient peut-être
       encore l'original, et peut-être pas — compter le délai est la
       réponse prudente. */
    case "PURGEE":
    /*
      `A_CORRIGER` reste compté, et c'est un choix. Le remède distingue
      deux situations que l'état confond : « ton passeport expire quatre
      mois après ton retour, il en faut six » demande une nouvelle
      démarche, « ton scan est coupé » n'en demande aucune. Les séparer
      suppose de lire le remède pièce par pièce, ce qui est un arbitrage
      et non une correction — voir la PR. En attendant, on compte : la
      fausse alerte se corrige en changeant une date, la fausse assurance
      se découvre au guichet.
    */
    case "A_CORRIGER":
      return false;

    default: {
      const jamais: never = etat;
      throw new Error(`État de pièce non arbitré : ${JSON.stringify(jamais)}`);
    }
  }
}

/**
 * Déposée, conservée, jamais analysée — RG-06.5.
 *
 * L'état se dérive sans champ nouveau, et la dérivation est exacte :
 * `remede` ne passe à `REMPLACER` qu'après un dépôt, et l'état ne revient à
 * `ATTENDUE` qu'après un balayage sain **sans** analyse — c'est le cas du
 * quota épuisé. Un dépôt analysé finit `CONFORME`, `A_CORRIGER`,
 * `ILLISIBLE` ou `HORS_SUJET` ; une pièce jamais déposée garde
 * `TELEVERSER`.
 *
 * Sans cette distinction, la pastille affiche « Attendue » sur une pièce
 * dont le fichier est sur le serveur, à côté d'une action « Remplacer » :
 * le candidat lit qu'on attend toujours sa pièce et la renvoie. Le lot qui
 * a branché « Téléverser sans analyse » a rendu cet état atteignable
 * exprès — il fallait qu'il se lise.
 */
export const estDeposeeNonVerifiee = (piece: Piece): boolean =>
  piece.etat === "ATTENDUE" && piece.remede === "REMPLACER";

/**
 * La pastille dit ce qui est vrai des deux : le fichier est là, la
 * vérification n'a pas eu lieu. « Conservée » d'abord, parce que c'est ce
 * qu'on veut savoir quand on vient de dépenser ses données mobiles.
 */
export const LIBELLE_CONSERVEE_NON_VERIFIEE = "Conservée, non vérifiée";

/**
 * Pourquoi la vérification n'a pas eu lieu — et pourquoi il en faut deux.
 *
 * La mention était une constante unique, qui disait « tes analyses du pack
 * sont utilisées ». Elle était exacte tant que c'était le seul motif. Elle
 * ne l'est plus depuis que le retrait de l'autorisation d'analyse arrête
 * la lecture : envoyer quelqu'un recharger des analyses alors qu'il vient
 * de retirer son accord lui ferait payer pour un geste qu'il a lui-même
 * fait, et ne réparerait rien.
 *
 * Le motif est donc porté par la pièce, et la pastille reste la même : ce
 * qu'on veut savoir d'abord est que le fichier est arrivé.
 */
export type MotifDeNonAnalyse = "quota" | "autorisation_retiree";

export const MENTION_NON_ANALYSEE: Record<MotifDeNonAnalyse, string> = {
  quota:
    "Ton fichier est bien arrivé. Il n'a pas été analysé : tes analyses du pack sont utilisées. Tu peux le relire toi-même, ou recharger des analyses.",
  autorisation_retiree:
    "Ton fichier est bien arrivé et il est conservé. Il n'a pas été analysé : tu as retiré l'autorisation d'analyse de tes pièces. Tu peux la redonner depuis tes autorisations, ou relire la pièce toi-même.",
};

/**
 * Pièce qu'on photographie ou qu'on scanne, par opposition à une pièce qu'on
 * rédige. Les conseils de prise de vue n'ont de sens que pour la première :
 * les afficher sous une lettre de motivation fait douter de tout le reste.
 */
export const estAPhotographier = (piece: Piece): boolean => piece.remede !== "REDIGER";

/** Ce qu'on attend au dépôt. Une lettre ne se prend pas en photo. */
export const sousTitreDepot = (piece: Piece): string =>
  estAPhotographier(piece)
    ? `PDF ou photo, ${TAILLE_MAXI_MO} Mo maximum. Plusieurs pages acceptées.`
    : `Dépose ta lettre en PDF, ${TAILLE_MAXI_MO} Mo maximum, ou rédige-la avec l'entretien guidé.`;

/**
 * Libellé de l'issue d'une ligne de checklist. Une pièce, un libellé, sur
 * tous les écrans qui la montrent.
 */
export function libelleAction(piece: Piece): string {
  if (estConforme(piece)) return "Voir";
  if (piece.etat === "ILLISIBLE") return "Reprendre";
  switch (piece.remede) {
    case "TELEVERSER":
      return "Ajouter";
    case "REMPLACER":
      return "Remplacer";
    case "REDIGER":
      return "Rédiger";
    case "DEMARCHE":
      return "Voir";
  }
}

/** « 3 sur 5 conformes » — le sous-titre de la section Obligatoires de C-06. */
export function libelleAvancementFamille(
  pieces: readonly Piece[],
  famille: FamillePiece,
): string {
  const lot = pieces.filter((p) => p.famille === famille);
  return `${lot.filter(estConforme).length} sur ${lot.length} conformes`;
}

export interface GroupesCompletude {
  /** Obligatoires non conformes : sans elles, le dépôt est refusé. */
  bloquantes: Piece[];
  /** Complémentaires non conformes : elles renforcent le dossier. */
  ensuite: Piece[];
  conformes: Piece[];
}

/**
 * Regroupement de C-09. Le seul ordre affiché est celui qui bloque le dépôt :
 * un candidat qui ouvre cet écran doit savoir en une ligne par quoi commencer.
 */
export function grouperPourCompletude(pieces: readonly Piece[]): GroupesCompletude {
  return {
    bloquantes: pieces.filter((p) => p.famille === "OBLIGATOIRE" && !estConforme(p)),
    ensuite: pieces.filter((p) => p.famille === "COMPLEMENTAIRE" && !estConforme(p)),
    conformes: pieces.filter(estConforme),
  };
}

/**
 * Complétude calculée à partir de la checklist **et de la règle figée**,
 * jamais saisie à la main.
 *
 * C'est ce qui garantit que le tableau de bord, la checklist et l'écran de
 * complétude comptent la même chose. Ils la comptaient déjà — entre eux :
 * `conditions: []` était écrit en dur ici, et aucun des trois ne comptait
 * comme la base, qui évalue les conditions et décide le passage à `PRET`.
 * Un dossier dont toutes les pièces sont conformes et dont une condition
 * bloquante ne l'est pas s'affichait « COMPLET — rien ne bloque un dépôt »
 * alors que le serveur refusait de le déclarer prêt.
 *
 * `regle` porte les `rules` **figées** du dossier (INV-3). Absente — la
 * démonstration statique, un dossier sans version — le calcul se réduit
 * aux pièces, comme avant.
 *
 * `conformes` porte les codes **du référentiel** des pièces conformes, et
 * l'appelant les fournit parce que `Piece.code` ne les a plus : c'est une
 * pastille de trois lettres, `passeport` y devient `PAS`. Les déduire
 * d'ici rapprochait `PAS` de `passeport`, donc rien du tout : **toutes**
 * les conditions se seraient lues non satisfaites, sur tous les dossiers,
 * sans qu'un type ni un test s'en aperçoive. La relation se déclare, elle
 * ne se devine pas.
 *
 * `versClient` retire le barème interne, qui ne franchit jamais la
 * frontière (arbitrage C-09).
 */
export function completudeDesPieces(
  pieces: readonly Piece[],
  options: {
    coherence?: number;
    redaction?: number;
    regle?: unknown;
    conformes?: ReadonlySet<string>;
  } = {},
): CompletenessPublic {
  return versClient(
    computeCompleteness({
      documents: pieces.map((p) => ({
        code: p.code,
        libelle: p.libelle,
        required: p.famille === "OBLIGATOIRE",
        status: p.etat,
      })),
      conditions: conditionsEvaluees(options.regle, options.conformes ?? new Set()),
      coherence: options.coherence ?? 1,
      redaction: options.redaction ?? 1,
    }),
  );
}


/**
 * Péremption d'une pièce au regard de la date de dépôt.
 *
 * Le prototype affichait « Expire bientôt » sur un test d'anglais valable
 * jusqu'à sept semaines *après* le dépôt visé. « Bientôt » y alarme sans rien
 * demander, alors que la pièce passe. Les deux situations sont distinctes et
 * appellent des gestes différents : l'une se refait avant le dépôt, l'autre
 * se surveille seulement si la date de dépôt glisse.
 *
 * ── La même fausse alarme, par l'autre bout ────────────────────────────
 *
 * La fonction était juste et on lui donnait la mauvaise date : les écrans
 * passaient `Dossier.depotVise`, qui portait la date **cible** — la
 * rentrée. Une pièce expirant entre le dépôt et la rentrée était alors
 * annoncée « avant le dépôt visé », alors qu'elle est valable ce jour-là.
 * Sur le dossier néerlandais, cette fenêtre fait quatre-vingt-dix jours.
 *
 * Le paramètre s'appelle donc `depot`, et rien d'autre ne conviendra.
 */
export type AlertePeremption = "AUCUNE" | "AVANT_LE_DEPOT" | "APRES_LE_DEPOT";

export function alertePeremption(piece: Piece, depot?: string): AlertePeremption {
  if (!piece.perimeLe || !depot) return "AUCUNE";
  return piece.perimeLe < depot ? "AVANT_LE_DEPOT" : "APRES_LE_DEPOT";
}

const FORMAT_JOUR = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function libelleAlertePeremption(piece: Piece, depot?: string): string | null {
  const alerte = alertePeremption(piece, depot);
  if (alerte === "AUCUNE" || !piece.perimeLe) return null;
  const date = FORMAT_JOUR.format(new Date(`${piece.perimeLe}T00:00:00Z`));
  return alerte === "AVANT_LE_DEPOT"
    ? `Expire le ${date}, avant le dépôt visé`
    : `Valable jusqu'au ${date}`;
}

/**
 * La mention portée par une ligne de checklist, quand il y en a une.
 *
 * Deux questions, et une seule ligne pour les dire — d'où ce point unique
 * plutôt qu'un choix répété sur chaque écran :
 *
 * - la pièce est **déjà** hors validité : la ligne dit depuis quand, et
 *   l'état de la pièce dit le reste ;
 * - la pièce est valable aujourd'hui mais ne le sera plus au dépôt : la
 *   ligne prévient, sans rien déclasser.
 *
 * L'ordre compte. « Expire le 3 mars, avant le dépôt visé » sur une pièce
 * expirée depuis un mois parle au futur d'un fait passé.
 */
export function mentionDeLaPiece(piece: Piece, depot?: string): string | null {
  if (piece.etat === "EXPIREE" && piece.perimeLe) return mentionEchue(piece.perimeLe);
  return libelleAlertePeremption(piece, depot);
}

/**
 * Les deux seuls nombres qui bloquent un dépôt : les pièces obligatoires
 * qui manquent, et les exigences de la règle figée qu'aucune pièce ne
 * tient.
 *
 * Le type existe pour qu'une phrase de conclusion ne puisse pas se
 * calculer sans les deux. Cinq phrases ont conclu tour à tour à partir des
 * seules pièces — la barre d'action de C-06, celle de C-09, la section des
 * blocages, l'en-tête de dénombrement, le texte de préparation d'un
 * rendez-vous payant — et chacune était rassurante sur le seul dossier
 * qu'on ne pouvait pas déposer. Il est extrait de `compteurs` plutôt que
 * redéfini : c'est la même mesure, calculée une fois.
 */
export type CompteursDeBlocage = Pick<
  CompletenessPublic["compteurs"],
  "obligatoiresManquantes" | "exigencesNonTenues"
>;

/**
 * Ce que la barre d'action annonce sous la checklist.
 *
 * « Pièces à reprendre » décrirait une correction ; une pièce jamais déposée
 * n'a rien à reprendre, et un passeport trop court se remplace à
 * l'administration, pas dans l'application. La phrase dit donc ce qui est
 * vrai des deux : elles bloquent le dépôt.
 *
 * ── Deux phrases côte à côte qui se contredisaient ──────────────────
 *
 * Elle ne comptait que des pièces. Depuis que le calcul des écrans évalue
 * les conditions de la règle figée, C-09 affichait les deux ensemble :
 *
 *     en-tête : « 1 exigence n'est pas remplie »
 *     blocage : « Rien ne bloque le dépôt »
 *     palier  : INCOMPLET — prêt : false
 *
 * Sur le même écran, à quelques lignes d'écart.
 *
 * ── Le paramètre facultatif était la sixième occurrence ────────────────
 *
 * Le correctif précédent a ajouté `exigences = 0`. La valeur par défaut
 * rendait l'omission légale : `libelleBlocage(pieces)` compilait et
 * rendait la phrase d'avant. C-06 l'appelait ainsi, et affichait donc
 * « Dossier incomplet », « 1 exigence n'est pas remplie » et « Rien ne
 * bloque le dépôt » sur un même écran, à soixante-dix lignes d'écart.
 *
 * La fonction ne prend donc plus de pièces du tout. Les deux nombres qui
 * décident vivent ensemble dans `compteurs`, calculés au même endroit ;
 * les recompter ici, c'était la seconde implémentation qui a fini par
 * diverger de la première. `grouperPourCompletude(pieces).bloquantes.length`
 * et `compteurs.obligatoiresManquantes` ont été comparés sur les 256
 * combinaisons de deux pièces : ils ne diffèrent jamais.
 *
 * Il n'y a plus d'appel qui conclue à partir des seules pièces, parce que
 * le type n'en accepte plus. Écrire `{ obligatoiresManquantes: 0,
 * exigencesNonTenues: 0 }` reste possible ; c'est alors une affirmation
 * dans la diff, plus un oubli.
 */
export function libelleBlocage(compteurs: CompteursDeBlocage): string {
  const bloquantes = compteurs.obligatoiresManquantes;
  const exigences = compteurs.exigencesNonTenues;
  if (bloquantes === 0 && exigences === 0) return "Rien ne bloque le dépôt";

  const membres: string[] = [];
  if (bloquantes > 0) membres.push(bloquantes > 1 ? `${bloquantes} pièces` : "1 pièce");
  if (exigences > 0) membres.push(exigences > 1 ? `${exigences} exigences` : "1 exigence");

  /* Le verbe s'accorde sur l'ensemble, pas sur le dernier membre. */
  const pluriel = bloquantes + exigences > 1;
  return `${membres.join(" et ")} ${pluriel ? "bloquent" : "bloque"} le dépôt`;
}

/**
 * Où mène la ligne de checklist. Une pièce à rédiger ouvre l'entretien guidé,
 * pas l'écran de téléversement : proposer « dépose ton fichier » à quelqu'un
 * qui n'a rien écrit ne l'avance pas.
 */
export const lienDePiece = (dossierId: string, piece: Piece): string =>
  piece.remede === "REDIGER"
    ? `/dossiers/${dossierId}/redaction/${piece.id}`
    : `/dossiers/${dossierId}/pieces/${piece.id}`;

/** Première pièce à traiter : celle qui bloque, sinon celle qui renforce. */
export function premiereATraiter(pieces: readonly Piece[]): Piece | undefined {
  const { bloquantes, ensuite } = grouperPourCompletude(pieces);
  return bloquantes[0] ?? ensuite[0];
}

/** « le passeport, l'attestation de ressources et la photo d'identité ». */
const enumerer = (libelles: readonly string[]): string => {
  if (libelles.length <= 1) return libelles[0] ?? "";
  return `${libelles.slice(0, -1).join(", ")} et ${libelles[libelles.length - 1]}`;
};

/**
 * Ce qu'il reste à préparer, nommé — T-05, avant un rendez-vous.
 *
 * Le prototype écrivait « Ta checklist est à 80 % : les deux pièces à
 * reprendre sont le relevé bancaire et la photo d'identité ». Le pourcentage
 * était le dernier de l'interface candidat, et il était de trop : la phrase
 * nommait déjà les deux pièces, ce qui est la seule chose utile avant un
 * appel de quarante-cinq minutes. Le chiffre n'ajoutait qu'une note à
 * retenir de travers (arbitrage C-09).
 */
export function libelleAPreparer(
  pieces: readonly Piece[],
  compteurs: CompteursDeBlocage,
): string {
  const exigences = compteurs.exigencesNonTenues;
  const { bloquantes, ensuite } = grouperPourCompletude(pieces);
  const aTraiter = bloquantes.length > 0 ? bloquantes : ensuite;

  /*
    Une exigence qu'aucune pièce ne lève est précisément ce qu'un rendez-vous
    sert à débloquer : la plateforme ne sait pas la vérifier, le consultant
    si. L'annoncer en premier, et ne jamais la passer sous silence.

    Sans ce paramètre, la phrase disait « toutes les pièces demandées sont
    conformes : l'appel peut porter sur le fond du dossier » sur un dossier
    qu'une exigence tient à « incomplet ». Le candidat entrait dans un appel
    payant en croyant n'avoir rien à y régler, et le seul sujet qui restait
    n'était pas nommé.

    Il a d'abord eu une valeur par défaut, et l'omission restait donc
    légale : c'est ainsi que C-06 a gardé sa phrase d'avant. Elle n'en a
    plus. Les noms des pièces viennent de la checklist, le nombre
    d'exigences vient du calcul — ils ne se déduisent pas l'un de l'autre,
    et la fonction demande les deux.
  */
  const mention =
    exigences > 0
      ? exigences > 1
        ? `${exigences} exigences de la règle de ton dossier restent à lever, et aucune pièce ne les lève : c'est le premier sujet à porter à l'appel.`
        : "1 exigence de la règle de ton dossier reste à lever, et aucune pièce ne la lève : c'est le premier sujet à porter à l'appel."
      : "";

  if (aTraiter.length === 0) {
    return mention !== ""
      ? mention
      : "Toutes les pièces demandées sont conformes : l'appel peut porter sur le fond du dossier.";
  }

  const noms = enumerer(aTraiter.map((p) => p.libelle.toLowerCase()));
  const nature = bloquantes.length > 0 ? "obligatoires" : "complémentaires";
  const phrase =
    aTraiter.length > 1
      ? `${aTraiter.length} pièces ${nature} restent à traiter : ${noms}.`
      : `1 pièce ${nature === "obligatoires" ? "obligatoire" : "complémentaire"} reste à traiter : ${noms}.`;
  /* L'exigence passe devant : elle ne se règle pas en téléversant. */
  return mention !== "" ? `${mention} ${phrase}` : phrase;
}
