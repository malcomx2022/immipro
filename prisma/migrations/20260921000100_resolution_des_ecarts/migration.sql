-- La résolution d'un écart de réconciliation — arbitrage du 21/09/2026.
--
-- B-04 affichait « Traiter les N écarts » sur un bouton sans action. Un
-- écart s'ouvrait donc au bout de vingt-quatre heures et ne se refermait
-- jamais : le compteur montait, et O.B, qui suspend la conservation du
-- motif d'échec tant qu'un dossier est ouvert, n'avait aucun événement
-- pour dater sa clôture.
--
-- **La résolution ne modifie jamais à elle seule la vérité financière.**
-- Elle enregistre ce qu'un administrateur a constaté et décidé. Un
-- paiement ne devient encaissé ou remboursé que par la confirmation
-- signée du fournisseur — c'est INV-7, et une action manuelle ne s'y
-- substitue pas.
--
-- **Elle n'efface pas l'écart.** `discrepancy` reste : l'historique dit
-- qu'un désaccord a existé, ce qu'il disait, et comment il s'est refermé.
-- Effacer le texte ferait disparaître la question en même temps que la
-- réponse.

CREATE TYPE "DiscrepancyOutcome" AS ENUM (
  -- Le désaccord s'explique, et rien ne bouge côté argent.
  'EXPLIQUE_SANS_CORRECTION',
  -- On attend encore le fournisseur : l'écart se referme, la vigilance non.
  'ATTENTE_CONFIRMATION',
  -- Une somme est à rendre. L'obligation s'ouvre ailleurs, pas ici.
  'REMBOURSEMENT_A_INITIER',
  -- Transmis pour investigation : ce n'est plus une question de guichet.
  'INCIDENT_TRANSMIS'
);

ALTER TABLE "Transaction"
  ADD COLUMN "discrepancyOutcome"    "DiscrepancyOutcome",
  ADD COLUMN "discrepancyNote"       TEXT,
  ADD COLUMN "discrepancyResolvedAt" TIMESTAMP(3),
  ADD COLUMN "discrepancyResolvedBy" TEXT;

CREATE INDEX "Transaction_discrepancyResolvedAt_idx"
  ON "Transaction"("discrepancyResolvedAt");

-- ── Garde-fous ─────────────────────────────────────────────────────────────

-- Les quatre vont ensemble. Une issue sans date ne daterait pas le sursis
-- d'O.B ; une date sans acteur ne serait imputable à personne ; une
-- résolution sans note ne se relit pas six mois plus tard, et c'est
-- précisément quand on la relit qu'elle sert.
--
-- **`IS NOT NULL` est explicite, et ce n'est pas une redondance.** La
-- première version écrivait seulement `btrim("discrepancyNote") <> ''`.
-- Sur une colonne nulle, `btrim(NULL) <> ''` vaut NULL, et une contrainte
-- CHECK **passe** quand son expression vaut NULL : seul FALSE rejette.
-- Une clôture sans note entrait donc en base, et le script de vérification
-- l'a acceptée — le garde-fou était écrit et ne gardait rien. Le piège ne
-- vaut que pour les colonnes nullables : ailleurs dans le schéma, la même
-- forme s'applique à des colonnes NOT NULL, où elle est sûre.
ALTER TABLE "Transaction"
  ADD CONSTRAINT "transaction_resolution_ecart_est_entiere"
  CHECK (
    ("discrepancyOutcome" IS NULL
      AND "discrepancyNote" IS NULL
      AND "discrepancyResolvedAt" IS NULL
      AND "discrepancyResolvedBy" IS NULL)
    OR ("discrepancyOutcome" IS NOT NULL
      AND "discrepancyNote" IS NOT NULL AND btrim("discrepancyNote") <> ''
      AND "discrepancyResolvedAt" IS NOT NULL
      AND "discrepancyResolvedBy" IS NOT NULL AND btrim("discrepancyResolvedBy") <> '')
  );

-- On ne referme que ce qui a été ouvert. Une résolution sans écart
-- daterait une clôture qui n'a jamais eu de question.
ALTER TABLE "Transaction"
  ADD CONSTRAINT "transaction_resolution_suppose_un_ecart"
  CHECK ("discrepancyResolvedAt" IS NULL OR "discrepancy" IS NOT NULL);

-- Et pas avant l'ouverture de la transaction, qui précède forcément son
-- écart.
ALTER TABLE "Transaction"
  ADD CONSTRAINT "transaction_resolution_apres_l_ouverture"
  CHECK ("discrepancyResolvedAt" IS NULL OR "discrepancyResolvedAt" >= "createdAt");

-- L'écart, lui, ne s'efface pas. Aucune contrainte ne peut interdire un
-- UPDATE qui remettrait `discrepancy` à nul ; c'est un test qui le tient,
-- comme pour le journal d'audit (B-06) et l'historique éditorial (P.B).
