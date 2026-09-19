import { db } from "@/lib/db";
import { echec } from "@/server/http/echecs";
import { payload } from "@/server/acces/regles";
import { editorialDe } from "@/lib/contenu/destinations";
import type { FicheSuivie, Collecte, StatutFiche } from "@/domain/backoffice/veille";
import type { Compte, StatutCompte } from "@/domain/backoffice/comptes";
import type { Paiement, EtatOperateur, EtatRapprochement } from "@/domain/backoffice/reconciliation";
import type { EcritureAudit, CategorieAudit } from "@/domain/backoffice/audit";
import type { PieceEnEchec } from "@/domain/backoffice/revue";
import { aReconcilier } from "@/server/paiement/cycle";
import { getPack, type Devise } from "@/domain/payments/pricing";

/**
 * Lecture du back-office — B-01 à B-07, WF-14 à WF-16.
 *
 * INV-4 vu de ce côté : les règles de source secondaire **sont** visibles
 * ici, avec leur marque. L'invariant dit qu'elles ne sont jamais montrées à
 * l'utilisateur, pas qu'on les cache au veilleur — c'est lui qui doit savoir
 * qu'une source secondaire attend d'être remplacée.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);

const STATUT_FICHE: Record<string, StatutFiche> = {
  PUBLISHED: "PUBLIE",
  DRAFT: "BROUILLON",
  ARCHIVED: "ARCHIVE",
};

/** File de veille — B-01. Trente jours d'horizon, comme la requête de DOC-11. */
export const HORIZON_VEILLE_JOURS = 30;

export async function fichesSuivies(aujourdhui = new Date()): Promise<FicheSuivie[]> {
  const horizon = new Date(aujourdhui);
  horizon.setUTCDate(horizon.getUTCDate() + HORIZON_VEILLE_JOURS);

  const regles = await db.visaRule.findMany({
    where: { status: { in: ["PUBLISHED", "DRAFT"] }, nextReviewAt: { lte: horizon } },
    orderBy: { nextReviewAt: "asc" },
  });

  const derniers = await db.sourceCheck.findMany({
    where: { difference: { not: null } },
    orderBy: { checkedAt: "desc" },
    take: 50,
  });

  return regles.map((r) => {
    const edito = editorialDe(r.countryCode, r.visaType);
    const ecart = derniers.find((s) => s.sourceUrl === r.sourceUrl)?.difference;
    return {
      id: r.id,
      code: r.countryCode,
      pays: edito?.pays ?? r.countryCode,
      procedure: libelleProcedure(r),
      niveauSource: r.sourceTier,
      source: hote(r.sourceUrl),
      verifieeLe: iso(r.verifiedAt),
      relectureLe: iso(r.nextReviewAt),
      version: r.version,
      statut: STATUT_FICHE[r.status] ?? "BROUILLON",
      ...(ecart ? { ecart } : {}),
    };
  });
}

/**
 * Le libellé de la procédure vient du payload et non du code technique :
 * « etudes_mvv_vvr » ne se lit pas, « Séjour pour études (MVV + VVR) » si.
 */
function libelleProcedure(regle: { rules: unknown; visaType: string }): string {
  try {
    return payload(regle as never).libelle;
  } catch {
    return regle.visaType.replace(/_/gu, " ");
  }
}

const hote = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return url;
  }
};

/**
 * État de la collecte — B-01.
 *
 * Une source muette ne vaut pas un changement de règle : l'échec est
 * enregistré et rien n'est dépublié (RG-14.3). C'est ce qui permet
 * d'annoncer « 13 sources sur 14 » avec un compte exact plutôt qu'une
 * « collecte partielle » invérifiable.
 */
