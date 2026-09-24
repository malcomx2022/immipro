# DOC-11 — Workflows fonctionnels ImmiPro

**Version 1.0 — septembre 2026**
Périmètre : l'ensemble des parcours fonctionnels de la plateforme, côté candidat, back-office et système.
Prérequis de lecture : DOC-01 (architecture), la note de réconciliation VisaBridge, et le référentiel `visa_rules`.

---

## 0. Conventions et invariants

Ces règles s'appliquent à **tous** les workflows. Elles ne sont pas rappelées à chaque étape.

| # | Invariant | Conséquence |
|---|---|---|
| INV-1 | La plateforme informe et prépare, elle ne conseille pas juridiquement | Aucun workflow ne produit d'avis sur les chances d'obtention |
| INV-2 | Aucune promesse de résultat | Ni dans l'UI, ni dans les emails, ni dans les documents générés |
| INV-3 | Un dossier fige la version de règle utilisée (`Application.visaRuleId`) | Une évolution réglementaire ne casse jamais une checklist en cours |
| INV-4 | Une règle de source `SECONDAIRE` n'est jamais visible par l'utilisateur | Filtrage au niveau requête, pas au niveau affichage |
| INV-5 | Toute pièce d'identité est purgée selon la politique de rétention | Purge automatique, indépendante de l'action utilisateur |
| INV-6 | Tout appel IA est débité d'un quota de tokens rattaché au pack | Pas de dépassement silencieux |
| INV-7 | Tout paiement est idempotent et réconcilié par webhook signé | Un webhook rejoué ne crédite jamais deux fois |
| INV-8 | Chaque information réglementaire affichée porte sa source et sa date de vérification | Confiance utilisateur + traçabilité de diligence |

**Acteurs**

| Code | Acteur | Description |
|---|---|---|
| VIS | Visiteur | Non authentifié |
| CAND | Candidat | Compte créé, avec ou sans pack |
| CONS | Consultant | Partenaire vérifié (phase 3) |
| VEIL | Veilleur | Opérateur de la veille réglementaire |
| ADM | Administrateur | Back-office complet |
| SYS | Système | Jobs, webhooks, crons |

---

## 1. Vue d'ensemble des parcours

```
VIS ──WF-01 simulateur──► WF-02 inscription ──► WF-03 recommandations
                                                       │
                                                       ▼
                                            WF-04 ouverture de dossier
                                                       │
                                          ┌────────────┴────────────┐
                                          ▼                         ▼
                                  WF-05 achat pack          (dossier gratuit limité)
                                          │
                                          ▼
                    WF-06 checklist ◄──► WF-07 score ◄──► WF-08 pièces rédigées
                                          │
                                          ▼
                                  WF-09 suivi & échéances
                                          │
                                          ▼
                                  WF-10 clôture & purge

Transverses : WF-11 alertes • WF-12 consultants • WF-13 affiliation
Internes    : WF-14 veille • WF-15 administration • WF-16 coûts IA
```

---

## 2. Machines à états

### 2.1 Dossier (`Application`)

| État | Signification | Transitions sortantes |
|---|---|---|
| `BROUILLON` | Destination choisie, pack non acheté | → `ACTIF`, `ABANDONNE` |
| `ACTIF` | Pack acheté, constitution en cours | → `PRET`, `SUSPENDU`, `ABANDONNE` |
| `PRET` | Score de complétude ≥ seuil, toutes pièces bloquantes validées | → `SOUMIS`, `ACTIF` (si régression) |
| `SOUMIS` | Le candidat déclare avoir déposé sa demande | → `ISSUE_DECLAREE` |
| `SUSPENDU` | Divergence réglementaire majeure, arbitrage requis | → `ACTIF`, `ABANDONNE` |
| `ISSUE_DECLAREE` | Le candidat déclare accepté / refusé / sans réponse | → `ARCHIVE` |
| `ABANDONNE` | Inactif > 12 mois ou demande explicite | → `ARCHIVE` |
| `ARCHIVE` | Pièces purgées, métadonnées conservées | terminal |

