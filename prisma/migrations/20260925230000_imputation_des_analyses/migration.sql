-- Arbitrage S.92 — chaque ligne du grand livre nomme l'octroi qu'elle
-- entame, rend ou retire (premier entré, premier consommé).
--
-- Aucune ligne existante n'est réécrite : les lignes antérieures restent
-- sans imputation, et le rejeu du grand livre les impute par la même règle.
ALTER TABLE "AnalysisCredit" ADD COLUMN "grantId" TEXT;

CREATE INDEX "AnalysisCredit_grantId_idx" ON "AnalysisCredit"("grantId");

ALTER TABLE "AnalysisCredit" ADD CONSTRAINT "AnalysisCredit_grantId_fkey"
  FOREIGN KEY ("grantId") REFERENCES "AnalysisCredit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Un octroi n'est imputé à rien : seules les lignes qui entament, rendent
-- ou retirent en portent un.
ALTER TABLE "AnalysisCredit" ADD CONSTRAINT "AnalysisCredit_imputation_hors_octroi"
  CHECK ("grantId" IS NULL OR "reason" IN ('ANALYSE', 'ANALYSE_RENDUE', 'REMBOURSEMENT'));
