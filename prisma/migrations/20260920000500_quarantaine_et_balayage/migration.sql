-- Quarantaine et balayage antivirus — I.D, tranché le 20/09/2026.
--
-- Un fichier déposé n'entre pas dans le stockage de confiance : il atterrit
-- dans une zone de quarantaine dont rien ne sort, et n'en est promu qu'une
-- fois balayé. La base tient l'état ; les trois contraintes plus bas tiennent
-- sa cohérence, pour qu'aucun chemin de code ne puisse écrire un balayage qui
-- n'a pas eu lieu.
--
-- Les versions déjà déposées passent en quarantaine, et c'est voulu : aucune
-- n'a été balayée, aucune ne peut donc être déclarée saine. Elles redeviennent
-- consultables après un passage du balayeur, pas avant.

CREATE TYPE "ScanState" AS ENUM ('EN_QUARANTAINE', 'SAINE', 'INFECTEE');

ALTER TABLE "DocumentVersion"
  ADD COLUMN "scanState"   "ScanState" NOT NULL DEFAULT 'EN_QUARANTAINE',
  ADD COLUMN "scannedAt"   TIMESTAMP(3),
  ADD COLUMN "scanFinding" TEXT;

-- Un état balayé porte sa date, et une quarantaine n'en porte pas. La forme
-- est celle du remboursement (M.B) : une équivalence plutôt que deux
-- implications, parce que c'est l'absence de date sur un état décidé qui
-- rendrait le balayage invérifiable après coup.
ALTER TABLE "DocumentVersion"
  ADD CONSTRAINT "document_version_balayage_date"
  CHECK (("scanState" = 'EN_QUARANTAINE') = ("scannedAt" IS NULL));

-- Une menace nommée suppose un fichier écarté. Sans cette contrainte, un
-- `scanFinding` posé sur une version saine se lirait, en back-office, comme
-- un fichier douteux laissé en circulation.
ALTER TABLE "DocumentVersion"
  ADD CONSTRAINT "document_version_menace_seulement_si_infectee"
  CHECK ("scanFinding" IS NULL OR "scanState" = 'INFECTEE');

-- Un fichier écarté ne garde pas ses octets. La destruction est faite par le
-- job ; la contrainte interdit d'oublier de la refléter — une clé d'objet
-- survivante sur une version infectée est une URL présignable.
ALTER TABLE "DocumentVersion"
  ADD CONSTRAINT "document_version_infectee_sans_octets"
  CHECK (NOT ("scanState" = 'INFECTEE' AND "objectKey" IS NOT NULL));

-- C-07 relu. « Une version porte un fichier ou un texte, jamais ni l'un ni
-- l'autre » ne connaissait que deux façons d'être sans contenu : le fichier
-- purgé, ou l'erreur. Il y en a une troisième, et la décision vient de la
-- créer — la version écartée au contrôle, dont les octets sont détruits et
-- ne reviendront pas. Elle n'est pas purgée pour autant : une purge est un
-- acte de rétention, avec sa date et son sens propres, et confondre les deux
-- ferait compter les fichiers écartés dans le bilan de la purge.
ALTER TABLE "DocumentVersion" DROP CONSTRAINT "version_porte_un_contenu";
ALTER TABLE "DocumentVersion"
  ADD CONSTRAINT "version_porte_un_contenu"
  CHECK ("objectKey" IS NOT NULL OR "body" IS NOT NULL OR "purgedAt" IS NOT NULL
         OR "scanState" = 'INFECTEE');

-- La file de balayage se lit par état : les quarantaines en attente d'abord.
CREATE INDEX "DocumentVersion_scanState_uploadedAt_idx"
  ON "DocumentVersion"("scanState", "uploadedAt");