export async function collecte(): Promise<Collecte | null> {
  const derniere = await db.sourceCheck.findFirst({ orderBy: { checkedAt: "desc" } });
  if (!derniere) return null;

  const debutDuJour = new Date(derniere.checkedAt);
  debutDuJour.setUTCHours(0, 0, 0, 0);

  const duJour = await db.sourceCheck.findMany({ where: { checkedAt: { gte: debutDuJour } } });
  const muette = duJour.find((s) => !s.reachable);

  const prochaine = new Date(derniere.checkedAt);
  prochaine.setUTCDate(prochaine.getUTCDate() + 1);

  let injoignable: Collecte["injoignable"];
  if (muette) {
    const derniereReussite = await db.sourceCheck.findFirst({
      where: { sourceUrl: muette.sourceUrl, reachable: true },
      orderBy: { checkedAt: "desc" },
    });
    injoignable = {
      source: hote(muette.sourceUrl),
      derniereReussite: derniereReussite ? iso(derniereReussite.checkedAt) : "jamais",
      tentatives: muette.attempts,
    };
  }

  return {
    sources: duJour.length,
    relevees: duJour.filter((s) => s.reachable).length,
    faiteLe: derniere.checkedAt.toISOString(),
    prochaineLe: prochaine.toISOString(),
    ...(injoignable ? { injoignable } : {}),
  };
}

/** Comptes — B-03, WF-15. */
export async function comptes(recherche?: string): Promise<Compte[]> {
  const lignes = await db.user.findMany({
    where: recherche ? { email: { contains: recherche, mode: "insensitive" } } : {},
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      consents: { where: { revokedAt: null, granted: true } },
      applications: {
        include: {
          credits: true,
          transactions: { where: { status: "CONFIRMEE" }, orderBy: { confirmedAt: "asc" } },
        },
      },
    },
  });

  return lignes.map((u) => {
    const credits = u.applications.flatMap((a) => a.credits);
    const octroyees = credits.filter((c) => c.delta > 0).reduce((n, c) => n + c.delta, 0);
    const solde = credits.reduce((n, c) => n + c.delta, 0);
    const achat = u.applications.flatMap((a) => a.transactions).at(0);
    const pack = achat ? getPack(achat.packCode) : undefined;

    return {
      id: u.id,
      nom: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
      email: u.email,
      inscritLe: iso(u.createdAt),
      dossiers: u.applications.length,
      pack: pack?.libelle ?? "aucun",
      consentements: u.consents.map((c) => c.kind),
      analysesUtilisees: octroyees - solde,
      analysesTotal: octroyees,
      statut: statutDuCompte(u),
    };
  });
}

const statutDuCompte = (u: { suspendedAt: Date | null; emailVerified: Date | null }): StatutCompte =>
  u.suspendedAt ? "SUSPENDU" : u.emailVerified ? "ACTIF" : "EMAIL_NON_VERIFIE";

/**
 * Paiements — B-04.
 *
 * L'état de rapprochement n'est pas l'état du paiement : un silence de
 * l'opérateur laisse une transaction confirmée non rapprochée, et aucun
 * paiement n'est accusé sur l'absence de réponse d'un tiers.
 */
export async function paiements(maintenant = new Date()): Promise<Paiement[]> {
  const transactions = await db.transaction.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { email: true } } },
  });

  return transactions.map((t) => ({
    reference: t.reference,
    compte: t.user.email,
    montant: t.amount,
    devise: t.currency,
    moyen: t.provider === "FEDAPAY" ? "Mobile Money" : "Carte bancaire",
    ...(t.providerTxId ? { transaction: t.providerTxId } : {}),
    recuLe: t.createdAt.toISOString(),
    etat: etatDuRapprochement(t, maintenant),
  }));
}

function etatDuRapprochement(
  t: {
    status: string;
    reconciledAt: Date | null;
    discrepancy: string | null;
    createdAt: Date;
  },
  maintenant: Date,
): EtatRapprochement {
  if (t.discrepancy) return "ECART";
  if (t.status === "CONFIRMEE") return t.reconciledAt ? "RAPPROCHE" : "EN_ATTENTE";
  if (t.status === "EXPIREE") return "ECHEC_DELAI";
  if (t.status === "ECHOUEE") return "ECHEC_SOLDE";
  return aReconcilier(t.createdAt, maintenant) ? "ECART" : "EN_ATTENTE";
}

/**
 * État de l'opérateur — B-04.
 *
 * L'interrogation du fournisseur n'est pas branchée : l'état se déduit donc
 * de ce que la base sait, à savoir la date du dernier rapprochement réussi.
 * Annoncer « disponible » sans avoir interrogé personne serait une
 * affirmation sans mesure.
 */
