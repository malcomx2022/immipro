-- Suppression de compte (RG-10.4) et affiliation partenaires (WF-13).

-- ── RG-10.4 ────────────────────────────────────────────────────────────────
-- Deux dates sur le compte, et non une. Entre la demande et l'anonymisation
-- il y a la purge des pièces, qui dépend d'un stockage objet : l'état
-- intermédiaire existe dans les faits, autant le nommer. C'est celui que
-- B-03 affiche sous « Suppression demandée » et que le job reprend.
ALTER TABLE "User"
  ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt"           TIMESTAMP(3);

CREATE INDEX "User_deletionRequestedAt_deletedAt_idx"
  ON "User"("deletionRequestedAt", "deletedAt");

-- ── Un consentement par autorisation ───────────────────────────────────────
-- Deux autorisations de A-05 partageaient `MARKETING`, deux autres
-- `PIECES_IDENTITE`. L'écran lisait la dernière ligne de la catégorie :
-- retirer l'une affichait l'autre comme retirée. Une preuve de consentement
-- qui répond pour une autre n'en est pas une.
CREATE TYPE "ConsentKind_new" AS ENUM (
  'CGU',
  'PIECES_IDENTITE',
  'PIECES_FINANCIERES',
  'ALERTES_REGLES',
  'PARTENAIRES',
  'MESURE_AUDIENCE'
);

ALTER TABLE "Consent"
  ALTER COLUMN "kind" TYPE "ConsentKind_new"
  USING (
    CASE "kind"::text
      WHEN 'CONFIDENTIALITE' THEN 'ALERTES_REGLES'
      WHEN 'MARKETING'       THEN 'PARTENAIRES'
      ELSE "kind"::text
    END
  )::"ConsentKind_new";

-- Une ligne `MARKETING` couvrait deux autorisations : on ne sait plus
-- laquelle elle prouve. Elle est donc retirée plutôt que devinée — la trace
-- reste, l'autorisation ne vaut plus. Redemander vaut mieux que supposer.
UPDATE "Consent"
   SET "revokedAt" = now()
 WHERE "kind" = 'PARTENAIRES'
   AND "revokedAt" IS NULL;

DROP TYPE "ConsentKind";
ALTER TYPE "ConsentKind_new" RENAME TO "ConsentKind";

-- ── WF-13 ──────────────────────────────────────────────────────────────────
CREATE TYPE "PartnerKind" AS ENUM (
  'ASSURANCE_SANTE',
  'LOGEMENT',
  'EQUIVALENCE_DIPLOME',
  'TRANSFERT_FONDS',
  'CONSULTANT'
);

CREATE TYPE "ReferralStatus" AS ENUM (
  'PROPOSEE',
  'REDIRIGEE',
  'ABOUTIE',
  'SANS_SUITE',
  'DECLINEE'
);

CREATE TABLE "Partner" (
    "id"            TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "kind"          "PartnerKind" NOT NULL,
    "city"          TEXT,
    "qualification" TEXT,
    "url"           TEXT NOT NULL,
    "commissionBps" INTEGER NOT NULL,
    "active"        BOOLEAN NOT NULL DEFAULT true,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartnerActivation" (
    "id"          TEXT NOT NULL,
    "partnerId"   TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "basis"       TEXT NOT NULL,
    "verifiedAt"  DATE NOT NULL,
    "verifiedBy"  TEXT NOT NULL,
    "revokedAt"   TIMESTAMP(3),

    CONSTRAINT "PartnerActivation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartnerReferral" (
    "id"                 TEXT NOT NULL,
    "partnerId"          TEXT NOT NULL,
    "applicationId"      TEXT NOT NULL,
    "step"               TEXT NOT NULL,
    "motive"             TEXT NOT NULL,
    "status"             "ReferralStatus" NOT NULL DEFAULT 'PROPOSEE',
    "commissionBps"      INTEGER NOT NULL,
    "proposedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redirectedAt"       TIMESTAMP(3),
    "settledAt"          TIMESTAMP(3),
    "commissionAmount"   INTEGER,
    "commissionCurrency" CHAR(3),

    CONSTRAINT "PartnerReferral_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartnerActivation_partnerId_countryCode_key"
  ON "PartnerActivation"("partnerId", "countryCode");
CREATE INDEX "PartnerActivation_countryCode_revokedAt_idx"
  ON "PartnerActivation"("countryCode", "revokedAt");
CREATE UNIQUE INDEX "PartnerReferral_applicationId_partnerId_step_key"
  ON "PartnerReferral"("applicationId", "partnerId", "step");
CREATE INDEX "PartnerReferral_applicationId_status_idx"
  ON "PartnerReferral"("applicationId", "status");
CREATE INDEX "PartnerReferral_partnerId_status_proposedAt_idx"
  ON "PartnerReferral"("partnerId", "status", "proposedAt");

ALTER TABLE "PartnerActivation" ADD CONSTRAINT "PartnerActivation_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerReferral" ADD CONSTRAINT "PartnerReferral_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerReferral" ADD CONSTRAINT "PartnerReferral_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
