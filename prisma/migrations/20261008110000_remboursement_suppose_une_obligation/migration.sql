-- Un remboursement suppose une obligation — INV-7, revue du 07/10/2026, E3
-- (décision D-8 du 08/10/2026).
--
-- `CONFIRMEE → REMBOURSEE` passait sur le seul statut : un remboursement
-- fait au tableau de bord du fournisseur, sans obligation chez nous,
-- soldait une dette qui n'existait pas. Le code ouvre désormais un écart
-- au lieu de solder ; la base le tient aussi.
--
-- Reprise : une ligne déjà remboursée sans obligation (pièces `ESSAI-`
-- seulement à cette date) reçoit une obligation datée de son
-- remboursement, et un écart qui dit ce qu'il faut vérifier — ses droits
-- n'ont pas été retirés et son avoir porte le prix payé.

UPDATE "Transaction"
   SET "refundDueAt" = "refundedAt",
       "refundBasis" = 'Reprise E3 : remboursement constaté chez le fournisseur sans obligation préalable',
       "discrepancy" = COALESCE(
         "discrepancy",
         'Remboursé sans obligation préalable (reprise E3) : droits non retirés, avoir du prix payé. À vérifier.'
       )
 WHERE "status" = 'REMBOURSEE' AND "refundDueAt" IS NULL;

ALTER TABLE "Transaction" ADD CONSTRAINT "transaction_rembourse_suppose_une_obligation"
  CHECK ("status" <> 'REMBOURSEE' OR "refundDueAt" IS NOT NULL);
