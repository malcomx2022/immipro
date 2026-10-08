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

-- Le miroir de `refuse` : ce qu'une contrainte ne doit **pas** bloquer.
-- Une unicité trop large se voit à ce qu'elle refuse de trop, et un fichier
-- qui ne sait dire que « refusé » ne l'attraperait jamais.
CREATE OR REPLACE FUNCTION passe(intitule text, ecriture text) RETURNS text AS $$
BEGIN
  BEGIN
    EXECUTE ecriture;
  EXCEPTION WHEN others THEN
    RETURN '  BLOQUÉ   · ' || intitule || ' → ' || SQLERRM;
  END;
  RETURN '  posé     · ' || intitule;
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

SELECT refuse(
  'RG-07.2 · une date de passage sans l''état qui va avec',
  $q$INSERT INTO "Application" (id, "userId", status, "visaRuleId", "readyAt", "updatedAt")
     VALUES ('a3','u1','SOUMIS', NULL, now(), now())$q$);

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

-- Une clé d'objet ne sert qu'à une version (07/10/2026, revue M1) : deux
-- versions sur le même objet le rendent lisible depuis deux dossiers.
SELECT refuse(
  'M1 · une seconde version sur la clé d''objet d''une autre',
  $q$INSERT INTO "DocumentVersion" (id, "documentId", rank, "objectKey", checksum)
     VALUES ('v3b','d1',30,'minio/y','abc-autre')$q$);

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

-- L'attente de balayage, et son incident (22/09/2026). Le balayeur parle
-- maintenant à un moteur réel : une pièce peut rester en quarantaine, et
-- c'est cette attente-là que la base tient cohérente.
SELECT refuse(
  'I.D · un incident de balayage sans cause, qui ne dirait pas quoi faire',
  $q$INSERT INTO "DocumentVersion" (id, "documentId", rank, "objectKey", checksum,
       "scanAttempts", "scanLastAttemptAt", "scanIncidentAt")
     VALUES ('v9','d1',9,'minio/ee','ee1', 3, now(), now())$q$);

SELECT refuse(
  'I.D · un incident ouvert sur une version déjà décidée',
  $q$INSERT INTO "DocumentVersion" (id, "documentId", rank, "objectKey", checksum,
       "scanState", "scannedAt", "scanIncidentAt", "scanIncidentCause")
     VALUES ('v10','d1',10,'minio/ff','ff1','SAINE', now(), now(), 'injoignable')$q$);

SELECT refuse(
  'I.D · une tentative de balayage comptée sans être datée',
  $q$INSERT INTO "DocumentVersion" (id, "documentId", rank, "objectKey", checksum,
       "scanAttempts")
     VALUES ('v11','d1',11,'minio/gg','gg1', 2)$q$);

SELECT refuse(
  'I.D · une date de tentative sans tentative comptée',
  $q$INSERT INTO "DocumentVersion" (id, "documentId", rank, "objectKey", checksum,
       "scanLastAttemptAt")
     VALUES ('v12','d1',12,'minio/hh','hh1', now())$q$);

SELECT refuse(
  'I.D · un compteur de tentatives négatif',
  $q$INSERT INTO "DocumentVersion" (id, "documentId", rank, "objectKey", checksum,
       "scanAttempts", "scanLastAttemptAt")
     VALUES ('v13','d1',13,'minio/ii','ii1', -1, now())$q$);

-- L'attente de lecture, et son compte (22/09/2026). L'extraction parle
-- maintenant à un service réel : une saturation se rejoue, et le nombre de
-- reprises décide du basculement en revue humaine. Un compte faux le
-- déclencherait trop tôt — une panne de tiers versée à la file de revue — ou
-- jamais.
SELECT refuse(
  'WF-06 · une tentative de lecture comptée sans être datée',
  $q$INSERT INTO "DocumentVersion" (id, "documentId", rank, "objectKey", checksum,
       "analysisAttempts")
     VALUES ('v14','d1',14,'minio/jj','jj1', 2)$q$);

SELECT refuse(
  'WF-06 · une date de tentative de lecture sans tentative comptée',
  $q$INSERT INTO "DocumentVersion" (id, "documentId", rank, "objectKey", checksum,
       "analysisLastAttemptAt")
     VALUES ('v15','d1',15,'minio/kk','kk1', now())$q$);

