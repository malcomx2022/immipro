-- Tentatives d'analyse — WF-06, lot du 22/09/2026.
--
-- L'extraction est branchée sur un service réel, et un service réel sature,
-- tombe et met du temps à répondre. DOC-11 le prévoit depuis le premier
-- jour : « job réessayé avec backoff exponentiel ; au-delà de 3 échecs,
-- bascule en revue manuelle back-office ». Compter les échecs suppose de
-- les retenir entre deux passages de la file, et rien ne les retenait.
--
-- Sans ce compteur, la première saturation versait la pièce en revue
-- humaine avec un message qui accuse le fichier — la panne d'un tiers
-- payée par le candidat, et par la file de revue.

ALTER TABLE "DocumentVersion"
  ADD COLUMN "analysisAttempts"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "analysisLastAttemptAt" TIMESTAMP(3);

-- Un compteur de tentatives ne descend pas sous zéro. Même garde que pour
-- le balayage, et pour la même raison : une colonne devenue négative sans
-- que rien ne s'en aperçoive fait cesser un seuil de se déclencher.
ALTER TABLE "DocumentVersion"
  ADD CONSTRAINT "document_version_analyses_positives"
  CHECK ("analysisAttempts" >= 0);

-- Une tentative comptée porte sa date, et l'absence de tentative n'en porte
-- aucune. Une équivalence, comme pour le balayage : c'est le compteur sans
-- date qui rendrait l'attente invérifiable — on saurait qu'on a réessayé,
-- pas depuis quand on attend.
ALTER TABLE "DocumentVersion"
  ADD CONSTRAINT "document_version_analyse_datee"
  CHECK (("analysisAttempts" = 0) = ("analysisLastAttemptAt" IS NULL));
