-- La tenue temporaire d'un créneau — arbitrage du 21/09/2026.
--
-- Un rendez-vous existait en deux temps sans que rien ne les distingue :
-- il naissait `RESERVE`, c'est-à-dire confirmé, avant qu'un centime ait
-- été encaissé. `TENU` est l'état qui manquait — le créneau est gardé, le
-- paiement n'est pas fait, et rien n'est promis.
--
-- Seule dans sa migration : PostgreSQL refuse d'employer une valeur
-- d'énumération dans la transaction qui la crée.
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'TENU';
