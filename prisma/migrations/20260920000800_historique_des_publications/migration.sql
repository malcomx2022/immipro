-- L'historique des publications d'un guide ou d'un article — P.B, tranché
-- le 20/09/2026 en faveur d'un historique des publications uniquement.
--
-- Une règle est versionnée parce qu'un dossier fige la sienne (INV-3) ; un
-- guide n'a rien qui le fige, et c'est ce qui a fait conclure trop vite
-- qu'il n'avait pas besoin d'histoire. Le journal d'audit gardait pourtant
-- qui avait publié et pourquoi, sur un texte que la republication effaçait
-- : la trace désignait un contenu qui n'existait plus.
--
-- Une version par publication, pas par frappe. Elle sert à quatre choses —
-- prouver ce qui était public à une date, revenir en arrière, donner un
-- objet à la ligne d'audit, et comprendre une information erronée signalée
-- après coup.

CREATE TABLE "EditorialVersion" (
  "id"           TEXT NOT NULL,
  "docId"        TEXT NOT NULL,
  "rang"         INTEGER NOT NULL,
  "title"        TEXT NOT NULL,
  "standfirst"   TEXT NOT NULL,
  "body"         JSONB NOT NULL,
  "sourceLabel"  TEXT NOT NULL,
  "verifiedAt"   TIMESTAMP(3) NOT NULL,
  "countryLabel" TEXT,
  "section"      TEXT,
  "author"       TEXT,
  "publishedBy"  TEXT NOT NULL,
  "reason"       TEXT NOT NULL,
  "publishedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EditorialVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EditorialVersion_docId_rang_key"
  ON "EditorialVersion"("docId", "rang");
CREATE INDEX "EditorialVersion_docId_publishedAt_idx"
  ON "EditorialVersion"("docId", "publishedAt");

ALTER TABLE "EditorialVersion"
  ADD CONSTRAINT "EditorialVersion_docId_fkey"
  FOREIGN KEY ("docId") REFERENCES "EditorialDoc"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Garde-fous ─────────────────────────────────────────────────────────────
-- Même raison que les migrations précédentes : une règle écrite dans un
-- service ne protège que ce service.

-- Les rangs se comptent à partir de un. Un rang nul ou négatif ferait de
-- « la version 1 » une expression ambiguë, dans une table dont tout
-- l'intérêt est de désigner une version sans ambiguïté.
ALTER TABLE "EditorialVersion"
  ADD CONSTRAINT "version_editoriale_rang_a_partir_de_un"
  CHECK ("rang" >= 1);

-- INV-8 — ce qui a été public portait sa source. La colonne est déjà non
-- nulle ; une chaîne d'espaces la contournerait, comme partout ailleurs.
ALTER TABLE "EditorialVersion"
  ADD CONSTRAINT "version_editoriale_porte_sa_source"
  CHECK (btrim("sourceLabel") <> '');

-- Une version sans motif ne se relit pas : l'historique existe pour
-- répondre à « pourquoi ce texte a-t-il changé », et un motif vide rend la
-- ligne aussi muette que l'absence de ligne.
ALTER TABLE "EditorialVersion"
  ADD CONSTRAINT "version_editoriale_porte_son_motif"
  CHECK (btrim("reason") <> '' AND btrim("publishedBy") <> '');

-- L'immuabilité, elle, n'est pas ici. Aucune contrainte CHECK n'empêche un
-- UPDATE de réécrire une ligne. Elle tient comme celle du journal d'audit
-- (B-06) : par l'absence d'écrivain dans le code, et par un test qui
-- vérifie qu'aucune route ni aucun service n'appelle `editorialVersion`
-- en mise à jour ou en suppression.
