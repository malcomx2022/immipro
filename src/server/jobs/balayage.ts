import { db } from "@/lib/db";
import { promouvoir, removeQuarantaine } from "@/lib/storage";
import { leBalayeur, type Balayeur } from "@/server/securite/antivirus";
import {
  MOTIF_INDISPONIBILITE,
  suiteDeLIndisponibilite,
  type CauseDIndisponibilite,
} from "@/domain/securite/balayage";
import { refusAuControle } from "@/domain/dossiers/quarantaine";
import { recalculerCompletude } from "@/server/acces/dossiers";
import { commandeLaPiece, ecrireSurLaPieceCourante } from "@/server/acces/piece-courante";
import { compteur, solde } from "@/server/acces/quota";
import { autorisationAccordee } from "@/server/acces/consentements";
import { MENTION_NON_ANALYSEE, type MotifDeNonAnalyse } from "@/domain/dossiers/piece";

/**
 * Balayage d'une pièce déposée — WF-06 étape 2, I.D.
 *
 * Le job sépare le dépôt de l'admission. Le navigateur a écrit dans la
 * quarantaine ; ici on lit, on décide, et on promeut — ou pas. Rien
 * d'autre ne franchit cette frontière.
 *
 * Trois issues, et une seule promeut :
 *
 * - **saine** → l'objet passe dans le stockage de confiance, la version
 *   porte sa date de balayage, et l'analyse peut partir ;
 * - **infectée** → les octets sont détruits, la pièce redevient à
 *   déposer, et le candidat lit pourquoi sans lire le nom de la menace ;
 * - **pas de verdict** → rien n'est promu, l'attente est comptée et datée,
 *   et la fonction lève **si la cause peut disparaître d'elle-même**.
 *   Une exception est la seule façon de demander une reprise à une file
 *   de jobs ; en lever une sur un fichier trop volumineux ferait rejouer
 *   sans fin une tâche qui ne peut pas aboutir, et noierait l'incident
 *   qu'il fallait voir. La distinction vit dans le domaine
 *   (`suiteDeLIndisponibilite`), pas ici.
 *
 * ── Le `switch` exhaustif, et ce qu'il a rattrapé ────────────────────
 *
 * L'indisponibilité était rendue par `null`, testée par `if (!verdict)`.
 * Le jour où elle est devenue un objet — pour porter sa cause —, ce test
 * est passé à côté : un objet est toujours vrai, et le code tombait
 * **dans la branche de promotion**. Une pièce que personne n'avait
 * balayée serait entrée dans le stockage de confiance parce qu'un
 * moteur n'avait pas répondu.
 *
 * D'où la forme ci-dessous : un `switch` sur `verdict.etat`, avec un
 * `const jamais: never`. Un quatrième état ne compilera pas tant qu'on
 * n'aura pas dit ce qu'il promeut — et la réponse par défaut, ici, est
 * « rien ».
 *
 * La fonction est idempotente : une version déjà décidée ressort sans rien
 * écrire. C'est ce qui permet de rejouer la file après une reprise.
 */

export interface Tache {
  applicationId: string;
  documentId: string;
  versionId: string;
}

export type Suite =
  /** Promue et analysable : le quota couvre une analyse. */
  | "ANALYSE"
  /** Promue, mais le quota est épuisé (RG-06.5) — le fichier reste conservé. */
  | "CONSERVEE"
  /** Écartée au contrôle. */
  | "REFUSEE"
  /**
   * Aucun verdict, et la cause ne se reprend pas seule : la pièce reste en
   * quarantaine, l'incident est ouvert, et rejouer ne changerait rien.
   */
  | "BLOQUEE"
  /** Rien à faire : version inconnue, sans octet, ou déjà décidée. */
  | "SANS_OBJET";

export class BalayageIndisponible extends Error {
  /** La cause voyage avec l'exception : le journal de file la portera. */
  readonly cause: CauseDIndisponibilite;

