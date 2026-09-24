import { db } from "@/lib/db";
import { ecartOuvert } from "@/domain/backoffice/ecart";
import {
  MOTIF_RELANCES_EPUISEES,
  suiteDeLaDette,
  TENTATIVES_AVANT_HUMAIN,
} from "@/domain/paiement/remboursement";
import { initierLeRemboursement } from "@/server/acces/paiements";
import { remboursementConfigure, type Rembourseur } from "@/server/paiement/remboursement";

/**
 * La reprise des demandes de remboursement qui ne sont pas parties —
 * K.C, RG-05.1, INV-7.
 *
 * ── Ce que le produit promettait, et que rien ne faisait ────────────
 *
 * `RESTE_A_FAIRE.DECIDE` dit, depuis le premier jour : « La demande n'est
 * pas partie. **Relance l'envoi.** » Personne ne la relançait.
 * `initierLeRemboursement` avait trois appelants — l'annulation d'une
 * consultation, la suppression d'un compte, un bouton du back-office — et
 * les deux premiers avalent l'échec (`.catch(() => null)`). C'est juste
 * sur le moment : une panne du fournisseur ne doit faire échouer ni une
 * annulation ni une anonymisation. Mais rien ne revenait ensuite.
 *
 * Constaté en exécution, après un premier envoi en échec passager, puis
 * **toutes** les passes que l'ouvrier planifie :
 *
 *     premier envoi : temporaire
 *     refundDueAt=true refundRequestedAt=false refundedAt=false
 *     après réconciliation, péremption, purge, inactivité, rappels :
 *       tentatives       : 1
 *       demandes parties : 1
 *
 * Une somme due à un candidat, jamais redemandée, jusqu'à ce qu'un
 * opérateur la remarque dans B-04 et clique dessus.
 *
 * ── Ce que cette passe ne décide pas ────────────────────────────────
 *
 * Quoi relancer, et quand. `suiteDeLaDette` le dit sans base ni réseau.
 * Ce fichier lit, envoie, écrit — et c'est tout ce qui demande une base.
 *
 * Elle ne solde jamais rien non plus : `initierLeRemboursement` envoie une
 * demande, et seule la notification signée du fournisseur pose
 * `refundedAt` (INV-7). Une passe qui écrirait « remboursé » parce qu'elle
 * a envoyé une demande annoncerait un virement que personne n'a fait.
 */

export interface BilanDesRelances {
  /** Dettes ouvertes examinées. */
  examinees: number;
  /** Demandes réenvoyées. */
  relancees: number;
  /** Laissées : le repos n'est pas écoulé, ou un humain les a déjà. */
  laissees: number;
  /** Écarts ouverts faute d'aboutir après `TENTATIVES_AVANT_HUMAIN` envois. */
  abandonnees: number;
  /** Ce qui a empêché de traiter une dette, dette par dette. */
  incidents: readonly string[];
  /**
   * Aucun rail de remboursement n'est configuré : la passe n'a rien
   * tenté. Ce n'est pas une panne de la passe — c'est le cas où il n'y a
   * rien à quoi envoyer.
   */
  railMuet: boolean;
}

/** Une dette qui échoue ne fait pas tomber les autres ; la file rejoue. */
export const doitRejouer = (bilan: BilanDesRelances): boolean =>
  bilan.incidents.length > 0;

