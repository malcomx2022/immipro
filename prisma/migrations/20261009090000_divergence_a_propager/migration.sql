-- WF-11 — une divergence ne se perd plus entre la publication et sa mise
-- en file (revue du 07/10/2026, M8).
--
-- La publication écrivait sa transaction, puis postait le job de
-- propagation. Un `poster` qui levait faisait répondre 5xx à une
-- publication faite ; un nouvel essai ne trouvait plus de prédécesseur, et
-- les dossiers de la version remplacée n'étaient jamais prévenus.
--
-- La dette s'écrit désormais dans la transaction de la publication, et la
-- reprise horaire (`JOBS.REPRISE_DIVERGENCE`) la retrouve.

ALTER TABLE "VisaRule" ADD COLUMN "divergenceDueAt" TIMESTAMP(3);

CREATE INDEX "VisaRule_divergenceDueAt_idx" ON "VisaRule"("divergenceDueAt");

-- Seule une version mise en vigueur a des dossiers à prévenir : un
-- brouillon n'en a remplacé aucune.
ALTER TABLE "VisaRule" ADD CONSTRAINT "regle_divergence_sur_version_en_vigueur"
  CHECK ("divergenceDueAt" IS NULL OR "publishedAt" IS NOT NULL);

-- ── Rejeu, une fois (D-23 du 08/10/2026) ──────────────────────────────
--
-- Les divergences perdues avant cette correction ne laissent aucune trace.
-- La version en vigueur de chaque procédure qui a un prédécesseur est donc
-- marquée une fois, échue depuis une heure : la première reprise horaire
-- la propage. La passe est reprenable — `RuleMigration.alertedAt` saute un
-- dossier déjà prévenu —, et un dossier qui ne l'a jamais été reçoit
-- l'alerte qu'il aurait dû recevoir.
UPDATE "VisaRule" v
   SET "divergenceDueAt" = now() - interval '1 hour'
 WHERE v."publishedAt" IS NOT NULL
   AND v."effectiveTo" IS NULL
   AND EXISTS (
     SELECT 1 FROM "VisaRule" p
      WHERE p."countryCode" = v."countryCode"
        AND p."visaType" = v."visaType"
        AND p."version" < v."version"
   );
