-- Remboursement dû — K.C, tranché le 20/09/2026.
--
-- Une suppression de compte avant la limite d'annulation ouvre un
-- remboursement. Elle ne le fait pas : aucune API de remboursement n'est
-- branchée (I.C), et écrire `REMBOURSEE` à la décision annoncerait un
-- virement que personne n'a effectué. Deux colonnes, donc, et deux moments —
-- ce qui est dû, et ce qui est parti.

ALTER TABLE "Transaction"
  ADD COLUMN "refundDueAt" TIMESTAMP(3),
  ADD COLUMN "refundBasis" TEXT;

-- Une obligation dit toujours pourquoi. Un remboursement dû sans motif ne se
-- traite pas : l'opérateur qui l'ouvre en B-04 ne saurait pas s'il vient de
-- la règle d'annulation ou d'un geste, ni de qui.
ALTER TABLE "Transaction"
  ADD CONSTRAINT "transaction_remboursement_du_porte_son_motif"
  CHECK (("refundDueAt" IS NULL) = ("refundBasis" IS NULL));

-- On ne doit que ce qu'on a encaissé. La forme est celle de M.B, pour la
-- même raison : ouvrir une obligation sur une transaction jamais confirmée
-- ferait sortir de l'argent qui n'est jamais entré.
ALTER TABLE "Transaction"
  ADD CONSTRAINT "transaction_remboursement_du_suppose_un_encaissement"
  CHECK ("refundDueAt" IS NULL OR "status" IN ('CONFIRMEE', 'REMBOURSEE'));

-- L'obligation précède le remboursement, jamais l'inverse. Une date de
-- décision postérieure au virement décrirait une chronologie impossible, et
-- c'est le genre d'incohérence qui ne se voit qu'à l'audit, des mois après.
ALTER TABLE "Transaction"
  ADD CONSTRAINT "transaction_remboursement_du_avant_le_versement"
  CHECK ("refundDueAt" IS NULL OR "refundedAt" IS NULL OR "refundDueAt" <= "refundedAt");

-- La file des remboursements à traiter se lit par cette colonne : les plus
-- anciens d'abord, et ceux qui ne sont pas encore partis seulement.
CREATE INDEX "Transaction_refundDueAt_refundedAt_idx"
  ON "Transaction"("refundDueAt", "refundedAt");
