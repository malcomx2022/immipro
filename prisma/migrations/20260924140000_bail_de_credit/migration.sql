-- Bail d'ouverture de la contrepartie d'un paiement (INV-7).
--
-- Deux achèvements simultanés du même paiement — la notification signée
-- qui vient de confirmer, et la passe de réconciliation qui balaie les
-- paiements confirmés — lisaient tous les deux « rien d'ouvert » et
-- ouvraient tous les deux. La colonne se prend par une mise à jour
-- conditionnelle : c'est la base qui arbitre.
ALTER TABLE "Transaction" ADD COLUMN "creditingAt" TIMESTAMP(3);
