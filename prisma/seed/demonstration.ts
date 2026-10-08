import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { empreinte } from "../../src/server/securite/secret";
import { checklistDepuis, echeancesDepuis } from "../../src/server/acces/dossiers";
import { payload } from "../../src/server/acces/regles";
import { getPack } from "../../src/domain/payments/pricing";
import { COMMISSION_BPS_ANNONCEE } from "../../src/domain/partenaires/affiliation";
import {
  coutMicrosDesJetons,
  tarifDepuisEnvironnement,
} from "../../src/domain/backoffice/couts";
import {
  peutEcrireLaDemonstration,
  sourcesSansReleve,
} from "../../src/domain/exploitation/demonstration";
import { LONGUEUR_MINIMALE } from "../../src/domain/comptes/mot-de-passe";

/**
 * Jeu de démonstration — développement seulement.
 *
 * Il crée une candidate, un dossier en cours et un brouillon, des pièces
 * dans plusieurs états, une analyse, une alerte et un consultant habilité.
 * Objectif : pouvoir ouvrir chaque écran et voir ce qu'il montre, ce qu'aucun
 * test ne remplace — les défauts trouvés à l'œil sur les lots précédents
 * l'ont tous été ainsi.
 *
 * **Il n'écrit que sur une base locale, nommée, sans facture réelle** —
 * revue du 07/10/2026, M17. Un jeu de démonstration écrit dans une base
 * réelle y laisse des comptes au mot de passe connu de qui l'a lancé. Il
 * ne refusait qu'avec `NODE_ENV=production`, que `npm run seed:demo` ne
 * pose pas. La décision vit dans `domain/exploitation/demonstration.ts`.
 *
 *     SEED_DEMO_BASE=immipro npm run seed:demo
 *
 * Le mot de passe est tiré à chaque passage et affiché une fois, ou lu dans
 * `DEMO_MOT_DE_PASSE` pour qui veut le garder d'une passe à l'autre. Il
 * n'est plus écrit dans le dépôt.
 */
const prisma = new PrismaClient();

/** Un domaine réservé (RFC 2606) : aucun courrier de démonstration ne part chez quelqu'un. */
const EMAIL = "aline.dossou@immipro.test";
/**
 * L'adresse des passes antérieures au 08/10/2026, sur un domaine réel. Elle
 * est retirée avec le reste du jeu : la référence de la vente de
 * démonstration est unique, et une base de développement la porte encore.
 */
const ANCIENNE_ADRESSE = "aline.dossou@email.com";
const PARTENAIRE_DEMO = "Cabinet Adjovi & Associés";

/**
 * Un compte par rôle, et non un seul compte tout-puissant.
 *
 * RG-15.3 demande le moindre privilège ; la seule façon de vérifier qu'il
 * tient est d'ouvrir les écrans avec chacun des trois rôles et de constater
 * ce qui se ferme. Un jeu de démonstration où tout le monde est
 * administrateur ne prouve rien.
 */
const OPERATEURS = [
  { email: "veilleur@immipro.test", role: "VEILLEUR" as const, prenom: "Koffi" },
  { email: "admin@immipro.test", role: "ADMIN" as const, prenom: "Mireille" },
];

/** Assez long pour passer la règle d'inscription (A-04), et différent à chaque passe. */
function motDePasse(): string {
  const fourni = process.env.DEMO_MOT_DE_PASSE;
  if (fourni !== undefined) {
    if (fourni.length < LONGUEUR_MINIMALE) {
      throw new Error(
        `DEMO_MOT_DE_PASSE compte ${fourni.length} caractère(s) ; il en faut au moins ${LONGUEUR_MINIMALE}, comme à l'inscription.`,
      );
    }
    return fourni;
  }
  return randomBytes(12).toString("base64url");
}

