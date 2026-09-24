-- S.87 : les rappels d'échéance se règlent, et ne partent qu'une fois.
--
-- Les préférences vivent sur le compte. Les valeurs par défaut sont celles
-- que tout le monde avait jusqu'ici — rappels actifs, email, sept jours —,
-- avec le fuseau d'affichage : aucun candidat ne voit son rappel changer
-- tant qu'il n'a rien réglé.
ALTER TABLE "User"
  ADD COLUMN "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "reminderEmail" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "reminderTimeZone" TEXT NOT NULL DEFAULT 'Africa/Porto-Novo',
  ADD COLUMN "reminderLeadDays" INTEGER NOT NULL DEFAULT 7;

-- Trois délais d'alerte, et pas un autre : sept est RG-09.2.
ALTER TABLE "User"
  ADD CONSTRAINT "user_delai_de_rappel"
  CHECK ("reminderLeadDays" IN (3, 7, 14));

CREATE TYPE "NotificationEmailStatus" AS ENUM ('EN_ATTENTE', 'ENVOYE', 'NON_ENVOYE');

ALTER TABLE "Notification"
  ADD COLUMN "dedupKey" TEXT,
  ADD COLUMN "emailStatus" "NotificationEmailStatus",
  ADD COLUMN "emailAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "emailAttemptAt" TIMESTAMP(3),
  ADD COLUMN "emailSentAt" TIMESTAMP(3);

-- La clé qui empêche deux rappels le même jour, quelle que soit la façon
-- dont la passe a été lancée deux fois.
CREATE UNIQUE INDEX "Notification_dedupKey_key" ON "Notification"("dedupKey");
CREATE INDEX "Notification_emailStatus_idx" ON "Notification"("emailStatus");

-- Un courrier ne se dit envoyé qu'avec sa date, et sa date ne se pose que
-- sur un courrier envoyé.
ALTER TABLE "Notification"
  ADD CONSTRAINT "notification_courrier_date"
  CHECK (("emailStatus" IS NOT DISTINCT FROM 'ENVOYE') = ("emailSentAt" IS NOT NULL));
