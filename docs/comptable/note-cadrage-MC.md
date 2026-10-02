# Note de cadrage — Avis comptable (M.C)
## ImmiPro : faut-il une facture en plus du reçu ? Mentions et numérotation

**Date :** 2 octobre 2026
**Objet :** demande d'avis comptable préalable à l'encaissement commercial
**Référence interne :** M.C

---

## 1. Contexte

**ImmiPro** (`immipro.app`) est une plateforme en ligne d'aide à la préparation de dossiers d'immigration : études, travail, regroupement familial. Elle est exploitée par **Rêveur Digital**, établie au **Bénin**.

ImmiPro informe et prépare. Elle ne dépose aucun dossier, ne donne aucun conseil juridique et ne se prononce jamais sur l'issue d'une demande.

**Ce qui est vendu.** Tous les prix sont fixés dans la grille du produit. Il y a **deux grilles**, une par devise. Ce sont deux tarifs distincts, et non une conversion de l'un vers l'autre.

| Prestation | F CFA (XOF) | Euros (EUR) |
|---|---|---|
| Pack Essentiel (une destination, 10 analyses de pièces) | 5 000 | 12 |
| Pack Dossier (une destination, 30 analyses, rédaction assistée) | 15 000 | 29 |
| Pack Dossier Pro (trois destinations, 90 analyses, rédaction assistée) | 45 000 | 59 |
| Recharge de 10 analyses supplémentaires *(volume et prix provisoires, revus après le pilote)* | 3 000 | 7 |
| Passage du pack Essentiel au pack Dossier *(seule la différence est payée)* | différence | différence |
| Consultation de 45 minutes avec un consultant habilité *(encaissée par ImmiPro ; montant à confirmer)* | 20 000 | 35 |

Aucun paiement en F CFA n'est accepté en dessous de 3 000 F CFA.

**Moyens de paiement**, selon la devise :
- **F CFA → Mobile Money**, via **FedaPay**. Le produit ne choisit ni ne nomme l'opérateur : le client paie avec celui de son numéro.
- **Euros → carte bancaire**, via **Stripe**.

**Choix de la grille.** Par défaut, elle suit le pays du client : F CFA pour les pays de l'UEMOA (Bénin, Côte d'Ivoire, Sénégal, Togo, Burkina Faso, Mali, Niger, Guinée-Bissau), euros pour les autres.

**Encaissement.** Un paiement n'est réputé encaissé qu'à réception de la **notification signée** du prestataire de paiement. Aucune vente n'est enregistrée sur la seule déclaration du client.

---

## 2. Ce que le produit émet aujourd'hui

Après chaque paiement **confirmé** par le prestataire, l'application établit un **« reçu »**. Le document s'appelle volontairement « reçu » et ne se présente pas comme une facture.

**Ce que le reçu affiche :**
- une **référence** unique, **non séquentielle** : c'est un identifiant technique, pas un numéro de facture. Le choix est délibéré : une suite d'entiers révélerait le nombre de ventes ;
- la **date et l'heure** du paiement, à l'heure de Cotonou ;
- le **moyen de paiement** : « Mobile Money » ou « Carte bancaire » ;
- la **référence de la transaction chez l'opérateur**, une fois sa notification reçue ;
- la **prestation** achetée et, s'il y a lieu, la destination du dossier concerné ;
- le **montant** et la **devise** ;
- une ligne « Frais de service : 0 » ;
- l'**identité de l'émetteur**, tirée de l'identité légale saisie dans l'application (dénomination, forme juridique, siège, RCCM, IFU, adresse de contact). Tant que ces informations ne sont pas saisies, le reçu le signale au lieu d'afficher une identité incomplète ;
- une mention précisant que le reçu atteste du paiement d'un service de préparation de dossier, et qu'il exclut les frais de demande versés à l'administration.

**Ce que le reçu n'affiche pas :**
- **aucune TVA** et aucun montant hors taxes ;
- **ni le nom ni l'adresse électronique du client**. Le reçu est consultable dans l'espace personnel du client, qui seul y a accès ;
- **aucun numéro de téléphone** : le numéro Mobile Money n'est pas conservé.

**Envoi et conservation :**
- À la confirmation du paiement, un **courriel** est envoyé au client. Il indique la **référence et le montant**, et renvoie au reçu détaillé dans son espace.
- Le client peut **imprimer** le reçu, ou l'enregistrer en PDF depuis son navigateur, et se le **renvoyer** par courriel.
- Aucun fichier PDF n'est conservé par la plateforme. Le reçu est **reconstitué à partir des données de paiement**, qui sont conservées.
- Si le client supprime son compte, ses données de paiement sont conservées **sans son nom** (montant, date, référence, statut) pour l'obligation comptable.