Règle : le passage `ACTIF → PRET` est **calculé**, jamais déclaré. Le passage `PRET → SOUMIS` est **déclaré**, jamais calculé — la plateforme ne dépose rien à la place du candidat (INV-1).

### 2.2 Pièce (`Document`)

| État | Signification |
|---|---|
| `ATTENDUE` | Présente dans la checklist, non téléversée |
| `EN_ANALYSE` | Téléversée, job en file |
| `CONFORME` | Toutes les conditions déterministes passent |
| `A_CORRIGER` | Au moins une condition échoue, message actionnable disponible |
| `ILLISIBLE` | Extraction impossible (qualité, format, chiffrement) |
| `HORS_SUJET` | Le type détecté ne correspond pas au type attendu |
| `EXPIREE` | Pièce valide à l'analyse, périmée depuis (ex. relevé > 3 mois) |
| `PURGEE` | Contenu supprimé, verdict conservé |

### 2.3 Paiement (`Transaction`)

`INITIEE → EN_ATTENTE → (CONFIRMEE | ECHOUEE | EXPIREE) → [REMBOURSEE]`

`EN_ATTENTE` est l'état long du Mobile Money : la validation par code PIN sur le téléphone prend 30 à 120 secondes.

---

## 3. Parcours candidat

### WF-01 — Simulateur d'éligibilité

| | |
|---|---|
| **Acteur** | VIS |
| **Déclencheur** | Arrivée sur la page d'accueil ou une page pays (SEO) |
| **Objectif** | Donner une valeur immédiate sans compte, et qualifier le visiteur |
| **Préconditions** | Au moins une `VisaRule` en statut `PUBLISHED` |

**Étapes**

1. Le visiteur renseigne un formulaire court : objectif (études / emploi), plus haut diplôme, domaine, années d'expérience, langues et niveaux, budget total disponible, pays de résidence.
2. Le système charge les règles `PUBLISHED` (INV-4) et applique le **filtrage strict** : élimination de toute destination dont une condition `bloquant: true` échoue.
3. Sur les destinations restantes, application du **scoring pondéré** (langue 30 %, budget 20 %, facilité administrative 20 %, débouchés post-visa 15 %, qualité de vie 10 %, coût de la vie 5 %).
4. Affichage des 3 meilleures destinations avec, pour chacune : le score, les **trois raisons principales chiffrées**, et un motif d'exclusion pour les destinations écartées.
5. Chaque donnée affichée porte sa source et sa date de vérification (INV-8).
6. Incitation à créer un compte pour conserver le résultat et ouvrir un dossier.

**Règles de gestion**

- RG-01.1 : le résultat est calculé en mémoire, sans écriture, tant que le visiteur n'est pas authentifié.
- RG-01.2 : aucun pourcentage de « chances d'obtention » n'est affiché (INV-1).
- RG-01.3 : si aucune destination ne passe le filtrage strict, afficher les conditions les plus proches d'être atteintes plutôt qu'un écran vide — c'est le moment où le candidat comprend ce qui lui manque.

**Cas limites**

| Cas | Traitement |
|---|---|
| Budget déclaré nul | Basculer sur le filtre « destinations avec bourse » (CSC, MEXT, GKS) |
| Aucune langue renseignée à un niveau suffisant | Proposer les destinations anglophones et le parcours « préparation linguistique » |
| Profil hors périmètre (mineur, sans diplôme) | Réponse honnête et orientation, pas de score |

---

### WF-02 — Inscription et profil

| | |
|---|---|
| **Acteur** | VIS → CAND |
| **Déclencheur** | Clic sur « conserver mes résultats » ou « ouvrir un dossier » |

**Étapes**

1. Création de compte : email + mot de passe, ou OAuth Google (NextAuth, sessions en base).
2. Vérification de l'email par lien à usage unique, validité 24 h.
3. Reprise automatique des réponses du simulateur dans le profil — le candidat ne resaisit rien.
4. Complément progressif du profil : téléphone (format international, indispensable au Mobile Money), diplômes, certifications, expérience.
5. Consentements distincts et journalisés : CGU, politique de confidentialité, traitement des pièces d'identité, communications marketing (optionnel, décoché par défaut).

