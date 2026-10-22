-- S.183 / C-8 : une version relue se purge, sa relecture reste datée.
--
-- La garde du 22/09/2026 exigeait un texte pour toute relecture datée. La
-- purge (INV-5) efface le texte et garde la trace — date de purge, analyse
-- et remarques vidées — : elle gardait donc aussi `critiquedAt`, et la base
-- refusait la version. Le dossier entier ne se purgeait plus, pièces
-- d'identité comprises : rétention, clôture et suppression de compte en
-- erreur. Relevé par la recette navigateur R-O05.
--
-- La garde reste entière pour une version vivante : une relecture datée sur
-- une pièce téléversée, sans texte et non purgée, est toujours refusée.
-- Assouplissement seul : aucune ligne existante ne peut le violer.

ALTER TABLE "DocumentVersion"
  DROP CONSTRAINT "document_version_relecture_sur_un_texte";

ALTER TABLE "DocumentVersion"
  ADD CONSTRAINT "document_version_relecture_sur_un_texte"
  CHECK ("critiquedAt" IS NULL OR "body" IS NOT NULL OR "purgedAt" IS NOT NULL);
