-- RG-15.2 — le pack entamé se rembourse au prorata des analyses restantes,
-- décision de la direction du 06/10/2026.
--
-- Jusqu'ici, tout remboursement rendait le montant payé : la somme due ne
-- se stockait pas, elle se lisait dans `amount`. Elle peut désormais être
-- inférieure, et elle doit survivre au recalcul : c'est elle qui part chez
-- le fournisseur, et c'est elle que l'avoir porte.
--
-- **En unités mineures** (le franc pour le XOF, le centime pour l'EUR),
-- comme les montants des factures : 12 € × 6 ÷ 10 = 7,20 €, que `amount`
-- — en unités entières de la grille — ne sait pas écrire.
--
-- Nulle sur les lignes existantes : nulle se lit « le montant payé », ce
-- qui était vrai de chacune d'elles. Aucune réécriture de l'historique.
ALTER TABLE "Transaction" ADD COLUMN "refundAmount" INTEGER;

-- On ne rend jamais plus qu'on n'a encaissé, et jamais rien : une somme
-- nulle n'ouvre pas d'obligation (le domaine le dit avant la base).
ALTER TABLE "Transaction"
  ADD CONSTRAINT "transaction_somme_rendue_bornee_par_le_paiement"
  CHECK (
    "refundAmount" IS NULL
    OR (
      "refundAmount" > 0
      AND "refundAmount" <= "amount" * (CASE WHEN "currency" = 'EUR' THEN 100 ELSE 1 END)
    )
  );

-- Une somme à rendre n'existe pas sans l'obligation qui la doit (K.C).
ALTER TABLE "Transaction"
  ADD CONSTRAINT "transaction_somme_rendue_suppose_une_obligation"
  CHECK ("refundAmount" IS NULL OR "refundDueAt" IS NOT NULL);
