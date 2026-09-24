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
import { aReconcilier, DELAI_RECONCILIATION_MINUTES } from "@/server/paiement/cycle";
import { getPack, type Devise } from "@/domain/payments/pricing";
import { achatDepuisLeCode } from "@/domain/payments/achat";
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
 * État des relevés de sources — B-01.
 *
 * Une source muette ne vaut pas un changement de règle : l'échec est
 * enregistré et rien n'est dépublié (RG-14.3). C'est ce qui permet
 * d'annoncer « 13 sources sur 14 » avec un compte exact plutôt qu'une
 * « collecte partielle » invérifiable.
 *
 * ── Le compte portait sur les lignes, pas sur les sources ───────────
 *
 * Il retenait tous les relevés du **jour du dernier**, et comptait
 * `duJour.length` comme un nombre de sources. Trois relevés sur une même
 * adresse se lisaient donc « 3 sources relevées ». Et la source muette
 * était *n'importe quelle* ligne en échec de cette journée, même si un
 * relevé plus récent avait joint la source depuis : l'écran gardait son
 * bandeau d'incident après la réparation.
 *
 * Rien ne le montrait tant que seule la graine de démonstration écrivait —
 * une ligne par source, toutes au même instant. Le premier relevé réel l'a
 * dit, et c'est la fumée de publication qui l'a trouvé.
 *
 * **Le dernier relevé de chaque source décide.** La fenêtre du jour est
 * partie avec : un relevé est le geste du veilleur, et il ne relit pas
 * quatorze sources dans la même journée — les fermer à minuit aurait
 * annoncé « 1 source relevée » le lendemain d'un relevé unique.
 */
