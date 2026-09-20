-- Vérification des garde-fous portés par la base.
--
-- Chaque bloc tente une écriture que la migration doit refuser. Un bloc qui
-- ne lève pas d'exception est une contrainte absente : la sortie le dit.
--
--   psql "$DATABASE_URL" -f scripts/verifier-garde-fous.sql
--
-- Le script n'écrit rien : chaque essai est annulé.

\set ON_ERROR_STOP off
\pset pager off

CREATE OR REPLACE FUNCTION refuse(intitule text, ecriture text) RETURNS text AS $$
BEGIN
  BEGIN
    EXECUTE ecriture;
  -- Un refus vaut refus, qu'il vienne d'un CHECK, d'une unicité ou d'une
  -- clé étrangère : ce qui se vérifie ici, c'est que l'écriture n'entre pas.
  EXCEPTION WHEN check_violation OR unique_violation OR foreign_key_violation OR not_null_violation THEN
    RETURN '  refusé   · ' || intitule;
  WHEN others THEN
    RETURN '  ERREUR   · ' || intitule || ' → ' || SQLERRM;
  END;
  RETURN '  ACCEPTÉ  · ' || intitule || ' — la contrainte manque';
END;
$$ LANGUAGE plpgsql;

BEGIN;

SELECT refuse(
  'INV-4 · une règle SECONDAIRE ne se publie pas',
  $q$INSERT INTO "VisaRule" (id, "countryCode", "visaType", category, version, "effectiveFrom",
       rules, "sourceUrl", "sourceTier", "verifiedAt", "verifiedBy", "nextReviewAt", status, "updatedAt")
     VALUES ('t1','NL','etudes','ETUDES',1,'2026-01-01','{}','https://x','SECONDAIRE',
       '2026-01-01','veilleur','2026-04-01','PUBLISHED', now())$q$);

SELECT refuse(
  'INV-8 · une règle sans source ne s''écrit pas',
  $q$INSERT INTO "VisaRule" (id, "countryCode", "visaType", category, version, "effectiveFrom",
       rules, "sourceUrl", "sourceTier", "verifiedAt", "verifiedBy", "nextReviewAt", status, "updatedAt")
     VALUES ('t2','NL','etudes','ETUDES',2,'2026-01-01','{}','   ','OFFICIEL',
       '2026-01-01','veilleur','2026-04-01','DRAFT', now())$q$);

INSERT INTO "User" (id, email, "createdAt") VALUES ('u1','a@b.c', now());

SELECT refuse(
  'INV-3 · un dossier actif a figé sa version de règle',
  $q$INSERT INTO "Application" (id, "userId", status, "updatedAt")
     VALUES ('a1','u1','ACTIF', now())$q$);

SELECT refuse(
  'RG-07.2 · PRET sans date de passage',
  $q$INSERT INTO "Application" (id, "userId", status, "visaRuleId", "updatedAt")
     VALUES ('a2','u1','PRET', NULL, now())$q$);

INSERT INTO "Application" (id, "userId", status, "updatedAt") VALUES ('a0','u1','BROUILLON', now());

SELECT refuse(
  'INV-6 · une écriture de quota à zéro',
  $q$INSERT INTO "AnalysisCredit" (id, "applicationId", delta, reason)
     VALUES ('c1','a0',0,'ACHAT_PACK')$q$);

SELECT refuse(
  'INV-6 · une analyse qui crédite au lieu de débiter',
  $q$INSERT INTO "AnalysisCredit" (id, "applicationId", delta, reason)
     VALUES ('c2','a0',5,'ANALYSE')$q$);

INSERT INTO "Consultant" (id, name, firm, city, qualification, languages, "responseHours")
  VALUES ('k1','M','F','V','agréé','[]',24);

SELECT refuse(
  'RG-12.2 · un partage de dossier sans échéance postérieure',
  $q$INSERT INTO "ConsultantAccess" (id, "applicationId", "consultantId", "grantedAt", "expiresAt")
     VALUES ('x1','a0','k1', now(), now() - interval '1 day')$q$);

SELECT refuse(
  'WF-12 · une annulation gratuite après le créneau',
  $q$INSERT INTO "Appointment" (id, reference, "applicationId", "consultantId", "startsAt",
       "durationMin", "freeUntil")
     VALUES ('r1','RDV-1','a0','k1', now() + interval '2 day', 45, now() + interval '3 day')$q$);

INSERT INTO "Document" (id, "applicationId", code, label) VALUES ('d1','a0','ID','Passeport');

SELECT refuse(
  'C-07 · une version de pièce sans contenu',
  $q$INSERT INTO "DocumentVersion" (id, "documentId", rank) VALUES ('v1','d1',1)$q$);

SELECT refuse(
  'INV-5 · une version purgée qui garde sa clé d''objet',
  $q$INSERT INTO "DocumentVersion" (id, "documentId", rank, "objectKey", "purgedAt")
     VALUES ('v2','d1',2,'minio/x', now())$q$);

INSERT INTO "DocumentVersion" (id, "documentId", rank, "objectKey", checksum)
  VALUES ('v3','d1',3,'minio/y','abc');

