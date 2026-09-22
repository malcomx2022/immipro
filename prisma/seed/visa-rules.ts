import { PrismaClient } from "@prisma/client";
import {
  visaRulesSchema,
  SCHEMA_VERSION,
  peutEtrePubliee,
  raisonsDIncompletabilite,
} from "../../src/domain/rules/schema";
import { REGLES_DE_REFERENCE } from "./visa-rules.data";

const prisma = new PrismaClient();

async function main() {
  for (const r of REGLES_DE_REFERENCE) {
    // 1. Validation du payload
    const payload = visaRulesSchema.parse(r.rules);

    // 2. Garde-fou : une règle qu'aucun dépôt ne pourrait terminer ne
    //    s'insère pas. Elle passerait la validation de forme — la pièce
    //    porteuse d'une condition est facultative — et laisserait chaque
    //    dossier ouvert dessus bloqué pour toujours.
    const impossibles = raisonsDIncompletabilite(payload);
    if (impossibles.length > 0) {
      throw new Error(`${r.countryCode}/${r.visaType} : ${impossibles.join(" ")}`);
    }

    // 3. Garde-fou : pas de publication sur source secondaire
    const status = peutEtrePubliee(r.sourceTier) ? r.status : "DRAFT";
    if (status !== r.status) {
      console.warn(`[${r.countryCode}/${r.visaType}] forcé en DRAFT : source ${r.sourceTier}`);
    }

    // 3. Archivage de la version précédente s'il y en a une.
    //
    // `version: { not: r.version }` n'est pas un détail : sans cette clause,
    // un second passage du seed archive la ligne qu'il s'apprête à réécrire.
    // L'upsert la repasse bien en PUBLISHED juste après, mais laisse
    // derrière lui l'`effectiveTo` que l'archivage vient de poser — une
    // règle publiée dont la validité s'est terminée le jour de son entrée en
    // vigueur. Elle reste visible au back-office et disparaît de l'affichage
    // candidat, ce qu'aucun écran ne signale : c'est le filtre de lecture
    // qui l'écarte, silencieusement et à juste titre.
    await prisma.visaRule.updateMany({
      where: {
        countryCode: r.countryCode,
        visaType: r.visaType,
        status: "PUBLISHED",
        version: { not: r.version },
      },
      data: { status: "ARCHIVED", effectiveTo: new Date(r.effectiveFrom) },
    });

    await prisma.visaRule.upsert({
      where: {
        countryCode_visaType_version: {
          countryCode: r.countryCode,
          visaType: r.visaType,
          version: r.version,
        },
      },
      update: {
        rules: payload,
        // Les bornes de validité sont réécrites, et pas seulement posées à la
        // création : une reprise du seed doit ramener la fiche à l'état que
        // le fichier décrit, sinon elle corrige les textes et laisse les
        // dates d'un passage précédent.
        effectiveFrom: new Date(r.effectiveFrom),
        effectiveTo: r.effectiveTo ? new Date(r.effectiveTo) : null,
        sourceUrl: r.sourceUrl,
        sourceTier: r.sourceTier,
        verifiedAt: new Date(r.verifiedAt),
        verifiedBy: r.verifiedBy,
        nextReviewAt: new Date(r.nextReviewAt),
        status,
      },
      create: {
        countryCode: r.countryCode,
        visaType: r.visaType,
        category: r.category,
        version: r.version,
        effectiveFrom: new Date(r.effectiveFrom),
        effectiveTo: r.effectiveTo ? new Date(r.effectiveTo) : null,
        rules: payload,
        schemaVersion: SCHEMA_VERSION,
        sourceUrl: r.sourceUrl,
        sourceTier: r.sourceTier,
        verifiedAt: new Date(r.verifiedAt),
        verifiedBy: r.verifiedBy,
        nextReviewAt: new Date(r.nextReviewAt),
        status,
      },
    });

    console.log(`✓ ${r.countryCode}/${r.visaType} v${r.version} — ${status}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
