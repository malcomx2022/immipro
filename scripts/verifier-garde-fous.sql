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

-- ── I.D · la quarantaine et le balayage ───────────────────────────────────
SELECT refuse(
  'I.D · une version déclarée saine sans date de balayage',
  $q$INSERT INTO "DocumentVersion" (id, "documentId", rank, "objectKey", checksum, "scanState")
     VALUES ('v5','d1',5,'minio/aa','aa1','SAINE')$q$);

SELECT refuse(
  'I.D · une date de balayage sur une pièce encore en quarantaine',
  $q$INSERT INTO "DocumentVersion" (id, "documentId", rank, "objectKey", checksum,
       "scanState", "scannedAt")
     VALUES ('v6','d1',6,'minio/bb','bb1','EN_QUARANTAINE', now())$q$);

SELECT refuse(
  'I.D · une menace nommée sur une version saine',
  $q$INSERT INTO "DocumentVersion" (id, "documentId", rank, "objectKey", checksum,
       "scanState", "scannedAt", "scanFinding")
     VALUES ('v7','d1',7,'minio/cc','cc1','SAINE', now(), 'Eicar-Test')$q$);

SELECT refuse(
  'I.D · une version écartée qui garde ses octets',
  $q$INSERT INTO "DocumentVersion" (id, "documentId", rank, "objectKey", checksum,
       "scanState", "scannedAt")
     VALUES ('v8','d1',8,'minio/dd','dd1','INFECTEE', now())$q$);

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

-- ── N.B · le motif d'un refus ─────────────────────────────────────────────
--
-- Chacun de ces quatre porte `failureCauseAt` depuis O.B, et ce n'est pas
-- une formalité : sans la date, la nouvelle contrainte
-- `transaction_motif_porte_sa_date` les refusait tous les quatre la
-- première, et chacun passait pour la mauvaise raison. Le décompte restait
-- à quarante-cinq refus — un garde-fou vérifié par un autre que le sien ne
-- vérifie plus rien.
SELECT refuse(
  'N.B · un motif de refus sur un paiement encaissé',
  $q$INSERT INTO "Transaction" (id, reference, "userId", "packCode", amount, currency,
       provider, status, "failureCause", "failureCauseAt")
     VALUES ('t1','IMP-260920-AAAAAA','u1','essentiel',5000,'XOF','FEDAPAY','CONFIRMEE','REFUS_EMETTEUR',now())$q$);

SELECT refuse(
  'N.B · un motif de refus sur un paiement encore en attente',
  $q$INSERT INTO "Transaction" (id, reference, "userId", "packCode", amount, currency,
       provider, status, "failureCause", "failureCauseAt")
     VALUES ('t2','IMP-260920-BBBBBB','u1','essentiel',5000,'XOF','FEDAPAY','EN_ATTENTE','SOLDE_INSUFFISANT',now())$q$);

SELECT refuse(
  'N.B · une expiration qui accuserait le payeur',
  $q$INSERT INTO "Transaction" (id, reference, "userId", "packCode", amount, currency,
       provider, status, "failureCause", "failureCauseAt")
     VALUES ('t3','IMP-260920-CCCCCC','u1','essentiel',5000,'XOF','FEDAPAY','EXPIREE','SOLDE_INSUFFISANT',now())$q$);

SELECT refuse(
  'N.B · un échec annoncé par l''émetteur qui se dirait hors délai',
  $q$INSERT INTO "Transaction" (id, reference, "userId", "packCode", amount, currency,
       provider, status, "failureCause", "failureCauseAt")
     VALUES ('t4','IMP-260920-DDDDDD','u1','essentiel',5000,'XOF','FEDAPAY','ECHOUEE','DELAI_DEPASSE',now())$q$);

-- ── P.B · l'historique des publications ───────────────────────────────────
SELECT refuse(
  'P.B · une version publiée sans source (INV-8)',
  $q$INSERT INTO "EditorialVersion" (id, "docId", rang, title, standfirst, body,
       "sourceLabel", "verifiedAt", "publishedBy", reason)
     VALUES ('ev1','d1',1,'Titre','Chapeau','{}'::jsonb,'   ', now(),'op','Publication')$q$);

