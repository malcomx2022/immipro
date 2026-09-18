-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "VisaCategory" AS ENUM ('ETUDES', 'EMPLOI', 'FAMILLE', 'RECHERCHE_EMPLOI');

-- CreateEnum
CREATE TYPE "SourceTier" AS ENUM ('OFFICIEL', 'INSTITUTIONNEL', 'SECONDAIRE');

-- CreateEnum
CREATE TYPE "RuleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ConsentKind" AS ENUM ('CGU', 'CONFIDENTIALITE', 'PIECES_IDENTITE', 'MARKETING');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('BROUILLON', 'ACTIF', 'PRET', 'SOUMIS', 'SUSPENDU', 'ISSUE_DECLAREE', 'ABANDONNE', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "Issue" AS ENUM ('ACCEPTE', 'REFUSE', 'SANS_REPONSE', 'RENONCE');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('ATTENDUE', 'EN_ANALYSE', 'CONFORME', 'A_CORRIGER', 'ILLISIBLE', 'HORS_SUJET', 'EXPIREE', 'PURGEE');

-- CreateEnum
CREATE TYPE "DocumentRemedy" AS ENUM ('TELEVERSER', 'REMPLACER', 'REDIGER', 'DEMARCHE');

-- CreateEnum
CREATE TYPE "DocumentFamily" AS ENUM ('OBLIGATOIRE', 'COMPLEMENTAIRE');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('FEDAPAY', 'STRIPE');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('INITIEE', 'EN_ATTENTE', 'CONFIRMEE', 'ECHOUEE', 'EXPIREE', 'REMBOURSEE');

-- CreateEnum
CREATE TYPE "AnalysisVerdict" AS ENUM ('CONFORME', 'A_CORRIGER', 'ILLISIBLE', 'HORS_SUJET');

-- CreateEnum
CREATE TYPE "ReviewReason" AS ENUM ('SIGNALE_PAR_LE_CANDIDAT', 'ECHEC_TECHNIQUE', 'DOCUMENT_NON_RECONNU', 'NETTETE_INSUFFISANTE');

-- CreateEnum
CREATE TYPE "CreditReason" AS ENUM ('ACHAT_PACK', 'RECHARGE', 'ANALYSE', 'ANALYSE_RENDUE', 'GESTE_COMMERCIAL');

-- CreateEnum
CREATE TYPE "CritiqueKind" AS ENUM ('INCOHERENCE', 'A_RENFORCER', 'FORME');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('REGLEMENTATION', 'ECHEANCE', 'ANALYSE', 'PAIEMENT', 'VEILLE');

-- CreateEnum
CREATE TYPE "RuleImpact" AS ENUM ('MINEUR', 'MAJEUR', 'CRITIQUE');

-- CreateEnum
CREATE TYPE "MigrationDecision" AS ENUM ('MIGRER', 'CONSERVER');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('RESERVE', 'HONORE', 'ANNULE', 'REPORTE', 'ABSENT');

-- CreateTable
CREATE TABLE "VisaRule" (
    "id" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "visaType" TEXT NOT NULL,
    "category" "VisaCategory" NOT NULL,
    "version" INTEGER NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "rules" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "sourceUrl" TEXT NOT NULL,
    "sourceTier" "SourceTier" NOT NULL,
    "verifiedAt" DATE NOT NULL,
    "verifiedBy" TEXT NOT NULL,
    "nextReviewAt" DATE NOT NULL,
    "status" "RuleStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisaRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "countryCode" CHAR(2),
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "emailVerified" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "objectif" TEXT,
    "highestDegree" TEXT,
    "fieldOfStudy" TEXT,
    "yearsExperience" INTEGER,
    "languages" JSONB,
    "budgetTotal" INTEGER,
    "budgetCurrency" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ConsentKind" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "version" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "visaRuleId" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'BROUILLON',
    "internalScore" INTEGER NOT NULL DEFAULT 0,
    "readyAt" TIMESTAMP(3),
    "targetDate" DATE,
    "submittedAt" TIMESTAMP(3),
    "issue" "Issue",
    "issueReason" TEXT,
    "purgeDueAt" TIMESTAMP(3),
    "purgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "family" "DocumentFamily" NOT NULL DEFAULT 'OBLIGATOIRE',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "remedy" "DocumentRemedy" NOT NULL DEFAULT 'TELEVERSER',
    "status" "DocumentStatus" NOT NULL DEFAULT 'ATTENDUE',
    "extracted" JSONB,
    "feedback" TEXT,
    "finding" TEXT,
    "hint" TEXT,
    "validityMonths" INTEGER,
    "expiresAt" DATE,
    "analyzedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deadline" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dueAt" DATE NOT NULL,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "Deadline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT,
    "packCode" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "providerTxId" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'INITIEE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "reconciledAt" TIMESTAMP(3),
    "discrepancy" TEXT,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT,
    "operation" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costMicros" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "objectKey" TEXT,
    "checksum" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "body" TEXT,
    "wordCount" INTEGER,
    "changeNote" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purgedAt" TIMESTAMP(3),

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentAnalysis" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "verdict" "AnalysisVerdict" NOT NULL,
    "fields" JSONB,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "engineLog" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "creditConsumed" BOOLEAN NOT NULL DEFAULT true,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualReview" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "reason" "ReviewReason" NOT NULL,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewerId" TEXT,
    "decision" "AnalysisVerdict",
    "message" TEXT,
    "creditRefunded" BOOLEAN NOT NULL DEFAULT false,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ManualReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisCredit" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "CreditReason" NOT NULL,
    "transactionId" TEXT,
    "analysisId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewAnswer" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "section" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CritiqueFinding" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "kind" "CritiqueKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "gaps" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CritiqueFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "dueAt" DATE,
    "migrationId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleMigration" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fromRuleId" TEXT NOT NULL,
    "toRuleId" TEXT NOT NULL,
    "impact" "RuleImpact" NOT NULL,
    "diff" JSONB NOT NULL,
    "decision" "MigrationDecision",
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleMigration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceCheck" (
    "id" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reachable" BOOLEAN NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "error" TEXT,
    "difference" TEXT,

    CONSTRAINT "SourceCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consultant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "firm" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "qualification" TEXT NOT NULL,
    "languages" JSONB NOT NULL,
    "responseHours" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consultant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Accreditation" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "title" TEXT NOT NULL,
    "verifiedAt" DATE NOT NULL,
    "verifiedBy" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Accreditation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultantAccess" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ConsultantAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'RESERVE',
    "freeUntil" TIMESTAMP(3) NOT NULL,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisaRule_countryCode_category_status_idx" ON "VisaRule"("countryCode", "category", "status");

-- CreateIndex
CREATE INDEX "VisaRule_status_nextReviewAt_idx" ON "VisaRule"("status", "nextReviewAt");

-- CreateIndex
CREATE UNIQUE INDEX "VisaRule_countryCode_visaType_version_key" ON "VisaRule"("countryCode", "visaType", "version");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE INDEX "Consent_userId_kind_idx" ON "Consent"("userId", "kind");

-- CreateIndex
CREATE INDEX "Application_userId_status_idx" ON "Application"("userId", "status");

-- CreateIndex
CREATE INDEX "Application_visaRuleId_idx" ON "Application"("visaRuleId");

-- CreateIndex
CREATE INDEX "Application_status_purgeDueAt_idx" ON "Application"("status", "purgeDueAt");

-- CreateIndex
CREATE INDEX "Document_status_expiresAt_idx" ON "Document"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Document_applicationId_family_status_idx" ON "Document"("applicationId", "family", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Document_applicationId_code_key" ON "Document"("applicationId", "code");

-- CreateIndex
CREATE INDEX "Deadline_applicationId_dueAt_idx" ON "Deadline"("applicationId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_reference_key" ON "Transaction"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_providerTxId_key" ON "Transaction"("providerTxId");

-- CreateIndex
CREATE INDEX "Transaction_status_createdAt_idx" ON "Transaction"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_reconciledAt_createdAt_idx" ON "Transaction"("reconciledAt", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_applicationId_createdAt_idx" ON "AiUsage"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_target_createdAt_idx" ON "AuditLog"("target", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentVersion_documentId_uploadedAt_idx" ON "DocumentVersion"("documentId", "uploadedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_rank_key" ON "DocumentVersion"("documentId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_checksum_key" ON "DocumentVersion"("documentId", "checksum");

-- CreateIndex
CREATE INDEX "DocumentAnalysis_verdict_analyzedAt_idx" ON "DocumentAnalysis"("verdict", "analyzedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ManualReview_analysisId_key" ON "ManualReview"("analysisId");

-- CreateIndex
CREATE INDEX "ManualReview_decidedAt_queuedAt_idx" ON "ManualReview"("decidedAt", "queuedAt");

-- CreateIndex
CREATE INDEX "AnalysisCredit_applicationId_createdAt_idx" ON "AnalysisCredit"("applicationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewAnswer_documentId_rank_key" ON "InterviewAnswer"("documentId", "rank");

-- CreateIndex
CREATE INDEX "CritiqueFinding_versionId_kind_idx" ON "CritiqueFinding"("versionId", "kind");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "RuleMigration_decision_createdAt_idx" ON "RuleMigration"("decision", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RuleMigration_applicationId_toRuleId_key" ON "RuleMigration"("applicationId", "toRuleId");

-- CreateIndex
CREATE INDEX "SourceCheck_checkedAt_idx" ON "SourceCheck"("checkedAt");

-- CreateIndex
CREATE INDEX "SourceCheck_sourceUrl_checkedAt_idx" ON "SourceCheck"("sourceUrl", "checkedAt");

-- CreateIndex
CREATE INDEX "Accreditation_countryCode_revokedAt_idx" ON "Accreditation"("countryCode", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Accreditation_consultantId_countryCode_key" ON "Accreditation"("consultantId", "countryCode");

-- CreateIndex
CREATE INDEX "ConsultantAccess_applicationId_revokedAt_idx" ON "ConsultantAccess"("applicationId", "revokedAt");

-- CreateIndex
CREATE INDEX "ConsultantAccess_consultantId_expiresAt_idx" ON "ConsultantAccess"("consultantId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_reference_key" ON "Appointment"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_transactionId_key" ON "Appointment"("transactionId");

-- CreateIndex
CREATE INDEX "Appointment_applicationId_startsAt_idx" ON "Appointment"("applicationId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_consultantId_startsAt_key" ON "Appointment"("consultantId", "startsAt");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_visaRuleId_fkey" FOREIGN KEY ("visaRuleId") REFERENCES "VisaRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAnalysis" ADD CONSTRAINT "DocumentAnalysis_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualReview" ADD CONSTRAINT "ManualReview_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "DocumentAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisCredit" ADD CONSTRAINT "AnalysisCredit_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisCredit" ADD CONSTRAINT "AnalysisCredit_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewAnswer" ADD CONSTRAINT "InterviewAnswer_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CritiqueFinding" ADD CONSTRAINT "CritiqueFinding_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleMigration" ADD CONSTRAINT "RuleMigration_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleMigration" ADD CONSTRAINT "RuleMigration_fromRuleId_fkey" FOREIGN KEY ("fromRuleId") REFERENCES "VisaRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleMigration" ADD CONSTRAINT "RuleMigration_toRuleId_fkey" FOREIGN KEY ("toRuleId") REFERENCES "VisaRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accreditation" ADD CONSTRAINT "Accreditation_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantAccess" ADD CONSTRAINT "ConsultantAccess_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantAccess" ADD CONSTRAINT "ConsultantAccess_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

