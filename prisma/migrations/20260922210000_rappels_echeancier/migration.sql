-- Rappels d'échéance — WF-09 étape 3, lot du 22/09/2026.
--
-- La file `echeancier.rappel` était déclarée avec ce motif : « personne n'y
-- poste encore, l'envoi attend la messagerie ». Le transport SMTP est branché
-- depuis ce matin, et la phrase est devenue fausse sans que rien ne bouge. Un
-- candidat dont une échéance était dépassée depuis trois jours ne recevait
-- rien — ni courrier, ni notification.
--
-- Deux marques, parce que RG-09.2 pose deux règles distinctes : « un email
-- hebdomadaire » est une cadence, qui porte sur le dossier ; « sauf urgence à
-- moins de 7 jours » est une exception, qui porte sur l'échéance.

ALTER TABLE "Application"
  ADD COLUMN "lastReminderAt" TIMESTAMP(3);

ALTER TABLE "Deadline"
  ADD COLUMN "remindedAt" TIMESTAMP(3);

-- Une échéance faite ne se rappelle plus, et n'a donc pas à porter la trace
-- d'un rappel postérieur à son accomplissement. La garde n'interdit pas
-- d'avoir rappelé avant : c'est l'ordre normal des choses.
ALTER TABLE "Deadline"
  ADD CONSTRAINT "deadline_rappel_avant_accomplissement"
  CHECK ("remindedAt" IS NULL OR "doneAt" IS NULL OR "remindedAt" <= "doneAt");

-- La passe quotidienne cherche les dossiers dont une échéance approche. Sans
-- index, elle balaie toute la table chaque nuit ; avec lui, elle lit ce qui
-- vient.
CREATE INDEX "Deadline_dueAt_doneAt_idx" ON "Deadline"("dueAt", "doneAt");