**Règles de gestion**

- RG-02.1 : le consentement au traitement des pièces d'identité est **séparé** de l'acceptation des CGU et révocable.
- RG-02.2 : aucune pièce ne peut être téléversée avant ce consentement.
- RG-02.3 : le numéro de téléphone est validé par format avant tout paiement Mobile Money.

---

### WF-03 — Recommandation de destinations

| | |
|---|---|
| **Acteur** | CAND |
| **Différence avec WF-01** | Résultat persisté, comparaison multi-destinations, historique des exécutions |

**Étapes**

1. Recalcul du score sur le profil complet.
2. Persistance dans `Recommendation` avec les poids appliqués et l'horodatage — nécessaire pour expliquer a posteriori pourquoi une recommandation a changé.
3. Vue comparative jusqu'à 3 destinations : coût total estimé, preuve de fonds, droit au travail étudiant, **dispositif post-diplôme**, débouché emploi.
4. Ajustement manuel des pondérations par le candidat (« je privilégie un pays francophone », « je veux pouvoir travailler pendant mes études »).

**Règles de gestion**

- RG-03.1 : la comparaison au-delà de 3 destinations est réservée au pack supérieur.
- RG-03.2 : toute modification d'une `VisaRule` publiée invalide les recommandations qui s'y appuient et déclenche un recalcul au prochain accès.
- RG-03.3 : le champ `permis_employeur_requis` est affiché en évidence sur la ligne « travail étudiant » — le droit au travail appartient à l'employeur, pas à l'étudiant, et c'est une source majeure de désillusion.

---

### WF-04 — Ouverture d'un dossier

| | |
|---|---|
| **Acteur** | CAND |
| **Résultat** | `Application` en état `BROUILLON` |

**Étapes**

1. Choix d'une destination et d'un type de visa parmi les recommandations.
2. Création de l'`Application` avec **snapshot de la règle** : `visaRuleId` pointe vers la version exacte en vigueur (INV-3).
3. Génération de la checklist à partir de `rules.pieces_requises`, enrichie des `delai_obtention_jours` pour construire l'échéancier.
4. Affichage de l'aperçu gratuit : liste des pièces et calendrier indicatif, sans analyse ni génération.
5. Affichage des `reserves[]` de la règle sous forme de disclaimer **contextuel à la destination**, pas d'un texte générique de pied de page.

**Règles de gestion**

- RG-04.1 : un candidat peut ouvrir plusieurs dossiers ; un seul pack est consommé par dossier.
- RG-04.2 : un dossier `BROUILLON`, `ACTIF` ou `PRET` inactif depuis 90 jours déclenche une relance, puis passe en `ABANDONNE` à 12 mois ; ses pièces sont purgées sous 30 jours. Le paiement ne constitue pas un motif de conservation (arbitrage S.78).
- RG-04.3 : l'étape « reconnaissance / équivalence de diplôme » est insérée automatiquement dans la checklist pour les destinations qui l'exigent, avec son délai propre (souvent 2 à 4 mois) — c'est le poste qui fait rater les échéances.

---

### WF-05 — Achat d'un pack

| | |
|---|---|
| **Acteurs** | CAND, SYS |
| **Rails** | FedaPay (XOF, MTN MoMo et Moov) — Stripe (EUR, carte) |

**Étapes — rail Mobile Money**

1. Le candidat choisit son pack. La devise est déterminée par son pays de résidence, avec possibilité de bascule manuelle.
2. Création d'une `Transaction` locale en `INITIEE` avec une référence interne unique.
3. Appel FedaPay, stockage du `providerTxId`, redirection vers la page de paiement hébergée.
4. Le candidat choisit son opérateur, saisit son numéro, reçoit une notification USSD et confirme par code PIN.
5. Redirection vers `/paiement/attente`, page de polling interrogeant `GET /api/payments/status?tx=` toutes les 3 secondes, **timeout à 5 minutes**, bouton « Réessayer ».
6. En parallèle, le webhook FedaPay arrive, sa **signature est vérifiée**, la `Transaction` passe en `CONFIRMEE`.
7. Crédit du pack : quota de tokens IA, déblocage des fonctionnalités, passage du dossier en `ACTIF`.
8. Envoi du reçu par email.

