-- Le rail de remboursement sortant — arbitrage du 21/09/2026.
--
-- **Trois faits, et ils étaient deux.** K.C écrivait la décision de
-- rembourser (`refundDueAt`), M.B écrivait la confirmation que l'argent
-- est reparti (`refundedAt`, posé par la notification signée). Entre les
-- deux manquait la demande envoyée au fournisseur — si bien qu'une
-- obligation ouverte et une demande partie se lisaient pareil, et qu'une
-- tentative échouée ne laissait aucune trace.
--
-- Ce que ces colonnes ajoutent est **l'état de la demande**, jamais celui
-- de l'argent : seule la confirmation signée du fournisseur fait passer
-- une transaction à `REMBOURSEE` (INV-7), et rien ici ne s'y substitue.

ALTER TABLE "Transaction"
  -- Le fournisseur a accepté la demande. L'argent n'est pas reparti pour
  -- autant : c'est un accusé de réception, pas un virement.
  ADD COLUMN "refundRequestedAt" TIMESTAMP(3),
  -- La dernière tentative, réussie ou non. Une dette dont l'envoi échoue
  -- reste une dette, et il faut savoir depuis quand on essaie.
  ADD COLUMN "refundAttemptedAt" TIMESTAMP(3),
  ADD COLUMN "refundAttempts"    INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Transaction_refundRequestedAt_idx"
  ON "Transaction"("refundRequestedAt", "refundedAt");

-- ── Garde-fous ─────────────────────────────────────────────────────────────

-- On n'envoie que ce qu'on doit. Une demande sans obligation enverrait de
-- l'argent qu'aucune décision n'a engagé.
ALTER TABLE "Transaction"
  ADD CONSTRAINT "transaction_demande_suppose_une_obligation"
  CHECK ("refundRequestedAt" IS NULL OR "refundDueAt" IS NOT NULL);

-- Et une tentative aussi : on ne tente pas un envoi qu'on ne doit pas.
ALTER TABLE "Transaction"
  ADD CONSTRAINT "transaction_tentative_suppose_une_obligation"
  CHECK ("refundAttemptedAt" IS NULL OR "refundDueAt" IS NOT NULL);

-- La chronologie des trois faits : décidé, puis demandé, puis versé. Une
-- demande antérieure à la décision, ou une confirmation antérieure à la
-- demande, décrirait une histoire impossible — et c'est exactement le
-- genre d'incohérence qu'un rapprochement comptable révèle six mois plus
-- tard, quand plus personne ne sait laquelle des deux dates croire.
ALTER TABLE "Transaction"
  ADD CONSTRAINT "transaction_demande_apres_la_decision"
  CHECK ("refundRequestedAt" IS NULL OR "refundRequestedAt" >= "refundDueAt");

-- Le compteur de tentatives ne descend pas, et une tentative datée en
-- suppose au moins une.
ALTER TABLE "Transaction"
  ADD CONSTRAINT "transaction_tentatives_non_negatives"
  CHECK ("refundAttempts" >= 0);

ALTER TABLE "Transaction"
  ADD CONSTRAINT "transaction_tentative_datee_est_comptee"
  CHECK ("refundAttemptedAt" IS NULL OR "refundAttempts" > 0);

-- Le motif de retrait du quota, ajouté à l'énumération. **Rien ne
-- l'utilise ici**, et c'est obligatoire : PostgreSQL refuse qu'une valeur
-- d'énumération fraîchement ajoutée soit employée dans la transaction qui
-- l'ajoute (55P04, « unsafe use of new value of enum type »). La
-- contrainte qui s'en sert vit donc dans la migration suivante.
ALTER TYPE "CreditReason" ADD VALUE 'REMBOURSEMENT';
