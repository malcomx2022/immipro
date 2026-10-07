-- INV-6 — une analyse ne se rend qu'une fois (revue du 07/10/2026, F4).
--
-- `rendreUneAnalyse` lisait s'il existait déjà un rendu, puis écrivait le
-- sien. Deux revues tranchées dans la même seconde passaient toutes deux la
-- lecture : l'analyse était rendue deux fois, et le candidat gagnait une
-- analyse qu'il n'avait pas payée. La décision de revue est désormais
-- conditionnée ; la base porte la règle pour tout autre chemin.

-- Les doublons déjà écrits, s'il y en a : le premier rendu reste, l'effet
-- des suivants est annulé par une écriture inverse, imputée au même octroi
-- (S.92). Le grand livre s'ajoute, il ne se réécrit pas — le modèle est
-- `20260922000000_retrait_unique_du_remboursement`.
INSERT INTO "AnalysisCredit" ("id", "applicationId", "delta", "reason", "grantId", "note", "createdAt")
SELECT gen_random_uuid(), d."applicationId", -d."delta", 'ANALYSE', d."grantId",
       'Annulation d''un rendu écrit deux fois pour la même analyse (migration du 07/10/2026).',
       now()
  FROM (
    SELECT c.*,
           row_number() OVER (PARTITION BY c."analysisId" ORDER BY c."createdAt", c."id") AS rang
      FROM "AnalysisCredit" c
     WHERE c."reason" = 'ANALYSE_RENDUE' AND c."analysisId" IS NOT NULL
  ) d
 WHERE d.rang > 1;

-- Puis les rendus en trop sortent de l'index : leur `analysisId` passe à
-- nul et la note dit pourquoi. La ligne demeure, son effet est annulé
-- au-dessus.
UPDATE "AnalysisCredit" c
   SET "analysisId" = NULL,
       "note" = coalesce(c."note", '') ||
         ' — rendu en double, détaché de son analyse le 07/10/2026 ; son effet est annulé par une écriture inverse.'
 WHERE c."reason" = 'ANALYSE_RENDUE'
   AND c."analysisId" IS NOT NULL
   AND c."id" <> (
     SELECT p."id" FROM "AnalysisCredit" p
      WHERE p."reason" = 'ANALYSE_RENDUE' AND p."analysisId" = c."analysisId"
      ORDER BY p."createdAt", p."id"
      LIMIT 1
   );

-- Partiel : un rendu de tentative (lecture non aboutie, reprise en
-- attente) n'a pas d'analyse, et chaque tentative est son propre couple
-- débit et rendu.
CREATE UNIQUE INDEX "analysiscredit_un_seul_rendu_par_analyse"
    ON "AnalysisCredit" ("analysisId")
 WHERE "reason" = 'ANALYSE_RENDUE' AND "analysisId" IS NOT NULL;
