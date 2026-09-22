-- Propagation d'une divergence réglementaire, reprenable — WF-11, RG-11.2.
--
-- La passe s'arrêtait au premier dossier `PRET` : la mise en pause
-- écrivait `status` sans poser `readyAt`, et la garde
-- `application_pret_date_coherente` refusait la ligne. Le job levait, et
-- tous les dossiers suivants ne recevaient rien. La file rejouait, butait
-- au même endroit, et ajoutait au passage une seconde notification au
-- premier dossier — la ligne d'arbitrage est créée **avant** l'alerte, et
-- ne pouvait donc pas dire si l'alerte était partie.
--
-- `alertedAt` le dit. Elle est posée dans la même transaction que la
-- notification et la mise en pause : soit le dossier est prévenu et marqué,
-- soit rien n'est écrit et la reprise le reprend.
ALTER TABLE "RuleMigration" ADD COLUMN "alertedAt" TIMESTAMP(3);

-- Une décision ne se prend pas avant d'avoir été proposée. La garde dit
-- l'ordre des deux dates plutôt que de le laisser à la bonne volonté des
-- appelants : un arbitrage antidaté rendrait illisible la question « le
-- candidat a-t-il été prévenu avant de trancher ? », qui est précisément
-- ce que WF-11 étape 4 suppose.
ALTER TABLE "RuleMigration"
  ADD CONSTRAINT "migration_decidee_apres_alerte"
  CHECK ("decidedAt" IS NULL OR "alertedAt" IS NULL OR "alertedAt" <= "decidedAt");

-- La reprise cherche les dossiers concernés et non encore prévenus.
CREATE INDEX "RuleMigration_toRuleId_alertedAt_idx"
  ON "RuleMigration" ("toRuleId", "alertedAt");