SELECT refuse(
  'WF-06 · un compteur de tentatives de lecture négatif',
  $q$INSERT INTO "DocumentVersion" (id, "documentId", rank, "objectKey", checksum,
       "analysisAttempts", "analysisLastAttemptAt")
     VALUES ('v16','d1',16,'minio/ll','ll1', -1, now())$q$);

-- La relecture d'une pièce rédigée (22/09/2026). Elle porte sur un texte, et
-- elle seule distingue « relu, rien à reprendre » de « jamais relu » : les
-- deux rendent une liste de remarques vide. R-04 lisait la seconde comme la
-- première, sur la foi d'une variable d'environnement.
-- Les rappels d'échéance (22/09/2026). Une échéance faite ne se rappelle
-- plus : porter la trace d'un rappel postérieur à son accomplissement
-- décrirait un courrier envoyé pour une date déjà tenue.
INSERT INTO "Deadline" (id, "applicationId", code, label, "dueAt", "doneAt")
  VALUES ('dl1','a0','depot','Déposer la demande', now() + interval '10 days',
          now() - interval '5 days');

SELECT refuse(
  'WF-09 · un rappel daté après l''accomplissement de l''échéance',
  $q$UPDATE "Deadline" SET "remindedAt" = now() WHERE id = 'dl1'$q$);

-- La propagation d'une divergence (22/09/2026, au soir). La ligne
-- d'arbitrage est créée **avant** l'alerte : c'est `alertedAt` qui dit que
-- le candidat a été prévenu, et l'ordre des deux dates est ce qui rend
-- lisible la question « a-t-il tranché après avoir été prévenu ? ».
INSERT INTO "VisaRule" (id, "countryCode", "visaType", category, version, "effectiveFrom",
    rules, "sourceUrl", "sourceTier", "verifiedAt", "verifiedBy", "nextReviewAt", status, "updatedAt")
  VALUES ('vr1','NL','etudes','ETUDES',9,'2026-01-01','{}','https://x','OFFICIEL',
    '2026-01-01','veilleur','2026-04-01','PUBLISHED', now());
INSERT INTO "VisaRule" (id, "countryCode", "visaType", category, version, "effectiveFrom",
    rules, "sourceUrl", "sourceTier", "verifiedAt", "verifiedBy", "nextReviewAt", status, "updatedAt")
  VALUES ('vr2','NL','etudes','ETUDES',10,'2026-01-01','{}','https://x','OFFICIEL',
    '2026-01-01','veilleur','2026-04-01','PUBLISHED', now());

-- La succession des versions (23/09/2026). `status` dit ce qui s'affiche,
-- `publishedAt` dit ce qui a été mis en vigueur — et c'est la seconde qui
-- ordonne la succession, parce que la veille repasse en DRAFT une fiche dont
-- la relecture est dépassée sans pour autant mettre fin à la version.
SELECT refuse(
  'WF-14 · une version archivée qui n''aurait jamais été mise en vigueur',
  $q$INSERT INTO "VisaRule" (id, "countryCode", "visaType", category, version, "effectiveFrom",
       rules, "sourceUrl", "sourceTier", "verifiedAt", "verifiedBy", "nextReviewAt", status, "updatedAt")
     VALUES ('vr9','NL','etudes','ETUDES',97,'2026-01-01','{}','https://x','OFFICIEL',
       '2026-01-01','veilleur','2026-04-01','ARCHIVED', now())$q$);

SELECT refuse(
  'WF-14 · une fin de validité sans mise en vigueur',
  $q$INSERT INTO "VisaRule" (id, "countryCode", "visaType", category, version, "effectiveFrom",
       "effectiveTo", rules, "sourceUrl", "sourceTier", "verifiedAt", "verifiedBy",
       "nextReviewAt", status, "updatedAt")
     VALUES ('vr10','NL','etudes','ETUDES',98,'2026-01-01','2026-06-01','{}','https://x','OFFICIEL',
       '2026-01-01','veilleur','2026-04-01','DRAFT', now())$q$);

SELECT refuse(
  'WF-14 · une version qui finit avant d''entrer en vigueur',
  $q$INSERT INTO "VisaRule" (id, "countryCode", "visaType", category, version, "effectiveFrom",
       "effectiveTo", "publishedAt", rules, "sourceUrl", "sourceTier", "verifiedAt", "verifiedBy",
       "nextReviewAt", status, "updatedAt")
     VALUES ('vr11','NL','etudes','ETUDES',99,'2026-01-01','2026-06-01','2026-09-01','{}','https://x','OFFICIEL',
       '2026-01-01','veilleur','2026-04-01','ARCHIVED', now())$q$);

