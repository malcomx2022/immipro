import { db } from "@/lib/db";
import { ETATS_FIGES } from "@/domain/dossiers/etat";
import { getQueue, JOBS, poster } from "@/lib/queue";
import { lireLesConstats } from "@/server/exploitation/constats";
import { antivirusConfigure } from "@/server/securite/antivirus";
import { sondeDuConstat } from "@/domain/exploitation/constats";
import {
  reprendreAuControle,
  type CauseDIndisponibilite,
} from "@/domain/securite/balayage";

/**
 * La reprise des contrôles restés sans verdict — I.D, RG-06.3.
 *
 * ── Ce que quatre messages promettaient, et que rien ne faisait ─────
 *
 * « Ton fichier est conservé et sera contrôlé **dès que le service
 * revient**, tu n'as rien à faire. » « Ton fichier est conservé, **nous
 * reprenons la main dessus**, tu n'as rien à faire. »
 *
 * `BALAYAGE_PIECE` n'était postée que par la confirmation du dépôt, une
 * fois. Les causes qui ne se reprennent pas seules s'achevaient sur
 * `BLOQUEE` sans consommer de reprise ; les deux autres épuisaient les
 * six de la file en une dizaine de minutes. Passé cela, le fichier
 * restait en quarantaine, l'incident s'affichait dans l'état de service,
 * et personne ne revenait le chercher. L'incident était visible sans
 * être traité — et c'est bien un traitement que la phrase annonçait.
 *
 * ── Quand la passe reprend, et quand elle s'abstient ────────────────
 *
 * Seulement sur une sonde **concluante** : le moteur a reconnu EICAR,
 * donc il balaie. C'est le mot de la phrase — « dès que le service
 * revient » —, et reprendre sur une sonde absente rejouerait dans le
 * vide en rouvrant l'incident qu'on vient d'ouvrir. Une sonde échouée,
 * a fortiori.
 *
 * Elle ne décide pas, elle remet en file : c'est `balayerUnePiece` qui
 * conclut, promeut ou écarte, et qui solde l'incident s'il conclut. Deux
 * décisions du même fait finiraient par diverger.
 *
 * Et elle ne reprend que ce qui revient à la plateforme. `quiPeutAgir`
 * le disait déjà, cause par cause, sans que rien n'en découle : un
 * fichier trop lourd et un objet absent demandent un nouveau dépôt, et
 * rejouer par-dessus ferait mentir la consigne que le candidat a lue.
 */

export interface BilanDeReprise {
  /** Versions sans verdict examinées. */
  examinees: number;
  /** Remises en file de balayage. */
  remises: number;
  /** Laissées : elles attendent un geste du candidat, ou le repos. */
  laissees: number;
  /**
   * Le moteur ne prouve pas qu'il balaie : la passe n'a rien remis.
   * Ce n'est pas une panne de la passe — c'est le cas où « dès que le
   * service revient » n'est pas encore arrivé.
   */
  moteurMuet: boolean;
}

export async function reprendreLesQuarantaines(
  maintenant: Date = new Date(),
): Promise<BilanDeReprise> {
  const sonde = sondeDuConstat(
    antivirusConfigure(),
    (await lireLesConstats()).antivirus,
    maintenant,
  );
  if (sonde !== "CONCLUANTE") {
    return { examinees: 0, remises: 0, laissees: 0, moteurMuet: true };
  }

  /*
    Les versions sans verdict dont le fichier existe encore. `purgedAt`
    exclut ce qu'INV-5 a effacé : remettre en file une clé purgée
    rendrait `objet_absent`, donc un incident tout neuf sur une pièce que
    la plateforme a elle-même supprimée.
  */
  const sansVerdict = await db.documentVersion.findMany({
    where: {
      scanState: "EN_QUARANTAINE",
      objectKey: { not: null },
      purgedAt: null,
    },
    select: {
      id: true,
      documentId: true,
      scanIncidentCause: true,
      scanLastAttemptAt: true,
      document: { select: { applicationId: true } },
    },
  });

  const file = await getQueue();
  let remises = 0;

  for (const version of sansVerdict) {
    const reprendre = reprendreAuControle({
      cause: version.scanIncidentCause as CauseDIndisponibilite | null,
      derniereTentative: version.scanLastAttemptAt,
      maintenant,
    });
    if (!reprendre) continue;

    // `poster` et non `send` : une mise en file perdue laisserait la
    // pièce exactement où la passe l'a trouvée, et le bilan annoncerait
    // une reprise qui n'a pas eu lieu.
    await poster(file, JOBS.BALAYAGE_PIECE, {
      applicationId: version.document.applicationId,
      documentId: version.documentId,
      versionId: version.id,
    });
    remises += 1;
  }

  return {
    examinees: sansVerdict.length,
    remises,
    laissees: sansVerdict.length - remises,
    moteurMuet: false,
  };
}

