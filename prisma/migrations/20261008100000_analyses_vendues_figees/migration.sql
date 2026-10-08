-- Ce que le pack vendait, figé à la vente — RG-15.2, revue du 07/10/2026,
-- M5 (décision D-12 du 08/10/2026).
--
-- Le prorata d'un remboursement et la part de chaque destination se
-- lisaient sur la grille du jour (`PACKS`). Une grille révisée aurait
-- changé la somme due sur une vente passée.
--
-- Reprise : les valeurs de la grille au moment de cette migration, qui
-- n'ont jamais changé depuis l'ouverture (`src/domain/payments/pricing.ts`) :
-- Essentiel 10 analyses pour 1 destination, Dossier 30 pour 1, Pro 90 pour 3.
-- Les autres codes (recharges, consultations, montée) ne sont pas des packs
-- de la grille et restent nuls.

ALTER TABLE "Transaction"
  ADD COLUMN "packAnalyses" INTEGER,
  ADD COLUMN "packDestinations" INTEGER;

UPDATE "Transaction"
   SET "packAnalyses" = CASE "packCode"
                          WHEN 'essentiel' THEN 10
                          WHEN 'dossier' THEN 30
                          WHEN 'pro' THEN 90
                        END,
       "packDestinations" = CASE "packCode" WHEN 'pro' THEN 3 ELSE 1 END
 WHERE "packCode" IN ('essentiel', 'dossier', 'pro');

-- L'une ne va pas sans l'autre, et un pack vend au moins une analyse
-- pour au moins une destination.
ALTER TABLE "Transaction" ADD CONSTRAINT "transaction_analyses_vendues_coherentes"
  CHECK (("packAnalyses" IS NULL) = ("packDestinations" IS NULL)
     AND ("packAnalyses" IS NULL OR ("packAnalyses" > 0 AND "packDestinations" > 0)));