export async function collecte(): Promise<Collecte | null> {
  /*
    `distinct` avec l'ordre décroissant rend la ligne la plus récente de
    chaque adresse, et rien de plus : borné par le nombre de sources, et
    non par le nombre de relevés jamais écrits.
  */
  const etats = await db.sourceCheck.findMany({
    distinct: ["sourceUrl"],
    orderBy: { checkedAt: "desc" },
  });
  const derniere = etats[0];
  if (!derniere) return null;

  const muette = etats.find((s) => !s.reachable);

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
    sources: etats.length,
    relevees: etats.filter((s) => s.reachable).length,
    faiteLe: derniere.checkedAt.toISOString(),
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
export async function paiements(
  jourIso: string,
  maintenant = new Date(),
): Promise<Paiement[]> {
  /*
    Les transactions **de la journée**, et elles seules — 24/09/2026.

    Le lecteur rendait les cent dernières, toutes dates confondues, sous un
    écran qui annonce « Journée du 24 septembre 2026 » et un tableau qui
    porte « Paiements de la journée ». Exécuté : trois lignes, 100 000 XOF
    affichés pour une journée qui en avait encaissé 50 000. Et l'export
    nomme son fichier d'après le jour et le journalise comme
    `grand-livre:<jour>` en appelant ce même lecteur — un livre attesté
    pour une date qu'il ne couvre pas.

    **`createdAt` et non `confirmedAt`** : le tableau liste aussi ce qui
    est en attente et ce qui a échoué, qui n'ont pas de date
    d'encaissement. Le jour d'une transaction est celui où elle existe.

    **Aucun plafond.** Un livre tronqué en silence est précisément ce que
    ce tableau doit prévenir, et une journée est bornée par l'activité
    plutôt que par une constante choisie ici.
  */
  const debut = new Date(`${jourIso}T00:00:00.000Z`);
  const fin = new Date(debut.getTime() + 24 * 60 * 60 * 1000);
  const transactions = await db.transaction.findMany({
    where: { createdAt: { gte: debut, lt: fin } },
    orderBy: { createdAt: "desc" },
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

/** Au-delà, le rapprochement automatique n'a plus donné signe de vie. */
const SILENCE_MINUTES = 60;

/**
 * État de l'opérateur — B-04.
 *
 * L'état se déduit de la date du dernier rapprochement : une confirmation
 * reçue par webhook signé, ou une consultation qui a abouti dans le job de
 * réconciliation. Les deux sont la parole du fournisseur, et il n'y en a
 * pas d'autre à confronter.
 *
 * ── Une heure sans achat n'est pas une panne d'opérateur ─────────────
 *
 * La règle était « rien depuis une heure ⇒ indisponible », et elle accusait
 * un tiers sur un silence qui n'était pas le sien. Un site où personne ne
 * paie entre deux heures et sept heures du matin affichait, tous les
 * matins : « L'API Stripe ne répond plus », le total de la journée passait
 * pour impubliable et l'export partait avec l'attestation d'un incident qui
 * n'avait pas eu lieu. C'est la faute symétrique de celle que la note
 * d'origine refusait — annoncer « disponible » sans avoir interrogé
 * personne —, et la plus coûteuse des deux : elle déclenche une réaction.
 *
 * Une indisponibilité ne s'affirme donc que si quelque chose attendait
 * l'opérateur : des transactions non abouties au-delà du délai de
 * rattrapage, celles-là mêmes que le job lui soumet toutes les quinze
 * minutes. S'il n'y en a aucune, personne n'a rien demandé, et la date du
 * dernier rapprochement — affichée en clair, jour compris — dit tout ce que
 * la plateforme sait.
 */
export async function etatOperateur(maintenant = new Date()): Promise<EtatOperateur | null> {
  const dernier = await db.transaction.findFirst({
    where: { reconciledAt: { not: null } },
    orderBy: { reconciledAt: "desc" },
    select: { reconciledAt: true, provider: true },
  });
  if (!dernier?.reconciledAt) return null;

  const repondRecemment =
    maintenant.getTime() - dernier.reconciledAt.getTime() < SILENCE_MINUTES * 60 * 1000;

  /*
    Ce que le job soumet au fournisseur à chaque passe (RG-05.4). Zéro
    ligne, c'est une question qui n'a pas été posée : le silence est le
    nôtre, pas celui de l'opérateur.
  */
  const enSouffrance = repondRecemment
    ? 0
    : await db.transaction.count({
        where: {
          status: { in: ["INITIEE", "EN_ATTENTE"] },
          createdAt: { lt: new Date(maintenant.getTime() - DELAI_RECONCILIATION_MINUTES * 60 * 1000) },
        },
      });

  return {
    disponible: repondRecemment || enSouffrance === 0,
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
  "regle.republication": "REGLE",
  "contenu.publication": "REGLE",
  "contenu.creation": "REGLE",
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

/**
 * Le pack sous lequel ce dossier a été vendu — B-07.
 *
 * ── `transactions[0]` n'est pas le pack ─────────────────────────────
 *
 * La lecture prenait la **première transaction confirmée**, quelle que
 * soit sa catégorie. Un dossier s'ouvre sans rien payer, et T-05 propose
 * une consultation sur un dossier déjà ouvert : la consultation se règle
 * donc couramment **avant** le pack. `getPack("consultation")` ne rend
 * rien, et toute la ligne de coût s'éteignait.
 *
 * Constaté en exécution, sur deux dossiers consommant exactement dix fois
 * le quota de jetons du même pack :
 *
 *     pack seul          · pack essentiel · quota 120000 · part du quota 1000 %
 *     consultation avant · pack null      · quota null   · part du quota null
 *
 *     ordre de la liste (le plus alarmant d'abord) :
 *       1. pack seul
 *       2. consultation avant
 *
 * Le second n'a ni quota, ni part, ni prix — et le tri, qui lit `?? 0`,
 * le renvoie en bas. C'est exactement ce que le commentaire du tri dit
 * avoir corrigé pour le tarif manquant : « le dossier à dix fois son
 * quota pouvait finir en bas de liste ». La même chute, par l'autre
 * porte.
 *
 * ── La catégorie décide, pas la grille ──────────────────────────────
 *
 * On choisit sur la **catégorie** de l'achat, et non sur ce que la grille
 * en dit : un pack retiré de l'offre reste le pack de ce dossier, et sa
 * ligne doit le nommer avec un quota inconnu plutôt que de désigner une
 * autre transaction — ou rien.
 */
const leurPack = <T extends { packCode: string }>(
  transactions: readonly T[],
): T | undefined => transactions.find((t) => achatDepuisLeCode(t.packCode).type === "pack");

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
      const achat = leurPack(dossiers.find((d) => d.id === u.applicationId)?.transactions ?? []);
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
  /**
   * Un brouillon existe-t-il déjà ?
   *
   * `brouillon` portait `versions.find(DRAFT) ?? cible` : faute de
   * brouillon, l'écran affichait la version en vigueur sous ce nom. Les
   * valeurs restent le bon point de départ — la suivante s'écrit à partir
   * d'elles —, mais l'écran ne doit pas les appeler « brouillon » ni
   * laisser croire qu'une seconde ligne existe.
   */
  brouillonExistant: boolean;
  /**
   * Le numéro que l'enregistrement écrira : celui du brouillon, ou le
   * suivant s'il faut l'ouvrir. L'écran l'annonce avant le clic.
   */
  versionAEcrire: number;
}

export async function editionDeLaRegle(id: string): Promise<VueEditionRegle | null> {
  const cible = await db.visaRule.findUnique({ where: { id } });
  if (!cible) return null;

  const versions = await db.visaRule.findMany({
    where: { countryCode: cible.countryCode, visaType: cible.visaType },
    orderBy: { version: "desc" },
  });

  const enVigueur = versions.find((v) => v.status === "PUBLISHED") ?? cible;
  const existant = versions.find((v) => v.status === "DRAFT");
  /*
    Faute de brouillon, la version en vigueur sert de **point de départ** :
    c'est d'elle que la suivante sera copiée, et c'est donc elle qu'il faut
    montrer. Ce qui change, c'est ce que l'écran en dit.
  */
  const brouillon = existant ?? enVigueur;

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
    brouillonExistant: existant !== undefined,
    versionAEcrire: existant
      ? existant.version
      : Math.max(...versions.map((v) => v.version)) + 1,
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
