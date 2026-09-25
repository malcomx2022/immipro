-- S.90 : le candidat signale une date de dépôt erronée ; un opérateur
-- l'applique (correction auditée de S.89) ou la refuse, avec une réponse.
CREATE TYPE "DepositCorrectionStatus" AS ENUM ('EN_ATTENTE', 'APPLIQUEE', 'REFUSEE');

CREATE TABLE "DepositCorrectionRequest" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "requestedDate" DATE NOT NULL,
    "explanation" TEXT NOT NULL,
    "status" "DepositCorrectionStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "answer" TEXT,

    CONSTRAINT "DepositCorrectionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DepositCorrectionRequest_status_createdAt_idx"
  ON "DepositCorrectionRequest"("status", "createdAt");

ALTER TABLE "DepositCorrectionRequest"
  ADD CONSTRAINT "DepositCorrectionRequest_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "Application"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Une seule demande en attente par dossier.
CREATE UNIQUE INDEX "correction_de_depot_une_en_attente"
  ON "DepositCorrectionRequest"("applicationId")
  WHERE "status" = 'EN_ATTENTE';

-- Une demande tranchée dit quand et par qui ; une demande en attente, non.
-- Un refus porte sa réponse au candidat.
ALTER TABLE "DepositCorrectionRequest"
  ADD CONSTRAINT "correction_de_depot_tranchee"
  CHECK (("status" = 'EN_ATTENTE') = ("resolvedAt" IS NULL AND "resolvedBy" IS NULL)
     AND ("status" <> 'REFUSEE' OR "answer" IS NOT NULL));
