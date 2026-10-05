/**
 * Le diagnostic d'un paiement — S.116, relevé en bac à sable le 05/10/2026.
 *
 * Le widget FedaPay affichait « Transaction réussie », et la plateforme
 * tenait la transaction pour échouée, cause « refus de l'émetteur », sans
 * webhook reçu. Pour le comprendre, il fallait croiser à la main quatre
 * sources : la ligne de transaction, ses événements de paiement, le
 * journal d'audit et le tableau de bord du fournisseur. Ce module dit ce
 * que leur croisement montre, et ce qu'il faut faire ensuite.
 *
 * Il constate, il ne corrige rien : la commande qui l'appelle ne fait que
 * des lectures. Une transaction ne change d'état que par une notification
 * signée ou par la réconciliation (INV-7).
 *
 * Module pur : aucune dépendance à Prisma, Next ou au réseau.
 */

export const USAGE_DIAGNOSTIC =
  "Usage : node dist/diagnostic-paiement.mjs --reference IMP-AAMMJJ-XXXXXX";

/**
 * Une référence de la plateforme (`IMP-261005-P98AEE`). La forme est
 * vérifiée large — lettres, chiffres, tirets — pour ne pas refuser une
 * référence d'un format antérieur : c'est la base qui dira si elle existe.
 */
const FORME_REFERENCE = /^[A-Z0-9][A-Z0-9-]{3,63}$/u;

export function lireLaReference(
  argv: readonly string[],
): { ok: true; reference: string } | { ok: false; erreur: string } {
  const i = argv.indexOf("--reference");
  const brute = i >= 0 && i + 1 < argv.length ? (argv[i + 1] ?? "").trim().toUpperCase() : "";
  if (!FORME_REFERENCE.test(brute)) {
    return {
      ok: false,
      erreur: `--reference : la référence du paiement, telle que B-04 et le reçu l'affichent (par exemple IMP-261005-P98AEE) — reçu « ${brute || "rien"} ».`,
    };
  }
  return { ok: true, reference: brute };
}

export type OrigineEvenement = "webhook" | "reconciliation";

/**
 * D'où vient un événement de paiement, lu sur son identifiant.
 *
 * La réconciliation écrit `reconciliation:<référence>:<état>` ; un webhook
 * écrit l'identifiant du fournisseur, préfixé par son nom.
 */
export const origineDeLEvenement = (providerEventId: string): OrigineEvenement =>
  providerEventId.startsWith("reconciliation:") ? "reconciliation" : "webhook";

/** Ce que le fournisseur a répondu à la lecture de la transaction enregistrée. */
export type LectureFournisseur =
  | {
      issue: "lue";
      id: string;
      /** L'état brut du fournisseur (`approved`, `declined`…). */
      etat: string | null;
      /** Le même, traduit dans le cycle interne ; nul s'il est inconnu. */
      statut: string | null;
      /** Notre référence, telle qu'elle revient dans `custom_metadata`. */
      referenceMarchande: string | null;
    }
  | { issue: "introuvable" }
  | { issue: "indisponible"; detail: string }
  | { issue: "non_lue"; raison: string };

export interface FaitsDuPaiement {
  reference: string;
  statut: string;
  fournisseur: string;
  providerTxId: string | null;
  /** Événements de paiement appliqués, par origine. */
  webhooks: number;
  reconciliations: number;
  /** Notifications reçues puis refusées par la table du cycle (journal d'audit). */
  notificationsRefusees: number;
  ecartOuvert: boolean;
  lecture: LectureFournisseur;
  /** L'adresse publique de la plateforme, pour nommer l'URL du webhook. */
  racine: string;
  /** L'espace du fournisseur (`sandbox` ou `live`). */
  espace: string;
}

const ABOUTIE_SANS_SUCCES = new Set(["ECHOUEE", "EXPIREE"]);

/**
 * Les constats, dans l'ordre où il faut les traiter. Chacun dit ce qu'il
 * faut faire, et où.
 */
