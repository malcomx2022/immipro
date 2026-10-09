-- La date de la prestation sur chaque pièce — revue du 07/10/2026, F5
-- (D-14, option a).
--
-- Le numéro et l'exercice restent ceux de l'émission : la suite reste
-- chronologique et continue. Mais une facture émise le 02/01 par le filet
-- de la réconciliation, pour une vente du 31/12, ne portait aucune date de
-- la vente. `performedAt` la porte : la confirmation du paiement pour une
-- facture, celle du remboursement pour un avoir.

ALTER TABLE "Invoice" ADD COLUMN "performedAt" TIMESTAMP(3);

-- Reprise des pièces déjà émises. Le déclencheur `facture_immuable` ne
-- connaît pas encore la colonne : cette mise à jour passe, et c'est la
-- seule qui le pourra. Une vente sans date de confirmation — qu'aucune
-- transition ne produit — prend la date d'émission, ce que la pièce
-- portait jusqu'ici.
UPDATE "Invoice" i
   SET "performedAt" = COALESCE(
         CASE i."kind" WHEN 'FACTURE' THEN t."confirmedAt" ELSE t."refundedAt" END,
         i."issuedAt")
  FROM "Transaction" t
 WHERE t."id" = i."transactionId";

ALTER TABLE "Invoice" ALTER COLUMN "performedAt" SET NOT NULL;

-- Figée comme le reste de la pièce : la colonne entre dans le contenu que
-- le déclencheur compare.
CREATE OR REPLACE FUNCTION "facture_immuable"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'facture_immuable : la pièce % ne se supprime pas ; elle s''annule par un avoir ou une mention d''annulation.', OLD."number";
  END IF;
  IF (NEW."number", NEW."kind", NEW."series", NEW."fiscalYear", NEW."rank", NEW."transactionId",
      NEW."originId", NEW."issuedAt", NEW."performedAt", NEW."emitter", NEW."clientName", NEW."clientAddress",
      NEW."clientQuality", NEW."designation", NEW."currency", NEW."amountIncl", NEW."amountExcl",
      NEW."vatAmount", NEW."vatRateBp", NEW."vatNote", NEW."amountInWords", NEW."paymentMethod")
     IS DISTINCT FROM
     (OLD."number", OLD."kind", OLD."series", OLD."fiscalYear", OLD."rank", OLD."transactionId",
      OLD."originId", OLD."issuedAt", OLD."performedAt", OLD."emitter", OLD."clientName", OLD."clientAddress",
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
