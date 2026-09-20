-- Garde-fous de la suppression de compte et de l'affiliation.
--
-- Même raison que les migrations 20260918000100 et 20260919000100 : une
-- règle écrite dans un service ne protège que ce service. Ici elle protège
-- surtout contre nous-mêmes — une anonymisation interrompue à mi-chemin
-- laisse un compte qui n'est ni vivant ni effacé, et c'est le pire état.

-- ── RG-10.4 ────────────────────────────────────────────────────────────────
-- Un compte anonymisé a d'abord été demandé en suppression, et l'ordre des
-- deux dates n'est pas négociable : `deletedAt` avant la demande décrirait
-- une suppression que personne n'a demandée.
ALTER TABLE "User"
  ADD CONSTRAINT "user_suppression_demandee_avant_anonymisation"
  CHECK ("deletedAt" IS NULL OR ("deletionRequestedAt" IS NOT NULL AND "deletedAt" >= "deletionRequestedAt"));

-- Une anonymisation qui garderait le nom, le téléphone ou l'empreinte du mot
-- de passe n'anonymise rien. La base refuse la demi-mesure : si le compte
-- est marqué anonymisé, ces colonnes sont nulles, sans exception.
ALTER TABLE "User"
  ADD CONSTRAINT "user_anonymise_ne_nomme_personne"
  CHECK (
    "deletedAt" IS NULL
    OR ("passwordHash" IS NULL
        AND "firstName" IS NULL
        AND "lastName" IS NULL
        AND "phone" IS NULL)
  );

-- ── RG-13.1 ────────────────────────────────────────────────────────────────
-- « La proposition est contextuelle à l'étape, jamais publicitaire hors
-- contexte. » Sans étape, il ne reste qu'une réclame — et le motif déclaré
-- est ce qui distingue une proposition d'un encart.
ALTER TABLE "PartnerReferral"
  ADD CONSTRAINT "referral_contexte_non_vide"
  CHECK (length(btrim("step")) > 0 AND length(btrim("motive")) > 0);

-- ── RG-13.3 ────────────────────────────────────────────────────────────────
-- Le taux annoncé est le taux facturé. Il est recopié sur la proposition, et
-- un taux hors bornes rendrait la mention affichée absurde plutôt que
-- fausse — ce qui est pire, parce que personne ne la relit.
ALTER TABLE "Partner"
  ADD CONSTRAINT "partner_taux_de_commission_borne"
  CHECK ("commissionBps" BETWEEN 0 AND 10000);

ALTER TABLE "PartnerReferral"
  ADD CONSTRAINT "referral_taux_de_commission_borne"
  CHECK ("commissionBps" BETWEEN 0 AND 10000);

-- ── WF-13, étape 2 : « commission au résultat » ────────────────────────────
-- Un montant de commission n'existe que sur une proposition aboutie, et une
-- proposition aboutie est datée. Écrire la commission à la proposition en
-- ferait une créance imaginaire, comptée avant d'être due.
ALTER TABLE "PartnerReferral"
  ADD CONSTRAINT "referral_commission_au_resultat"
  CHECK (
    ("commissionAmount" IS NULL AND "commissionCurrency" IS NULL)
    OR ("status" = 'ABOUTIE' AND "commissionAmount" > 0 AND "commissionCurrency" IS NOT NULL)
  );

ALTER TABLE "PartnerReferral"
  ADD CONSTRAINT "referral_aboutie_est_datee"
  CHECK (("status" = 'ABOUTIE') = ("settledAt" IS NOT NULL));

-- Une redirection tracée précède l'aboutissement : on n'aboutit pas chez un
-- partenaire sans y avoir été envoyé.
ALTER TABLE "PartnerReferral"
  ADD CONSTRAINT "referral_redirection_avant_aboutissement"
  CHECK ("status" NOT IN ('REDIRIGEE', 'ABOUTIE') OR "redirectedAt" IS NOT NULL);

-- ── RG-13.4 ────────────────────────────────────────────────────────────────
-- « La rétro-commission est vérifiée destination par destination avant
-- activation. » Une activation sans motif ni vérificateur n'atteste rien :
-- même exigence que pour une règle du référentiel (INV-8).
ALTER TABLE "PartnerActivation"
  ADD CONSTRAINT "activation_verification_non_vide"
  CHECK (length(btrim("basis")) > 0 AND length(btrim("verifiedBy")) > 0);