SELECT refuse(
  'P.B · une version publiée sans motif',
  $q$INSERT INTO "EditorialVersion" (id, "docId", rang, title, standfirst, body,
       "sourceLabel", "verifiedAt", "publishedBy", reason)
     VALUES ('ev2','d1',1,'Titre','Chapeau','{}'::jsonb,'service-public.fr', now(),'op','  ')$q$);

SELECT refuse(
  'P.B · une version sans auteur de publication',
  $q$INSERT INTO "EditorialVersion" (id, "docId", rang, title, standfirst, body,
       "sourceLabel", "verifiedAt", "publishedBy", reason)
     VALUES ('ev3','d1',1,'Titre','Chapeau','{}'::jsonb,'service-public.fr', now(),'','Publication')$q$);

SELECT refuse(
  'P.B · une version de rang nul, qui rendrait « la version 1 » ambigu',
  $q$INSERT INTO "EditorialVersion" (id, "docId", rang, title, standfirst, body,
       "sourceLabel", "verifiedAt", "publishedBy", reason)
     VALUES ('ev4','d1',0,'Titre','Chapeau','{}'::jsonb,'service-public.fr', now(),'op','Publication')$q$);

-- ── O.B · la conservation du motif ────────────────────────────────────────
SELECT refuse(
  'O.B · un motif d''échec sans date, qui échapperait à la purge',
  $q$INSERT INTO "Transaction" (id, reference, "userId", "packCode", amount, currency,
       provider, status, "failureCause")
     VALUES ('t40','IMP-260920-NNNNNN','u1','essentiel',5000,'XOF','FEDAPAY','ECHOUEE','REFUS_EMETTEUR')$q$);

SELECT refuse(
  'O.B · une date d''échec sans motif à effacer',
  $q$INSERT INTO "Transaction" (id, reference, "userId", "packCode", amount, currency,
       provider, status, "failureCauseAt")
     VALUES ('t41','IMP-260920-OOOOOO','u1','essentiel',5000,'XOF','FEDAPAY','ECHOUEE',now())$q$);

SELECT refuse(
  'O.B · un échec daté avant l''ouverture de sa transaction',
  $q$INSERT INTO "Transaction" (id, reference, "userId", "packCode", amount, currency,
       provider, status, "createdAt", "failureCause", "failureCauseAt")
     VALUES ('t42','IMP-260920-PPPPPP','u1','essentiel',5000,'XOF','FEDAPAY','ECHOUEE',
       now(), 'REFUS_EMETTEUR', now() - interval '1 hour')$q$);

-- ── M.B · le remboursement ────────────────────────────────────────────────
SELECT refuse(
  'M.B · un remboursement sans date',
  $q$INSERT INTO "Transaction" (id, reference, "userId", "packCode", amount, currency,
       provider, status, "confirmedAt")
     VALUES ('t5','IMP-260920-EEEEEE','u1','essentiel',5000,'XOF','FEDAPAY','REMBOURSEE',now())$q$);

SELECT refuse(
  'M.B · une date de remboursement sur un paiement encore acquis',
  $q$INSERT INTO "Transaction" (id, reference, "userId", "packCode", amount, currency,
       provider, status, "confirmedAt", "refundedAt")
     VALUES ('t6','IMP-260920-FFFFFF','u1','essentiel',5000,'XOF','FEDAPAY','CONFIRMEE',now(),now())$q$);

SELECT refuse(
  'M.B · un remboursement sans encaissement préalable',
  $q$INSERT INTO "Transaction" (id, reference, "userId", "packCode", amount, currency,
       provider, status, "refundedAt")
     VALUES ('t7','IMP-260920-GGGGGG','u1','essentiel',5000,'XOF','FEDAPAY','REMBOURSEE',now())$q$);