**Remboursements.** Un paiement remboursé garde son reçu, avec sa référence. Le reçu indique alors « Remboursé » et la date du remboursement : l'obligation comptable ne s'efface pas.

---

## 3. Questions posées

### Q1. Une facture est-elle obligatoire en plus du reçu ?

Au regard du droit béninois et des règles UEMOA applicables :
- La vente de prestations de services numériques à des particuliers impose-t-elle une **facture** en bonne et due forme, ou le **reçu** décrit au §2 suffit-il ?
- Faut-il distinguer selon le **moyen de paiement** (Mobile Money ou carte) ?
- Faut-il distinguer selon la **résidence du client** (Bénin, autre pays UEMOA, hors UEMOA) ?
- Le **reçu** peut-il continuer d'exister comme preuve immédiate du paiement, à côté d'une facture qui aurait sa propre numérotation ?

### Q2. Si une facture est requise, quelles mentions obligatoires ?

Liste exacte des mentions à faire figurer :
- **Vendeur** : dénomination, forme, RCCM, IFU, siège, etc.
- **Acheteur** : quelles informations minimales ? Le produit ne demande aujourd'hui que l'adresse électronique, et le nom s'il est saisi.
- **Prestation** : description, date d'émission, date ou période de la prestation.
- **Montants** : hors taxes, TVA, toutes taxes comprises.
- **Autres** : mentions propres au Bénin ou à l'UEMOA.

### Q3. Quelle numérotation ?

- La numérotation doit-elle être **continue et chronologique**, sans rupture ?
- Une **séquence unique**, ou des séquences distinctes par devise ou par moyen de paiement ?
- La facture doit-elle être émise à la **confirmation** de l'encaissement, comme le reçu aujourd'hui ?

### Q4. TVA

- Les prestations sont-elles soumises à la **TVA béninoise** ? À quel taux ?
- Quel traitement pour les clients **hors du Bénin** : UEMOA, Europe, autres ?
- Faut-il distinguer **particuliers et professionnels**, si des professionnels utilisent un jour la plateforme ?
- Les deux grilles (F CFA et euros) sont des **prix distincts**, pas des conversions. Une facture en euros doit-elle porter une **contre-valeur en F CFA** ? Selon quel taux et à quelle date ?

### Q5. Cas particuliers

- **Remboursements.** Faut-il un **avoir** à chaque remboursement ? Avec quelle numérotation ?
  - Aujourd'hui, un remboursement n'est réputé fait qu'à réception de la confirmation du prestataire.
  - Les remboursements Mobile Money se font **à la main**, dans le tableau de bord du prestataire, puis sont déclarés dans l'application.
  - Il n'existe **aucun remboursement automatique**.
- **Pack partiellement consommé.** Le produit **n'applique aucun prorata** : une demande de remboursement d'un pack entamé est examinée **au cas par cas**, en revue manuelle. Comment traiter comptablement un remboursement partiel, si la direction en décide ?
- **Passage d'Essentiel à Dossier.** Le client paie la différence, sous une référence distincte. Facture distincte, ou facture rectificative ?
- **Consultation.** Elle est annulable sans frais jusqu'à 24 heures avant le rendez-vous. Au-delà, elle reste due. Quel traitement pour une consultation annulée à temps, puis remboursée ?
- **Paiements non aboutis** (échoués, expirés, abandonnés) : aucun document comptable n'est émis. Est-ce correct ?

### Q6. Conservation et archivage

- Quelle est la durée légale de conservation des factures, reçus et pièces de paiement au Bénin ? Cette durée sera reprise dans la politique de données personnelles.
- La conservation des données de paiement en base, à partir desquelles le reçu est reconstitué à l'identique à tout moment, suffit-elle ? Faut-il conserver un fichier figé (PDF) de chaque facture ?

---

## 4. Documents disponibles

Sur demande :
- les **Conditions générales d'utilisation et de vente** (brouillon en cours de validation juridique), où les prix et les remboursements sont repris du produit ;
- un **exemple de reçu**, tel qu'il s'affiche dans l'application ;
- la **grille tarifaire** complète, reproduite au §1 ;
- le détail des **flux de paiement** : Mobile Money via FedaPay, carte via Stripe, confirmation par notification signée.

---

## 5. Échéance

Cet avis est **bloquant avant le premier encaissement commercial**. Le pilote fermé, sans encaissement, peut démarrer sans lui. Aucune vente réelle n'aura lieu avant réception de votre avis.

**Contact :** Rêveur Digital — client@reveurdigital.com

---

*Document préparé le 02/10/2026, corrigé le même jour pour correspondre au fonctionnement réel du produit — Réf. M.C — ImmiPro*