async function main() {
  const url = process.env.DATABASE_URL;
  const confirmation = process.env.SEED_DEMO_BASE;
  // Hôte et nom d'abord, sans rien lire : une base qui n'est pas locale
  // n'est pas même interrogée. Les factures réelles ensuite, une fois la
  // base jointe — un tunnel vers la production se présente comme local.
  const avant = peutEcrireLaDemonstration(url, confirmation, 0);
  if (!avant.ecrire) throw new Error(avant.raison);
  const decision = peutEcrireLaDemonstration(
    url,
    confirmation,
    await prisma.invoice.count({ where: { series: "REELLE" } }),
  );
  if (!decision.ecrire) throw new Error(decision.raison);

  const secret = motDePasse();

  const regle = await prisma.visaRule.findFirst({
    where: { countryCode: "NL", visaType: "etudes_mvv_vvr", status: "PUBLISHED" },
  });
  const brouillonRegle = await prisma.visaRule.findFirst({
    where: { countryCode: "CH", status: "PUBLISHED" },
  });
  if (!regle || !brouillonRegle) {
    throw new Error("Lance d'abord `npm run seed:rules`.");
  }

  // Les paiements ne tombent pas en cascade, et c'est voulu : un reçu
  // survit à la suppression du compte, pour l'obligation comptable annoncée
  // au candidat sur C-11. Le jeu de démonstration les retire donc à part —
  // ce qu'un vrai effacement de compte ne fera pas : RG-10.4 anonymise les
  // métadonnées, il ne les supprime pas.
  for (const ancien of await prisma.user.findMany({
    where: { email: { in: [EMAIL, ANCIENNE_ADRESSE] } },
  })) {
    await prisma.analysisCredit.deleteMany({ where: { application: { userId: ancien.id } } });
    await prisma.transaction.deleteMany({ where: { userId: ancien.id } });
    await prisma.user.delete({ where: { id: ancien.id } });
  }
  await prisma.consultant.deleteMany({ where: { firm: "Visser Immigration Advies" } });
  await prisma.partner.deleteMany({ where: { name: PARTENAIRE_DEMO } });
  await prisma.auditLog.deleteMany({ where: { actorId: "systeme:demonstration" } });

  const candidate = await prisma.user.create({
    data: {
      email: EMAIL,
      passwordHash: await empreinte(secret),
      firstName: "Aline",
      lastName: "Dossou",
      phone: "+22997000042",
      countryCode: "BJ",
      emailVerified: new Date(),
      profile: {
        create: {
          objectif: "Étudier",
          highestDegree: "Licence en gestion",
          fieldOfStudy: "Gestion",
          languages: { en: "B2" },
          budgetTotal: 9_000_000,
          budgetCurrency: "XOF",
        },
      },
      consents: {
        create: [
          { kind: "CGU", granted: true, version: "1.0" },
          { kind: "PIECES_IDENTITE", granted: true, version: "1.0" },
          // Sans cette autorisation, T-03 ne s'affiche pas : la proposition
          // de partenaire n'est pas un encart qu'on subit (RG-13.1).
          { kind: "PARTENAIRES", granted: true, version: "1.0" },
        ],
      },
    },
  });

  const cible = new Date();
  cible.setUTCFullYear(cible.getUTCFullYear() + 1, 8, 1);

  const dossier = await prisma.application.create({
    data: {
      userId: candidate.id,
      visaRuleId: regle.id,
      status: "ACTIF",
      targetDate: cible,
      documents: { create: checklistDepuis(payload(regle)) },
      deadlines: { create: echeancesDepuis(payload(regle), cible) },
    },
    include: { documents: true },
  });

  // Pack acheté : le quota s'ouvre par le grand livre, comme en production.
  const pack = getPack("dossier")!;
  const transaction = await prisma.transaction.create({
    data: {
      reference: "IMP-260919-DEMO01",
      userId: candidate.id,
      applicationId: dossier.id,
      packCode: pack.code,
      amount: pack.prix.XOF,
      currency: "XOF",
      provider: "FEDAPAY",
      providerTxId: "fedapay:demonstration-1",
      status: "CONFIRMEE",
      confirmedAt: new Date(),
      // Comme une vente réelle : ce que le pack vend est figé sur la vente
      // (S.128), et la contrepartie constatée à l'ouverture du quota (S.130).
      packAnalyses: pack.analyses,
      packDestinations: pack.destinations,
      creditedAt: new Date(),
    },
  });
  await prisma.analysisCredit.create({
    data: {
      applicationId: dossier.id,
      delta: pack.analyses,
      reason: "ACHAT_PACK",
      transactionId: transaction.id,
      note: `Pack ${pack.libelle}`,
    },
  });

  // Une pièce conforme, une à corriger, une analysée : les trois états que
  // la checklist doit savoir montrer côte à côte.
  //
  // Les pièces sont choisies par code et non par position : l'ordre de
  // `create` n'est pas garanti au retour, et la première version de ce jeu
  // marquait « conforme » une pièce au hasard — le tableau de bord
  // proposait alors d'ajouter un passeport déjà déposé.
  const parCode = (code: string) => dossier.documents.find((d) => d.code === code);
  const passeport = parCode("passeport");
  const admission = parCode("admission");
  const fonds = parCode("preuve_fonds");

  if (passeport) {
    await prisma.document.update({
      where: { id: passeport.id },
      data: { status: "CONFORME", analyzedAt: new Date() },
    });
  }

  if (admission) {
    await prisma.document.update({
      where: { id: admission.id },
      data: {
        status: "A_CORRIGER",
        remedy: "REMPLACER",
        feedback:
          "Le document est une admission conditionnelle. L'IND exige une admission inconditionnelle : demande la version définitive à ton établissement.",
        finding: "Admission conditionnelle constatée, inconditionnelle exigée.",
        analyzedAt: new Date(),
      },
    });
  }

  if (fonds) {
    const version = await prisma.documentVersion.create({
      data: {
        documentId: fonds.id,
        rank: 1,
        objectKey: `dossiers/${dossier.id}/${fonds.code}/demonstration-releve.pdf`,
        checksum: "a".repeat(64),
        mimeType: "application/pdf",
        sizeBytes: 240_000,
      },
    });
    await prisma.documentAnalysis.create({
      data: {
        versionId: version.id,
        verdict: "A_CORRIGER",
        fields: {
          titulaire: "DOSSOU Aline",
          solde_disponible: "10 000 EUR",
          date_du_releve: "2026-09-02",
        },
        title: "Il manque 3 569,24 € sur le relevé",
        body: "Le relevé montre 10 000 € disponibles, et l'IND en exige 13 569,24 € pour l'année. Téléverse un relevé plus récent, ou ajoute une attestation de prise en charge d'un garant.",
        inputTokens: 4200,
        outputTokens: 310,
      },
    });
    await prisma.document.update({
      where: { id: fonds.id },
      data: {
        status: "A_CORRIGER",
        remedy: "REMPLACER",
        feedback:
          "Le relevé montre 10 000 € disponibles, et l'IND en exige 13 569,24 € pour l'année.",
        finding: "10 000 € constatés, 13 569,24 € exigés.",
        analyzedAt: new Date(),
      },
    });
    await prisma.analysisCredit.create({
      data: { applicationId: dossier.id, delta: -1, reason: "ANALYSE" },
    });
    await prisma.aiUsage.create({
      data: {
        userId: candidate.id,
        applicationId: dossier.id,
        operation: `analyse:${fonds.code}`,
        inputTokens: 4200,
        outputTokens: 310,
        // Le coût sort du tarif configuré, jamais d'un chiffre posé ici : un
        // montant inventé dans le jeu de démonstration fait croire que B-07
        // sait tarifer alors qu'il attend encore ses trois variables.
        costMicros:
          coutMicrosDesJetons(tarifDepuisEnvironnement(process.env), 4200, 310) ?? 0,
      },
    });
  }

  // Un brouillon, pour que le tableau de bord montre deux états.
  await prisma.application.create({
    data: {
      userId: candidate.id,
      visaRuleId: brouillonRegle.id,
      status: "BROUILLON",
      documents: { create: checklistDepuis(payload(brouillonRegle)) },
    },
  });

  await prisma.notification.create({
    data: {
      userId: candidate.id,
      applicationId: dossier.id,
      kind: "ANALYSE",
      title: "Il manque 3 569,24 € sur le relevé",
      body: "Téléverse un relevé plus récent, ou ajoute une attestation de prise en charge d'un garant.",
    },
  });

  /**
   * Un partenaire activé sur les Pays-Bas, et un seul.
   *
   * Son taux est celui que T-03 écrit en toutes lettres : la lecture refuse
   * de proposer un partenaire à un autre taux, pour que la phrase affichée
   * et la commission facturée ne puissent pas diverger (RG-13.3). Rien n'est
   * activé sur les autres destinations : c'est l'état par défaut que demande
   * RG-13.4, et le dossier suisse du jeu de démonstration le montre — il
   * n'affiche aucune proposition.
   */
  await prisma.partner.create({
    data: {
      name: PARTENAIRE_DEMO,
      kind: "ASSURANCE_SANTE",
      city: "Cotonou",
      qualification: "courtier agréé, 9 ans d'exercice",
      url: "https://exemple.invalid/assurance-etudiants",
      commissionBps: COMMISSION_BPS_ANNONCEE,
      activations: {
        create: {
          countryCode: "NL",
          basis: "Rétro-commission licite sur courtage d'assurance santé aux Pays-Bas",
          verifiedAt: new Date("2026-09-15"),
          verifiedBy: "gislain",
        },
      },
    },
  });

  const consultant = await prisma.consultant.create({
    data: {
      name: "Marieke Visser",
      firm: "Visser Immigration Advies",
      city: "Groningue",
      qualification: "Juriste en droit des étrangers, inscrite depuis 2014",
      languages: ["nl", "en", "fr"],
      responseHours: 24,
      accreditations: {
        create: {
          countryCode: "NL",
          title: "Juriste agréée — Raad voor Rechtsbijstand",
          verifiedAt: new Date("2026-03-11"),
          verifiedBy: "gislain",
        },
      },
    },
  });

  /*
    Un relevé de veille par source qui n'en a aucun, pour que B-01 et la
    date de vérification aient quelque chose à montrer. L'historique de la
    veille porte la date de vérification de chaque information (INV-8) :
    la graine l'effaçait en entier à chaque passe, relevés réels compris.
  */
  const sources = [regle.sourceUrl, brouillonRegle.sourceUrl];
  const dejaRelevees = await prisma.sourceCheck.findMany({
    where: { sourceUrl: { in: sources } },
    select: { sourceUrl: true },
  });
  await prisma.sourceCheck.createMany({
    data: sourcesSansReleve(
      sources,
      dejaRelevees.map((r) => r.sourceUrl),
    ).map((sourceUrl) => ({ sourceUrl, reachable: true })),
  });

  await prisma.auditLog.create({
    data: {
      actorId: "systeme:demonstration",
      action: "regle.publication",
      target: `visaRule:${regle.id}`,
      reason: "Jeu de démonstration",
    },
  });

  for (const operateur of OPERATEURS) {
    await prisma.user.deleteMany({ where: { email: operateur.email } });
    await prisma.user.create({
      data: {
        email: operateur.email,
        passwordHash: await empreinte(secret),
        firstName: operateur.prenom,
        role: operateur.role,
        emailVerified: new Date(),
      },
    });
    console.log(`✓ ${operateur.role.toLowerCase()} ${operateur.email}`);
  }

  console.log(`✓ candidate ${EMAIL}`);
  console.log(`✓ dossier actif ${dossier.id}`);
  console.log(`✓ consultant ${consultant.name}`);
  // Une fois, pour les trois comptes, et nulle part ailleurs : il n'est
  // écrit ni dans le dépôt ni en base, seulement son empreinte.
  console.log(
    process.env.DEMO_MOT_DE_PASSE !== undefined
      ? `\nMot de passe des trois comptes : celui de DEMO_MOT_DE_PASSE (base « ${decision.base} »).`
      : `\nMot de passe des trois comptes, tiré pour cette passe (base « ${decision.base} ») : ${secret}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