-- Une version qu'un dossier a pu figer ne se réécrit pas (07/10/2026,
-- revue C1). L'échéance de relecture la repasse en DRAFT sans la retirer
-- aux dossiers : son statut change, son contenu non.
INSERT INTO "VisaRule" (id, "countryCode", "visaType", category, version, "effectiveFrom",
    "publishedAt", rules, "sourceUrl", "sourceTier", "verifiedAt", "verifiedBy",
    "nextReviewAt", status, "updatedAt")
  VALUES ('vr12','NL','etudes','ETUDES',100,'2026-01-01','2026-01-01','{}','https://x','OFFICIEL',
    '2026-01-01','veilleur','2026-04-01','PUBLISHED', now());

SELECT passe(
  'RG-14.1 · l''échéance de relecture retire de l''affichage une version en vigueur',
  $q$UPDATE "VisaRule" SET status = 'DRAFT', "verifiedAt" = now(), "nextReviewAt" = now()
     WHERE id = 'vr12'$q$);

SELECT refuse(
  'INV-3 · le contenu d''une version mise en vigueur ne se réécrit pas, même dépubliée',
  $q$UPDATE "VisaRule" SET rules = '{"libelle":"autre"}' WHERE id = 'vr12'$q$);

SELECT refuse(
  'INV-3 · la source d''une version mise en vigueur ne change pas',
  $q$UPDATE "VisaRule" SET "sourceUrl" = 'https://ailleurs' WHERE id = 'vr12'$q$);

SELECT refuse(
  'INV-3 · la date de mise en vigueur ne s''efface pas',
  $q$UPDATE "VisaRule" SET "publishedAt" = NULL WHERE id = 'vr12'$q$);

INSERT INTO "VisaRule" (id, "countryCode", "visaType", category, version, "effectiveFrom",
    rules, "sourceUrl", "sourceTier", "verifiedAt", "verifiedBy", "nextReviewAt", status, "updatedAt")
  VALUES ('vr13','NL','etudes','ETUDES',101,'2026-01-01','{}','https://x','OFFICIEL',
    '2026-01-01','veilleur','2026-04-01','DRAFT', now());
INSERT INTO "Application" (id, "userId", status, "visaRuleId", "updatedAt")
  VALUES ('a20','u1','BROUILLON','vr13', now());

SELECT refuse(
  'INV-3 · une version qu''un dossier référence ne se réécrit pas, même jamais datée',
  $q$UPDATE "VisaRule" SET rules = '{"libelle":"autre"}' WHERE id = 'vr13'$q$);

-- Et elle ne se supprime pas (07/10/2026, revue F12) : la clé étrangère
-- mettait à nul la règle d'un dossier encore en brouillon.
SELECT refuse(
  'INV-3 · une version qu''un dossier en brouillon a figée ne se supprime pas',
  $q$DELETE FROM "VisaRule" WHERE id = 'vr13'$q$);

INSERT INTO "VisaRule" (id, "countryCode", "visaType", category, version, "effectiveFrom",
    rules, "sourceUrl", "sourceTier", "verifiedAt", "verifiedBy", "nextReviewAt", status, "updatedAt")
  VALUES ('vr14','NL','etudes','ETUDES',102,'2026-01-01','{}','https://x','OFFICIEL',
    '2026-01-01','veilleur','2026-04-01','DRAFT', now());

SELECT passe(
  'WF-14 · un brouillon jamais mis en vigueur s''écrit',
  $q$UPDATE "VisaRule" SET rules = '{"libelle":"suivante"}', "sourceUrl" = 'https://y'
     WHERE id = 'vr14'$q$);

SELECT passe(
  'WF-14 · la publication d''un brouillon pose sa date de mise en vigueur',
  $q$UPDATE "VisaRule" SET status = 'PUBLISHED', "publishedAt" = now(), "effectiveFrom" = now()
     WHERE id = 'vr14'$q$);

SELECT refuse(
  'WF-11 · une divergence tranchée avant que le candidat en soit prévenu',
  $q$INSERT INTO "RuleMigration" (id, "applicationId", "fromRuleId", "toRuleId", impact, diff,
       "alertedAt", decision, "decidedAt")
     VALUES ('rm1','a0','vr1','vr2','CRITIQUE','[]', now(), 'CONSERVER', now() - interval '1 day')$q$);

