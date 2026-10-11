-- REV11-L2, S.173 — 11/10/2026. Une mesure inconnue n'est pas une
-- consommation nulle.
--
-- Les adaptateurs écrivaient zéro jeton quand le fournisseur ne transmettait
-- pas de mesure, et le grand livre ignorait alors l'appel : il disparaissait
-- de B-07. Chaque ligne dit désormais ce que le fournisseur a mesuré ; les
-- colonnes de jetons n'en portent que la part connue.
--
-- Additive : un type et deux colonnes nullables. Les lignes antérieures
-- restent nulles — non qualifiées. Leurs zéros ne permettent pas de
-- reconstruire une consommation réelle, et rien ne les réécrit.

CREATE TYPE "MesureDUsage" AS ENUM ('MESUREE', 'ENTREE_SEULE', 'SORTIE_SEULE', 'INCONNUE');

ALTER TABLE "AiUsage" ADD COLUMN "usageMeasure" "MesureDUsage";

ALTER TABLE "DocumentAnalysis" ADD COLUMN "usageMeasure" "MesureDUsage";

-- Des jetons négatifs ne s'inscrivent plus. Reproduit sur `47b39b0` : une
-- mesure de -12/1,5 jetons entrait telle quelle, en -12/1. Les adaptateurs
-- la refusent désormais ; la base le tient aussi, comme ses autres
-- garde-fous. `NOT VALID` : la contrainte vaut pour toute nouvelle ligne,
-- sans relire ni réécrire l'historique, que le diagnostic des données
-- décompte à part.
ALTER TABLE "AiUsage"
  ADD CONSTRAINT "AiUsage_jetons_positifs"
  CHECK ("inputTokens" >= 0 AND "outputTokens" >= 0) NOT VALID;

ALTER TABLE "DocumentAnalysis"
  ADD CONSTRAINT "DocumentAnalysis_jetons_positifs"
  CHECK ("inputTokens" >= 0 AND "outputTokens" >= 0) NOT VALID;
