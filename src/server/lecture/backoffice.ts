import { db } from "@/lib/db";
import { ecartOuvert } from "@/domain/backoffice/ecart";
import {
  acteurLisible,
  compteDeLActeur,
  origineDe,
  type IdentiteDUnCompte,
} from "@/domain/backoffice/acteur";
import { echec } from "@/server/http/echecs";
import { payload } from "@/server/acces/regles";
import { editorialDe, EDITORIAL } from "@/lib/contenu/destinations";
import {
  HORIZON_VEILLE_JOURS,
  type FicheSuivie,
  type Collecte,
  type StatutFiche,
} from "@/domain/backoffice/veille";
import type { Compte, StatutCompte } from "@/domain/backoffice/comptes";
import type { Paiement, EtatOperateur, EtatRapprochement } from "@/domain/backoffice/reconciliation";
import type { EcritureAudit, CategorieAudit } from "@/domain/backoffice/audit";
import type { PieceEnEchec } from "@/domain/backoffice/revue";
import type { ConsultantAdministre } from "@/domain/backoffice/consultants";
import { aReconcilier } from "@/server/paiement/cycle";
import { getPack, type Devise } from "@/domain/payments/pricing";
import {
  coutMicrosDesJetons,
  partDuQuotaIA,
  tarifDepuisEnvironnement,
  type Journee,
  type TarifIA,
} from "@/domain/backoffice/couts";
import { moyenDe } from "@/domain/paiement/recu";

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

/**
 * File de veille — B-01. L'horizon vient du domaine, qui le dit aussi à
 * l'écran : l'état vide annonce quand une fiche y entrera, et les deux
 * doivent lire le même nombre.
 */
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
    where: {
      // Un compte anonymisé n'est plus un compte : plus de nom, plus
      // d'adresse, personne à suspendre ni à rétablir (RG-10.4).
      deletedAt: null,
      ...(recherche ? { email: { contains: recherche, mode: "insensitive" as const } } : {}),
    },
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

/**
 * L'ordre des cas est l'ordre d'urgence pour l'opérateur, pas celui des
 * colonnes. Une suppression demandée passe devant une suspension : elle a
 * une échéance réglementaire, et un compte resté dans cet état est une
 * promesse non tenue au candidat (RG-10.4).
 *
 * Un compte anonymisé n'apparaît plus : il n'y a plus personne à administrer,
 * et le lister rappellerait une identité que la suppression vient d'effacer.
 */
const statutDuCompte = (u: {
  suspendedAt: Date | null;
  emailVerified: Date | null;
  deletionRequestedAt: Date | null;
}): StatutCompte =>
  u.deletionRequestedAt
    ? "SUPPRESSION_DEMANDEE"
    : u.suspendedAt
      ? "SUSPENDU"
      : u.emailVerified
        ? "ACTIF"
        : "EMAIL_NON_VERIFIE";

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

  const acteurs = new Map(
    (
      await db.user.findMany({
        where: {
          id: {
            in: [
              ...new Set(
                transactions
                  .map((t) => t.discrepancyResolvedBy)
                  .filter((id): id is string => id !== null),
              ),
            ],
          },
        },
        select: { id: true, email: true },
      })
    ).map((u) => [u.id, u.email]),
  );

  return transactions.map((t) => ({
    reference: t.reference,
    compte: t.user.email,
    montant: t.amount,
    devise: t.currency,
    moyen: moyenDe(t.provider),
    ...(t.providerTxId ? { transaction: t.providerTxId } : {}),
    ...(t.failureCause ? { cause: t.failureCause } : {}),
    ...(t.refundBasis ? { motifDuRemboursement: t.refundBasis } : {}),
    recuLe: t.createdAt.toISOString(),
    etat: etatDuRapprochement(t, maintenant),
    // L'écart voyage avec sa résolution : refermer sans relire le constat
    // reviendrait à signer un texte qu'on n'a pas sous les yeux. Les
    // adresses sont résolues comme au journal — l'identifiant durable
    // reste en base, la lecture en tire une identité lisible.
    ...(t.discrepancy
      ? {
          ecart: {
            constat: t.discrepancy,
            ...(t.discrepancyResolvedAt &&
            t.discrepancyOutcome &&
            t.discrepancyNote &&
            t.discrepancyResolvedBy
              ? {
                  resolution: {
                    issue: t.discrepancyOutcome,
                    note: t.discrepancyNote,
                    par: acteurs.get(t.discrepancyResolvedBy) ?? t.discrepancyResolvedBy,
                    le: t.discrepancyResolvedAt.toISOString(),
                  },
                }
              : {}),
          },
        }
      : {}),
  }));
}

