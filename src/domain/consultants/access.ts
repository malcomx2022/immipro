/**
 * Accès d'un consultant à un dossier — WF-12, pack Accompagné (lot 4).
 *
 * Deux tables de droits, l'accès est leur intersection (arbitrage du 13/09/2026) :
 * 1. Habilitation par destination, portée par le consultant.
 * 2. Accord nominatif du candidat, porté par le dossier, révocable à tout moment.
 *
 * Aucune des deux ne couvre l'autre : la première répond à la compétence,
 * la seconde au consentement (pièces d'identité, cf. A-05).
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export interface Habilitation {
  consultantId: string;
  /** Code pays ISO 3166-1 alpha-2 de la destination couverte. */
  destination: string;
  habiliteLe: Date;
  /** Une habilitation retirée reste en table, datée. */
  retireeLe?: Date | null;
}

export interface AccordAcces {
  dossierId: string;
  consultantId: string;
  donneLe: Date;
  /** La révocation coupe l'accès sans supprimer les échanges tenus. */
  revoqueLe?: Date | null;
}

export interface DossierRef {
  id: string;
  destination: string;
}

/** Ce qu'un consultant autorisé peut lire. Le moyen de paiement et l'historique d'achat n'en font pas partie. */
export type PorteeLecture = "pieces" | "analyse" | "checklist" | "echeancier" | "echanges";
export const PORTEE_CONSULTANT: readonly PorteeLecture[] = ["pieces", "analyse", "checklist", "echeancier", "echanges"];

/**
 * Ce que l'écran d'accord annonce, dérivé de la portée elle-même (T-04).
 *
 * La liste affichée au candidat et la liste qu'applique `peutLire` sont la
 * même : un écran qui énumère à part ce que le consultant verra finit par
 * promettre autre chose que ce que le code autorise, et c'est le sens du
 * consentement qui se perd.
 */
export const LIBELLE_PORTEE: Record<PorteeLecture, string> = {
  pieces: "Tes pièces déposées",
  analyse: "Le résultat de leur analyse",
  checklist: "Ta checklist",
  echeancier: "Ton échéancier",
  echanges: "Tes échanges dans ImmiPro",
};

/**
 * Ce qui reste hors de portée quoi qu'il arrive. Énoncé au même endroit que
 * ce qui est accordé : un consentement qui ne dit que ce qu'il ouvre se lit
 * comme un blanc-seing.
 */
export const HORS_PORTEE: readonly string[] = [
  "Ton moyen de paiement et tes achats",
  "Tes dossiers pour d'autres destinations",
  "Ton mot de passe et tes identifiants",
];

/**
 * L'accord est révocable à tout moment, et l'écran le dit avant de le
 * demander — pas après. Une autorisation qu'on ne sait pas retirer n'est pas
 * donnée librement.
 */
export const MENTION_REVOCATION =
  "Le consultant ne voit rien tant que tu n'as pas donné ton accord. Tu peux le retirer à tout moment depuis « Mes consentements ».";


export type MotifRefus = "NON_HABILITE" | "SANS_ACCORD";

export type Decision =
  | { autorise: true; portee: readonly PorteeLecture[] }
  | { autorise: false; motifs: MotifRefus[] };

const actif = (debut: Date, fin: Date | null | undefined, a: Date) =>
  debut <= a && (fin == null || fin > a);

export function peutLire(
  consultantId: string,
  dossier: DossierRef,
  habilitations: readonly Habilitation[],
  accords: readonly AccordAcces[],
  a: Date = new Date(),
): Decision {
  const habilite = habilitations.some(
    (h) => h.consultantId === consultantId && h.destination === dossier.destination && actif(h.habiliteLe, h.retireeLe, a),
  );
  const accorde = accords.some(
    (x) => x.consultantId === consultantId && x.dossierId === dossier.id && actif(x.donneLe, x.revoqueLe, a),
  );
  if (habilite && accorde) return { autorise: true, portee: PORTEE_CONSULTANT };
  const motifs: MotifRefus[] = [];
  if (!habilite) motifs.push("NON_HABILITE");
  if (!accorde) motifs.push("SANS_ACCORD");
  return { autorise: false, motifs };
}

/**
 * Événement de journal : toute lecture par un consultant s'inscrit (B-06),
 * autorisée ou refusée. Le candidat peut en demander l'extrait depuis A-05.
 */
export interface LectureConsultant {
  type: "LECTURE_CONSULTANT";
  horodatage: Date;
  consultantId: string;
  dossierId: string;
  portee: readonly PorteeLecture[];
  resultat: "AUTORISEE" | "REFUSEE";
  motifs?: MotifRefus[];
}

export function evenementLecture(
  consultantId: string,
  dossier: DossierRef,
  decision: Decision,
  portee: readonly PorteeLecture[] = PORTEE_CONSULTANT,
  a: Date = new Date(),
): LectureConsultant {
  return decision.autorise
    ? { type: "LECTURE_CONSULTANT", horodatage: a, consultantId, dossierId: dossier.id, portee, resultat: "AUTORISEE" }
    : { type: "LECTURE_CONSULTANT", horodatage: a, consultantId, dossierId: dossier.id, portee, resultat: "REFUSEE", motifs: decision.motifs };
}

