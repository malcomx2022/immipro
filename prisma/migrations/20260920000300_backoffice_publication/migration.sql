-- Back-office de publication éditoriale — J.C, B-08.
--
-- Les guides pays et les articles étaient les deux derniers écrans publics
-- à lire un fichier du dépôt. Un guide ne se changeait donc pas sans un
-- développeur, un déploiement et une relecture de code — et surtout, le
-- vocabulaire interdit ne protégeait personne là où `CLAUDE.md` promet
-- qu'il protège : « un administrateur qui saisit une promesse dans un guide
-- pays bute sur la même règle qu'un développeur ». Cette phrase décrivait
-- un dispositif qui n'existait pas, faute d'écran où saisir un guide.

CREATE TYPE "EditorialKind" AS ENUM ('GUIDE', 'ARTICLE');
CREATE TYPE "EditorialStatus" AS ENUM ('BROUILLON', 'PUBLIE', 'RETIRE');

CREATE TABLE "EditorialDoc" (
  "id"           TEXT NOT NULL,
  "kind"         "EditorialKind" NOT NULL,
  "slug"         TEXT NOT NULL,
  "status"       "EditorialStatus" NOT NULL DEFAULT 'BROUILLON',
  "title"        TEXT NOT NULL,
  "standfirst"   TEXT NOT NULL,
  "body"         JSONB NOT NULL,
  "sourceLabel"  TEXT,
  "verifiedAt"   TIMESTAMP(3),
  "countryLabel" TEXT,
  "section"      TEXT,
  "author"       TEXT,
  "publishedAt"  TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EditorialDoc_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EditorialDoc_kind_slug_key" ON "EditorialDoc"("kind", "slug");
CREATE INDEX "EditorialDoc_kind_status_idx" ON "EditorialDoc"("kind", "status");

-- ── Garde-fous ─────────────────────────────────────────────────────────────
-- Même raison que les migrations précédentes : une règle écrite dans un
-- service ne protège que ce service, et celui-ci sera un jour appelé depuis
-- un import en masse ou une console.

-- INV-8 — toute information réglementaire affichée porte sa source et sa
-- date de vérification. Un guide publié sans elles afficherait un pied de
-- page vide là où le lecteur cherche d'où vient ce qu'il vient de lire.
ALTER TABLE "EditorialDoc"
  ADD CONSTRAINT "editorial_publie_porte_sa_source"
  CHECK (
    "status" <> 'PUBLIE'
    OR ("sourceLabel" IS NOT NULL AND btrim("sourceLabel") <> '' AND "verifiedAt" IS NOT NULL)
  );

-- Un document publié a une date de publication, et un brouillon n'en a pas.
-- Sans cela, un article daté du jour de sa création annoncerait une date de
-- parution que personne n'a décidée.
ALTER TABLE "EditorialDoc"
  ADD CONSTRAINT "editorial_date_de_publication_suit_l_etat"
  CHECK (
    ("status" = 'BROUILLON' AND "publishedAt" IS NULL)
    OR ("status" <> 'BROUILLON' AND "publishedAt" IS NOT NULL)
  );

-- L'adresse publique n'est pas vide, et ne porte que ce qui tient dans une
-- URL : elle est saisie une fois et ne change plus.
ALTER TABLE "EditorialDoc"
  ADD CONSTRAINT "editorial_adresse_publique_lisible"
  CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- Un guide nomme son pays, un article sa rubrique et son auteur. Le surtitre
-- de P-05 et la signature de P-07 sont dans la maquette : les laisser
-- facultatifs produirait un écran à trou.
ALTER TABLE "EditorialDoc"
  ADD CONSTRAINT "editorial_guide_nomme_son_pays"
  CHECK ("kind" <> 'GUIDE' OR ("countryLabel" IS NOT NULL AND btrim("countryLabel") <> ''));

ALTER TABLE "EditorialDoc"
  ADD CONSTRAINT "editorial_article_nomme_sa_rubrique_et_son_auteur"
  CHECK (
    "kind" <> 'ARTICLE'
    OR ("section" IS NOT NULL AND btrim("section") <> ''
        AND "author" IS NOT NULL AND btrim("author") <> '')
  );
