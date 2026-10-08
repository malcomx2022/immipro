-- La revue manuelle d'un remboursement se tranche — RG-15.2, revue du
-- 07/10/2026, M4 (décision D-11 du 08/10/2026).
--
-- 1. La décision : qui a fixé la somme et quand. L'initiation la lit au
--    lieu de réévaluer le pack, et la demande part avec `refundAmount`.

ALTER TABLE "Transaction"
  ADD COLUMN "refundDecidedAt" TIMESTAMP(3),
  ADD COLUMN "refundDecidedBy" TEXT;

-- L'une ne va pas sans l'autre, et une décision porte sur une obligation
-- ouverte dont la somme est fixée.
ALTER TABLE "Transaction" ADD CONSTRAINT "transaction_tranche_complete"
  CHECK (("refundDecidedAt" IS NULL) = ("refundDecidedBy" IS NULL)
     AND ("refundDecidedAt" IS NULL
          OR ("refundDueAt" IS NOT NULL AND "refundAmount" IS NOT NULL)));

-- 2. Le retrait des droits, par dossier servi. Un Pro sert jusqu'à trois
--    dossiers, et la décision D-11 retire ses analyses restantes de chacun.
--    L'index tenait « un retrait par remboursement » ; il tient désormais
--    « un retrait par remboursement et par dossier », ce qui garde la
--    protection contre un second retrait sur le même dossier.

DROP INDEX "analysiscredit_un_seul_retrait_par_remboursement";

CREATE UNIQUE INDEX "analysiscredit_un_seul_retrait_par_remboursement"
    ON "AnalysisCredit" ("transactionId", "applicationId")
 WHERE "reason" = 'REMBOURSEMENT' AND "transactionId" IS NOT NULL;
