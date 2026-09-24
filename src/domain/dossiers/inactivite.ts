/**
 * Le dossier qu'on laisse de côté — RG-04.2, étendue par l'arbitrage S.78.
 *
 * « Un dossier `BROUILLON` inactif depuis 90 jours déclenche une relance,
 * puis passe en `ABANDONNE` à 12 mois. » L'arbitrage étend la règle aux
 * dossiers payés, `ACTIF` et `PRET` : le paiement ne constitue pas un
 * motif de conservation supplémentaire (`domain/dossiers/conservation`).
 *
 * ── Ce que le code affirmait sans le faire ──────────────────────────
 *
 * `ABANDONNE` existait dans l'enum Prisma, dans `EtatStocke`, et l'écran
 * avait un cas pour lui — `versStatut("ABANDONNE")` rend « CLOTURE ».
 * **Aucune écriture ne le produisait.** Exécuté avant correction, sur un
 * brouillon laissé tel quel :
 *
 *     inactif depuis              : 630 jours (21 mois)
 *     statut                      : BROUILLON
 *     relance envoyée             : 0
 *     dossiers ABANDONNE en base  : 0
 *
 * Vingt et un mois, aucune relance, aucun changement. C'est la même forme
 * que le `readyAt` de S.47 et que l'`EXPIREE` de la péremption : un état
 * que le produit décrit, que les écrans savent lire, et que personne
 * n'écrit.
 *
 * ── L'horloge, et pourquoi ce n'est pas `updatedAt` ─────────────────
 *
 * Le réflexe est de mesurer l'inactivité sur `Application.updatedAt`.
 * Il est faux, et la sonde le montre :
 *
 *     updatedAt avant                     : 2025-01-01
 *     updatedAt après un rappel système   : 2026-09-22
 *     l'horloge a-t-elle été remise à zéro par le système ? true
 *
 * `updatedAt` est `@updatedAt` : **toute** écriture le déplace, y compris
 * celles de la plateforme. Le job de rappels d'échéance réveille aussi les
 * brouillons (`ETATS_RAPPELABLES`) et pose `lastReminderAt` ; il aurait
 * donc remis l'horloge à zéro chaque semaine, et les douze mois ne
 * seraient jamais arrivés. Un dossier mort serait resté vivant parce que
 * la plateforme lui écrivait.
 *
 * L'horloge est donc ce que **le candidat** a produit. Deux gestes la
 * portent, et ils ont la même propriété : aucune passe de nuit ne les
 * écrit — l'analyse note un verdict, la péremption déclasse, la purge
 * efface, aucune n'en crée. La mesure ne peut pas être remise à zéro par
 * la plateforme elle-même.
 *
 * - le **dépôt d'une pièce** (`DocumentVersion.uploadedAt`) ;
 * - la **réponse d'entretien** (`InterviewAnswer.updatedAt`), WF-08.
 *
 * ── Le geste qui ne comptait pas ────────────────────────────────────
 *
 * Le second manquait, et c'est le travail le plus long du parcours. Un
 * entretien de rédaction se remplit sur des semaines, réponse par
 * réponse — la route le dit elle-même, « conservées à mesure », une
 * écriture par question quittée. Aucune ne produit de `DocumentVersion` :
 * la mise en forme, qui en produit une, demande un pack, et un brouillon
 * n'en a pas. Un candidat pouvait donc travailler son entretien toutes
 * les semaines pendant un an sans que l'horloge bouge d'un jour.
 *
 * Constaté en exécution, sur une vraie base, dossier ouvert quatre cents
 * jours plus tôt et une réponse écrite **l'avant-veille** :
 *
 *     SONDE entretien : réponse écrite il y a 2 jours
 *     SONDE entretien : statut = ABANDONNE | purgeDueAt = 2027-07-01
 *     SONDE entretien : notifications = 1
 *
 * Clos, pièces programmées à la purge, et l'unique notification est
 * l'avis de clôture : pas même la relance des quatre-vingt-dix jours,
 * que l'abandon précède. La plateforme a fermé le dossier de quelqu'un
 * qui s'en occupait cette semaine-là, et le lui a appris après coup.
 *
 * Ce qu'elle ne compte toujours pas : un candidat qui ne ferait que
 * déplacer sa date cible, sans jamais rien déposer ni répondre, pendant
 * douze mois. C'est assumé — et la relance du quatre-vingt-dixième jour
 * est là pour ça : elle part neuf mois avant l'abandon, et dit ce qui
 * arrivera.
 *
 * ── On ne compte pas comme inactif quelqu'un qui attend ─────────────
 *
 * L'horloge, telle qu'elle était, ignorait le plan que la plateforme
 * avait elle-même construit. L'échéancier se calcule à rebours depuis la
 * date cible : un candidat qui vise la rentrée 2029 a un premier geste au
 * 4 mai 2029, et rien avant. Exécuté avant correction, sur un dossier
 * ouvert quatre cents jours plus tôt :
 *
 *     échéance : 2029-05-04  À demander : Diplôme le plus élevé
 *     échéance : 2029-06-03  Dépôt de la demande
 *     inactivité : {"examines":1,"relances":0,"abandons":1,…}
 *     [INACTIVITE] Ton dossier Pays-Bas a été clos
 *
 * Clos le 1er avril 2027, deux ans avant sa première tâche. La plateforme
 * lui avait fait un plan disant « rien à faire avant mai 2029 », puis
 * l'a fermé pour n'avoir rien fait.
 *
 * L'horloge part donc du **plus tard** entre ce que le candidat a produit
 * et sa première échéance non faite. Une échéance à venir la suspend : il
 * n'y a rien à reprocher à qui n'avait rien à faire. Elle repart le jour
 * où cette échéance arrive, et c'est bien le jour où l'absence de geste
 * devient un signe.
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

/** RG-04.2 — la relance. */
export const RELANCE_JOURS = 90;