/** Au-delà, une version saine sans analyse n'attend plus sa file : elle a été perdue. */
export const ATTENTE_DE_L_ANALYSE_MINUTES = 30;

/**
 * La reprise des analyses perdues — revue du 07/10/2026, E6.
 *
 * Le worker poste l'analyse après la promotion. Une mise en file perdue à
 * ce moment laissait la pièce « en analyse » pour toujours : le balayage
 * rejoué rendait « sans objet », et la reprise des quarantaines ne lit que
 * ce qui est encore en quarantaine. Cette passe retrouve les versions
 * saines restées sans analyse et remet leur balayage en file ;
 * `balayerUnePiece` reprend alors la suite de la promotion, sans rappeler
 * le moteur. Elle ne dépend donc pas de la sonde antivirus.
 *
 * Seule la dernière version d'une pièce compte : une version remplacée
 * depuis n'a plus rien à attendre.
 */
export async function reprendreLesAnalysesEnAttente(
  maintenant: Date = new Date(),
): Promise<{ remises: number }> {
  const seuil = new Date(maintenant.getTime() - ATTENTE_DE_L_ANALYSE_MINUTES * 60_000);
  const enAttente = await analysesEnAttenteDepuis(seuil);

  const file = await getQueue();
  for (const version of enAttente) {
    await poster(file, JOBS.BALAYAGE_PIECE, {
      applicationId: version.applicationId,
      documentId: version.documentId,
      versionId: version.id,
    });
  }
  return { remises: enAttente.length };
}

/**
 * Les versions saines qui attendent leur analyse depuis le seuil — une
 * définition, lue par la reprise horaire (30 minutes) et par l'état de
 * service (une heure, RF-4, S.150).
 *
 * Seule la dernière version d'une pièce compte : une version remplacée
 * n'a plus rien à attendre (RG-06.8). Et seulement sur un dossier encore
 * modifiable : un dossier déposé ou clos garde l'état de ses pièces, sa
 * version ne sera jamais lue, et la compter ferait une alerte qui ne
 * s'éteint pas.
 */
export async function analysesEnAttenteDepuis(
  seuil: Date,
): Promise<{ id: string; documentId: string; applicationId: string; scannedAt: Date }[]> {
  const versions = await db.documentVersion.findMany({
    where: {
      scanState: "SAINE",
      objectKey: { not: null },
      purgedAt: null,
      scannedAt: { lt: seuil },
      analyses: { none: {} },
      document: {
        status: "EN_ANALYSE",
        application: { status: { notIn: [...ETATS_FIGES] } },
      },
    },
    select: {
      id: true,
      documentId: true,
      scannedAt: true,
      document: {
        select: {
          applicationId: true,
          versions: { orderBy: { rank: "desc" }, take: 1, select: { id: true } },
        },
      },
    },
    orderBy: { scannedAt: "asc" },
  });
  return versions
    .filter((v) => v.document.versions[0]?.id === v.id)
    .map((v) => ({
      id: v.id,
      documentId: v.documentId,
      applicationId: v.document.applicationId,
      scannedAt: v.scannedAt!,
    }));
}
