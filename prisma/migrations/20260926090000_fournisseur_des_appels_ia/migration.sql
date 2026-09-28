-- S.94 — chaque appel au modèle dit chez quel fournisseur, et avec quel
-- modèle, il est parti. Les lignes existantes restent nulles : elles sont
-- toutes d'Anthropic, et se lisent ainsi sans réécriture.
ALTER TABLE "AiUsage" ADD COLUMN "provider" TEXT;
ALTER TABLE "AiUsage" ADD COLUMN "model" TEXT;

-- Un fournisseur connu, ou rien : une faute de frappe ne crée pas une
-- colonne de coûts fantôme dans B-07.
ALTER TABLE "AiUsage" ADD CONSTRAINT "ai_usage_fournisseur_connu"
  CHECK ("provider" IS NULL OR "provider" IN ('anthropic', 'openai_compatible'));
