-- Pourquoi un paiement n'a pas abouti — N.B.
--
-- Le cycle recevait la raison du fournisseur et ne l'écrivait nulle part.
-- Deux écrans en payaient le prix : $-05 annonçait « les cinq minutes se
-- sont écoulées » sur un refus reçu en deux secondes, et le tableau B-04
-- classait tout échec en « échec solde », y compris une panne technique ou
-- une annulation du payeur.
--
-- Ce qui entre en base est une catégorie à nous, jamais le texte du
-- fournisseur : il cite un moyen de paiement, parfois un message de banque.
-- Six valeurs fermées suffisent à écrire la bonne phrase, et aucune ne
-- désigne une carte ni un portefeuille.

CREATE TYPE "PaymentFailure" AS ENUM (
  'SOLDE_INSUFFISANT',
  'REFUS_EMETTEUR',
  'ANNULE_PAR_LE_PAYEUR',
  'MOYEN_INVALIDE',
  'INCIDENT_TECHNIQUE',
  'DELAI_DEPASSE'
);

ALTER TABLE "Transaction" ADD COLUMN "failureCause" "PaymentFailure";

-- ── Garde-fous ─────────────────────────────────────────────────────────────
-- Même raison que les migrations précédentes : une règle écrite dans un
-- service ne protège que ce service.

-- Un motif de refus sur un paiement encaissé serait une contradiction lue
-- comme une donnée. Seuls l'échec et l'expiration en portent un — le
-- remboursement non plus : rendre l'argent n'est pas le refuser.
ALTER TABLE "Transaction"
  ADD CONSTRAINT "transaction_motif_seulement_sur_un_echec"
  CHECK ("failureCause" IS NULL OR "status" IN ('ECHOUEE', 'EXPIREE'));

-- Une expiration est prononcée par la plateforme faute de réponse : elle ne
-- peut pas porter un motif que seul l'émetteur aurait pu donner.
ALTER TABLE "Transaction"
  ADD CONSTRAINT "transaction_expiration_ne_juge_pas_le_payeur"
  CHECK ("status" <> 'EXPIREE' OR "failureCause" IS NULL OR "failureCause" = 'DELAI_DEPASSE');

-- Symétriquement, `DELAI_DEPASSE` ne s'invente pas sur un échec annoncé par
-- l'émetteur : celui-ci a répondu, dans le délai.
ALTER TABLE "Transaction"
  ADD CONSTRAINT "transaction_echec_annonce_n_est_pas_un_delai"
  CHECK ("status" <> 'ECHOUEE' OR "failureCause" IS DISTINCT FROM 'DELAI_DEPASSE');

-- RG-10.4 — le motif part avec le compte. L'obligation comptable porte sur
-- le montant, la date et la référence ; savoir qu'une carte a été refusée
-- pour solde un jour de septembre ne lui sert pas, et décrit une personne.
--
-- Ce garde-fou-là n'est pas ici : une contrainte CHECK ne peut pas
-- interroger une autre table. Il tient dans `acces/suppression.ts`, à côté
-- du motif de refus de visa, qui part pour la même raison — et un test
-- vérifie que l'anonymisation le remet à nul.
