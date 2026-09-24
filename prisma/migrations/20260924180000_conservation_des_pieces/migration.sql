-- Arbitrage S.78 : la conservation des pièces selon l'état du dossier.
--
-- Avant lui, seules la clôture déclarée et l'abandon d'un brouillon
-- posaient une échéance de purge. Un dossier payé, soumis ou suspendu dont
-- le candidat ne revenait jamais gardait ses pièces d'identité sans terme.
--
-- `retentionUntil` porte la fin de conservation d'un dossier soumis, que
-- la confirmation du candidat prolonge. `suspendedAt` et
-- `statusBeforeSuspension` gardent la trace d'une suspension, qui survit à
-- la purge des pièces : c'est sur elle que la dette opérationnelle se
-- mesure.
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'CONSERVATION';

ALTER TABLE "Application"
  ADD COLUMN "retentionUntil" TIMESTAMP(3),
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "statusBeforeSuspension" "ApplicationStatus";

-- Les dossiers déjà soumis reçoivent leur échéance : douze mois après le
-- dépôt déclaré. L'arithmétique des intervalles de PostgreSQL ramène un 31
-- au dernier jour du mois d'arrivée, comme `decalerDeMois`. Le job annonce
-- ensuite la purge avec son préavis, même si l'échéance est déjà passée.
UPDATE "Application"
   SET "retentionUntil" = COALESCE("submittedAt", "updatedAt") + INTERVAL '12 months'
 WHERE "status" = 'SOUMIS';

-- Les dossiers déjà suspendus reçoivent leur date : celle de la plus
-- ancienne divergence critique qu'ils n'ont pas arbitrée, à défaut leur
-- dernière écriture. Le statut antérieur n'a jamais été noté : il reste
-- inconnu plutôt que deviné.
UPDATE "Application" a
   SET "suspendedAt" = COALESCE(
         (SELECT MIN(m."createdAt") FROM "RuleMigration" m
           WHERE m."applicationId" = a."id"
             AND m."impact" = 'CRITIQUE'
             AND m."decision" IS NULL),
         a."updatedAt")
 WHERE a."status" = 'SUSPENDU';

-- Un dossier suspendu porte sa date ; aucun autre n'en porte.
ALTER TABLE "Application"
  ADD CONSTRAINT "application_suspension_datee"
  CHECK (("status" = 'SUSPENDU') = ("suspendedAt" IS NOT NULL));
