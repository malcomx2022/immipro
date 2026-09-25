-- S.88 : le passage d'Essentiel à Dossier est une transaction distincte,
-- liée à l'achat Essentiel qu'elle complète.
ALTER TABLE "Transaction" ADD COLUMN "sourceTransactionId" TEXT;

ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_sourceTransactionId_fkey"
  FOREIGN KEY ("sourceTransactionId") REFERENCES "Transaction"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Une montée cite toujours son achat d'origine, et rien d'autre n'en cite.
ALTER TABLE "Transaction"
  ADD CONSTRAINT "transaction_montee_sourcee"
  CHECK (("packCode" = 'montee-dossier') = ("sourceTransactionId" IS NOT NULL));

-- Une seule montée ouverte par achat et par dossier. Une montée échouée
-- ou expirée ne compte plus : le candidat peut recommencer. Une montée
-- remboursée non plus : le supplément est rendu, le droit retiré.
CREATE UNIQUE INDEX "transaction_une_montee_par_achat"
  ON "Transaction"("sourceTransactionId", "applicationId")
  WHERE "sourceTransactionId" IS NOT NULL
    AND "status" IN ('INITIEE', 'EN_ATTENTE', 'CONFIRMEE');
