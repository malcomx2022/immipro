-- REV11-L2 : extension de la mesure, sans UPDATE ni requalification historique.
-- Les NULL désignent un compteur/coût inconnu ; un vrai zéro reste un entier.
ALTER TABLE "AiUsage" ADD COLUMN "usageState" TEXT;
ALTER TABLE "AiUsage" ALTER COLUMN "inputTokens" DROP NOT NULL;
ALTER TABLE "AiUsage" ALTER COLUMN "outputTokens" DROP NOT NULL;
ALTER TABLE "AiUsage" ALTER COLUMN "costMicros" DROP NOT NULL;
ALTER TABLE "DocumentAnalysis" ADD COLUMN "usageState" TEXT;
ALTER TABLE "DocumentAnalysis" ALTER COLUMN "inputTokens" DROP NOT NULL;
ALTER TABLE "DocumentAnalysis" ALTER COLUMN "outputTokens" DROP NOT NULL;

-- L'ancien écrivain reste compatible pendant le déploiement : état nul.
-- Toute nouvelle mesure explicite doit être cohérente ; aucune valeur négative.
ALTER TABLE "AiUsage" ADD CONSTRAINT "ai_usage_mesure_coherente" CHECK (
  "usageState" IS NULL OR (
    ("inputTokens" IS NULL OR "inputTokens" >= 0) AND
    ("outputTokens" IS NULL OR "outputTokens" >= 0) AND
    (("usageState" = 'CONNUE' AND "inputTokens" IS NOT NULL AND "outputTokens" IS NOT NULL) OR
     ("usageState" = 'INCONNUE' AND "inputTokens" IS NULL AND "outputTokens" IS NULL) OR
     ("usageState" = 'PARTIELLE' AND (("inputTokens" IS NULL) <> ("outputTokens" IS NULL))) OR
     ("usageState" = 'INVALIDE' AND ("inputTokens" IS NULL OR "outputTokens" IS NULL))) AND
    ("costMicros" IS NULL OR ("usageState" = 'CONNUE' AND "costMicros" >= 0))
  )
);
ALTER TABLE "DocumentAnalysis" ADD CONSTRAINT "analyse_mesure_coherente" CHECK (
  "usageState" IS NULL OR (
    ("inputTokens" IS NULL OR "inputTokens" >= 0) AND
    ("outputTokens" IS NULL OR "outputTokens" >= 0) AND
    (("usageState" = 'CONNUE' AND "inputTokens" IS NOT NULL AND "outputTokens" IS NOT NULL) OR
     ("usageState" = 'INCONNUE' AND "inputTokens" IS NULL AND "outputTokens" IS NULL) OR
     ("usageState" = 'PARTIELLE' AND (("inputTokens" IS NULL) <> ("outputTokens" IS NULL))) OR
     ("usageState" = 'INVALIDE' AND ("inputTokens" IS NULL OR "outputTokens" IS NULL)))
  )
);
