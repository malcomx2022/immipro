-- S.101 — Les textes juridiques : variables saisies dans le back-office,
-- et versions publiées après validation tracée.

-- CreateEnum
CREATE TYPE "LegalPublicationKind" AS ENUM ('VALIDATION', 'MISE_A_JOUR_VARIABLES');

-- CreateTable
CREATE TABLE "LegalVariable" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalVariable_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "LegalPublication" (
    "id" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "rang" INTEGER NOT NULL,
    "kind" "LegalPublicationKind" NOT NULL,
    "templateHash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "standfirst" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "variables" JSONB NOT NULL,
    "reviewer" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "publishedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalPublication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LegalPublication_page_rang_key" ON "LegalPublication"("page", "rang");

-- CreateIndex
CREATE INDEX "LegalPublication_page_publishedAt_idx" ON "LegalPublication"("page", "publishedAt");

-- Une page connue, ou rien : une faute de frappe ne crée pas une page fantôme.
ALTER TABLE "LegalPublication" ADD CONSTRAINT "legal_publication_page_connue"
  CHECK ("page" IN ('mentions-legales', 'conditions', 'donnees-personnelles', 'contact'));

-- Un relecteur nommé : la validation sans relecteur n'existe pas (S.101).
ALTER TABLE "LegalPublication" ADD CONSTRAINT "legal_publication_relecteur_nomme"
  CHECK (length(trim("reviewer")) >= 5);
