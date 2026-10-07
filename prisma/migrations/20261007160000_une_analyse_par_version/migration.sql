-- INV-6 — une version de pièce s'analyse une fois (revue du 07/10/2026, E5).
--
-- La file rejoue un job dont l'acquittement s'est perdu. Le job d'analyse
-- ne regardait pas si la version avait déjà son verdict : un rejeu
-- débitait une seconde analyse, écrivait un second verdict et envoyait une
-- seconde notification. Le job porte désormais une garde ; deux exécutions
-- simultanées la passent pourtant toutes deux, et c'est la base qui les
-- départage, ici.

-- ── Les doublons déjà écrits, s'il y en a ─────────────────────────────
--
-- On garde la première analyse de chaque version. Celles qui la suivent
-- ont coûté une analyse au candidat pour une lecture déjà faite : on la
-- lui rend, par une écriture au grand livre, à l'octroi que le débit avait
-- entamé (S.92). Le grand livre s'ajoute, il ne se réécrit pas — c'est le
-- modèle de `20260922000000_retrait_unique_du_remboursement`.
WITH doublons AS (
  SELECT a.id, a."creditConsumed", d."applicationId",
         row_number() OVER (PARTITION BY a."versionId" ORDER BY a."analyzedAt", a.id) AS rang
    FROM "DocumentAnalysis" a
    JOIN "DocumentVersion" v ON v.id = a."versionId"
    JOIN "Document" d ON d.id = v."documentId"
)
INSERT INTO "AnalysisCredit" ("id", "applicationId", "delta", "reason", "analysisId", "grantId", "note", "createdAt")
SELECT gen_random_uuid(), x."applicationId", 1, 'ANALYSE_RENDUE', x.id,
       (SELECT c."grantId" FROM "AnalysisCredit" c
         WHERE c."analysisId" = x.id AND c."reason" = 'ANALYSE'
         ORDER BY c."createdAt" DESC LIMIT 1),
       'Analyse écrite deux fois sur la même version (rejeu de la file) : la seconde lecture est rendue (migration du 07/10/2026).',
       now()
  FROM doublons x
 WHERE x.rang > 1
   AND x."creditConsumed"
   AND NOT EXISTS (
     SELECT 1 FROM "AnalysisCredit" r
      WHERE r."analysisId" = x.id AND r."reason" = 'ANALYSE_RENDUE'
   );

-- Puis les analyses en trop partent, avec la revue humaine qui en dépend
-- (`ManualReview` suit par cascade). La pièce garde son état et la
-- première analyse ; les lignes du grand livre qui nommaient les
-- doublons restent, et la note ci-dessus dit pourquoi.
DELETE FROM "DocumentAnalysis" a
 USING (
   SELECT id, row_number() OVER (PARTITION BY "versionId" ORDER BY "analyzedAt", id) AS rang
     FROM "DocumentAnalysis"
 ) r
 WHERE a.id = r.id AND r.rang > 1;

-- ── La garde ──────────────────────────────────────────────────────────
--
-- Partielle par nécessité, et non par choix : `versionId` n'est jamais
-- nul, mais Prisma ne sait déclarer cette unicité qu'en faisant de la
-- relation un un-à-un, ce que tout le code lit comme une liste
-- (`version.analyses`). Un index partiel n'est pas vu par le schéma,
-- comme `appointment_creneau_vivant`.
CREATE UNIQUE INDEX "documentanalysis_une_par_version"
    ON "DocumentAnalysis" ("versionId")
 WHERE "versionId" IS NOT NULL;