export async function etatOperateur(): Promise<EtatOperateur | null> {
  const dernier = await db.transaction.findFirst({
    where: { reconciledAt: { not: null } },
    orderBy: { reconciledAt: "desc" },
    select: { reconciledAt: true, provider: true },
  });
  if (!dernier?.reconciledAt) return null;
  return {
    disponible: Date.now() - dernier.reconciledAt.getTime() < 60 * 60 * 1000,
    dernierRapprochement: dernier.reconciledAt.toISOString(),
    operateur: dernier.provider === "FEDAPAY" ? "FedaPay" : "Stripe",
  };
}

/** Journal — B-06, RG-15.1. */
const CATEGORIE: Record<string, CategorieAudit> = {
  "piece.consultation": "ACCES_PIECE",
  "piece.purge": "ACCES_PIECE",
  "dossier.consultation": "ACCES_PIECE",
  "compte.suspension": "COMPTE",
  "compte.retablissement": "COMPTE",
  "compte.suppression": "COMPTE",
  "paiement.remboursement": "PAIEMENT",
  "paiement.reconciliation": "PAIEMENT",
  "regle.publication": "REGLE",
  "revue.decision": "ACCES_PIECE",
};

export async function journal(filtre?: CategorieAudit): Promise<EcritureAudit[]> {
  const lignes = await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 });

  return lignes
    .map((l) => ({
      id: l.id,
      horodatage: l.createdAt.toISOString(),
      acteur: l.actorId,
      categorie: CATEGORIE[l.action] ?? ("COMPTE" as CategorieAudit),
      action: l.action,
      objet: l.target,
      detail: l.reason,
      origine: l.actorId.startsWith("systeme:")
        ? "tâche planifiée"
        : l.actorId.startsWith("webhook:")
          ? "webhook"
          : "back-office",
    }))
    .filter((e) => (filtre ? e.categorie === filtre : true));
}

/**
 * File de revue — B-05.
 *
 * Aucun rapprochement de vocabulaire n'est nécessaire : l'enum Prisma
 * `ReviewReason` et l'union du domaine portent les mêmes quatre noms, et le
 * test `schema-domaine` le garantit. Une table de correspondance ici
 * n'ajouterait qu'un endroit où se tromper.
 */
export async function fileDeRevue(): Promise<PieceEnEchec[]> {
  const file = await db.manualReview.findMany({
    where: { decidedAt: null },
    orderBy: { queuedAt: "asc" },
    include: {
      analysis: {
        include: {
          version: {
            include: {
              document: true,
            },
          },
        },
      },
    },
  });

  return file.map((r) => {
    const document = r.analysis.version.document;
    return {
      id: r.id,
      piece: document.label,
      dossier: document.applicationId,
      motif: r.reason,
      deposeeLe: r.queuedAt.toISOString(),
      // Trace technique : pour l'opérateur seul, jamais pour le candidat
      // (DOC-12 §16, règle 3 — l'exception assumée du message B-02).
      journal: r.analysis.engineLog ?? "Aucune trace enregistrée.",
    };
  });
}

/** Coûts IA — B-07, RG-16.1. */
export interface LigneDeCout {
  dossierId: string;
  appels: number;
  coutMicros: number;
  pack: string | null;
  prixPack: number | null;
  devise: string | null;
  partDuPrix: number | null;
}

export async function coutsParDossier(): Promise<LigneDeCout[]> {
  const usages = await db.aiUsage.groupBy({
    by: ["applicationId"],
    _sum: { costMicros: true },
    _count: { _all: true },
  });

  const dossiers = await db.application.findMany({
    where: { id: { in: usages.flatMap((u) => (u.applicationId ? [u.applicationId] : [])) } },
    include: {
      transactions: { where: { status: "CONFIRMEE" }, orderBy: { confirmedAt: "asc" } },
    },
  });

  return usages
    .flatMap((u) => {
      if (!u.applicationId) return [];
      const achat = dossiers.find((d) => d.id === u.applicationId)?.transactions[0];
      const pack = achat ? getPack(achat.packCode) : undefined;
      const prix = pack && achat ? pack.prix[achat.currency as Devise] : null;
      const coutMicros = u._sum.costMicros ?? 0;
      return [
        {
          dossierId: u.applicationId,
          appels: u._count._all,
          coutMicros,
          pack: pack?.code ?? null,
          prixPack: prix,
          devise: achat?.currency ?? null,
          partDuPrix: prix ? coutMicros / 1_000_000 / prix : null,
        },
      ];
    })
    .sort((a, b) => (b.partDuPrix ?? 0) - (a.partDuPrix ?? 0));
}