/** RG-04.2 — l'abandon. Douze mois, comptés de la même origine. */
export const ABANDON_JOURS = 365;

export type SuiteDInactivite = "RIEN" | "RELANCER" | "ABANDONNER";

export interface EtatDInactivite {
  /** Jours écoulés depuis la dernière chose faite par le candidat. */
  inactifDepuis: number;
  /**
   * Une relance a-t-elle déjà été envoyée **depuis** cette dernière
   * activité ? Sans cette question, la passe de nuit renverrait la même
   * relance chaque jour du quatre-vingt-dixième au trois-cent-soixante-
   * cinquième — la façon la plus sûre de se faire filtrer, et la même
   * raison qui a donné `Deadline.remindedAt` aux rappels d'échéance.
   */
  dejaRelance: boolean;
}

/**
 * Ce qu'il faut faire de ce brouillon aujourd'hui.
 *
 * L'abandon passe **avant** la relance : un dossier que personne n'a
 * touché depuis treize mois n'a pas à recevoir un avertissement pour ce
 * qui lui arrive le jour même. Le cas se produit à la première passe
 * après la mise en service, sur tout le stock accumulé — et c'est
 * précisément là que l'ordre compte.
 */
export function suiteDInactivite(etat: EtatDInactivite): SuiteDInactivite {
  if (etat.inactifDepuis >= ABANDON_JOURS) return "ABANDONNER";
  if (etat.inactifDepuis >= RELANCE_JOURS && !etat.dejaRelance) return "RELANCER";
  return "RIEN";
}

/**
 * Le jour où ce dossier sera clos si rien ne bouge — annoncé, jamais
 * deviné.
 *
 * Un message d'échéance sans date apprend au candidat qu'il a « du
 * temps », ce qui n'est pas une information. Il en a jusqu'à un jour
 * précis, et c'est celui-là qui se dit.
 */
export const jourDeLAbandon = (derniereActivite: Date): Date =>
  new Date(derniereActivite.getTime() + ABANDON_JOURS * 24 * 60 * 60 * 1000);

/**
 * La dernière chose que le candidat a produite.
 *
 * L'ouverture du dossier fait plancher : un dossier sans aucun geste est
 * inactif depuis son ouverture, pas depuis toujours.
 *
 * Les gestes arrivent en vrac et de plusieurs tables — dépôts de pièces,
 * réponses d'entretien. Ils sont pris ensemble et non l'un après l'autre
 * parce que la question n'est pas « a-t-il déposé ? » mais « a-t-il fait
 * quelque chose ? » : les traiter séparément est précisément ce qui a
 * laissé l'entretien hors du compte.
 *
 * Une date antérieure à l'ouverture ne peut pas exister et n'est pas
 * écartée : `max` s'en charge, et une garde de plus dirait qu'on s'y
 * attend.
 */
export function derniereActiviteDuCandidat(
  ouverture: Date,
  gestes: readonly Date[],
): Date {
  return gestes.reduce((tard, date) => (date > tard ? date : tard), ouverture);
}

