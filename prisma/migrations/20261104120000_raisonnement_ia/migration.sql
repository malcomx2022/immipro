-- S.212 : la part de raisonnement d'un appel, comprise dans "outputTokens".
-- Additive, sans UPDATE : les lignes existantes restent NULL (« non rapporté »).
ALTER TABLE "AiUsage" ADD COLUMN "reasoningTokens" INTEGER;

-- Un raisonnement n'existe que sur une mesure connue, et n'excède jamais la
-- sortie facturée qui le contient.
ALTER TABLE "AiUsage" ADD CONSTRAINT "ai_usage_raisonnement_coherent" CHECK (
  "reasoningTokens" IS NULL OR (
    "reasoningTokens" >= 0 AND
    "usageState" = 'CONNUE' AND
    "outputTokens" IS NOT NULL AND
    "reasoningTokens" <= "outputTokens"
  )
);