SELECT refuse(
  'RG-06.2 · deux versions de même empreinte sur une même pièce',
  $q$INSERT INTO "DocumentVersion" (id, "documentId", rank, "objectKey", checksum)
     VALUES ('v4','d1',4,'minio/z','abc')$q$);

INSERT INTO "DocumentAnalysis" (id, "versionId", verdict, title, body)
  VALUES ('an1','v3','A_CORRIGER','Titre','Corps actionnable de la remarque.');

SELECT refuse(
  'RG-06.3 · une revue décidée sans message au candidat',
  $q$INSERT INTO "ManualReview" (id, "analysisId", reason, decision, "decidedAt")
     VALUES ('m1','an1','ECHEC_TECHNIQUE','A_CORRIGER', now())$q$);

SELECT refuse(
  'RG-15.1 · une écriture d''audit sans motif',
  $q$INSERT INTO "AuditLog" (id, "actorId", action, target, reason)
     VALUES ('l1','op','LECTURE','d1','   ')$q$);

-- ── Sessions et secrets à usage unique ─────────────────────────────

SELECT refuse(
  'A-02 · une session qui expire avant d''être créée',
  $q$INSERT INTO "Session" (id, "tokenHash", "userId", "expiresAt", "createdAt")
     VALUES ('s1','h1','u1', now() - interval '1 day', now())$q$);

SELECT refuse(
  'A-03 · un code de vérification expiré à l''émission',
  $q$INSERT INTO "AuthSecret" (id, "userId", kind, "secretHash", "expiresAt", "createdAt")
     VALUES ('k1','u1','VERIFICATION_EMAIL','h', now() - interval '1 minute', now())$q$);

SELECT refuse(
  'A-03 · un compteur d''essais négatif, qui rouvre la recherche par force brute',
  $q$INSERT INTO "AuthSecret" (id, "userId", kind, "secretHash", "expiresAt", attempts)
     VALUES ('k2','u1','VERIFICATION_EMAIL','h', now() + interval '10 minutes', -1)$q$);

-- ── Suppression de compte (RG-10.4) ────────────────────────────────

SELECT refuse(
  'RG-10.4 · un compte anonymisé sans demande de suppression',
  $q$UPDATE "User" SET "deletedAt" = now() WHERE id = 'u1'$q$);

SELECT refuse(
  'RG-10.4 · une anonymisation qui garde le nom du candidat',
  $q$UPDATE "User"
        SET "deletionRequestedAt" = now(), "deletedAt" = now(), "firstName" = 'Aline'
      WHERE id = 'u1'$q$);

SELECT refuse(
  'RG-10.4 · une anonymisation qui garde l''empreinte du mot de passe',
  $q$UPDATE "User"
        SET "deletionRequestedAt" = now(), "deletedAt" = now(), "passwordHash" = 'scrypt$x'
      WHERE id = 'u1'$q$);

-- ── Affiliation partenaires (WF-13) ────────────────────────────────

INSERT INTO "Partner" (id, name, kind, url, "commissionBps")
  VALUES ('p1','Cabinet X','CONSULTANT','https://x.example',1500);

SELECT refuse(
  'RG-13.3 · un taux de commission hors bornes',
  $q$INSERT INTO "Partner" (id, name, kind, url, "commissionBps")
     VALUES ('p2','Cabinet Y','CONSULTANT','https://y.example',12000)$q$);

SELECT refuse(
  'RG-13.4 · une activation sans vérification nommée',
  $q$INSERT INTO "PartnerActivation" (id, "partnerId", "countryCode", basis, "verifiedAt", "verifiedBy")
     VALUES ('pa1','p1','NL','   ','2026-01-01','veilleur')$q$);

SELECT refuse(
  'RG-13.1 · une proposition sans étape de checklist',
  $q$INSERT INTO "PartnerReferral" (id, "partnerId", "applicationId", step, motive, "commissionBps")
     VALUES ('pr1','p1','a0','  ','Refus déclaré en 2024',1500)$q$);

SELECT refuse(
  'WF-13 · une commission inscrite avant l''aboutissement',
  $q$INSERT INTO "PartnerReferral" (id, "partnerId", "applicationId", step, motive,
       "commissionBps", "commissionAmount", "commissionCurrency")
     VALUES ('pr2','p1','a0','ID','Refus déclaré en 2024',1500,20000,'XOF')$q$);

SELECT refuse(
  'WF-13 · une proposition aboutie sans date de règlement',
  $q$INSERT INTO "PartnerReferral" (id, "partnerId", "applicationId", step, motive,
       "commissionBps", status, "redirectedAt")
     VALUES ('pr3','p1','a0','ID','Refus déclaré en 2024',1500,'ABOUTIE', now())$q$);

SELECT refuse(
  'WF-13 · un aboutissement sans redirection tracée',
  $q$INSERT INTO "PartnerReferral" (id, "partnerId", "applicationId", step, motive,
       "commissionBps", status, "settledAt")
     VALUES ('pr4','p1','a0','ID','Refus déclaré en 2024',1500,'ABOUTIE', now())$q$);

ROLLBACK;

DROP FUNCTION IF EXISTS refuse(text, text);
