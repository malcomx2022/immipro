-- RF-4, reliquat de S.148 — 09/10/2026. La réservation d'une rédaction
-- assistée, ouverte jusqu'à une échéance.
--
-- La mise en forme et la relecture débitent avant l'appel au modèle
-- (INV-6), dans une requête synchrone. Un arrêt entre le débit et le
-- résultat laissait un débit sans issue, que rien ne rendait. Le débit
-- porte désormais l'échéance de sa réservation ; une issue la remet à nul,
-- et la reprise horaire rend celles qui l'ont passée.
--
-- Additive : une colonne nullable et son index. Les lignes antérieures
-- restent nulles : elles ne sont ni réécrites ni reprises.

ALTER TABLE "AnalysisCredit" ADD COLUMN "reservedUntil" TIMESTAMP(3);

CREATE INDEX "AnalysisCredit_reservedUntil_idx" ON "AnalysisCredit"("reservedUntil");