/**
 * Durée d'un accord de partage, en jours après le rendez-vous — RG-12.2.
 *
 * L'accord est révocable **et** expire de lui-même, et l'échéance est
 * obligatoire en base. Reste à décider de sa valeur : elle couvre le
 * rendez-vous et le temps d'un compte rendu, pas davantage. Deux semaines
 * laissent au consultant de quoi revenir sur une pièce après l'entretien ;
 * un mois laisserait un accès ouvert longtemps après que la question a été
 * réglée, et personne ne penserait à le retirer.
 */
export const ACCORD_DUREE_JOURS = 14;

/**
 * ── Deux phrases du consentement disaient autre chose que le code ────
 *
 * **Le journal des lectures.** L'écran annonçait, juste au-dessus de la
 * case : « Chaque consultation de ton dossier par le consultant est
 * inscrite au journal, que tu peux demander à tout moment. » Rien n'écrit
 * une telle ligne : `evenementLecture` n'a aucun appelant en production,
 * `LECTURE_CONSULTANT` n'existe nulle part ailleurs, et aucune surface
 * candidat ne parle de journal — la promesse portait à la fois sur un
 * enregistrement qui n'a pas lieu et sur un extrait que personne ne sert.
 *
 * Elle est retirée plutôt que reformulée. Un consentement doit dire ce qui
 * est vrai au moment où il est donné ; ce qui viendra avec l'accès des
 * consultants se dira le jour où l'accès existera, et le garde-fou de
 * `tests/partage.test.ts` ramène la phrase ce jour-là.
 *
 * **L'échéance.** La case disait « jusqu'à ce que je retire cet accord », et
 * l'accord expire de lui-même : RG-12.2 dit « révocable **et** expire
 * automatiquement », `confirmerLaConsultation` écrit `expiresAt`, et « Mes
 * consentements » affiche l'état échu. Le candidat signait donc une
 * autorisation plus longue que la vraie, et se croyait tenu de la retirer
 * pour qu'elle cesse.
 *
 * Les deux phrases se composent ici, à partir de `ACCORD_DUREE_JOURS` :
 * écrire le nombre à l'écran l'aurait laissé diverger de celui que la base
 * applique.
 */
export const libelleDeLAutorisation = (consultant: string, pays: string): string =>
  `J'autorise ${consultant} à consulter mon dossier ${pays} jusqu'à ce que je retire cet accord, et au plus tard ${ACCORD_DUREE_JOURS} jours après le rendez-vous.`;

export const MENTION_DE_LAUTORISATION =
  `Il ne verra rien avant. L'accord s'arrête dès que tu le retires, et de lui-même ${ACCORD_DUREE_JOURS} jours après le rendez-vous : tu n'as rien à faire pour qu'il expire.`;

/**
 * Un accord vu depuis « Mes consentements » — A-05, RG-12.2.
 *
 * L'accord était annoncé révocable à trois endroits — la mention de T-04,
 * la case de T-05, et depuis le lot I.E le courrier de confirmation — et
 * rien ne permettait de le retirer. Les deux liens qui prétendaient y mener
 * menaient au profil, qui n'en parle pas.
 *
 * Trois états, et ils ne se valent pas : un accord retiré l'a été par le
 * candidat, un accord échu s'est fermé tout seul à la date convenue. Les
 * confondre ferait croire à un geste qu'on n'a pas fait.
 */
export type EtatPartage = "actif" | "retire" | "echu";

export function etatDuPartage(accord: AccordAcces, expireLe: Date, a: Date = new Date()): EtatPartage {
  if (accord.revoqueLe != null && accord.revoqueLe <= a) return "retire";
  return expireLe > a ? "actif" : "echu";
}

export const LIBELLE_ETAT_PARTAGE: Record<EtatPartage, string> = {
  actif: "Accès ouvert",
  retire: "Accès retiré",
  echu: "Accès échu",
};

/**
 * Ce que le retrait fait, et ce qu'il ne fait pas. Dit avant le geste :
 * quelqu'un qui croit effacer une consultation déjà eue se tromperait sur
 * ce qu'il obtient.
 *
 * Elle citait le même journal que la case de T-05 — « les consultations
 * déjà inscrites au journal restent lisibles » — et il n'existe pas
 * davantage ici. Ce qui reste vrai et qui est le point du paragraphe :
 * le retrait vaut pour l'avenir, il ne défait pas ce qui a déjà été
 * ouvert. La phrase le dit sans s'appuyer sur un registre absent.
 */
export const MENTION_RETRAIT =
  "Le retrait ferme l'accès immédiatement, et pour l'avenir seulement : ce que le consultant a déjà ouvert, il l'a déjà vu, et le retrait ne le lui retire pas de la mémoire.";

export const PARTAGES_VIDES =
  "Aucun consultant n'a accès à tes dossiers. Un accès s'ouvre quand tu prends rendez-vous, et se referme seul à la date convenue.";

/** « jusqu'au 5 octobre 2026 », « échu le 5 octobre 2026 », selon l'état. */
export function libelleEcheance(etat: EtatPartage, jour: string): string {
  if (etat === "retire") return "Retiré";
  return etat === "actif" ? `Jusqu'au ${jour}` : `Échu le ${jour}`;
}
