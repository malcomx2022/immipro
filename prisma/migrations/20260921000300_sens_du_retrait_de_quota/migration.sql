-- Le sens de l'écriture suit son motif, et le nouveau motif débite.
--
-- **Séparée de la migration précédente, et il le fallait.** PostgreSQL
-- refuse qu'une valeur d'énumération ajoutée dans une transaction y soit
-- employée : `ALTER TYPE ... ADD VALUE` suivi d'une contrainte qui cite
-- la nouvelle valeur échoue en 55P04, et Prisma enveloppe chaque
-- migration dans une transaction. Le déploiement s'arrêtait là, avec une
-- migration en échec — pas seulement en test.
--
-- La contrainte d'origine énumère les motifs qui créditent et le seul qui
-- débite ; un motif absent des deux listes est refusé quel que soit son
-- signe. C'est ce qui a arrêté le premier essai de retrait — un garde-fou
-- écrit trois lots plus tôt, qui a fait exactement son travail : refuser
-- une écriture dont il ne connaissait pas le sens.
ALTER TABLE "AnalysisCredit" DROP CONSTRAINT "credit_sens_coherent_avec_motif";
ALTER TABLE "AnalysisCredit"
  ADD CONSTRAINT "credit_sens_coherent_avec_motif"
  CHECK (
    ("reason" IN ('ACHAT_PACK', 'RECHARGE', 'ANALYSE_RENDUE', 'GESTE_COMMERCIAL') AND "delta" > 0)
    OR ("reason" IN ('ANALYSE', 'REMBOURSEMENT') AND "delta" < 0)
  );