**Règles de gestion**

- RG-05.1 : le webhook est la **seule source de vérité**. Le retour de redirection ne crédite jamais un compte.
- RG-05.2 : traitement idempotent par `providerTxId` — un webhook rejoué ne crédite pas deux fois (INV-7).
- RG-05.3 : les routes de webhook sont exclues du rate limiting mais soumises à vérification de signature.
- RG-05.4 : un job de réconciliation interroge le fournisseur toutes les 15 minutes sur les transactions `EN_ATTENTE` de plus de 10 minutes — le webhook peut se perdre.
- RG-05.5 : montant minimum 3 000 XOF, en dessous duquel frais de collecte et coût IA rendent la transaction non rentable.

**Cas limites**

| Cas | Traitement |
|---|---|
| Paiement débité, webhook jamais reçu | Rattrapé par RG-05.4 ; au-delà de 24 h, ticket automatique en back-office |
| Double soumission | Réutilisation de la transaction `EN_ATTENTE` existante, pas de nouvelle création |
| Solde insuffisant | Message explicite et proposition du pack inférieur |
| Changement de devise en cours de session | Interdit après création de la transaction |
| Demande de remboursement | WF-15, avec règle de proratisation selon les tokens déjà consommés |

---

### WF-06 — Constitution du dossier et analyse documentaire

| | |
|---|---|
| **Acteurs** | CAND, SYS |
| **Précondition** | Dossier `ACTIF`, quota de tokens disponible |

**Étapes**

1. Téléversement d'une pièce (PDF ou image) depuis la checklist.
2. Contrôles immédiats : type MIME, taille, **analyse antivirus**. Rejet synchrone en cas d'échec.
3. Stockage dans MinIO, bucket privé, clé non devinable. La pièce passe en `EN_ANALYSE`.
4. Mise en file d'un job (pg-boss).
5. Le worker appelle **Claude en vision directe sur le document** : identification du type, extraction des champs clés, signalement des incohérences apparentes.
6. Application des **validations déterministes en TypeScript** à partir de `rules.conditions` : validité du passeport, seuil de fonds, cohérence des dates, correspondance nom/prénom entre pièces.
7. Verdict, champs extraits, messages actionnables et tokens consommés enregistrés.
8. Notification du candidat, mise à jour du score de complétude (WF-07).

**Règles de gestion**

- RG-06.1 : tout ce qui est vérifiable sans IA l'est sans IA. L'IA n'intervient que sur l'extraction et la cohérence narrative.
- RG-06.2 : une pièce re-téléversée à l'identique (même empreinte) réutilise le verdict en cache, sans débit de tokens.
- RG-06.3 : un message d'échec est toujours **actionnable** — « votre passeport expire 4 mois après la date de retour prévue, il en faut 6 », jamais « document non conforme ».
- RG-06.4 : les URLs MinIO présignées ont une durée de vie de 5 minutes et sont générées à la demande.
- RG-06.5 : quota épuisé → dégradation gracieuse, proposition du pack supérieur, jamais de dépassement silencieux (INV-6).
- RG-06.6 : les pièces à durée de validité limitée (relevés bancaires, extraits de casier) portent une date de péremption et basculent en `EXPIREE` automatiquement.

**Cas limites**

| Cas | Traitement |
|---|---|
| Scan illisible | `ILLISIBLE` + consignes de reprise (cadrage, résolution, éclairage), pas de débit de quota |
| PDF protégé par mot de passe | Rejet synchrone avec explication |
| Type détecté ≠ type attendu | `HORS_SUJET` + proposition de reclassement dans la bonne ligne de checklist |
| Document dans une langue non gérée | Analyse limitée + obligation de traduction assermentée signalée |
| Service IA indisponible | Job réessayé avec backoff exponentiel ; au-delà de 3 échecs, bascule en revue manuelle back-office |

