-- S.175 / REV11-L4 : extension seule, aucun grand livre ou avis réécrit.
CREATE TYPE "EtatReservationRelecture" AS ENUM ('EN_COURS', 'RELUE', 'SANS_AVIS', 'EXPIREE', 'OBSOLETE', 'INTERROMPUE');
CREATE TABLE "RelectureReservation" (
  "id" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "creditId" TEXT NOT NULL,
  "state" "EtatReservationRelecture" NOT NULL DEFAULT 'EN_COURS',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "callStartedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "RelectureReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "relecture_issue_et_date" CHECK (("state" = 'EN_COURS') = ("finishedAt" IS NULL)),
  CONSTRAINT "relecture_echeance" CHECK ("expiresAt" > "createdAt")
);
CREATE UNIQUE INDEX "RelectureReservation_creditId_key" ON "RelectureReservation"("creditId");
CREATE INDEX "RelectureReservation_versionId_idx" ON "RelectureReservation"("versionId");
CREATE INDEX "RelectureReservation_state_expiresAt_idx" ON "RelectureReservation"("state", "expiresAt");
CREATE UNIQUE INDEX "relecture_une_en_cours_par_version" ON "RelectureReservation"("versionId") WHERE "state" = 'EN_COURS';
ALTER TABLE "RelectureReservation" ADD CONSTRAINT "RelectureReservation_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RelectureReservation" ADD CONSTRAINT "RelectureReservation_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "AnalysisCredit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
