-- Un seul retrait de droits par remboursement — arbitrage du 22/09/2026.
--
-- Les droits non consommés partent à l'initiation du remboursement, sous
-- la forme d'une écriture négative au grand livre. Cette écriture ne doit
-- avoir lieu qu'une fois : deux tentatives d'envoi retiraient deux fois
-- les mêmes droits, et le solde d'un dossier passait de trente à moins
-- trente. Le défaut a été vu en exécutant, et corrigé côté appelant par
-- une lecture préalable — qui ne tient pas contre deux reprises
-- simultanées, parce qu'entre la lecture et l'écriture l'autre est passé.
--
-- La base porte donc la règle, plutôt que la bonne volonté des appelants.
-- L'index est partiel : il ne contraint que les lignes de remboursement.
-- Les autres motifs — un octroi de pack, une recharge, un geste
-- commercial — n'ont pas la même règle, et un index sur toute la table
-- leur en imposerait une qu'aucune décision n'a prise.

-- Les doublons déjà écrits, s'il y en a : on garde le premier retrait et
-- on annule les suivants par une écriture inverse, plutôt que de les
-- supprimer. Le grand livre s'ajoute, il ne se réécrit pas — et un solde
-- rendu faux par un doublon doit être corrigé au vu de tous, pas effacé.
INSERT INTO "AnalysisCredit" ("id", "applicationId", "delta", "reason", "transactionId", "note", "createdAt")
SELECT gen_random_uuid(), d."applicationId", -d."delta", 'REMBOURSEMENT', NULL,
       'Annulation d''un retrait de droits écrit deux fois sur le même remboursement (migration du 22/09/2026).',
       now()
  FROM (
    SELECT c.*,
           row_number() OVER (PARTITION BY c."transactionId" ORDER BY c."createdAt", c."id") AS rang
      FROM "AnalysisCredit" c
     WHERE c."reason" = 'REMBOURSEMENT' AND c."transactionId" IS NOT NULL
  ) d
 WHERE d.rang > 1;

-- Puis on retire de l'index les lignes en trop, qui restent lisibles : le
-- `transactionId` passe à NULL et la note dit pourquoi. La ligne demeure,
-- son effet est annulé au-dessus, et la contrainte peut naître.
UPDATE "AnalysisCredit" c
   SET "transactionId" = NULL,
       "note" = coalesce(c."note", '') ||
         ' — retrait en double, détaché de sa transaction le 22/09/2026 ; son effet est annulé par une écriture inverse.'
 WHERE c."reason" = 'REMBOURSEMENT'
   AND c."transactionId" IS NOT NULL
   AND c."id" <> (
     SELECT p."id" FROM "AnalysisCredit" p
      WHERE p."reason" = 'REMBOURSEMENT' AND p."transactionId" = c."transactionId"
      ORDER BY p."createdAt", p."id"
      LIMIT 1
   );

CREATE UNIQUE INDEX "analysiscredit_un_seul_retrait_par_remboursement"
    ON "AnalysisCredit" ("transactionId")
 WHERE "reason" = 'REMBOURSEMENT' AND "transactionId" IS NOT NULL;
