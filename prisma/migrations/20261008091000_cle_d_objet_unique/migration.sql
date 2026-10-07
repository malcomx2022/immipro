-- Une clé d'objet désigne une seule version de pièce — règle
-- d'architecture 4, INV-5 (revue du 07/10/2026, M1).
--
-- La confirmation d'un dépôt écrivait la clé que le navigateur renvoyait,
-- sans la vérifier. Deux versions pointant le même objet, c'est un fichier
-- lisible depuis deux dossiers et effacé par la purge du premier venu. La
-- route vérifie désormais la clé ; la base refuse qu'elle serve deux fois.

-- Des doublons déjà écrits seraient la trace d'un détournement passé, ou
-- d'un défaut inconnu : on ne choisit pas à l'aveugle laquelle des deux
-- versions garde le fichier. La migration s'arrête et dit quoi regarder.
DO $$
DECLARE
  doublons integer;
BEGIN
  SELECT count(*) INTO doublons FROM (
    SELECT "objectKey" FROM "DocumentVersion"
     WHERE "objectKey" IS NOT NULL
     GROUP BY "objectKey" HAVING count(*) > 1
  ) d;
  IF doublons > 0 THEN
    RAISE EXCEPTION 'M1 : % clé(s) d''objet partagée(s) par plusieurs versions. À examiner avant migration : SELECT "objectKey", array_agg(id) FROM "DocumentVersion" WHERE "objectKey" IS NOT NULL GROUP BY 1 HAVING count(*) > 1;', doublons;
  END IF;
END $$;

-- Partielle : les versions rédigées n'ont pas d'objet, et une version
-- purgée a perdu sa clé.
CREATE UNIQUE INDEX "documentversion_cle_unique"
    ON "DocumentVersion" ("objectKey")
 WHERE "objectKey" IS NOT NULL;