function etatDuRapprochement(
  t: {
    status: string;
    reconciledAt: Date | null;
    discrepancy: string | null;
    discrepancyResolvedAt: Date | null;
    createdAt: Date;
    refundDueAt: Date | null;
    refundedAt: Date | null;
  },
  maintenant: Date,
): EtatRapprochement {
  // Un écart **refermé** n'est plus un écart à traiter : le texte reste
  // pour l'historique, mais la file de travail ne doit plus le compter,
  // sinon le compteur ne redescend jamais et cesse de vouloir dire
  // quelque chose (arbitrage du 21/09/2026).
  if (ecartOuvert(t)) return "ECART";
  // K.C — avant tout le reste, parce qu'une somme à rendre prime sur un
  // rapprochement réussi : une transaction rapprochée dont on doit l'argent
  // se serait affichée « Rapproché », et personne n'aurait rendu la somme.
  // Une demande partie et non confirmée reste une obligation, pas un
  // remboursement fait : c'est le cas le plus facile à oublier, parce
  // qu'il ressemble à un succès (arbitrage du 21/09/2026).
  if (t.refundDueAt && !t.refundedAt) return "REMBOURSEMENT_DU";
  if (t.status === "CONFIRMEE") return t.reconciledAt ? "RAPPROCHE" : "EN_ATTENTE";
  // Avant M.B, `REMBOURSEE` n'était nommé nulle part ici et tombait sur la
  // dernière ligne : passé dix minutes, « Écart à traiter ».
  if (t.status === "REMBOURSEE") return "REMBOURSE";
  if (t.status === "EXPIREE") return "ECHEC_DELAI";
  if (t.status === "ECHOUEE") return "ECHEC";
  /**
   * Une transaction en attente au-delà du délai de rattrapage est un
   * écart à traiter — **tant que personne ne l'a traitée**.
   *
   * Vu en refermant un écart dans l'écran : la base portait bien l'issue,
   * la note et la date, et la ligne réaffichait « Écart à traiter » au
   * rechargement. Cette ligne-ci ne lit pas `discrepancy` du tout : elle
   * déduit l'écart de l'âge, et rouvrait donc ce que la résolution venait
   * de refermer. Le compteur n'aurait jamais pu redescendre, ce qui est
   * exactement le défaut que cet arbitrage corrige.
   *
   * Le paiement reste « en attente » — c'est vrai, il n'est pas confirmé
   * — mais il sort de la file de travail, parce qu'il a été travaillé.
   */
  const aTraiter = aReconcilier(t.createdAt, maintenant) && t.discrepancyResolvedAt === null;
  return aTraiter ? "ECART" : "EN_ATTENTE";
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
  // Le retrait d'un accord de partage porte sur ce qu'un tiers pouvait
  // lire : il se classe avec les accès aux pièces, pas avec le compte.
  "partage.retrait": "ACCES_PIECE",
  "compte.suspension": "COMPTE",
  "compte.retablissement": "COMPTE",
  "compte.suppression": "COMPTE",
  "compte.export": "COMPTE",
  "paiement.remboursement": "PAIEMENT",
  "paiement.reconciliation": "PAIEMENT",
  "regle.publication": "REGLE",
  "contenu.publication": "REGLE",
  "revue.decision": "ACCES_PIECE",
  /**
   * Les deux exports du back-office.
   *
   * Aucune des quatre catégories de WF-15 ne nomme l'administration du
   * journal lui-même : le grand livre se range avec les paiements sans
   * difficulté, l'export du journal n'a pas d'endroit juste. Il est classé
   * ici plutôt que laissé au repli — un opérateur qui filtre sur
   * « Comptes » doit au moins le voir, et un classement décidé se relit,
   * là où un classement hérité d'un `??` ne se remarque jamais.
   */
  "paiements.export": "PAIEMENT",
  "journal.export": "COMPTE",
  /**
   * B-09 — l'habilitation d'un consultant.
   *
   * Classée avec les comptes : c'est d'une personne qu'il s'agit, de son
   * droit d'apparaître et de sa suspension, exactement ce que la
   * catégorie « Comptes » recouvre déjà pour les candidats. La ranger
   * sous « Règles » l'aurait mêlée aux publications du référentiel, avec
   * lesquelles elle n'a rien à voir.
   */
  "consultant.creation": "COMPTE",
  "consultant.habiliter": "COMPTE",
  "consultant.retirer": "COMPTE",
  "consultant.suspendre": "COMPTE",
  "consultant.retablir": "COMPTE",
};