  constructor(objectKey: string, cause: CauseDIndisponibilite) {
    super(`Balayeur sans verdict pour ${objectKey} (${cause}) — la pièce reste en quarantaine.`);
    this.name = "BalayageIndisponible";
    this.cause = cause;
  }
}

const inclusDuDocument = {
  document: { include: { application: { select: { userId: true } } } },
} as const;

type Version = NonNullable<
  Awaited<
    ReturnType<
      typeof db.documentVersion.findUnique<{
        where: { id: string };
        include: typeof inclusDuDocument;
      }>
    >
  >
>;

export async function balayerUnePiece(
  tache: Tache,
  balayer: Balayeur = leBalayeur(),
): Promise<Suite> {
  const version = await db.documentVersion.findUnique({
    where: { id: tache.versionId },
    include: inclusDuDocument,
  });
  if (!version || !version.objectKey) return "SANS_OBJET";
  /*
    Saine, mais jamais analysée — revue du 07/10/2026, E6.

    Le worker poste l'analyse après la promotion. Si cette mise en file
    échoue, la file rejoue le balayage ; il rendait « sans objet » sur une
    version déjà saine, et la pièce restait « en analyse » pour toujours.
    Le rejeu reprend donc la suite de la promotion, sans rappeler le
    moteur : le verdict est acquis, seule l'analyse manque.
  */
  if (version.scanState === "SAINE" && (await analyseEnAttente(version))) {
    return suiteApresPromotion(version, tache);
  }
  // Déjà décidée : une reprise de file ne rebalaie pas, et surtout ne
  // redescend pas une version saine en quarantaine.
  if (version.scanState !== "EN_QUARANTAINE") return "SANS_OBJET";

  const verdict = await balayer(version.objectKey);

  switch (verdict.etat) {
    case "SAINE":
      return admettre(version, tache);
    case "INFECTEE":
      return ecarter(version, tache, verdict.menace);
    case "INDISPONIBLE":
      return sansVerdict(version, verdict.cause);
    default: {
      /*
        La garantie du lot. Un état que personne n'a arbitré ne promeut
        pas « par défaut » : il ne compile pas. C'est exactement ce qui
        manquait quand l'indisponibilité est passée de `null` à un objet,
        et que `if (!verdict)` a cessé de l'attraper.
      */
      const jamais: never = verdict;
      throw new Error(`Verdict de balayage non arbitré : ${JSON.stringify(jamais)}`);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Les trois suites, une par état — et une seule promeut.
 * ------------------------------------------------------------------ */

/**
 * Saine : la frontière est franchie, et dans cet ordre.
 *
 * La promotion d'abord, l'écriture ensuite. Interrompue entre les deux,
 * elle laisse une version en quarantaine dont l'objet est déjà passé :
 * la reprise rebalaie, `tailleEnQuarantaine` ne trouve plus rien, et le
 * verdict est `objet_absent` — une pièce bloquée, visible, jamais une
 * pièce promue sans balayage. L'ordre inverse écrirait « saine » sur une
 * version dont les octets seraient restés en quarantaine, c'est-à-dire
 * une pièce déclarée consultable et introuvable.
 */
async function admettre(version: Version, tache: Tache): Promise<Suite> {
  await promouvoir(version.objectKey!);
  await db.documentVersion.update({
    where: { id: version.id },
    data: {
      scanState: "SAINE",
      scannedAt: new Date(),
      // L'attente est soldée. La contrainte
      // `document_version_incident_en_quarantaine` refuserait la ligne
      // sinon : une version décidée ne traîne pas son incident derrière
      // elle, et le compte d'exploitation ne compte que du vivant.
      ...SOLDE_DE_LATTENTE,
    },
  });
  return suiteApresPromotion(version, tache);
}

/**
 * Une version saine attend son analyse : aucune analyse écrite, la pièce
 * toujours « en analyse », et aucune version plus récente déposée depuis.
 */
async function analyseEnAttente(version: Version): Promise<boolean> {
  if (version.document.status !== "EN_ANALYSE") return false;
  const [analyses, plusRecente] = await Promise.all([
    db.documentAnalysis.count({ where: { versionId: version.id } }),
    db.documentVersion.count({
      where: { documentId: version.documentId, rank: { gt: version.rank } },
    }),
  ]);
  return analyses === 0 && plusRecente === 0;
}

/**
 * Ce qui suit la promotion : l'analyse, ou la conservation sans analyse.
 *
 * Partagée par la promotion et par sa reprise (E6) : deux décisions du
 * même fait finiraient par diverger.
 */
async function suiteApresPromotion(
  version: Pick<Version, "documentId" | "rank">,
  tache: Tache,
): Promise<Suite> {
  /*
    RF-2, FON-02 — une version remplacée depuis son dépôt, ou celle d'un
    dossier déposé ou clos, ne part pas en analyse et n'écrit rien sur la
    pièce : la version courante a sa propre suite. Le fichier reste
    promu et consultable à l'historique.
  */
  if (!(await commandeLaPiece(version.documentId, version.rank))) return "SANS_OBJET";

  /*
    RG-02.1 — l'autorisation d'analyse est révocable, et un retrait arrête
    la lecture à venir, pas seulement les dépôts suivants. Elle se relit
    ici comme le quota, et pour la même raison : entre le dépôt et le
    balayage, le candidat a pu se raviser.

    Avant le quota, parce qu'un retrait n'est pas un manque à recharger :
    proposer des analyses à quelqu'un qui vient de retirer son accord lui
    ferait payer pour un geste qu'il a lui-même fait.
  */
  const autorise = await autorisationAccordee(
    (
      await db.document.findUniqueOrThrow({
        where: { id: version.documentId },
        select: { application: { select: { userId: true } } },
      })
    ).application.userId,
    "pieces_identite",
  );
  if (!autorise) return conserver(version, tache, "autorisation_retiree");

  // RG-06.5 — le quota n'interdit pas le dépôt, il n'interdit que l'analyse.
  // Il se relit ici et non au dépôt : entre les deux, une autre pièce a pu
  // consommer la dernière analyse.
  if ((await solde(tache.applicationId)) > 0) return "ANALYSE";

  // Sans pack, il n'y a pas d'analyses épuisées : il n'y en a jamais eu.
  const { total } = await compteur(tache.applicationId);
  return conserver(version, tache, total > 0 ? "quota" : "sans_pack");
}

/**
 * Le quota s'est épuisé entre la promotion et le débit : une autre pièce,
 * ou la rédaction assistée, a pris la dernière analyse. La pièce est
 * conservée comme si le quota avait manqué à la promotion (E6).
 */
export async function conserverFauteDeQuota(
  version: Pick<Version, "documentId" | "rank">,
  tache: Tache,
): Promise<void> {
  const { total } = await compteur(tache.applicationId);
  await conserver(version, tache, total > 0 ? "quota" : "sans_pack");
}

/**
 * La pièce est là, elle ne sera pas analysée, et l'écran dit pourquoi.
 *
 * Le motif est écrit sur la pièce et non déduit d'une constante : il y en a
 * deux désormais, et une mention unique en démentirait une.
 */
async function conserver(
  version: Pick<Version, "documentId" | "rank">,
  tache: Tache,
  motif: MotifDeNonAnalyse,
): Promise<Suite> {
  // RF-2 : seulement si cette version commande encore la pièce.
  const courante = await ecrireSurLaPieceCourante(db, version.documentId, version.rank, {
    status: "ATTENDUE",
    feedback: MENTION_NON_ANALYSEE[motif],
  });
  if (!courante) return "SANS_OBJET";
  await recalculerCompletude(tache.applicationId);
  return "CONSERVEE";
}

/** Infectée : les octets partent d'abord, la pièce redevient à déposer. */
async function ecarter(version: Version, tache: Tache, menace: string): Promise<Suite> {
  await removeQuarantaine(version.objectKey!);
  // L'ordre compte : les octets partent d'abord. La contrainte
  // `document_version_infectee_sans_octets` refuserait la ligne si la clé
  // survivait, ce qui évite qu'une suppression manquée passe inaperçue.
  await db.documentVersion.update({
    where: { id: version.id },
    data: {
      scanState: "INFECTEE",
      scannedAt: new Date(),
      scanFinding: menace,
      objectKey: null,
      ...SOLDE_DE_LATTENTE,
    },
  });

  /*
    RF-2 — les octets d'une version infectée partent toujours. La pièce,
    elle, ne se réécrit que si cette version la commande encore : un
    fichier déjà remplacé n'a pas à faire redemander la pièce, ni à
    produire un avis sur ce que le candidat a déjà corrigé.
  */
  const refus = refusAuControle(version.document.label);
  const courante = await ecrireSurLaPieceCourante(db, version.documentId, version.rank, {
    status: "A_CORRIGER",
    feedback: refus.corps,
    // La pièce est de nouveau à déposer, et rien n'en tient lieu : le
    // remède redevient « téléverser », pas « remplacer ».
    remedy: "TELEVERSER",
  });
  if (!courante) return "REFUSEE";
  await db.notification.create({
    data: {
      userId: version.document.application.userId,
      applicationId: tache.applicationId,
      kind: "ANALYSE",
      title: refus.titre,
      body: refus.corps,
    },
  });
  await recalculerCompletude(tache.applicationId);
  return "REFUSEE";
}

/** Une décision tombe : l'attente n'a plus lieu d'être comptée. */
const SOLDE_DE_LATTENTE = {
  scanAttempts: 0,
  scanLastAttemptAt: null,
  scanIncidentAt: null,
  scanIncidentCause: null,
} as const;

/**
 * Pas de verdict : on compte, on date, et **rien ne bouge**.
 *
 * Ni promotion, ni destruction. On ne sait rien de ce fichier, et
 * détruire ce qu'on n'a pas su lire serait aussi faux que l'admettre.
 * Seule l'attente est écrite.
 *
 * Les deux champs d'incident sont posés **ensemble**, en une écriture :
 * la contrainte `document_version_incident_nomme` exige qu'ils soient
 * nuls ou renseignés de concert. La date garde sa valeur d'origine — son
 * ancienneté est ce qui dit depuis quand la chaîne est arrêtée, et la
 * réécrire rajeunirait indéfiniment une panne installée — tandis que la
 * cause suit la dernière tentative, parce que c'est elle qui dit à
 * l'exploitant s'il doit attendre ou intervenir.
 */
async function sansVerdict(version: Version, cause: CauseDIndisponibilite): Promise<Suite> {
  const tentatives = version.scanAttempts + 1;
  const suite = suiteDeLIndisponibilite(cause, tentatives);

  await db.documentVersion.update({
    where: { id: version.id },
    data: {
      scanAttempts: tentatives,
      scanLastAttemptAt: new Date(),
      ...(suite.signaler
        ? {
            scanIncidentAt: version.scanIncidentAt ?? new Date(),
            scanIncidentCause: cause,
          }
        : {}),
    },
  });

  /*
    Lever, c'est demander une reprise à pg-boss. On ne la demande que si
    elle peut aboutir. Sur une cause qui se rejouerait à l'identique —
    fichier trop volumineux, réponse hors contrat, objet absent — la
    tâche s'arrête ici : l'incident est ouvert, il se lit dans l'état de
    service, et la pièce reste en quarantaine. Rejouer aurait rempli la
    file et noyé ce qu'il fallait voir.
  */
  if (suite.rejouer) throw new BalayageIndisponible(version.objectKey!, cause);
  console.warn(`[balayage] ${version.id} — ${MOTIF_INDISPONIBILITE[cause]}`);
  return "BLOQUEE";
}