/**
 * Le jour où l'inactivité commence à se compter.
 *
 * Le plus tard entre ce que le candidat a produit — ouverture, dernier
 * dépôt — et sa première échéance non faite. Une échéance à venir place
 * ce début dans le futur, et `joursDInactivite` rend alors un compte
 * négatif : personne n'est inactif avant d'avoir eu quelque chose à
 * faire.
 *
 * `null` quand le dossier n'a pas d'échéance — pas de date cible, donc
 * pas de plan, donc rien qui suspende le décompte. C'est le cas courant,
 * et celui que RG-04.2 vise en premier.
 */
export function debutDeLInactivite(
  derniereActivite: Date,
  premiereEcheanceNonFaite: Date | null,
): Date {
  if (premiereEcheanceNonFaite === null) return derniereActivite;
  return premiereEcheanceNonFaite > derniereActivite
    ? premiereEcheanceNonFaite
    : derniereActivite;
}

/** Jours pleins écoulés, en UTC : une relance ne change pas de jour selon le fuseau. */
export function joursDInactivite(derniereActivite: Date, maintenant: Date): number {
  const jour = (d: Date) =>
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor((jour(maintenant) - jour(derniereActivite)) / (24 * 60 * 60 * 1000));
}

const DATE_LISIBLE = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export interface Relance {
  titre: string;
  corps: string;
  /** Objet du courrier. Distinct du titre : une boîte mail n'a pas de contexte. */
  objet: string;
}

/**
 * La relance du quatre-vingt-dixième jour.
 *
 * Elle est **actionnable** : elle dit ce qui existe déjà, ce qui manque,
 * la date à laquelle le dossier sera clos, et ce qu'il faut faire pour
 * que ça n'arrive pas. « Ton dossier est inactif » seul n'apprend rien à
 * quelqu'un qui le sait déjà.
 *
 * Elle ne reproche rien. Quelqu'un qui n'a pas ouvert son dossier depuis
 * trois mois a le plus souvent une raison — un financement qui n'est pas
 * réuni, une rentrée repoussée. La phrase laisse la place à ces deux
 * situations, et dit que reprendre ne coûte rien.
 */
export function relanceDeBrouillon(
  destination: string,
  derniereActivite: Date,
  piecesDeposees: number,
  pret = false,
): Relance {
  const echeance = DATE_LISIBLE.format(jourDeLAbandon(derniereActivite));
  const acquis =
    piecesDeposees > 0
      ? `Les ${piecesDeposees} pièces que tu as déjà déposées sont toujours là.`
      : "Tu n'as encore déposé aucune pièce.";
  /*
    Un dossier prêt n'a plus de pièce à déposer : lui dire « déposer une
    pièce suffit » lui demanderait un geste sans objet. Ce qui le garde,
    c'est de déclarer son dépôt s'il l'a fait — il passe alors sous la
    conservation des dossiers soumis, qui court pendant l'instruction.
  */
  const remede = pret
    ? "Si tu as déposé ta demande, déclare-le dans ton dossier : ses pièces seront alors conservées pendant l'instruction."
    : "Déposer une pièce suffit à le garder ouvert.";
  return {
    titre: `Ton dossier ${destination} est en attente`,
    objet: `Ton dossier ${destination} sera clos le ${echeance}`,
    corps: `Tu n'as rien ajouté à ton dossier ${destination} depuis trois mois. ${acquis}

Sans reprise de ta part, il sera clos le ${echeance} et ses pièces supprimées. ${remede}

Si ton projet est reporté, tu peux le laisser : rien ne se perd avant cette date.`,
  };
}

export interface Abandon {
  titre: string;
  corps: string;
}

/**
 * Ce que le candidat lit quand le dossier a été clos.
 *
 * La clôture est dite au passé et sans détour — elle a eu lieu. Le
 * message dit aussi la seule chose qui lui reste à décider : rouvrir un
 * dossier, et que ses pièces sont en cours de suppression, parce qu'INV-5
 * ne laisse pas des pièces d'identité derrière un dossier clos.
 */
export function abandonDeBrouillon(destination: string, purgeJours: number): Abandon {
  return {
    titre: `Ton dossier ${destination} a été clos`,
    corps: `Sans activité depuis douze mois, ton dossier ${destination} a été clos. Ses pièces sont supprimées de nos serveurs sous ${purgeJours} jours.

Tu peux ouvrir un nouveau dossier quand tu veux : la checklist repart de la règle en vigueur ce jour-là.`,
  };
}
