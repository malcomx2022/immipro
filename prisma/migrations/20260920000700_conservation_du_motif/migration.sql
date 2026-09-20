-- Combien de temps garder le motif d'un échec — O.B, tranché à
-- quatre-vingt-dix jours.
--
-- Le motif part déjà avec le compte (RG-10.4). Sur un compte vivant, il
-- restait lisible indéfiniment : un refus de 2026 se relisait en 2030,
-- alors que son utilité s'éteint avec la réclamation. Il n'est pas
-- nécessaire à la preuve comptable, qui tient au montant, à la date, au
-- statut et à la référence — ceux-là suivent leur propre politique et ne
-- sont pas touchés ici.
--
-- Effacer à l'échéance demande de savoir *quand* l'échec a eu lieu, et
-- rien ne le disait. `createdAt` date l'ouverture de la transaction, pas
-- son échec : entre les deux il y a le délai de confirmation, et pour une
-- transaction expirée par la réconciliation, parfois des heures. Une durée
-- annoncée en jours se compte depuis le fait qu'elle mesure.

ALTER TABLE "Transaction" ADD COLUMN "failureCauseAt" TIMESTAMP(3);

-- Les lignes déjà en base n'ont pas d'instant d'échec enregistré.
-- `createdAt` est la seule borne honnête dont on dispose, et elle est
-- antérieure à l'échec : l'échéance tombe donc au plus tôt. Pour une règle
-- de minimisation, se tromper dans le sens de l'effacement est le bon sens
-- d'erreur.
UPDATE "Transaction"
  SET "failureCauseAt" = "createdAt"
  WHERE "failureCause" IS NOT NULL;

-- ── Garde-fous ─────────────────────────────────────────────────────────────

-- Le motif et sa date vont ensemble, dans les deux sens. Un motif sans date
-- ne s'effacerait jamais — il échapperait à la purge en silence, ce qui est
-- exactement la panne qu'une conservation annoncée ne doit pas avoir. Une
-- date sans motif garderait la trace d'un échec dont on vient de retirer la
-- raison, sans rien prouver de plus que `status`.
ALTER TABLE "Transaction"
  ADD CONSTRAINT "transaction_motif_porte_sa_date"
  CHECK (("failureCause" IS NULL) = ("failureCauseAt" IS NULL));

-- Un échec daté avant l'ouverture de sa propre transaction ne veut rien
-- dire, et décalerait l'échéance vers le passé.
ALTER TABLE "Transaction"
  ADD CONSTRAINT "transaction_motif_date_apres_l_ouverture"
  CHECK ("failureCauseAt" IS NULL OR "failureCauseAt" >= "createdAt");
