-- Le remboursement arrive — M.B.
--
-- `REMBOURSEE` était au schéma, le reçu savait le présenter, la table du
-- cycle autorisait `CONFIRMEE → REMBOURSEE`, et les deux rails traduisaient
-- déjà leur événement de remboursement. Rien n'écrivait pourtant cet état,
-- et la cause tenait dans une colonne : `providerTxId` servait à la fois
-- d'identifiant de la transaction chez le fournisseur et de clé
-- d'idempotence du webhook.
--
-- Chez FedaPay, le remboursement porte le même identifiant d'entité que la
-- confirmation : la notification se lisait donc comme un rejeu et était
-- jetée en silence. Chez Stripe, l'événement porte l'identifiant de la
-- charge, différent de celui de la session : le remboursement s'écrivait,
-- mais en écrasant la référence opérateur que le reçu cite — une pièce
-- comptable dont la référence change après coup.
--
-- La clé d'idempotence descend donc sur la notification, qui est ce qui se
-- rejoue. `providerTxId` redevient ce que son nom dit, posé une fois.

CREATE TABLE "PaymentEvent" (
  "id"              TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "transactionId"   TEXT NOT NULL,
  "announced"       "TransactionStatus" NOT NULL,
  "receivedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentEvent_providerEventId_key" ON "PaymentEvent"("providerEventId");
CREATE INDEX "PaymentEvent_transactionId_receivedAt_idx" ON "PaymentEvent"("transactionId", "receivedAt");

ALTER TABLE "PaymentEvent"
  ADD CONSTRAINT "PaymentEvent_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Transaction" ADD COLUMN "refundedAt" TIMESTAMP(3);

-- ── Garde-fous ─────────────────────────────────────────────────────────────
-- Même raison que les migrations précédentes : une règle écrite dans un
-- service ne protège que ce service.

-- Un reçu est une pièce comptable. « Ce paiement a été remboursé » sans date
-- n'en est pas une, et une date de remboursement sur un paiement encore
-- acquis se lirait comme une somme rendue qui ne l'a pas été. Les deux vont
-- ensemble, dans les deux sens.
ALTER TABLE "Transaction"
  ADD CONSTRAINT "transaction_remboursement_porte_sa_date"
  CHECK (("status" = 'REMBOURSEE') = ("refundedAt" IS NOT NULL));

-- On ne rend pas une somme qui n'a jamais été encaissée. La table du cycle
-- le dit déjà — seule `CONFIRMEE` mène à `REMBOURSEE` — mais elle vit dans
-- un module, et un remboursement écrit à la main contournerait le module.
ALTER TABLE "Transaction"
  ADD CONSTRAINT "transaction_remboursement_suppose_un_encaissement"
  CHECK ("status" <> 'REMBOURSEE' OR "confirmedAt" IS NOT NULL);