/**
 * Les écritures d'une période, sans plafond.
 *
 * `journal()` en prend deux cents : c'est une lecture d'écran, et deux
 * cents lignes remplissent un tableau. Un export n'a pas le même droit —
 * tronqué en silence, il serait une attestation fausse, et c'est
 * exactement ce qu'un contrôle vient chercher. Les bornes sont incluses,
 * comme celles de `filtrerAudit`.
 */
/**
 * Le plafond est dit, jamais omis.
 *
 * Un paramètre facultatif se laisse oublier, et l'oubli irait dans le sens
 * du danger : un export plafonné en silence est une attestation fausse.
 * `"aucun"` s'écrit, se lit dans la diff, et se vérifie.
 */
type Plafond = number | "aucun";

export async function journalDeLaPeriode(periode: {
  du: string;
  au: string;
}): Promise<EcritureAudit[]> {
  return lireLeJournal("aucun", {
    createdAt: {
      gte: new Date(`${periode.du}T00:00:00.000Z`),
      lt: new Date(new Date(`${periode.au}T00:00:00.000Z`).getTime() + 86_400_000),
    },
  });
}

/** Deux cents lignes remplissent un tableau : c'est une lecture d'écran. */
export async function journal(filtre?: CategorieAudit): Promise<EcritureAudit[]> {
  const lignes = await lireLeJournal(200);
  return lignes.filter((e) => (filtre ? e.categorie === filtre : true));
}

async function lireLeJournal(
  plafond: Plafond,
  where?: { createdAt: { gte: Date; lt: Date } },
): Promise<EcritureAudit[]> {
  const lignes = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    ...(plafond === "aucun" ? {} : { take: plafond }),
  });

  /**
   * Les identités, en une requête pour deux cents lignes.
   *
   * Un même opérateur signe la plupart des écritures d'une journée :
   * résoudre ligne par ligne ferait deux cents lectures pour trois
   * personnes. `deletedAt` est lu comme les autres colonnes — c'est lui
   * qui distingue « Compte supprimé » d'« Acteur non résolu », et les
   * confondre dirait qu'on a perdu une trace là où le compte a
   * simplement été effacé à la demande.
   */
  const comptes = [
    ...new Set(lignes.map((l) => compteDeLActeur(l.actorId)).filter((id) => id !== null)),
  ];
  const identites = new Map<string, IdentiteDUnCompte>(
    (
      await db.user.findMany({
        where: { id: { in: comptes } },
        select: { id: true, email: true, firstName: true, lastName: true, deletedAt: true },
      })
    ).map((u) => [
      u.id,
      {
        prenom: u.firstName,
        nom: u.lastName,
        email: u.email,
        supprime: u.deletedAt !== null,
      },
    ]),
  );

  return lignes
    .map((l) => {
      const compte = compteDeLActeur(l.actorId);
      return {
        id: l.id,
        horodatage: l.createdAt.toISOString(),
        acteur: acteurLisible(l.actorId, compte ? (identites.get(compte) ?? null) : null),
        categorie: CATEGORIE[l.action] ?? ("COMPTE" as CategorieAudit),
        action: l.action,
        objet: l.target,
        detail: l.reason,
        origine: origineDe(l.actorId),
      };
    });
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

