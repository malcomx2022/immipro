import { PrismaClient } from "@prisma/client";
import { empreinte } from "../../src/server/securite/secret";
import { checklistDepuis, echeancesDepuis } from "../../src/server/acces/dossiers";
import { payload } from "../../src/server/acces/regles";
import { getPack } from "../../src/domain/payments/pricing";

/**
 * Jeu de démonstration — développement seulement.
 *
 * Il crée une candidate, un dossier en cours et un brouillon, des pièces
 * dans plusieurs états, une analyse, une alerte et un consultant habilité.
 * Objectif : pouvoir ouvrir chaque écran et voir ce qu'il montre, ce qu'aucun
 * test ne remplace — les défauts trouvés à l'œil sur les lots précédents
 * l'ont tous été ainsi.
 *
 * **Il refuse de tourner en production.** Un jeu de démonstration écrit dans
 * une base réelle y laisse un compte avec un mot de passe connu.
 */
const prisma = new PrismaClient();

const MOT_DE_PASSE = "demonstration-2026";
const EMAIL = "aline.dossou@email.com";

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

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Le jeu de démonstration ne s'écrit pas en production.");
  }

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
  const ancien = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (ancien) {
    await prisma.analysisCredit.deleteMany({ where: { application: { userId: ancien.id } } });
    await prisma.transaction.deleteMany({ where: { userId: ancien.id } });
    await prisma.user.delete({ where: { id: ancien.id } });
  }
  await prisma.consultant.deleteMany({ where: { firm: "Visser Immigration Advies" } });
  await prisma.sourceCheck.deleteMany({});
  await prisma.auditLog.deleteMany({ where: { actorId: "systeme:demonstration" } });

  const candidate = await prisma.user.create({
    data: {
      email: EMAIL,
      passwordHash: await empreinte(MOT_DE_PASSE),
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
        costMicros: 18_400,
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

  await prisma.sourceCheck.createMany({
    data: [
      { sourceUrl: regle.sourceUrl, reachable: true },
      { sourceUrl: brouillonRegle.sourceUrl, reachable: true },
    ],
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
        passwordHash: await empreinte(MOT_DE_PASSE),
        firstName: operateur.prenom,
        role: operateur.role,
        emailVerified: new Date(),
      },
    });
    console.log(`✓ ${operateur.role.toLowerCase()} ${operateur.email} / ${MOT_DE_PASSE}`);
  }

  console.log(`✓ candidate ${EMAIL} / ${MOT_DE_PASSE}`);
  console.log(`✓ dossier actif ${dossier.id}`);
  console.log(`✓ consultant ${consultant.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
