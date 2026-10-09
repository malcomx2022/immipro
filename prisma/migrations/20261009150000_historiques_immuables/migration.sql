-- Les historiques immuables le sont en base — revue du 07/10/2026, F11
-- (D-24 du 09/10/2026).
--
-- `EditorialVersion`, `LegalPublication` et `AuditLog` étaient déclarés
-- immuables, et l'immuabilité tenait « par l'absence d'écrivain » : un test
-- vérifiait qu'aucun code ne les réécrivait. Rien n'empêchait une graine,
-- un SQL passé à la main ou un futur chemin de le faire. Depuis C1, le
-- dépôt tient ses figements par déclencheur (`regle_figee_immuable`,
-- `facture_immuable`) : ces tables suivent la même convention.
--
-- Tous les refus lèvent `check_violation`, comme une contrainte : c'est ce
-- que `scripts/verifier-garde-fous.sql` compte comme un refus.

-- ── Les historiques de publication ───────────────────────────────────
--
-- Une version éditoriale ou juridique ne se corrige pas et ne s'efface
-- pas : elle prouve ce qu'un lecteur a pu lire, ou ce qu'un candidat a
-- accepté. Restaurer un texte crée une version de plus.
CREATE FUNCTION "historique_immuable"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '% : la version % ne se supprime pas ; l''historique s''allonge, il ne se réécrit pas.',
      TG_TABLE_NAME, OLD."rang"
      USING ERRCODE = 'check_violation';
  END IF;
  RAISE EXCEPTION '% : la version % est figée à sa publication ; republier crée une version de plus.',
    TG_TABLE_NAME, OLD."rang"
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "historique_immuable"
  BEFORE UPDATE OR DELETE ON "EditorialVersion"
  FOR EACH ROW EXECUTE FUNCTION "historique_immuable"();

CREATE TRIGGER "historique_immuable"
  BEFORE UPDATE OR DELETE ON "LegalPublication"
  FOR EACH ROW EXECUTE FUNCTION "historique_immuable"();

-- ── Le journal d'audit ───────────────────────────────────────────────
--
-- Une écriture ne se modifie jamais. Elle se supprime à l'échéance de sa
-- conservation, cinq ans (`CONSERVATION_ANNEES`, WF-15), par la purge
-- planifiée — et pas avant. Le seuil est couplé au domaine par
-- `tests/historiques-immuables.test.ts`, qui lit les deux.
CREATE FUNCTION "journal_immuable"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'AuditLog : l''écriture % ne se modifie pas.', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."createdAt" > now() - interval '5 years' THEN
    RAISE EXCEPTION 'AuditLog : l''écriture % du % se conserve cinq ans ; seule la purge à échéance la supprime.',
      OLD."id", OLD."createdAt"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "journal_immuable"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION "journal_immuable"();

-- ── L'arbitrage d'une divergence ─────────────────────────────────────
--
-- `RuleMigration` vit, et c'est pourquoi elle n'était pas déclarée
-- immuable : la passe de propagation y pose `alertedAt`, le candidat y
-- pose `decision` et `decidedAt`. Mais chacune se pose **une fois** — un
-- candidat prévenu l'a été, un arbitrage rendu l'est (`migration.ts`
-- refuse déjà un second choix). Le reste, ce que la publication a calculé
-- et que T-02 affiche, ne bouge pas.
--
-- La suppression reste libre : elle suit celle du dossier, en cascade.
CREATE FUNCTION "arbitrage_fige"() RETURNS trigger AS $$
BEGIN
  IF (NEW."id", NEW."applicationId", NEW."fromRuleId", NEW."toRuleId", NEW."impact", NEW."diff", NEW."createdAt")
     IS DISTINCT FROM
     (OLD."id", OLD."applicationId", OLD."fromRuleId", OLD."toRuleId", OLD."impact", OLD."diff", OLD."createdAt") THEN
    RAISE EXCEPTION 'RuleMigration : la divergence % est figée à sa propagation.', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."alertedAt" IS NOT NULL AND NEW."alertedAt" IS DISTINCT FROM OLD."alertedAt" THEN
    RAISE EXCEPTION 'RuleMigration : le candidat de la divergence % a déjà été prévenu.', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."decision" IS NOT NULL AND (NEW."decision", NEW."decidedAt") IS DISTINCT FROM (OLD."decision", OLD."decidedAt") THEN
    RAISE EXCEPTION 'RuleMigration : l''arbitrage de la divergence % est déjà rendu.', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."decidedAt" IS NOT NULL AND NEW."decidedAt" IS DISTINCT FROM OLD."decidedAt" THEN
    RAISE EXCEPTION 'RuleMigration : la date d''arbitrage de la divergence % est déjà posée.', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "arbitrage_fige"
  BEFORE UPDATE ON "RuleMigration"
  FOR EACH ROW EXECUTE FUNCTION "arbitrage_fige"();

-- ── `facture_immuable` suit la convention ────────────────────────────
--
-- Il levait `P0001`, l'erreur générique de PL/pgSQL. Même contenu figé
-- (`performedAt` compris, S.140), même texte ; seul le code change.
CREATE OR REPLACE FUNCTION "facture_immuable"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'facture_immuable : la pièce % ne se supprime pas ; elle s''annule par un avoir ou une mention d''annulation.', OLD."number"
      USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW."number", NEW."kind", NEW."series", NEW."fiscalYear", NEW."rank", NEW."transactionId",
      NEW."originId", NEW."issuedAt", NEW."performedAt", NEW."emitter", NEW."clientName", NEW."clientAddress",
      NEW."clientQuality", NEW."designation", NEW."currency", NEW."amountIncl", NEW."amountExcl",
      NEW."vatAmount", NEW."vatRateBp", NEW."vatNote", NEW."amountInWords", NEW."paymentMethod")
     IS DISTINCT FROM
     (OLD."number", OLD."kind", OLD."series", OLD."fiscalYear", OLD."rank", OLD."transactionId",
      OLD."originId", OLD."issuedAt", OLD."performedAt", OLD."emitter", OLD."clientName", OLD."clientAddress",
      OLD."clientQuality", OLD."designation", OLD."currency", OLD."amountIncl", OLD."amountExcl",
      OLD."vatAmount", OLD."vatRateBp", OLD."vatNote", OLD."amountInWords", OLD."paymentMethod") THEN
    RAISE EXCEPTION 'facture_immuable : le contenu de la pièce % est figé à l''émission.', OLD."number"
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."certificationCode" IS NOT NULL AND NEW."certificationCode" IS DISTINCT FROM OLD."certificationCode" THEN
    RAISE EXCEPTION 'facture_immuable : la certification de la pièce % est déjà posée.', OLD."number"
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."cancelledAt" IS NOT NULL AND (NEW."cancelledAt", NEW."cancelReason") IS DISTINCT FROM (OLD."cancelledAt", OLD."cancelReason") THEN
    RAISE EXCEPTION 'facture_immuable : l''annulation de la pièce % est déjà posée.', OLD."number"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
