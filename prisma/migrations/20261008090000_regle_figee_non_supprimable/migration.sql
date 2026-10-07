-- INV-3 — une version de règle qu'un dossier a figée ne se supprime pas
-- (revue du 07/10/2026, F12).
--
-- La clé étrangère était en `ON DELETE SET NULL`, la valeur par défaut de
-- Prisma. La garde `application_version_figee` empêchait déjà
-- la suppression d'une version visée par un dossier ouvert, mais un dossier
-- encore en brouillon perdait sa règle sans trace. Aucun code ne supprime de
-- version : le risque venait d'un SQL passé à la main. La base le refuse.
ALTER TABLE "Application" DROP CONSTRAINT "Application_visaRuleId_fkey";
ALTER TABLE "Application" ADD CONSTRAINT "Application_visaRuleId_fkey"
  FOREIGN KEY ("visaRuleId") REFERENCES "VisaRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
