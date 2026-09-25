-- S.89 : la date réelle du dépôt, distincte du moment où le candidat l'a
-- déclarée dans ImmiPro.
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'SUIVI_DEPOT';

ALTER TABLE "Application" ADD COLUMN "depositedOn" DATE;

-- Les dépôts déjà déclarés n'ont jamais dit leur date réelle : la seule
-- date connue est celle de la déclaration, lue au jour civil de Cotonou —
-- le fuseau dans lequel l'écran l'a toujours affichée. C'est la meilleure
-- approximation disponible, et elle ne recule aucune échéance déjà
-- annoncée : `retentionUntil` n'est pas touché.
UPDATE "Application"
   SET "depositedOn" = ("submittedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Porto-Novo')::date
 WHERE "submittedAt" IS NOT NULL;

-- Les deux faits vont ensemble : une date de dépôt sans déclaration, ou
-- l'inverse, serait un dépôt que personne n'a déclaré.
ALTER TABLE "Application"
  ADD CONSTRAINT "application_depot_declare"
  CHECK (("depositedOn" IS NULL) = ("submittedAt" IS NULL));

-- Un dépôt ne se déclare pas avant d'avoir eu lieu. La borne tient compte
-- des fuseaux : le jour civil du candidat peut avoir quatorze heures
-- d'avance sur l'instant UTC de sa déclaration.
ALTER TABLE "Application"
  ADD CONSTRAINT "application_depot_pas_dans_le_futur"
  CHECK ("depositedOn" IS NULL OR "depositedOn" <= ("submittedAt" + INTERVAL '14 hours')::date);

-- Ni avant l'ouverture du dossier, à douze heures de fuseau près.
ALTER TABLE "Application"
  ADD CONSTRAINT "application_depot_apres_ouverture"
  CHECK ("depositedOn" IS NULL OR "depositedOn" >= ("createdAt" - INTERVAL '12 hours')::date);
