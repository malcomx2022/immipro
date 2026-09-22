-- Incident de balayage — I.D, lot du 22/09/2026.
--
-- Le balayeur est branché sur un moteur réel, et un moteur réel tombe. Tant
-- qu'il n'y avait pas d'appel réseau, l'indisponibilité était une hypothèse ;
-- elle est maintenant un état de tous les jours, et une pièce peut rester en
-- quarantaine sans que personne le sache. Ces quatre colonnes rendent cette
-- attente lisible depuis l'extérieur, et **sans rien accepter** : elles
-- comptent et datent, elles ne promeuvent pas.

ALTER TABLE "DocumentVersion"
  ADD COLUMN "scanAttempts"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "scanLastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "scanIncidentAt"    TIMESTAMP(3),
  ADD COLUMN "scanIncidentCause" TEXT;

-- Un compteur de tentatives ne descend pas sous zéro. Trivial à écrire, et
-- c'est le genre de colonne qu'un `decrement` mal placé rend négative sans
-- que rien ne s'en aperçoive avant qu'un seuil cesse de se déclencher.
ALTER TABLE "DocumentVersion"
  ADD CONSTRAINT "document_version_tentatives_positives"
  CHECK ("scanAttempts" >= 0);

-- Une tentative comptée porte sa date, et l'absence de tentative n'en porte
-- aucune. Même forme que `document_version_balayage_date` : une équivalence,
-- parce que c'est le compteur sans date qui rendrait l'attente invérifiable.
ALTER TABLE "DocumentVersion"
  ADD CONSTRAINT "document_version_tentative_datee"
  CHECK (("scanAttempts" = 0) = ("scanLastAttemptAt" IS NULL));

-- Un incident nomme sa cause. Un incident anonyme dirait « quelque chose ne
-- va pas » sans dire s'il faut attendre ou intervenir, ce qui est la seule
-- question que l'exploitation se pose.
ALTER TABLE "DocumentVersion"
  ADD CONSTRAINT "document_version_incident_nomme"
  CHECK (("scanIncidentAt" IS NULL) = ("scanIncidentCause" IS NULL));

-- **La contrainte qui compte.** Un incident ouvert n'existe que sur une
-- pièce encore en quarantaine. Elle interdit qu'une version promue — ou
-- écartée — traîne un incident derrière elle, donc elle interdit de décider
-- d'une version sans avoir soldé son attente. Un écran d'exploitation qui
-- compte les incidents compte alors des pièces réellement bloquées, et non
-- l'historique de celles qui sont passées.
ALTER TABLE "DocumentVersion"
  ADD CONSTRAINT "document_version_incident_en_quarantaine"
  CHECK ("scanIncidentAt" IS NULL OR "scanState" = 'EN_QUARANTAINE');

-- L'exploitation lit les incidents par ancienneté : le plus vieux dit depuis
-- combien de temps la chaîne est arrêtée.
--
-- Index complet et non partiel, alors que la colonne est nulle pour la
-- quasi-totalité des lignes : Prisma ne sait pas décrire un index partiel,
-- et `smoke:migrations` compare `schema.prisma` à ce que les migrations
-- construisent. Un index plus économe au prix d'une dérive permanente
-- entre les deux serait un mauvais échange — c'est la dérive qui coûte.
CREATE INDEX "DocumentVersion_scanIncidentAt_idx"
  ON "DocumentVersion"("scanIncidentAt");