---

### WF-07 — Score de complétude

| | |
|---|---|
| **Acteur** | SYS |
| **Déclencheur** | Tout changement d'état d'une pièce ou de règle |

**Ce que le score est** : une mesure, de 0 à 100, de l'état d'avancement objectif du dossier.
**Ce que le score n'est pas** : une prédiction d'acceptation (INV-1).

**Composantes**

| Composante | Poids | Nature |
|---|---|---|
| Pièces obligatoires présentes et `CONFORME` | 50 % | Déterministe |
| Conditions bloquantes satisfaites | 25 % | Déterministe |
| Cohérence inter-documents | 15 % | Déterministe + IA |
| Qualité rédactionnelle des pièces libres | 10 % | IA |

**Règles de gestion**

- RG-07.1 : chaque point manquant est **explicable et actionnable**, avec le lien vers l'action correspondante.
- RG-07.2 : le passage en `PRET` exige 100 % des composantes déterministes, pas un score global élevé — une pièce bloquante manquante ne se compense pas par une bonne lettre de motivation.
- RG-07.3 : le libellé affiché est « complétude de votre dossier », jamais « chances de succès ».
- RG-07.4 : une pièce passant en `EXPIREE` fait régresser le score et repasse le dossier de `PRET` à `ACTIF`.

---

### WF-08 — Pièces rédigées : génération et correction

| | |
|---|---|
| **Acteur** | CAND + SYS |
| **Périmètre** | Lettre de motivation, projet d'études, CV au format du pays cible |

**Étapes**

1. Choix du type de pièce et de la destination — les attendus diffèrent fortement d'un pays à l'autre.
2. Entretien guidé : le candidat répond à des questions ciblées (parcours, motivation, projet de retour, financement).
3. Génération d'une première version **à partir de ses réponses**, jamais d'un modèle pré-rempli générique.
4. Analyse critique de la version : cohérence avec le reste du dossier, points faibles, éléments manquants au regard des attendus du pays.
5. Itérations, avec versionnement de chaque état.
6. Export PDF et DOCX.

**Règles de gestion**

- RG-08.1 : le document généré porte une mention indiquant qu'il s'agit d'une aide à la rédaction relevant de la responsabilité du candidat.
- RG-08.2 : aucun formulaire officiel n'est rempli ni soumis par la plateforme (INV-1).
- RG-08.3 : cohérence croisée obligatoire — si la lettre mentionne un financement familial et que le relevé est au nom du candidat, l'incohérence est signalée.
- RG-08.4 : chaque itération débite le quota de tokens ; le compteur restant est visible en permanence.

---

### WF-09 — Suivi et échéancier

| | |
|---|---|
| **Acteurs** | CAND, SYS |

**Étapes**

1. Construction de l'échéancier à rebours depuis la date cible (rentrée, prise de poste), en remontant les délais de chaque étape : équivalence de diplôme, test de langue, prise de rendez-vous consulaire, traitement du dossier.
2. Tableau de bord : score de complétude, prochaine action, jours restants, pièces expirantes.
3. Rappels par email et, pour les échéances critiques, par SMS.
4. Alerte d'incompatibilité si le calendrier ne tient plus, avec proposition de replanification.

**Règles de gestion**

- RG-09.1 : les délais utilisés proviennent de `rules.delai_traitement_jours` et `pieces_requises[].delai_obtention_jours`, jamais d'estimations codées en dur.
- RG-09.2 : les rappels sont regroupés — un email hebdomadaire, sauf urgence à moins de 7 jours.
- RG-09.3 : un délai réglementaire modifié déclenche un recalcul intégral de l'échéancier et une notification explicite.

---

### WF-10 — Clôture, issue déclarée et purge

| | |
|---|---|
| **Acteurs** | CAND, SYS |

