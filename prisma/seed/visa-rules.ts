import { PrismaClient } from "@prisma/client";
import {
  visaRulesSchema,
  SCHEMA_VERSION,
  peutEtrePubliee,
} from "../../src/domain/rules/schema";
import { refusDuReferentiel } from "../../src/domain/backoffice/regle";
import { REGLES_DE_REFERENCE } from "./visa-rules.data";

const prisma = new PrismaClient();

async function main() {
  for (const r of REGLES_DE_REFERENCE) {
    // 1. Validation du payload
    const payload = visaRulesSchema.parse(r.rules);

    // 2. Garde-fous de contenu, les mêmes que ceux de la publication.
    //
    //    Une règle entre en base par deux chemins : B-02, et cette graine.
    //    Ils appliquaient des contrôles différents — la graine ignorait le
    //    vocabulaire —, et le référentiel livré portait donc « moins de
    //    50 % de ses crédits annuels » dans un `message_echec`, c'est-à-dire
    //    une phrase que le candidat lit sur sa pièce et que la publication
    //    refuse. Une règle qu'aucun dépôt ne pourrait terminer était déjà
    //    refusée ici ; le vocabulaire l'est depuis le 23/09/2026, et par la
    //    même fonction que B-02.
    const refus = refusDuReferentiel(payload);
    if (refus !== null) {
      throw new Error(`${r.countryCode}/${r.visaType} : ${refus}`);
    }

    // 3. Garde-fou : pas de publication sur source secondaire
    const status = peutEtrePubliee(r.sourceTier) ? r.status : "DRAFT";
    if (status !== r.status) {
      console.warn(`[${r.countryCode}/${r.visaType}] forcé en DRAFT : source ${r.sourceTier}`);
    }

    // 4. Archivage de la version précédente s'il y en a une.
    //
    // `version: { not: r.version }` n'est pas un détail : sans cette clause,
    // un second passage du seed archive la ligne qu'il s'apprête à réécrire.
    // L'upsert la repasse bien en PUBLISHED juste après, mais laisse
    // derrière lui l'`effectiveTo` que l'archivage vient de poser — une
    // règle publiée dont la validité s'est terminée le jour de son entrée en
    // vigueur. Elle reste visible au back-office et disparaît de l'affichage
    // candidat, ce qu'aucun écran ne signale : c'est le filtre de lecture
    // qui l'écarte, silencieusement et à juste titre.
    // Le prédécesseur se cherche par sa **mise en vigueur** et non par son
    // statut : une version dont la relecture était dépassée est repassée en
    // DRAFT par la veille, et resterait sinon éternellement à côté de la
    // nouvelle, ni publiée ni archivée.
    await prisma.visaRule.updateMany({
      where: {
        countryCode: r.countryCode,
        visaType: r.visaType,
        publishedAt: { not: null },
        effectiveTo: null,
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
        // Le référentiel livré est mis en vigueur par le chargement, comme
        // une publication le ferait : sans cette date, la version suivante
        // ne trouverait pas son prédécesseur.
        publishedAt: status === "PUBLISHED" ? new Date(r.effectiveFrom) : null,
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
        publishedAt: status === "PUBLISHED" ? new Date(r.effectiveFrom) : null,
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