/**
 * Coûts IA — B-07, RG-16.1 et RG-16.2.
 *
 * Le coût est **recalculé ici**, depuis les jetons conservés et le tarif du
 * jour ; `AiUsage.costMicros` n'est pas lu. Deux raisons, et la seconde est
 * la plus importante :
 *
 *  - WF-16 étape 4 demande de réviser la grille tarifaire à partir des
 *    coûts réels, ce qui suppose de pouvoir repasser une grille sur une
 *    consommation déjà enregistrée ;
 *  - les lignes écrites avant qu'un tarif existe portent un zéro. Les
 *    sommer reviendrait à présenter comme gratuit ce qu'on ne savait pas
 *    encore facturer.
 *
 * Sans tarif, le coût vaut `null` d'un bout à l'autre de la chaîne — jamais
 * zéro, qui s'afficherait comme une dépense nulle face à un plafond.
 */
export interface LigneDeCout {
  dossierId: string;
  appels: number;
  jetonsEntree: number;
  jetonsSortie: number;
  /** `null` sans tarif configuré. */
  coutMicros: number | null;
  pack: string | null;
  prixPack: number | null;
  devise: string | null;
  /** Part du prix du pack, ratio. `null` sans tarif ou sans pack payé. */
  partDuPrix: number | null;
  /** Quota de jetons du pack acheté. `null` sans pack payé. */
  quotaJetons: number | null;
  /**
   * Part du quota de jetons déjà consommée. `null` sans pack payé.
   *
   * Elle ne demande **aucun tarif** : c'est ce qui la distingue de
   * `partDuPrix`, et c'est la seule alerte disponible tant que le prix
   * du jeton n'est pas renseigné.
   */
  partDuQuota: number | null;
}

export async function coutsParDossier(
  tarif: TarifIA | null = tarifDepuisEnvironnement(process.env),
): Promise<LigneDeCout[]> {
  const usages = await db.aiUsage.groupBy({
    by: ["applicationId"],
    _sum: { inputTokens: true, outputTokens: true },
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
      const jetonsEntree = u._sum.inputTokens ?? 0;
      const jetonsSortie = u._sum.outputTokens ?? 0;
      const coutMicros = coutMicrosDesJetons(tarif, jetonsEntree, jetonsSortie);
      return [
        {
          dossierId: u.applicationId,
          appels: u._count._all,
          jetonsEntree,
          jetonsSortie,
          coutMicros,
          pack: pack?.code ?? null,
          prixPack: prix,
          devise: achat?.currency ?? null,
          partDuPrix:
            prix && coutMicros !== null ? coutMicros / 1_000_000 / prix : null,
          quotaJetons: pack?.tokensIA ?? null,
          partDuQuota: partDuQuotaIA(jetonsEntree + jetonsSortie, pack?.tokensIA ?? null),
        },
      ];
    })
    /*
      Le plus alarmant des deux d'abord, et non la marge seule : sans
      tarif, `partDuPrix` vaut `null` partout, et le tri se faisait alors
      sur rien — le dossier à dix fois son quota pouvait finir en bas de
      liste. Les deux ratios sont comparables, puisque les deux disent
      « part de ce que le pack a vendu ».
    */
    .sort(
      (a, b) =>
        Math.max(b.partDuPrix ?? 0, b.partDuQuota ?? 0) -
        Math.max(a.partDuPrix ?? 0, a.partDuQuota ?? 0),
    );
}

/**
 * Consommation quotidienne — l'histogramme de B-07.
 *
 * En jetons, pas en argent : c'est la seule grandeur qui reste juste que le
 * tarif soit configuré ou non. Les jours sans appel ne sont pas renvoyés ;
 * c'est `serieQuotidienne` qui les remet à zéro, parce que combler un trou
 * est une décision d'affichage et qu'elle se teste sans base de données.
 */
