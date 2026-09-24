-- Un créneau n'est pris que par un rendez-vous **vivant**.
--
-- `@@unique([consultantId, startsAt])` disait « un rendez-vous par
-- consultant et par créneau ». La règle est « un rendez-vous **vivant** par
-- consultant et par créneau », et la différence n'était pas théorique.
--
-- RG-12.5, arbitrage K.C : « une suppression de compte annule les
-- rendez-vous à venir et **libère les créneaux immédiatement** ».
-- `acheverLaSuppression` écrit `status = 'ANNULE'` en le croyant. Mais la
-- ligne annulée restait, et l'unicité ne connaît pas les états : le créneau
-- devenait **définitivement inprenable**.
--
-- Les deux surfaces se contredisaient sans que rien ne les confronte :
-- `creneaux()` calcule ses horaires occupés depuis `RESERVE`, `REPORTE` et
-- les tenues en cours, donc affichait le créneau **libre** ; et
-- `tenirLeCreneau` butait sur l'unicité, donc répondait « ce créneau vient
-- d'être pris ». Le candidat remplissait l'accord de partage pour lire un
-- refus — précisément ce que le commentaire de `creneaux()` dit vouloir
-- éviter, et ce que celui de `libererLaTenue` avait diagnostiqué : « une
-- ligne annulée occuperait le créneau au regard de l'unicité, qui ne
-- connaît pas les états. »
--
-- Établi par exécution : un rendez-vous annulé, puis repris par un autre
-- candidat → `creneau_indisponible`.
--
-- La correction est une unicité **partielle**, qui dit la règle telle
-- qu'elle est. L'annulation garde donc sa ligne — c'est elle que la ligne
-- de remboursement cite — et le créneau redevient libre pour de bon.

DROP INDEX IF EXISTS "Appointment_consultantId_startsAt_key";

-- Deux rendez-vous vivants ne peuvent pas partager un créneau ; un
-- rendez-vous mort n'en occupe aucun.
CREATE UNIQUE INDEX "appointment_creneau_vivant"
  ON "Appointment" ("consultantId", "startsAt")
  WHERE status IN ('TENU', 'RESERVE', 'REPORTE');

-- L'index ordinaire reste : les disponibilités se lisent créneau par
-- créneau, tous états confondus, et l'unicité partielle ne les sert pas.
CREATE INDEX IF NOT EXISTS "Appointment_consultantId_startsAt_idx"
  ON "Appointment" ("consultantId", "startsAt");
