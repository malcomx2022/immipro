-- Avis comptable M.C, 04/10/2026 : chaque vente donne lieu à une facture,
-- chaque remboursement à un avoir. Numérotation continue par exercice,
-- pièces figées, jamais supprimées, conservées dix ans.
CREATE TYPE "InvoiceKind" AS ENUM ('FACTURE', 'AVOIR');
CREATE TYPE "InvoiceSeries" AS ENUM ('REELLE', 'ESSAI');

ALTER TABLE "User" ADD COLUMN "billingName" TEXT;
ALTER TABLE "User" ADD COLUMN "billingAddress" TEXT;

CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "kind" "InvoiceKind" NOT NULL,
    "series" "InvoiceSeries" NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "transactionId" TEXT NOT NULL,
    "originId" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emitter" JSONB,
    "clientName" TEXT,
    "clientAddress" TEXT,
    "clientQuality" TEXT NOT NULL DEFAULT 'Particulier',
    "designation" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "amountIncl" INTEGER NOT NULL,
    "amountExcl" INTEGER NOT NULL,
    "vatAmount" INTEGER NOT NULL,
    "vatRateBp" INTEGER,
    "vatNote" TEXT NOT NULL,
    "amountInWords" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "certificationCode" TEXT,
    "certifiedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");
CREATE UNIQUE INDEX "Invoice_originId_key" ON "Invoice"("originId");
CREATE UNIQUE INDEX "Invoice_transactionId_kind_key" ON "Invoice"("transactionId", "kind");
CREATE UNIQUE INDEX "Invoice_series_kind_fiscalYear_rank_key" ON "Invoice"("series", "kind", "fiscalYear", "rank");
CREATE INDEX "Invoice_issuedAt_idx" ON "Invoice"("issuedAt");

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_originId_fkey"
  FOREIGN KEY ("originId") REFERENCES "Invoice"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InvoiceSequence" (
    "series" "InvoiceSeries" NOT NULL,
    "kind" "InvoiceKind" NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "last" INTEGER NOT NULL,

    CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY ("series", "kind", "fiscalYear")
);

-- Un avoir cite la facture qu'il annule ; une facture ne cite rien.
ALTER TABLE "Invoice"
  ADD CONSTRAINT "facture_avoir_a_une_origine"
  CHECK (("kind" = 'AVOIR') = ("originId" IS NOT NULL));

-- Le hors-taxes et la TVA font le total, et rien n'est négatif : un avoir
-- se dit par son genre, pas par un signe.
ALTER TABLE "Invoice"
  ADD CONSTRAINT "facture_montants_coherents"
  CHECK ("amountIncl" = "amountExcl" + "vatAmount" AND "amountExcl" >= 0 AND "vatAmount" >= 0 AND "rank" >= 1);

-- Une pièce réelle porte toujours son émetteur et son client.
ALTER TABLE "Invoice"
  ADD CONSTRAINT "facture_reelle_complete"
  CHECK ("series" = 'ESSAI' OR ("emitter" IS NOT NULL AND "clientName" IS NOT NULL AND "clientAddress" IS NOT NULL));

-- Le code de certification et sa date vont ensemble ; l'annulation et son
-- motif aussi.
ALTER TABLE "Invoice"
  ADD CONSTRAINT "facture_certification_datee"
  CHECK (("certificationCode" IS NULL) = ("certifiedAt" IS NULL));
ALTER TABLE "Invoice"
  ADD CONSTRAINT "facture_annulation_motivee"
  CHECK (("cancelledAt" IS NULL) = ("cancelReason" IS NULL));

-- Une pièce émise ne se supprime pas et ne se réécrit pas. Seules la
-- certification (posée une fois) et l'annulation tracée (posée une fois)
-- s'y ajoutent.
CREATE FUNCTION "facture_immuable"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'facture_immuable : la pièce % ne se supprime pas ; elle s''annule par un avoir ou une mention d''annulation.', OLD."number";
  END IF;
  IF (NEW."number", NEW."kind", NEW."series", NEW."fiscalYear", NEW."rank", NEW."transactionId",
      NEW."originId", NEW."issuedAt", NEW."emitter", NEW."clientName", NEW."clientAddress",
      NEW."clientQuality", NEW."designation", NEW."currency", NEW."amountIncl", NEW."amountExcl",
      NEW."vatAmount", NEW."vatRateBp", NEW."vatNote", NEW."amountInWords", NEW."paymentMethod")
     IS DISTINCT FROM
     (OLD."number", OLD."kind", OLD."series", OLD."fiscalYear", OLD."rank", OLD."transactionId",
      OLD."originId", OLD."issuedAt", OLD."emitter", OLD."clientName", OLD."clientAddress",
      OLD."clientQuality", OLD."designation", OLD."currency", OLD."amountIncl", OLD."amountExcl",
      OLD."vatAmount", OLD."vatRateBp", OLD."vatNote", OLD."amountInWords", OLD."paymentMethod") THEN
    RAISE EXCEPTION 'facture_immuable : le contenu de la pièce % est figé à l''émission.', OLD."number";
  END IF;
  IF OLD."certificationCode" IS NOT NULL AND NEW."certificationCode" IS DISTINCT FROM OLD."certificationCode" THEN
    RAISE EXCEPTION 'facture_immuable : la certification de la pièce % est déjà posée.', OLD."number";
  END IF;
  IF OLD."cancelledAt" IS NOT NULL AND (NEW."cancelledAt", NEW."cancelReason") IS DISTINCT FROM (OLD."cancelledAt", OLD."cancelReason") THEN
    RAISE EXCEPTION 'facture_immuable : l''annulation de la pièce % est déjà posée.', OLD."number";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "facture_immuable"
  BEFORE UPDATE OR DELETE ON "Invoice"
  FOR EACH ROW EXECUTE FUNCTION "facture_immuable"();
