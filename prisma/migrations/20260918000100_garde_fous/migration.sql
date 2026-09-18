-- Garde-fous applicatifs portés par la base.
--
-- Ce que DOC-11 appelle « garde-fou applicatif, pas consigne humaine » ne
-- tient pas dans le schéma Prisma : ce sont des contraintes CHECK. Les
-- écrire ici, c'est les rendre vraies pour tout écrivain — l'application, un
-- import, une correction à la main en production, un futur worker.

-- ── INV-4 / RG-14.2 ────────────────────────────────────────────────────────
-- Une règle de source SECONDAIRE ne peut pas être publiée. Le filtrage se
-- fait dans la requête, pas dans l'affichage ; ici il se fait avant même la
-- requête, à l'écriture.
ALTER TABLE "VisaRule"
  ADD CONSTRAINT "visa_rule_secondaire_jamais_publiee"
  CHECK ("status" <> 'PUBLISHED' OR "sourceTier" <> 'SECONDAIRE');

-- ── INV-8 ──────────────────────────────────────────────────────────────────
-- Toute règle porte sa source et sa date de vérification. `sourceUrl` et
-- `verifiedAt` sont déjà non nuls ; reste à interdire la chaîne vide, qui
-- satisfait NOT NULL sans rien prouver.
ALTER TABLE "VisaRule"
  ADD CONSTRAINT "visa_rule_source_non_vide"
  CHECK (length(btrim("sourceUrl")) > 0 AND length(btrim("verifiedBy")) > 0);

-- ── INV-3 ──────────────────────────────────────────────────────────────────
-- Un dossier au-delà du brouillon a figé sa version de règle. Sans cette
-- contrainte, une checklist pourrait suivre la règle courante et changer
-- sous les pieds du candidat.
ALTER TABLE "Application"
  ADD CONSTRAINT "application_version_figee"
  CHECK ("status" = 'BROUILLON' OR "visaRuleId" IS NOT NULL);

-- ── RG-07.2 ────────────────────────────────────────────────────────────────
-- Le passage en PRET est calculé : `readyAt` est posé avec le statut, jamais
-- l'un sans l'autre.
ALTER TABLE "Application"
  ADD CONSTRAINT "application_pret_date_coherente"
  CHECK (("status" = 'PRET') = ("readyAt" IS NOT NULL));

-- ── RG-06.3 ────────────────────────────────────────────────────────────────
-- Une revue manuelle décidée porte son message au candidat. « Non conforme »
-- seul est interdit au code ; une décision sans message l'est aussi à la base.
ALTER TABLE "ManualReview"
  ADD CONSTRAINT "revue_decidee_porte_son_message"
  CHECK ("decidedAt" IS NULL OR (length(btrim(coalesce("message", ''))) >= 20 AND "decision" IS NOT NULL));

-- ── INV-6 ──────────────────────────────────────────────────────────────────
-- Une écriture de quota ne vaut rien à zéro : elle accorde ou elle débite.
ALTER TABLE "AnalysisCredit"
  ADD CONSTRAINT "credit_delta_non_nul"
  CHECK ("delta" <> 0);

-- Le sens de l'écriture suit son motif : un achat crédite, une analyse débite.
ALTER TABLE "AnalysisCredit"
  ADD CONSTRAINT "credit_sens_coherent_avec_motif"
  CHECK (
    ("reason" IN ('ACHAT_PACK', 'RECHARGE', 'ANALYSE_RENDUE', 'GESTE_COMMERCIAL') AND "delta" > 0)
    OR ("reason" = 'ANALYSE' AND "delta" < 0)
  );

-- ── RG-12.2 ────────────────────────────────────────────────────────────────
-- Un partage de dossier expire de lui-même, et son échéance est postérieure
-- à l'accord. Un accord sans échéance survit à la consultation qui l'a
-- motivé, et personne ne pense à le retirer.
ALTER TABLE "ConsultantAccess"
  ADD CONSTRAINT "acces_consultant_borne_dans_le_temps"
  CHECK ("expiresAt" > "grantedAt");

-- ── WF-12 ──────────────────────────────────────────────────────────────────
-- La limite d'annulation sans frais précède le créneau.
ALTER TABLE "Appointment"
  ADD CONSTRAINT "rendez_vous_annulation_avant_creneau"
  CHECK ("freeUntil" < "startsAt");

-- ── C-07 ───────────────────────────────────────────────────────────────────
-- Une version de pièce porte un fichier ou un texte, jamais ni l'un ni
-- l'autre. Une version vide n'a rien à versionner.
ALTER TABLE "DocumentVersion"
  ADD CONSTRAINT "version_porte_un_contenu"
  CHECK ("objectKey" IS NOT NULL OR "body" IS NOT NULL OR "purgedAt" IS NOT NULL);

-- ── INV-5 ──────────────────────────────────────────────────────────────────
-- Une version purgée n'a plus de clé d'objet : la purge supprime le contenu,
-- elle ne se contente pas de le dater.
ALTER TABLE "DocumentVersion"
  ADD CONSTRAINT "version_purgee_sans_objet"
  CHECK ("purgedAt" IS NULL OR ("objectKey" IS NULL AND "body" IS NULL));

-- ── AuditLog ───────────────────────────────────────────────────────────────
-- RG-15.1 : tout accès à une pièce porte son motif déclaré.
ALTER TABLE "AuditLog"
  ADD CONSTRAINT "audit_motif_non_vide"
  CHECK (length(btrim("reason")) > 0);
