-- Les clés étrangères indexées — revue du 07/10/2026, E11.
--
-- PostgreSQL n'indexe pas une clé étrangère de lui-même. Sans index qui la
-- porte en tête, chaque lecture par compte ou par dossier parcourt la table
-- entière, et chaque suppression en cascade aussi. Un index partiel ne
-- suffit pas : il ne sert que les lignes de son prédicat.
--
-- S'y ajoutent deux index de date : le journal d'audit (B-06, export par
-- période, purge à cinq ans) et la consommation IA (B-07) se lisent par
-- période. `scripts/migrations.mjs` refuse désormais toute nouvelle clé
-- étrangère sans index.

-- CreateIndex
CREATE INDEX "AiUsage_userId_idx" ON "AiUsage"("userId");

-- CreateIndex
CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");

-- CreateIndex
CREATE INDEX "AnalysisCredit_transactionId_idx" ON "AnalysisCredit"("transactionId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "CompletenessReviewRequest_applicationId_createdAt_idx" ON "CompletenessReviewRequest"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "DepositCorrectionRequest_applicationId_createdAt_idx" ON "DepositCorrectionRequest"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentAnalysis_versionId_analyzedAt_idx" ON "DocumentAnalysis"("versionId", "analyzedAt");

-- CreateIndex
CREATE INDEX "Notification_applicationId_kind_createdAt_idx" ON "Notification"("applicationId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "RuleMigration_fromRuleId_idx" ON "RuleMigration"("fromRuleId");

-- CreateIndex
CREATE INDEX "Transaction_userId_status_idx" ON "Transaction"("userId", "status");

-- CreateIndex
CREATE INDEX "Transaction_applicationId_status_idx" ON "Transaction"("applicationId", "status");