**Étapes**

1. Le candidat déclare avoir déposé sa demande → `SOUMIS`.
2. Relance à J+30 puis J+60 pour connaître l'issue.
3. Déclaration de l'issue : accepté, refusé (avec motif si communiqué), sans réponse, renoncement → `ISSUE_DECLAREE`.
4. Déclenchement de la **purge des pièces** selon la politique de rétention : suppression du contenu MinIO, conservation des seules métadonnées (type, verdict, horodatage). Les pièces passent en `PURGEE`.
5. Passage en `ARCHIVE`.

**Règles de gestion**

- RG-10.1 : la purge est automatique et indépendante de toute action du candidat (INV-5).
- RG-10.2 : la purge est annoncée à l'avance et présentée comme une garantie, pas subie comme une perte.
- RG-10.3 : les motifs de refus déclarés alimentent **l'amélioration des checklists**, jamais un modèle prédictif (INV-1).
- RG-10.4 : une demande de suppression de compte purge immédiatement les pièces et anonymise les métadonnées, sans attendre l'échéance. Les écritures strictement nécessaires à la comptabilité et au traitement d'un remboursement en cours sont conservées ou anonymisées, jamais supprimées (K.C).
- RG-10.5 : la conservation des octets est dissociée de celle du dossier. Une purge de pièces ne supprime ni le dossier, ni son historique, ni ses verdicts, ni ses traces d'audit ; un dossier `SOUMIS` ou `SUSPENDU` garde son état après la purge (arbitrage S.78).
- RG-10.6 : `SOUMIS` — l'inactivité seule ne vaut pas abandon. Les pièces sont conservées 12 mois après le dépôt déclaré. Soixante jours avant l'échéance, le candidat est invité à confirmer que l'instruction continue ; une confirmation explicite prolonge la conservation de 6 mois, renouvelable. Sans réponse, un préavis de 30 jours précède la purge.
- RG-10.7 : `SUSPENDU` — aucune inactivité ne clôt un dossier suspendu par la plateforme ; la suspension est une dette opérationnelle suivie par la sonde de santé. Avertissement après 11 mois de suspension, purge à 12 mois si elle n'est pas levée. Le dossier, le motif, la date et le statut antérieur restent ; les pièces encore nécessaires sont redemandées à la reprise.
- Toute purge est annoncée au moins 30 jours avant d'avoir lieu, y compris lorsque l'échéance théorique est déjà passée.

---

## 4. Workflows transverses

### WF-11 — Alertes réglementaires et divergence de version

| | |
|---|---|
| **Acteurs** | SYS, VEIL, CAND |
| **Déclencheur** | Publication d'une nouvelle version de `VisaRule` (WF-14) |

**Étapes**

1. À la publication de la version N+1, le système calcule le **diff** avec la version N.
2. Identification des dossiers `ACTIF` ou `PRET` rattachés à la version N.
3. Classement de l'impact :

| Impact | Critère | Traitement |
|---|---|---|
| **Mineur** | Aucune condition bloquante touchée | Information, dossier inchangé |
| **Majeur** | Seuil ou pièce obligatoire modifié | Notification + proposition de migration vers N+1 |
| **Critique** | Dispositif supprimé ou condition d'éligibilité perdue | Dossier en `SUSPENDU`, contact humain |

4. Le candidat décide de migrer ou non — un dossier déjà déposé reste régi par la version en vigueur au dépôt.

**Règles de gestion**

- RG-11.1 : une migration recalcule la checklist et le score, sans jamais supprimer une pièce déjà validée.
- RG-11.2 : les alertes sont ciblées par destination et type de visa, jamais diffusées à toute la base.
- RG-11.3 : un changement critique est doublé d'un email nominatif, pas seulement d'une notification in-app.

### WF-12 — Mise en relation consultant (phase 3)

| | |
|---|---|
| **Acteurs** | CAND, CONS, ADM |

