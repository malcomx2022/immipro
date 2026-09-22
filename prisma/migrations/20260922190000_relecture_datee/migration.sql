-- La relecture d'une version — WF-08 étape 4, lot du 22/09/2026.
--
-- R-04 décidait d'afficher un avis sur `redactionConfiguree()`, c'est-à-dire
-- sur la présence d'une clé d'API. Aucune analyse n'ayant jamais tourné, la
-- base rendait une liste vide et l'écran la lisait comme un résultat :
-- « Rien à reprendre sur cette version », sur une lettre que personne
-- n'avait lue. Le branchement de la lecture des pièces a rendu ce chemin
-- ordinaire — toute installation qui veut lire les pièces pose cette clé.
--
-- Une liste vide de remarques est un résultat légitime : « relu, rien à
-- reprendre ». Ce qui manquait est la trace de la relecture elle-même, qui
-- seule distingue ce résultat d'une absence. Elle se porte sur la version,
-- parce que c'est la version qui est relue — une version suivante n'hérite
-- de rien.

ALTER TABLE "DocumentVersion"
  ADD COLUMN "critiquedAt" TIMESTAMP(3);

-- Une relecture ne porte que sur un texte. Une pièce téléversée est analysée
-- par WF-06, qui écrit dans `DocumentAnalysis` ; dater une relecture sur un
-- passeport scanné ferait apparaître en R-04 un avis qui n'existe pas, et
-- rendrait la colonne inutilisable comme garde.
ALTER TABLE "DocumentVersion"
  ADD CONSTRAINT "document_version_relecture_sur_un_texte"
  CHECK ("critiquedAt" IS NULL OR "body" IS NOT NULL);