/** Une règle du back-office, par identifiant — B-02. */
export async function regleDuBackOffice(id: string) {
  const regle = await db.visaRule.findUnique({ where: { id } });
  if (!regle) throw echec("introuvable");
  return regle;
}

/**
 * Édition d'une règle — B-02.
 *
 * L'écran compare une version en vigueur et un brouillon. Les deux viennent
 * de la même paire (pays, type de visa) : c'est cette paire qui identifie
 * une procédure, la version n'en est qu'un rang.
 *
 * Le nombre de dossiers concernés est compté, jamais estimé — c'est lui qui
 * dit combien de personnes verront leur checklist bouger, et l'écran
 * l'affiche avant le bouton de publication.
 */
export interface VueEditionRegle {
  enVigueur: import("@/domain/backoffice/regle").Regle;
  brouillon: import("@/domain/backoffice/regle").Regle;
  dossiersConcernes: number;
  dossiersSousLaNouvelleRegle: number;
  historique: readonly { version: number; le: string; par: string }[];
}

export async function editionDeLaRegle(id: string): Promise<VueEditionRegle | null> {
  const cible = await db.visaRule.findUnique({ where: { id } });
  if (!cible) return null;

  const versions = await db.visaRule.findMany({
    where: { countryCode: cible.countryCode, visaType: cible.visaType },
    orderBy: { version: "desc" },
  });

  const enVigueur = versions.find((v) => v.status === "PUBLISHED") ?? cible;
  const brouillon = versions.find((v) => v.status === "DRAFT") ?? cible;

  const [concernes, sousLaNouvelle] = await Promise.all([
    db.application.count({ where: { visaRuleId: enVigueur.id } }),
    db.application.count({ where: { visaRuleId: brouillon.id } }),
  ]);

  return {
    enVigueur: versRegle(enVigueur),
    brouillon: versRegle(brouillon),
    dossiersConcernes: concernes,
    dossiersSousLaNouvelleRegle: sousLaNouvelle,
    historique: versions.map((v) => ({
      version: v.version,
      le: iso(v.verifiedAt),
      par: v.verifiedBy,
    })),
  };
}

/**
 * Vue d'édition d'une version.
 *
 * `libelleCandidat` et `reserveCandidat` sont les deux textes que le
 * formulaire soumet à la liste de vocabulaire interdit. Ils viennent du
 * payload : le libellé de la procédure et la première réserve, qui sont
 * exactement ce que le candidat lit.
 */
function versRegle(regle: {
  version: number;
  countryCode: string;
  visaType: string;
  rules: unknown;
  sourceTier: string;
  sourceUrl: string;
  effectiveFrom: Date;
  nextReviewAt: Date;
}): import("@/domain/backoffice/regle").Regle {
  const p = payload(regle as never);
  const edito = editorialDe(regle.countryCode, regle.visaType);
  const fonds = p.preuve_fonds;

  return {
    version: regle.version,
    pays: edito?.pays ?? regle.countryCode,
    procedure: p.libelle,
    niveauSource: regle.sourceTier as import("@/domain/backoffice/regle").NiveauSource,
    source: hote(regle.sourceUrl),
    montant: fonds?.valeur ?? 0,
    devise: fonds?.devise ?? "",
    intituleMontant: fonds
      ? `Ressources à prouver, ${fonds.periodicite === "mensuel" ? "par mois" : "pour l'année"}`
      : "Aucune ressource à prouver",
    applicableDepuis: iso(regle.effectiveFrom),
    delaiInstruction: p.delai_traitement_jours
      ? `${p.delai_traitement_jours.min} à ${p.delai_traitement_jours.max} jours`
      : "non communiqué",
    prochaineRelecture: iso(regle.nextReviewAt),
    libelleCandidat: p.libelle,
    reserveCandidat: p.reserves[0] ?? "",
  };
}
