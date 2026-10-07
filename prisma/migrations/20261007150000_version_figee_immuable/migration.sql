-- INV-3 — une version qu'un dossier a pu figer ne se réécrit jamais
-- (revue du 07/10/2026, C1).
--
-- RG-14.1 repasse en `DRAFT` une version en vigueur dont la relecture est
-- dépassée : elle disparaît de l'affichage, mais elle reste celle des
-- dossiers qui l'ont figée. B-02 la choisissait alors comme brouillon, sur
-- son seul statut, et la réécrivait en place : la checklist de tous ces
-- dossiers changeait d'un coup. Le code ne la choisit plus ; la base le
-- refuse aussi, pour qu'aucun autre chemin — une graine reprise, un SQL
-- passé à la main — ne le fasse à sa place.

-- ── Reprise ───────────────────────────────────────────────────────────
--
-- `20260923080000_version_mise_en_vigueur` n'a daté que les versions alors
-- `PUBLISHED` ou `ARCHIVED`. Une fiche que l'échéance avait déjà repassée
-- en `DRAFT` ce jour-là est restée sans date, et ressemble depuis à un
-- brouillon. Une version qu'un dossier référence a forcément été mise en
-- vigueur : on n'ouvre un dossier que sur une version affichée. Elle l'a
-- été à son `effectiveFrom`, la date que la publication y écrit.
UPDATE "VisaRule" v
   SET "publishedAt" = v."effectiveFrom"
 WHERE v."publishedAt" IS NULL
   AND (
     v."status" = 'PUBLISHED'
     OR EXISTS (SELECT 1 FROM "Application" a WHERE a."visaRuleId" = v.id)
   );

-- ── La garde ──────────────────────────────────────────────────────────
--
-- Figée : une version mise en vigueur un jour, ou référencée par un
-- dossier. Ce qui la définit ne bouge plus — le contenu, son schéma, la
-- procédure qu'elle décrit, son rang, sa source (INV-8) — ni sa date de
-- mise en vigueur une fois posée.
--
-- Restent libres, parce que la vie d'une version les écrit : `status` (la
-- veille la retire de l'affichage, le relevé l'y remet, la publication de
-- la suivante l'archive), `verifiedAt` et `verifiedBy` (la preuve de
-- diligence de RG-14.4), `nextReviewAt`, `effectiveFrom`, `effectiveTo`,
-- `notes`.
--
-- Le refus lève `check_violation`, comme une contrainte : c'est ce que
-- `scripts/verifier-garde-fous.sql` compte comme un refus.
CREATE OR REPLACE FUNCTION "regle_figee_immuable"() RETURNS trigger AS $$
BEGIN
  IF OLD."publishedAt" IS NOT NULL
     OR EXISTS (SELECT 1 FROM "Application" a WHERE a."visaRuleId" = OLD.id) THEN
    IF (NEW."rules", NEW."schemaVersion", NEW."countryCode", NEW."visaType",
        NEW."category", NEW."version", NEW."sourceTier", NEW."sourceUrl")
       IS DISTINCT FROM
       (OLD."rules", OLD."schemaVersion", OLD."countryCode", OLD."visaType",
        OLD."category", OLD."version", OLD."sourceTier", OLD."sourceUrl") THEN
      RAISE EXCEPTION 'INV-3 : la version % de %/% a été mise en vigueur ou figée par un dossier, son contenu ne se réécrit pas — ouvrir la version suivante',
        OLD."version", OLD."countryCode", OLD."visaType"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF OLD."publishedAt" IS NOT NULL
     AND NEW."publishedAt" IS DISTINCT FROM OLD."publishedAt" THEN
    RAISE EXCEPTION 'INV-3 : la date de mise en vigueur de la version % de %/% est posée une fois',
      OLD."version", OLD."countryCode", OLD."visaType"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "regle_figee_immuable"
  BEFORE UPDATE ON "VisaRule"
  FOR EACH ROW EXECUTE FUNCTION "regle_figee_immuable"();
