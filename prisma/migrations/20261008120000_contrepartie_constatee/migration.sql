-- La contrepartie constatée — RG-05.4, INV-7, revue du 07/10/2026, F6.
--
-- Le filet de la réconciliation lisait les deux cents plus anciennes ventes
-- confirmées, sans filtre : au-delà de deux cents ventes, un crédit
-- interrompu récent n'était jamais rattrapé. Et un achat sans contrepartie
-- ouvrable se disait « achevé » à chaque passe. La colonne constate la
-- contrepartie une fois ; le filet ne relit que les ventes qui ne la
-- portent pas.

ALTER TABLE "Transaction" ADD COLUMN "creditedAt" TIMESTAMP(3);

-- Reprise : les ventes dont la contrepartie existe déjà en base. Les autres
-- ventes confirmées restent nulles ; le filet les examine à sa prochaine
-- passe, et les constate ou les signale.
UPDATE "Transaction" t
   SET "creditedAt" = t."confirmedAt"
 WHERE t."confirmedAt" IS NOT NULL
   AND (
     t."status" = 'REMBOURSEE'
     OR EXISTS (SELECT 1 FROM "AnalysisCredit" c WHERE c."transactionId" = t."id" AND c."delta" > 0)
     OR EXISTS (SELECT 1 FROM "Appointment" a WHERE a."transactionId" = t."id" AND a."status" <> 'TENU')
   );

-- Une contrepartie suppose un encaissement.
ALTER TABLE "Transaction" ADD CONSTRAINT "transaction_contrepartie_apres_confirmation"
  CHECK ("creditedAt" IS NULL OR "confirmedAt" IS NOT NULL);

CREATE INDEX "Transaction_status_creditedAt_idx" ON "Transaction"("status", "creditedAt");