SELECT refuse(
  'WF-08 · une relecture datée sur une pièce téléversée, qui n''a pas de texte',
  $q$INSERT INTO "DocumentVersion" (id, "documentId", rank, "objectKey", checksum,
       "critiquedAt")
     VALUES ('v17','d1',17,'minio/mm','mm1', now())$q$);

INSERT INTO "DocumentAnalysis" (id, "versionId", verdict, title, body)
  VALUES ('an1','v3','A_CORRIGER','Titre','Corps actionnable de la remarque.');

-- Une analyse ne se rend qu'une fois (07/10/2026, revue F4) ; un rendu de
-- tentative, sans analyse, n'est pas concerné.
INSERT INTO "AnalysisCredit" (id, "applicationId", delta, reason, "analysisId")
  VALUES ('ar1','a0',1,'ANALYSE_RENDUE','an1');

SELECT refuse(
  'INV-6 · un second rendu de la même analyse',
  $q$INSERT INTO "AnalysisCredit" (id, "applicationId", delta, reason, "analysisId")
     VALUES ('ar2','a0',1,'ANALYSE_RENDUE','an1')$q$);

SELECT passe(
  'INV-6 · deux rendus de tentative, sans analyse',
  $q$INSERT INTO "AnalysisCredit" (id, "applicationId", delta, reason)
     VALUES ('ar3','a0',1,'ANALYSE_RENDUE'), ('ar4','a0',1,'ANALYSE_RENDUE')$q$);

-- Une version s'analyse une fois (07/10/2026, revue E5) : un rejeu de la
-- file ne débite pas une seconde lecture et n'écrit pas un second verdict.
SELECT refuse(
  'INV-6 · une seconde analyse sur la même version',
  $q$INSERT INTO "DocumentAnalysis" (id, "versionId", verdict, title, body)
     VALUES ('an2','v3','CONFORME','Titre','Corps actionnable de la remarque.')$q$);

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

-- ── Rail de remboursement · les trois faits dans l'ordre ─────────────────
SELECT refuse(
  'Remboursement · une demande envoyée sans obligation ouverte',
  $q$INSERT INTO "Transaction" (id, reference, "userId", "packCode", amount, currency,
       provider, status, "confirmedAt", "refundRequestedAt")
     VALUES ('tr1','IMP-260921-RRRRRR','u1','essentiel',5000,'XOF','FEDAPAY','CONFIRMEE',
       now(), now())$q$);

SELECT refuse(
  'Remboursement · une tentative sur une somme qu''on ne doit pas',
  $q$INSERT INTO "Transaction" (id, reference, "userId", "packCode", amount, currency,
       provider, status, "confirmedAt", "refundAttemptedAt", "refundAttempts")
     VALUES ('tr2','IMP-260921-SSSSSS','u1','essentiel',5000,'XOF','FEDAPAY','CONFIRMEE',
       now(), now(), 1)$q$);

SELECT refuse(
  'Remboursement · une demande antérieure à la décision',
  $q$INSERT INTO "Transaction" (id, reference, "userId", "packCode", amount, currency,
       provider, status, "confirmedAt", "refundDueAt", "refundBasis", "refundRequestedAt")
     VALUES ('tr3','IMP-260921-TTTTTT','u1','essentiel',5000,'XOF','FEDAPAY','CONFIRMEE',
       now(), now(), 'Geste', now() - interval '1 hour')$q$);

SELECT refuse(
  'Remboursement · une tentative datée mais jamais comptée',
  $q$INSERT INTO "Transaction" (id, reference, "userId", "packCode", amount, currency,
       provider, status, "confirmedAt", "refundDueAt", "refundBasis", "refundAttemptedAt")
     VALUES ('tr4','IMP-260921-UUUUUU','u1','essentiel',5000,'XOF','FEDAPAY','CONFIRMEE',
       now(), now(), 'Geste', now())$q$);

SELECT refuse(
  'Remboursement · un compteur de tentatives négatif',
  $q$INSERT INTO "Transaction" (id, reference, "userId", "packCode", amount, currency,
       provider, status, "refundAttempts")
     VALUES ('tr5','IMP-260921-VVVVVV','u1','essentiel',5000,'XOF','FEDAPAY','EN_ATTENTE',-1)$q$);

