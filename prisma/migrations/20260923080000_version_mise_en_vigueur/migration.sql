-- La succession des versions d'une règle — WF-14 §5, WF-11.
--
-- `status` dit ce qui s'affiche aujourd'hui ; il ne dit pas ce qui a été mis
-- en vigueur. RG-14.1 repasse en `DRAFT` une fiche dont la relecture est
-- dépassée — elle cesse d'être montrée, mais elle reste la version que des
-- dossiers ont figée (INV-3), donc toujours en vigueur pour eux.
--
-- La publication de la version suivante cherchait son prédécesseur par
-- `status = 'PUBLISHED'`. Après une passe de veille, elle n'en trouvait
-- plus : rien n'était archivé, aucune divergence n'était mise en file, et un
-- candidat dont le seuil venait de monter de 1 500 € n'apprenait rien. La
-- relecture par défaut étant de quatre-vingt-dix jours, tout retard du
-- veilleur ouvre cette fenêtre — et une nouvelle version se publie
-- précisément quand il vient de relire.
ALTER TABLE "VisaRule" ADD COLUMN "publishedAt" TIMESTAMP(3);

-- Les versions déjà en vigueur ou déjà remplacées l'ont été à leur
-- `effectiveFrom` : c'est la date que la publication y écrit.
UPDATE "VisaRule"
   SET "publishedAt" = "effectiveFrom"
 WHERE "status" IN ('PUBLISHED', 'ARCHIVED');

-- Une version archivée a forcément été mise en vigueur : on n'archive pas un
-- brouillon, on l'abandonne.
ALTER TABLE "VisaRule"
  ADD CONSTRAINT "regle_archivee_a_ete_mise_en_vigueur"
  CHECK ("status" <> 'ARCHIVED' OR "publishedAt" IS NOT NULL);

-- Et on ne termine pas ce qui n'a pas commencé. La garde tient aussi
-- l'ordre : une fin antérieure au début décrirait une période vide.
ALTER TABLE "VisaRule"
  ADD CONSTRAINT "regle_fin_apres_mise_en_vigueur"
  CHECK (
    "effectiveTo" IS NULL
    OR ("publishedAt" IS NOT NULL AND "publishedAt"::date <= "effectiveTo")
  );

CREATE INDEX "VisaRule_countryCode_visaType_publishedAt_idx"
  ON "VisaRule" ("countryCode", "visaType", "publishedAt");
