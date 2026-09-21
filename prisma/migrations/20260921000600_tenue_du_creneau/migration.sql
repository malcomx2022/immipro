-- Le créneau tenu, et ce qui le rend opposable.
--
-- `heldUntil` : jusqu'à quand la tenue vaut. Passé ce délai, le créneau se
-- reprend — sans quoi un paiement abandonné gèlerait un horaire pour
-- toujours.
--
-- `consentAt` : quand l'accord de partage a été donné. Il se prépare avant
-- le paiement, parce qu'il n'y a aucune raison de le redemander après ;
-- mais il n'ouvre **aucun** accès tant que le rendez-vous n'est pas
-- confirmé. Une date d'accord n'est pas une autorisation de lecture.
ALTER TABLE "Appointment"
  ADD COLUMN "heldUntil" TIMESTAMP(3),
  ADD COLUMN "consentAt" TIMESTAMP(3);

-- Les rendez-vous déjà écrits sans paiement.
--
-- Ils ont été créés par la route fautive : `RESERVE` sans transaction,
-- c'est-à-dire confirmés sans que rien n'ait été encaissé. On ne peut pas
-- leur inventer un paiement, et les laisser confirmés ferait mentir la
-- contrainte qui suit. Ils redeviennent ce qu'ils auraient dû être — une
-- tenue — et cette tenue est échue, donc le créneau est libre. Le candidat
-- devra reprendre rendez-vous, et cette fois il paiera.
UPDATE "Appointment"
   SET status = 'TENU', "heldUntil" = "createdAt", "consentAt" = "createdAt"
 WHERE status = 'RESERVE' AND "transactionId" IS NULL;

-- Et les accès consultant qu'ils avaient ouverts : un accès accordé sur un
-- rendez-vous qui n'a jamais été payé n'a pas lieu d'être. Révoqués, non
-- supprimés — l'historique doit dire qu'ils ont existé.
UPDATE "ConsultantAccess" a
   SET "revokedAt" = now()
 WHERE "revokedAt" IS NULL
   AND EXISTS (
     SELECT 1 FROM "Appointment" r
      WHERE r."applicationId" = a."applicationId"
        AND r."consultantId" = a."consultantId"
        AND r.status = 'TENU'
        AND r."transactionId" IS NULL
   );

-- ── Garde-fous ─────────────────────────────────────────────────────────

-- Le cœur de l'arbitrage, porté par la base et non par une intention : un
-- rendez-vous confirmé cite le paiement qui l'a payé. Aucune route, aucun
-- job, aucune reprise manuelle ne peut écrire `RESERVE` sans transaction.
ALTER TABLE "Appointment"
  ADD CONSTRAINT "appointment_reserve_exige_un_paiement"
  CHECK (status <> 'RESERVE' OR "transactionId" IS NOT NULL);

-- Une tenue sans échéance ne se reprend jamais : elle gèlerait le créneau.
ALTER TABLE "Appointment"
  ADD CONSTRAINT "appointment_tenue_exige_une_echeance"
  CHECK (status <> 'TENU' OR "heldUntil" IS NOT NULL);
