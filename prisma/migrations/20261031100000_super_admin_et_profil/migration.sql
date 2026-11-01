-- S.210 : rôle SUPER_ADMIN et identité du compte.
--
-- Additive seule : une valeur ajoutée à l'énumération, deux colonnes
-- nullables. Aucune ligne existante n'est réécrite, aucun rôle n'est donné :
-- le premier super-administrateur se nomme par la console du serveur
-- (`changer-role --role SUPER_ADMIN`), avec motif et trace au journal.
--
-- PostgreSQL accepte `ADD VALUE` dans une transaction depuis la version 12,
-- à condition que la valeur n'y soit pas utilisée : rien ci-dessous ne
-- l'emploie.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';

ALTER TABLE "User" ADD COLUMN "displayName" TEXT;
ALTER TABLE "User" ADD COLUMN "birthDate" DATE;

-- Le nom affiché garde ses bornes en base aussi (2 à 80 caractères) : une
-- écriture qui contournerait le domaine bute sur la même règle.
ALTER TABLE "User"
  ADD CONSTRAINT "user_nom_affiche_borne"
  CHECK ("displayName" IS NULL OR char_length("displayName") BETWEEN 2 AND 80);
