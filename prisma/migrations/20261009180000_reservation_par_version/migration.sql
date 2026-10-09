-- RF-3, reliquat E5 — 09/10/2026. La réservation d'une analyse rattachée
-- à sa version.
--
-- Le débit précède l'appel au modèle (INV-6). Un arrêt entre le débit et
-- le verdict laissait une ligne `ANALYSE` sans analyse : le rejeu ne la
-- retrouvait pas et débitait de nouveau. Le débit nomme désormais la
-- version qu'il réserve, et le rejeu reprend la réservation ouverte au
-- lieu d'en poser une seconde ; les rendus nomment la version qu'ils
-- soldent.
--
-- Additive : une colonne nullable, sa clé étrangère et son index. Les
-- lignes antérieures restent nulles — elles ne sont pas réécrites (le
-- diagnostic des débits ambigus relève de RF-4).

ALTER TABLE "AnalysisCredit" ADD COLUMN "versionId" TEXT;

ALTER TABLE "AnalysisCredit" ADD CONSTRAINT "AnalysisCredit_versionId_fkey"
  FOREIGN KEY ("versionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AnalysisCredit_versionId_idx" ON "AnalysisCredit"("versionId");