export async function consommationParJour(depuis: Date): Promise<Journee[]> {
  const usages = await db.aiUsage.findMany({
    where: { createdAt: { gte: depuis } },
    select: { createdAt: true, inputTokens: true, outputTokens: true },
  });

  const parJour = new Map<string, Journee>();
  for (const u of usages) {
    const jour = iso(u.createdAt);
    const cumul = parJour.get(jour) ?? { jour, jetons: 0, appels: 0 };
    cumul.jetons += u.inputTokens + u.outputTokens;
    cumul.appels += 1;
    parJour.set(jour, cumul);
  }

  return [...parJour.values()].sort((a, b) => a.jour.localeCompare(b.jour));
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

/**
 * Consultants et habilitations — B-09, WF-15.
 *
 * Toutes les habilitations sont rendues, retirées comprises : un retrait
 * se date, il ne s'efface pas, et l'écran d'administration est justement
 * celui où l'on relit ce qui a été fait. L'annuaire candidat, lui, ne sert
 * que les habilitations en cours — c'est `annuaire()` qui filtre, pas
 * cette lecture.
 */
export async function consultantsAdministres(): Promise<ConsultantAdministre[]> {
  const consultants = await db.consultant.findMany({
    include: { accreditations: { orderBy: { countryCode: "asc" } } },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  /*
    « Vérifié par 3911f2ee-… » promet une personne et montre une clé
    primaire — ce que l'arbitrage du 21/09/2026 a retiré du journal
    d'audit. Même résolution ici, et le même troisième repli : un
    identifiant qui ne résout pas se dit « non résolu » plutôt que de
    passer pour un nom. Le jeu de démonstration en contient un.
  */
  const identifiants = [
    ...new Set(consultants.flatMap((c) => c.accreditations.map((a) => a.verifiedBy))),
  ];
  const identites = new Map<string, IdentiteDUnCompte>(
    (
      await db.user.findMany({
        where: { id: { in: identifiants } },
        select: { id: true, email: true, firstName: true, lastName: true, deletedAt: true },
      })
    ).map((u) => [
      u.id,
      { prenom: u.firstName, nom: u.lastName, email: u.email, supprime: u.deletedAt !== null },
    ]),
  );

  return consultants.map((c) => ({
    id: c.id,
    nom: c.name,
    cabinet: c.firm,
    ville: c.city,
    qualification: c.qualification,
    langues: Array.isArray(c.languages) ? (c.languages as string[]) : [],
    delaiReponseHeures: c.responseHours,
    actif: c.active,
    habilitations: c.accreditations.map((a) => ({
      code: a.countryCode,
      pays: editorialDuPays(a.countryCode) ?? a.countryCode,
      titre: a.title,
      verifieeLe: iso(a.verifiedAt),
      verifiePar: acteurLisible(a.verifiedBy, identites.get(a.verifiedBy) ?? null),
      ...(a.revokedAt ? { retireeLe: iso(a.revokedAt) } : {}),
    })),
  }));
}

/**
 * Les destinations sur lesquelles un dossier peut s'ouvrir aujourd'hui.
 *
 * C'est à celles-là que la couverture se mesure : habiliter quelqu'un sur
 * un pays que la plateforme n'ouvre pas ne sert aucun candidat, et une
 * destination ouverte sans consultant est le seul manque qui compte.
 */
export async function destinationsOuvertes(): Promise<{ code: string; pays: string }[]> {
  const regles = await db.visaRule.findMany({
    where: { status: "PUBLISHED" },
    select: { countryCode: true },
    distinct: ["countryCode"],
    orderBy: { countryCode: "asc" },
  });
  return regles.map((r) => ({
    code: r.countryCode,
    pays: editorialDuPays(r.countryCode) ?? r.countryCode,
  }));
}

/**
 * Nom lisible d'un pays, depuis la part éditoriale du référentiel.
 *
 * Le code seul — « NL » — ne se lit pas sur un écran d'habilitation, où
 * l'opérateur choisit une juridiction. La première fiche éditoriale du
 * pays suffit : le nom ne dépend pas de la procédure.
 */
function editorialDuPays(countryCode: string): string | null {
  for (const [cle, edito] of Object.entries(EDITORIAL)) {
    if (cle.startsWith(`${countryCode}/`)) return edito.pays;
  }
  return null;
}