export function constatsDuDiagnostic(f: FaitsDuPaiement): string[] {
  const constats: string[] = [];
  const tableau = `au tableau de bord FedaPay (espace ${f.espace})`;
  const lue = f.lecture.issue === "lue" ? f.lecture : null;

  if (!f.providerTxId) {
    constats.push(
      "Aucune session n'a été ouverte chez le fournisseur pour cette référence : le candidat n'a pas pu payer par elle. Chercher un autre paiement du même compte en B-04.",
    );
  }

  if (lue && lue.referenceMarchande !== null && lue.referenceMarchande !== f.reference) {
    constats.push(
      `La transaction ${lue.id} lue chez le fournisseur porte la référence ${lue.referenceMarchande}, pas ${f.reference} : l'identifiant enregistré ne désigne pas ce paiement. Ne rien appliquer ; transmettre l'incident.`,
    );
  }

  if (lue && lue.statut === "CONFIRMEE" && ABOUTIE_SANS_SUCCES.has(f.statut)) {
    constats.push(
      `Le fournisseur dit « ${lue.etat} » pour ${lue.id}, et la plateforme tient la transaction pour ${f.statut === "ECHOUEE" ? "échouée" : "expirée"} : le candidat a été débité sans recevoir son pack. ${f.ecartOuvert ? "L'écart est ouvert en B-04" : "Ouvrir l'écart en B-04 si la confirmation n'y est pas encore"} ; rembourser la somme ${tableau}.`,
    );
  }

  if (lue && lue.statut === "ECHOUEE" && f.statut === "ECHOUEE") {
    constats.push(
      `Le fournisseur dit « ${lue.etat} » pour ${lue.id} : l'état de la plateforme est fidèle à cette transaction. Si le candidat a vu « Transaction réussie », c'est une autre transaction : la chercher ${tableau} par montant et par heure, et vérifier que son custom_metadata porte ${f.reference}.`,
    );
  }

  if (f.lecture.issue === "introuvable") {
    constats.push(
      `Le fournisseur ne connaît pas ${f.providerTxId ?? "cet identifiant"} dans l'espace ${f.espace} : vérifier que FEDAPAY_ENVIRONMENT et FEDAPAY_API_KEY désignent l'espace où la session a été ouverte.`,
    );
  }
  if (f.lecture.issue === "indisponible") {
    constats.push(`Lecture chez le fournisseur impossible (${f.lecture.detail}) : relancer la commande, puis vérifier ${tableau}.`);
  }
  if (f.lecture.issue === "non_lue") {
    constats.push(`Lecture chez le fournisseur non faite : ${f.lecture.raison}`);
  }

  if (f.webhooks === 0 && f.notificationsRefusees === 0 && f.fournisseur === "FEDAPAY") {
    constats.push(
      `Aucun webhook n'a atteint la plateforme pour cette référence. Vérifier ${tableau} qu'un webhook pointe vers ${f.racine.replace(/\/+$/u, "")}/api/webhooks/fedapay, et que sa clé secrète est la valeur de FEDAPAY_WEBHOOK_SECRET. Un webhook à signature refusée ne laisse aucune ligne en base : le chercher dans les journaux du service app (« [webhook:webhooks.fedapay] signature refusée »).`,
    );
  }
  if (f.notificationsRefusees > 0) {
    constats.push(
      `${f.notificationsRefusees} notification${f.notificationsRefusees > 1 ? "s reçues et refusées" : " reçue et refusée"} par le cycle du paiement : le motif est au journal d'audit (action paiement.reconciliation, cible transaction:${f.reference}).`,
    );
  }
  if (f.webhooks === 0 && f.reconciliations > 0) {
    constats.push(
      "L'état actuel vient de la réconciliation, qui consulte le fournisseur toutes les quinze minutes, et non d'un webhook.",
    );
  }

  if (constats.length === 0) {
    constats.push("Aucun désaccord relevé entre la plateforme et le fournisseur pour cette référence.");
  }
  return constats;
}