-- ── K.C · le remboursement dû ─────────────────────────────────────────────
SELECT refuse(
  'K.C · un remboursement dû sans motif',
  $q$INSERT INTO "Transaction" (id, reference, "userId", "packCode", amount, currency,
       provider, status, "confirmedAt", "refundDueAt")
     VALUES ('t8','IMP-260920-HHHHHH','u1','essentiel',20000,'XOF','FEDAPAY','CONFIRMEE',
       now(), now())$q$);

SELECT refuse(
  'K.C · un motif de remboursement sans obligation ouverte',
  $q$INSERT INTO "Transaction" (id, reference, "userId", "packCode", amount, currency,
       provider, status, "confirmedAt", "refundBasis")
     VALUES ('t9','IMP-260920-IIIIII','u1','essentiel',20000,'XOF','FEDAPAY','CONFIRMEE',
       now(), 'Suppression de compte')$q$);

SELECT refuse(
  'K.C · un remboursement dû sur un paiement jamais encaissé',
  $q$INSERT INTO "Transaction" (id, reference, "userId", "packCode", amount, currency,
       provider, status, "refundDueAt", "refundBasis")
     VALUES ('t10','IMP-260920-JJJJJJ','u1','essentiel',20000,'XOF','FEDAPAY','EN_ATTENTE',
       now(), 'Suppression de compte')$q$);

SELECT refuse(
  'K.C · un versement antérieur à la décision qui l''ouvre',
  $q$INSERT INTO "Transaction" (id, reference, "userId", "packCode", amount, currency,
       provider, status, "confirmedAt", "refundedAt", "refundDueAt", "refundBasis")
     VALUES ('t11','IMP-260920-KKKKKK','u1','essentiel',20000,'XOF','FEDAPAY','REMBOURSEE',
       now() - interval '2 days', now() - interval '1 day', now(), 'Geste de support')$q$);

-- ── J.C · la publication éditoriale ───────────────────────────────────────
SELECT refuse(
  'INV-8 · un guide publié sans source ni date de vérification',
  $q$INSERT INTO "EditorialDoc" (id, kind, slug, status, title, standfirst, body,
       "countryLabel", "publishedAt", "updatedAt")
     VALUES ('e1','GUIDE','pays-bas-essai','PUBLIE','Titre','Chapeau','{}'::jsonb,
       'Pays-Bas', now(), now())$q$);

SELECT refuse(
  'J.C · un brouillon portant une date de publication',
  $q$INSERT INTO "EditorialDoc" (id, kind, slug, status, title, standfirst, body,
       "countryLabel", "publishedAt", "updatedAt")
     VALUES ('e2','GUIDE','pays-bas-essai','BROUILLON','Titre','Chapeau','{}'::jsonb,
       'Pays-Bas', now(), now())$q$);

SELECT refuse(
  'J.C · une adresse publique qui ne tient pas dans une URL',
  $q$INSERT INTO "EditorialDoc" (id, kind, slug, status, title, standfirst, body,
       "countryLabel", "updatedAt")
     VALUES ('e3','GUIDE','Pays Bas !','BROUILLON','Titre','Chapeau','{}'::jsonb,
       'Pays-Bas', now())$q$);

SELECT refuse(
  'J.C · un guide qui ne nomme pas son pays',
  $q$INSERT INTO "EditorialDoc" (id, kind, slug, status, title, standfirst, body, "updatedAt")
     VALUES ('e4','GUIDE','pays-bas-essai','BROUILLON','Titre','Chapeau','{}'::jsonb, now())$q$);

SELECT refuse(
  'J.C · un article sans rubrique ni signature',
  $q$INSERT INTO "EditorialDoc" (id, kind, slug, status, title, standfirst, body, "updatedAt")
     VALUES ('e5','ARTICLE','releve-essai','BROUILLON','Titre','Chapeau','{}'::jsonb, now())$q$);

ROLLBACK;

DROP FUNCTION IF EXISTS refuse(text, text);
