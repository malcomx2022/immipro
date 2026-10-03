-- Avis juridique L.A, 03/10/2026 : la pondération de la complétude n'est
-- pas exposée, à condition que le candidat puisse demander une relecture
-- humaine de son évaluation. Un relecteur répond, la réponse part dans
-- les alertes du candidat.
CREATE TYPE "CompletenessReviewStatus" AS ENUM ('EN_ATTENTE', 'TRAITEE');

CREATE TABLE "CompletenessReviewRequest" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "status" "CompletenessReviewStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "answer" TEXT,

    CONSTRAINT "CompletenessReviewRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CompletenessReviewRequest_status_createdAt_idx"
  ON "CompletenessReviewRequest"("status", "createdAt");

ALTER TABLE "CompletenessReviewRequest"
  ADD CONSTRAINT "CompletenessReviewRequest_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "Application"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Une seule demande en attente par dossier.
CREATE UNIQUE INDEX "relecture_completude_une_en_attente"
  ON "CompletenessReviewRequest"("applicationId")
  WHERE "status" = 'EN_ATTENTE';

-- Une demande traitée dit quand, par qui, et ce qui a été répondu ; une
-- demande en attente, rien de tout cela.
ALTER TABLE "CompletenessReviewRequest"
  ADD CONSTRAINT "relecture_completude_traitee"
  CHECK (("status" = 'EN_ATTENTE') = ("resolvedAt" IS NULL AND "resolvedBy" IS NULL AND "answer" IS NULL));