-- ── Résolution des écarts · le guichet ne bricole pas une clôture ─────────
SELECT refuse(
  'Écart · une issue sans date de clôture',
  $q$INSERT INTO "Transaction" (id, reference, "userId", "packCode", amount, currency,
       provider, status, discrepancy, "discrepancyOutcome")
     VALUES ('te1','IMP-260921-AAAAAA','u1','essentiel',5000,'XOF','FEDAPAY','EN_ATTENTE',
       'Sans confirmation.', 'INCIDENT_TRANSMIS')$q$);

SELECT refuse(
  'Écart · une clôture sans note',
  $q$INSERT INTO "Transaction" (id, reference, "userId", "packCode", amount, currency,
       provider, status, discrepancy, "discrepancyOutcome", "discrepancyResolvedAt",
       "discrepancyResolvedBy")
     VALUES ('te2','IMP-260921-BBBBBB','u1','essentiel',5000,'XOF','FEDAPAY','EN_ATTENTE',
       'Sans confirmation.', 'INCIDENT_TRANSMIS', now(), 'op')$q$);

SELECT refuse(
  'Écart · une clôture que personne n''a prononcée',
  $q$INSERT INTO "Transaction" (id, reference, "userId", "packCode", amount, currency,
       provider, status, discrepancy, "discrepancyOutcome", "discrepancyNote",
       "discrepancyResolvedAt", "discrepancyResolvedBy")
     VALUES ('te3','IMP-260921-CCCCCC','u1','essentiel',5000,'XOF','FEDAPAY','EN_ATTENTE',
       'Sans confirmation.', 'INCIDENT_TRANSMIS', 'Relancé le fournisseur.', now(), '   ')$q$);

SELECT refuse(
  'Écart · une résolution sans écart à résoudre',
  $q$INSERT INTO "Transaction" (id, reference, "userId", "packCode", amount, currency,
       provider, status, "discrepancyOutcome", "discrepancyNote",
       "discrepancyResolvedAt", "discrepancyResolvedBy")
     VALUES ('te4','IMP-260921-DDDDDD','u1','essentiel',5000,'XOF','FEDAPAY','EN_ATTENTE',
       'INCIDENT_TRANSMIS', 'Relancé le fournisseur.', now(), 'op')$q$);

SELECT refuse(
  'Écart · une clôture antérieure à l''ouverture de la transaction',
  $q$INSERT INTO "Transaction" (id, reference, "userId", "packCode", amount, currency,
       provider, status, "createdAt", discrepancy, "discrepancyOutcome", "discrepancyNote",
       "discrepancyResolvedAt", "discrepancyResolvedBy")
     VALUES ('te5','IMP-260921-EEEEEE','u1','essentiel',5000,'XOF','FEDAPAY','EN_ATTENTE',
       now(), 'Sans confirmation.', 'INCIDENT_TRANSMIS', 'Relancé.',
       now() - interval '1 hour', 'op')$q$);

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

-- ── La tenue du créneau — arbitrage du 21/09/2026 ───────────────────────

SELECT refuse(
  'T-05 · un rendez-vous confirmé sans le paiement qui le paie',
  $q$INSERT INTO "Appointment" (id, reference, "applicationId", "consultantId",
       "startsAt", "durationMin", status, "freeUntil")
     SELECT 'rv1', 'RV-ESSAI-1', a.id, c.id, now() + interval '3 days', 45,
       'RESERVE', now() + interval '2 days'
       FROM "Application" a, "Consultant" c LIMIT 1$q$);

SELECT refuse(
  'T-05 · une tenue sans échéance, qui gèlerait le créneau',
  $q$INSERT INTO "Appointment" (id, reference, "applicationId", "consultantId",
       "startsAt", "durationMin", status, "freeUntil")
     SELECT 'rv2', 'RV-ESSAI-2', a.id, c.id, now() + interval '4 days', 45,
       'TENU', now() + interval '3 days'
       FROM "Application" a, "Consultant" c LIMIT 1$q$);

-- Un créneau n'est pris que par un rendez-vous vivant — RG-12.5.
--
-- L'unicité était totale : une ligne annulée gardait son horaire, et
-- RG-12.5 promet l'inverse. Les deux essais qui suivent tiennent les deux
-- moitiés de la règle : deux rendez-vous vivants ne partagent pas un
-- créneau, et un rendez-vous mort n'en occupe aucun.