1. Le candidat demande un accompagnement humain, depuis un point de blocage identifié.
2. Filtrage des consultants par destination, langue, spécialité, disponibilité.
3. Prise de rendez-vous, paiement, commission ImmiPro prélevée.
4. Partage **explicitement consenti et limité dans le temps** du dossier avec le consultant.
5. Évaluation après consultation.

**Règles de gestion**

- RG-12.1 : un consultant n'est référencé qu'après vérification de son habilitation dans la juridiction concernée — RCIC pour le Canada, et l'équivalent applicable ailleurs.
- RG-12.2 : le partage du dossier est révocable et expire automatiquement.
- RG-12.5 : *(ajoutée le 20/09/2026, arbitrage K.C)* une suppression de compte annule les rendez-vous à venir et **libère les créneaux immédiatement**, indépendamment du traitement financier. Elle n'annule pas pour autant les conditions commerciales acceptées à la réservation : avant la limite d'annulation stockée avec le rendez-vous, la consultation est remboursée ; après, elle reste due. Un remboursement au-delà de la limite est un geste de support, nommé et motivé — jamais une branche automatique.
- RG-12.3 : la plateforme est un intermédiaire de mise en relation ; le conseil est délivré par le consultant, sous sa responsabilité.
- RG-12.4 : toute prestation est rendue par le consultant, jamais par ImmiPro en son nom.

### WF-13 — Affiliation partenaires

1. Sur une surface dédiée — tarifs, services, annuaire — les offres disponibles pour la destination du dossier : assurance santé, logement, service d'équivalence de diplôme, transfert de fonds. Chaque offre se rattache à une étape de checklist et le dit.
2. Redirection tracée, commission au résultat.

**Règles de gestion**

- RG-13.1 : *(réécrite le 20/09/2026, arbitrage K.A)* à l'étape de checklist, la plateforme affiche une **aide fonctionnelle** — ce qu'il y a à faire pour obtenir la pièce — et jamais une offre. Une offre est **rattachée à une étape** et le dit, mais elle ne s'affiche que sur une surface dédiée, où le candidat vient la chercher.
- RG-13.2 : aucune proposition commerciale dans l'espace dossier lui-même ni pendant un parcours de paiement.

La version précédente de RG-13.1 demandait une proposition « contextuelle à l'étape » de checklist, ce que RG-13.2 interdisait dans la même phrase : l'étape de checklist *est* l'espace dossier. La frontière ne passe pas entre une proposition et plusieurs, mais entre expliquer quoi faire et vendre une prestation.
- RG-13.3 : la nature commerciale du lien est signalée.
- RG-13.4 : la rétro-commission sur recrutement étudiant est vérifiée destination par destination avant activation — elle est encadrée voire prohibée dans certains pays.

---

## 5. Workflows internes

### WF-14 — Veille réglementaire

| | |
|---|---|
| **Acteurs** | VEIL, SYS, ADM |
| **Criticité** | C'est le cœur opérationnel du produit |

**Étapes**

1. Un cron quotidien alimente la file de relecture :

```sql
SELECT country_code, visa_type, source_tier, next_review_at
FROM "VisaRule"
WHERE status IN ('PUBLISHED','DRAFT') AND next_review_at <= CURRENT_DATE + 30
ORDER BY next_review_at;
```

2. Le veilleur consulte la source officielle, compare, et conclut :
   - **inchangé** → `verifiedAt` et `nextReviewAt` mis à jour, pas de nouvelle version ;
   - **modifié** → création de la version N+1 en `DRAFT`.
3. Validation du payload par le schéma Zod avant toute écriture.
4. Relecture par un second opérateur pour toute modification de condition bloquante.
5. Publication : la version N passe en `ARCHIVED` avec son `effectiveTo`, la version N+1 en `PUBLISHED`.
6. Déclenchement de WF-11.

**Règles de gestion**

