-- Arbitrage S.91 — la référence du remboursement chez le fournisseur.
-- Posée par la déclaration d'un remboursement FedaPay fait au tableau de
-- bord. Unique : un même remboursement ne solde pas deux dettes.
ALTER TABLE "Transaction" ADD COLUMN "refundProviderRef" TEXT;

CREATE UNIQUE INDEX "Transaction_refundProviderRef_key" ON "Transaction"("refundProviderRef");

-- Pas de référence sans demande déclarée : la colonne accompagne
-- `refundRequestedAt`, elle ne le remplace pas.
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_reference_de_remboursement_datee"
  CHECK ("refundProviderRef" IS NULL OR "refundRequestedAt" IS NOT NULL);