INSERT INTO "Appointment" (id, reference, "applicationId", "consultantId",
    "startsAt", "durationMin", status, "freeUntil", "heldUntil")
  SELECT 'rv10', 'RV-ESSAI-10', a.id, c.id, now() + interval '9 days', 45,
    'TENU', now() + interval '8 days', now() + interval '10 minutes'
    FROM "Application" a, "Consultant" c LIMIT 1;

SELECT refuse(
  'T-05 · un second rendez-vous vivant sur un créneau déjà tenu',
  $q$INSERT INTO "Appointment" (id, reference, "applicationId", "consultantId",
       "startsAt", "durationMin", status, "freeUntil", "heldUntil")
     SELECT 'rv11', 'RV-ESSAI-11', a.id, c.id, now() + interval '9 days', 45,
       'TENU', now() + interval '8 days', now() + interval '10 minutes'
       FROM "Application" a, "Consultant" c LIMIT 1$q$);

-- Et l'inverse, qui doit passer : le créneau annulé se reprend. Une
-- unicité partielle qui refuserait aussi celle-ci gèlerait le créneau tout
-- autant, et c'est le défaut qu'elle corrige.
UPDATE "Appointment" SET status = 'ANNULE', "heldUntil" = NULL WHERE id = 'rv10';

SELECT passe(
  'T-05 · le créneau d''un rendez-vous annulé se reprend',
  $q$INSERT INTO "Appointment" (id, reference, "applicationId", "consultantId",
       "startsAt", "durationMin", status, "freeUntil", "heldUntil")
     SELECT 'rv12', 'RV-ESSAI-12', a.id, c.id, now() + interval '9 days', 45,
       'TENU', now() + interval '8 days', now() + interval '10 minutes'
       FROM "Application" a, "Consultant" c LIMIT 1$q$);

-- Ce que le pack vendait, figé à la vente (08/10/2026, revue M5, D-12) :
-- le nombre d'analyses ne va pas sans le nombre de destinations, et un
-- pack vend au moins une analyse pour au moins une destination.
SELECT refuse(
  'RG-15.2 · des analyses vendues sans leurs destinations',
  $q$INSERT INTO "Transaction" (id, reference, "userId", "packCode", "packAnalyses", amount,
       currency, provider, status)
     VALUES ('tm5a','IMP-261008-MCNQAA','u1','dossier',30,15000,'XOF','FEDAPAY','INITIEE')$q$);

SELECT refuse(
  'RG-15.2 · un pack vendu pour zéro analyse',
  $q$INSERT INTO "Transaction" (id, reference, "userId", "packCode", "packAnalyses",
       "packDestinations", amount, currency, provider, status)
     VALUES ('tm5b','IMP-261008-MCNQAB','u1','dossier',0,1,15000,'XOF','FEDAPAY','INITIEE')$q$);

-- ── Le remboursement sortant — arbitrage du 22/09/2026 ─────────────────

-- Une transaction confirmée dont le remboursement est décidé, et le
-- retrait de droits qui part à l'initiation. Les deux sont posés pour de
-- bon : le garde-fou qui suit a besoin d'un premier retrait existant.
INSERT INTO "Transaction" (id, reference, "userId", "packCode", amount, currency,
    provider, status, "confirmedAt", "refundDueAt", "refundBasis")
  VALUES ('t20','IMP-260922-RRRRRR','u1','essentiel',20000,'XOF','FEDAPAY','CONFIRMEE',
    now() - interval '2 days', now(), 'Geste de support');

INSERT INTO "AnalysisCredit" (id, "applicationId", delta, reason, "transactionId")
  VALUES ('ac1','a0',-10,'REMBOURSEMENT','t20');

-- Les droits non consommés partent une fois, et une seule. Deux reprises
-- simultanées passaient toutes deux la lecture préalable de l'appelant :
-- entre la lecture et l'écriture, l'autre était passé.
SELECT refuse(
  'K.C · un second retrait de droits sur le même remboursement',
  $q$INSERT INTO "AnalysisCredit" (id, "applicationId", delta, reason, "transactionId")
     VALUES ('ac2','a0',-10,'REMBOURSEMENT','t20')$q$);

-- Que l'index reste partiel — un octroi de pack coexistant avec le
-- retrait du même remboursement — s'éprouve dans
-- `scripts/fumee-remboursement.mts` : ce fichier-ci ne sait dire qu'une
-- chose, qu'une écriture est refusée.

ROLLBACK;

DROP FUNCTION IF EXISTS refuse(text, text);
DROP FUNCTION IF EXISTS passe(text, text);