- RG-14.1 : une fiche dont `nextReviewAt` est dépassée **repasse automatiquement en `DRAFT`** et disparaît de l'affichage utilisateur. Une donnée non relue ne peut pas continuer à se présenter comme fiable.
- RG-14.2 : une règle de source `SECONDAIRE` ne peut pas être publiée — garde-fou applicatif, pas consigne humaine.
- RG-14.3 : périodicité de relecture par défaut : 90 jours, ramenée à 30 jours avant une date connue de révision (les montants IND changent au 1er janvier).
- RG-14.4 : chaque version conserve son `sourceUrl`, `verifiedAt` et `verifiedBy` — c'est la preuve de diligence.

### WF-15 — Administration

| Domaine | Opérations |
|---|---|
| Utilisateurs | Recherche, suspension, export RGPD, suppression |
| Paiements | Consultation, réconciliation manuelle, remboursement |
| Dossiers | Consultation en lecture seule justifiée, déblocage, revue manuelle des pièces en échec |
| Contenu | Guides, blog, fiches pays |
| Consultants | Validation d'habilitation, suspension |
| Journalisation | Audit de tous les accès aux pièces |

**Règles de gestion**

- RG-15.1 : tout accès administrateur à une pièce d'identité est **journalisé avec motif obligatoire**.
- RG-15.2 : remboursement proratisé selon les tokens consommés, plafonné selon les CGU.
- RG-15.3 : RBAC strict, principe du moindre privilège, aucun compte partagé.

### WF-16 — Supervision des coûts IA

1. Chaque appel enregistre les tokens consommés, rattachés au dossier et au pack.
2. Tableau de bord : coût moyen par dossier, par type de pièce, par destination.
3. Alerte dès qu'un dossier dépasse un seuil de coût rapporté au prix du pack.
4. Révision périodique de la grille tarifaire à partir des coûts réels.

**Règles de gestion**

- RG-16.1 : le coût marginal moyen d'un dossier doit rester inférieur à 15 % du prix du pack correspondant.
- RG-16.2 : tout dépassement individuel déclenche une analyse — c'est souvent le signe d'un usage détourné ou d'une boucle de correction mal bornée.

---

## 6. Matrice de traçabilité

| Workflow | Tables principales | Appels IA | Impact juridique |
|---|---|---|---|
| WF-01 | `VisaRule` | non | INV-1, INV-8 |
| WF-02 | `User`, `Profile`, `Consent` | non | RGPD |
| WF-03 | `Recommendation` | non | INV-1 |
| WF-04 | `Application` | non | INV-3 |
| WF-05 | `Transaction` | non | CGU, facturation |
| WF-06 | `Document` | **oui** | RGPD, INV-5 |
| WF-07 | `Application`, `Document` | partiel | **INV-1 — point le plus sensible** |
| WF-08 | `GeneratedDocument` | **oui** | INV-1, INV-2 |
| WF-09 | `Deadline` | non | — |
| WF-10 | `Application`, `Document` | non | RGPD, rétention |
| WF-11 | `VisaRule`, `Application` | non | Devoir d'information |
| WF-12 | `Consultant`, `Booking` | non | **Professions réglementées** |
| WF-13 | `PartnerReferral` | non | Transparence commerciale |
| WF-14 | `VisaRule` | non | Preuve de diligence |
| WF-15 | `AuditLog` | non | RGPD |
| WF-16 | `AiUsage` | non | — |

---

## 7. Séquencement de mise en œuvre

| Lot | Workflows | Condition de sortie |
|---|---|---|
| **Lot 1 — MVP payant** | WF-01 à WF-07, WF-14 | Un candidat peut aller du simulateur au dossier complété et payer en Mobile Money |
| **Lot 2 — Rédaction et suivi** | WF-08, WF-09, WF-10, WF-16 | Cycle de vie complet du dossier, coûts IA maîtrisés |
| **Lot 3 — Confiance et revenus** | WF-11, WF-13, WF-15 | Alertes réglementaires opérationnelles, affiliation active |
| **Lot 4 — Humain** | WF-12 | Consultants vérifiés référencés |

WF-14 est dans le lot 1 **malgré son caractère interne** : sans veille, le référentiel se périme avant même le lancement, et l'ensemble du produit perd sa valeur.