export async function relancerLesRemboursements(
  maintenant: Date = new Date(),
  /**
   * Le rail, pour l'éprouver. Absent, `initierLeRemboursement` le résout
   * lui-même d'après le fournisseur de la transaction — une consultation
   * payée en euros ne se rembourse pas chez celui des francs CFA, et
   * c'est lui qui le sait.
   */
  rembourseur?: Rembourseur,
): Promise<BilanDesRelances> {
  /*
    Sans rail configuré, la passe ne tente rien — et surtout ne consomme
    aucune tentative.

    Constaté en éprouvant ce lot : sans clés, chaque envoi rendait
    `non_configure`, le compteur montait quand même, et au bout de cinq
    la passe ouvrait un écart disant « la demande n'est pas passée après
    5 envois ». Aucun envoi n'avait eu lieu : le rail n'était pas branché.
    L'écart accusait le fournisseur d'un silence qui était le nôtre, et
    brûlait les cinq tentatives que la dette aurait eues le jour où il
    l'est.

    Même forme que `moteurMuet` pour la reprise des quarantaines : sortir
    sans rien faire, et le dire dans le bilan plutôt que de le présenter
    comme un échec du fournisseur. `suiteDeLaTentative` le disait déjà de
    son côté — `non_configure` n'exige pas un humain, « la seconde se
    configure ».
  */
  if (!rembourseur && !remboursementConfigure()) {
    return {
      examinees: 0,
      relancees: 0,
      laissees: 0,
      abandonnees: 0,
      incidents: [],
      railMuet: true,
    };
  }

  /*
    L'index `(refundDueAt, refundedAt)` existait avant cette passe, et
    pour elle : une dette ouverte est un `refundDueAt` posé sans
    `refundedAt`. `refundRequestedAt: null` restreint à celles dont
    l'envoi n'est pas parti — une demande acceptée attend la notification
    signée, et la relancer enverrait une seconde demande sur une première
    qui a abouti.
  */
  const dettes = await db.transaction.findMany({
    where: {
      refundDueAt: { not: null },
      refundedAt: null,
      refundRequestedAt: null,
    },
    select: {
      id: true,
      reference: true,
      refundDueAt: true,
      refundRequestedAt: true,
      refundedAt: true,
      refundAttempts: true,
      refundAttemptedAt: true,
      discrepancy: true,
      discrepancyResolvedAt: true,
    },
    orderBy: { refundDueAt: "asc" },
    take: 200,
  });

  const bilan: BilanDesRelances = {
    examinees: dettes.length,
    relancees: 0,
    laissees: 0,
    abandonnees: 0,
    incidents: [],
    railMuet: false,
  };
  const incidents: string[] = [];

  for (const dette of dettes) {
    try {
      const suite = suiteDeLaDette(
        {
          dueAt: dette.refundDueAt,
          requestedAt: dette.refundRequestedAt,
          refundedAt: dette.refundedAt,
          tentatives: dette.refundAttempts,
          derniereTentative: dette.refundAttemptedAt,
          ecartOuvert: ecartOuvert(dette),
        },
        maintenant,
      );

      if (suite === "RIEN" || suite === "ATTENDRE") {
        bilan.laissees += 1;
        continue;
      }

      if (suite === "APPELER_UN_HUMAIN") {
        /*
          `discrepancy: null` dans la condition : on n'écrase pas un écart
          qu'un opérateur a déjà rédigé. C'est la même garde que
          `noterLEcart`, reprise ici parce que ce module n'y a pas accès.
        */
        await db.transaction.updateMany({
          where: { id: dette.id, discrepancy: null },
          data: { discrepancy: MOTIF_RELANCES_EPUISEES(dette.refundAttempts) },
        });
        bilan.abandonnees += 1;
        continue;
      }

      /*
        L'envoi. Il réserve lui-même sa tentative et compte son essai — un
        second appelant concurrent obtient `deja_en_cours` et n'envoie
        rien. La clé d'idempotence porte la référence : le fournisseur
        reconnaît un rejeu plutôt que de verser deux fois.
      */
      await initierLeRemboursement(dette.reference, rembourseur, maintenant);
      bilan.relancees += 1;
    } catch (erreur) {
      incidents.push(`${dette.reference} : ${cause(erreur)}`);
    }
  }

  return { ...bilan, incidents };
}

/** La cause, en une ligne utilisable — même lecture que les autres passes. */
const cause = (erreur: unknown): string => {
  const texte = erreur instanceof Error ? erreur.message : String(erreur);
  return texte.split("\n").map((l) => l.trim()).filter(Boolean).at(-1) ?? "cause inconnue";
};

export { TENTATIVES_AVANT_HUMAIN };
