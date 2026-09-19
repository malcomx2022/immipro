-- Garde-fous des sessions et des secrets à usage unique.
--
-- Même raison que la migration 20260918000100 : une règle écrite dans un
-- service ne protège que ce service. Une session dont l'échéance précède la
-- création est une session déjà morte à la naissance ; écrite par un import
-- ou une reprise manuelle, elle déconnecterait quelqu'un sans que rien ne
-- l'explique.

ALTER TABLE "Session"
  ADD CONSTRAINT session_echeance_posterieure_a_la_creation
  CHECK ("expiresAt" > "createdAt");

ALTER TABLE "AuthSecret"
  ADD CONSTRAINT secret_echeance_posterieure_a_la_creation
  CHECK ("expiresAt" > "createdAt");

-- Le compteur d'essais borne la recherche par force brute. Négatif, il la
-- rouvre sans fin.
ALTER TABLE "AuthSecret"
  ADD CONSTRAINT secret_essais_non_negatifs
  CHECK ("attempts" >= 0);
