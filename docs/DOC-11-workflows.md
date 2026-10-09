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
| INV-6 | Tout appel IA est débité d'un quota d'analyses rattaché au pack ; les jetons consommés sont mesurés et surveillés (D-1 du 09/10/2026) | Pas de dépassement silencieux |
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

### Périmètre V1 définitif (25/09/2026)

Ce qui suit l'emporte sur toute étape de ce document qui le contredirait. Une capacité marquée **V2** reste décrite, pour garder la trace de la spécification ; elle n'est ni promise, ni affichée, ni configurée en V1.

| Sujet | V1 |
|---|---|
| Langue | Produit en français, sur tous les écrans, courriels et documents. |
| Fuseau horaire | Les rappels suivent le fuseau choisi par le candidat (RG-09.4). Tous les autres écrans datent à l'heure de Cotonou (`FUSEAU_AFFICHAGE`). |
| Connexion | Adresse électronique et mot de passe. **OAuth Google : V2.** |
| SMS | **V2.** Les rappels partent dans l'application et par courriel. Aucune variable de fournisseur SMS n'est déclarée. |
| Montée en gamme | Essentiel → Dossier seulement (RG-05.6). **Essentiel → Dossier Pro : V2.** |
| Date de dépôt | La correction autonome par le candidat est **reportée**. Le recours passe par le support : le candidat signale la bonne date depuis son dossier, et un opérateur l'applique ou la refuse (RG-10.8). |
| Partenaires | Désactivés tant qu'aucune activation conformité n'existe pour la destination (K.D, RG-13.4). Aucune offre n'apparaît sans elle, et le filtre est dans la requête. |
| Fournisseur d'IA | Choisi par l'exploitant, par fonction (lecture des pièces, rédaction et relecture) : Anthropic par défaut, ou toute API compatible OpenAI. Les pièces d'identité ne partent chez un autre sous-traitant qu'Anthropic que sur autorisation écrite. Aucune bascule automatique (S.94, RG-06.7, RG-08.6). |

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

1. Création de compte : email + mot de passe, sessions en base. *(OAuth Google : V2, hors périmètre V1.)*
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
5. Redirection vers `/paiement/attente`, page de polling interrogeant `GET /api/paiements/statut?tx=` toutes les 3 secondes, **timeout à 5 minutes**, bouton « Réessayer ».
6. En parallèle, le webhook FedaPay arrive, sa **signature est vérifiée**, la `Transaction` passe en `CONFIRMEE`.
7. Crédit du pack : analyses ouvertes au grand livre du dossier, déblocage des fonctionnalités, passage du dossier en `ACTIF`.
8. Envoi du reçu par email.

**Règles de gestion**

- RG-05.1 : le webhook est la **seule source de vérité**. Le retour de redirection ne crédite jamais un compte.
- RG-05.2 : traitement idempotent par `providerTxId` — un webhook rejoué ne crédite pas deux fois (INV-7).
- RG-05.3 : les routes de webhook sont exclues du rate limiting mais soumises à vérification de signature.
- RG-05.4 : un job de réconciliation interroge le fournisseur toutes les 15 minutes sur les transactions `EN_ATTENTE` de plus de 10 minutes — le webhook peut se perdre.
- RG-05.5 : montant minimum 3 000 XOF, en dessous duquel frais de collecte et coût IA rendent la transaction non rentable.
- RG-05.6 : sur un même dossier, le passage d'Essentiel à Dossier se paie la différence — prix actuel de Dossier dans la devise de l'achat Essentiel, moins le montant effectivement payé pour cet achat, jamais négatif, sans conversion XOF/EUR (15 000 − 5 000 = 10 000 F ; 29 − 12 = 17 €). Il ajoute 20 analyses (le quota issu du pack passe de 10 à 30) et ouvre la rédaction assistée ; les recharges n'en réduisent ni le prix ni les analyses. L'achat Essentiel d'origine doit être confirmé, couvrir ce dossier, n'être ni remboursé ni en cours de remboursement ; une seule montée ouverte par achat et par dossier. La montée est une transaction distincte liée à l'achat source ; un rejeu ne débite ni ne crédite deux fois. La consommation du quota est imputée à ses octrois, premier entré premier consommé, et chaque débit nomme l'octroi qu'il entame : l'Essentiel et les recharges achetées avant la montée s'épuisent avant les 20 analyses ajoutées, une recharge achetée après s'épuise après elles. Le remboursement du supplément est automatique seulement si les 20 analyses de la montée sont intactes (aucune consommation imputée à son octroi) **et** si aucune rédaction assistée n'a été utilisée depuis sa confirmation ; il retire alors les 20 analyses et le droit à de nouveaux appels de rédaction assistée, jamais les réponses, textes ou versions. Sinon, revue manuelle. Tant qu'une montée confirmée n'est pas remboursée, l'achat Essentiel d'origine ne se rembourse pas seul. Essentiel → Dossier Pro est hors V1 (S.92, qui remplace la convention « consommées en dernier » de S.90). Un achat de Dossier au prix plein reste un achat supplémentaire et n'est pas présenté comme une montée (arbitrage S.88).

**Cas limites**

| Cas | Traitement |
|---|---|
| Paiement débité, webhook jamais reçu | Rattrapé par RG-05.4 ; au-delà de 24 h, ticket automatique en back-office |
| Double soumission | Réutilisation de la transaction `EN_ATTENTE` existante, pas de nouvelle création |
| Solde insuffisant | Message explicite et proposition du pack inférieur |
| Changement de devise en cours de session | Interdit après création de la transaction |
| Demande de remboursement | WF-15, avec proratisation selon les analyses vendues et restantes, figées sur la transaction (RG-15.2, S.124 et S.128) |

---

### WF-06 — Constitution du dossier et analyse documentaire

| | |
|---|---|
| **Acteurs** | CAND, SYS |
| **Précondition** | Dossier `ACTIF`, au moins une analyse disponible |

**Étapes**

1. Téléversement d'une pièce (PDF ou image) depuis la checklist.
2. Contrôles immédiats : type MIME, taille, **analyse antivirus**. Rejet synchrone en cas d'échec.
3. Stockage dans MinIO, bucket privé, clé non devinable. La pièce passe en `EN_ANALYSE`.
4. Mise en file d'un job (pg-boss).
5. Le worker appelle **le fournisseur de lecture choisi par l’exploitant, dans le cadre de RG-06.7** : identification du type, extraction des champs clés, signalement des incohérences apparentes.
6. Application des **validations déterministes en TypeScript** à partir de `rules.conditions` : validité du passeport, seuil de fonds, cohérence des dates, correspondance nom/prénom entre pièces.
7. Verdict, champs extraits, messages actionnables et tokens consommés enregistrés.
8. Notification du candidat, mise à jour du score de complétude (WF-07).

**Règles de gestion**

- RG-06.1 : tout ce qui est vérifiable sans IA l'est sans IA. L'IA n'intervient que sur l'extraction et la cohérence narrative.
- RG-06.2 : une pièce re-téléversée à l'identique (même empreinte) réutilise le verdict en cache, sans nouvel appel IA ni nouveau débit d’analyse (INV-6).
- RG-06.3 : un message d'échec est toujours **actionnable** — « votre passeport expire 4 mois après la date de retour prévue, il en faut 6 », jamais « document non conforme ».
- RG-06.4 : les URLs MinIO présignées ont une durée de vie de 5 minutes et sont générées à la demande.
- RG-06.5 : quota épuisé → dégradation gracieuse, proposition du pack supérieur, jamais de dépassement silencieux (INV-6).
- RG-06.6 : les pièces à durée de validité limitée (relevés bancaires, extraits de casier) portent une date de péremption et basculent en `EXPIREE` automatiquement.
- RG-06.7 : le fournisseur de la lecture automatique est choisi par l'exploitant (`AI_FOURNISSEUR_EXTRACTION`) : Anthropic par défaut, ou une API compatible OpenAI. Une pièce d'identité ne part chez un autre sous-traitant qu'Anthropic que si `AI_PIECES_SOUS_TRAITANT_AUTORISE` porte son code, posée une fois la sous-traitance validée ; sans elle, la lecture n'est pas branchée et la pièce part en revue humaine, analyse recréditée. Un PDF n'est envoyé qu'à un fournisseur déclaré lecteur de PDF ; sinon, revue humaine. Chaque appel consigne son fournisseur et son modèle, et son coût se calcule au tarif de ce fournisseur. Le quota des packs se compte en analyses ; les jetons de chaque appel sont mesurés et comparés à la contrepartie du pack par l'alerte de B-07 (INV-6, D-1 du 09/10/2026).

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
- RG-08.4 : chaque mise en forme ou relecture assistée débite une analyse, rendue si elle ne produit rien ; le compteur restant est visible en permanence.
- RG-08.5 : la rédaction assistée — proposition de texte à partir des réponses, reformulation, analyse critique, recoupements qui exigent la lecture automatique de pièces — est un droit des packs Dossier et Dossier Pro, dérivé de la couverture attribuée au dossier et jamais du dernier pack acheté par le compte. Une recharge d'analyses ne l'ouvre pas. Tous les packs gardent l'entretien guidé, l'écriture et la réécriture manuelles, les versions, les exports et les recoupements déterministes. Un refus ne perd jamais les réponses, le texte ni les versions (arbitrage S.80).
- RG-08.6 : le fournisseur de la mise en forme et de la relecture est choisi par l'exploitant (`AI_FOURNISSEUR_REDACTION`) : Anthropic par défaut, ou une API compatible OpenAI. Les consignes, le schéma de la relecture et la lecture des réponses sont les mêmes quel que soit le fournisseur ; une réponse hors schéma, coupée ou refusée ne produit ni version ni avis. Aucune bascule automatique vers un autre fournisseur (arbitrage S.94).

---

### WF-09 — Suivi et échéancier

| | |
|---|---|
| **Acteurs** | CAND, SYS |

**Étapes**

1. Construction de l'échéancier à rebours depuis la date cible (rentrée, prise de poste), en remontant les délais de chaque étape : équivalence de diplôme, test de langue, prise de rendez-vous consulaire, traitement du dossier.
2. Tableau de bord : score de complétude, prochaine action, jours restants, pièces expirantes.
3. Rappels dans l'application et par email, à l'heure du fuseau choisi par le candidat. *(SMS pour les échéances critiques : V2, hors périmètre V1.)*
4. Alerte d'incompatibilité si le calendrier ne tient plus, avec proposition de replanification.

**Règles de gestion**

- RG-09.1 : les délais utilisés proviennent de `rules.delai_traitement_jours` et `pieces_requises[].delai_obtention_jours`, jamais d'estimations codées en dur.
- RG-09.2 : les rappels sont regroupés — un email hebdomadaire, sauf urgence à moins de 7 jours.
- RG-09.3 : un délai réglementaire modifié déclenche un recalcul intégral de l'échéancier et une notification explicite.
- RG-09.4 : les rappels se règlent sur le compte — activation globale, email en plus de l'alerte dans l'application, fuseau horaire (liste de villes, Cotonou par défaut), délai d'alerte de 3, 7 ou 14 jours (7 par défaut, RG-09.2). Un rappel part au plus une fois par dossier et par jour local du candidat, à partir de 8 h dans son fuseau ; la clé `echeance:<dossier>:<jour>` est unique en base. L'email n'est annoncé que si le transport est constaté opérationnel ; un courrier non accepté par le serveur n'est jamais présenté comme envoyé, il reste en attente et est repris dans la journée, puis abandonné — la notification demeure. Aucun rappel pour une échéance faite, une pièce déjà déposée, un dossier déposé, clos, abandonné ou suspendu, un compte en suppression, des rappels coupés. Aucun SMS n'est proposé : le SMS est hors V1 (arbitrage S.87, périmètre V1 du 25/09/2026).

---

### WF-10 — Clôture, issue déclarée et purge

| | |
|---|---|
| **Acteurs** | CAND, SYS |

**Étapes**

1. Le candidat déclare avoir déposé sa demande, avec **la date réelle du dépôt** → `SOUMIS`.
2. Relance à J+30 puis J+60 après la date réelle du dépôt pour connaître l'issue.
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
- RG-10.8 : la déclaration de dépôt demande la date réelle du dépôt (« Quand as-tu déposé ta demande ? »), obligatoire, préremplie avec la date locale du jour, modifiable avant confirmation ; la case de confirmation reste non pré-cochée. La date est civile, sans heure ; elle ne peut être ni future ni antérieure à l'ouverture du dossier ; elle n'est pas refusée si elle précède `readyAt`, et aucun retard maximal n'est imposé. Deux faits sont conservés : la date réelle, qui commande les relances J+30 et J+60, l'échéance normale de conservation à douze mois, le suivi et l'export ; et la date de déclaration dans ImmiPro, qui sert l'audit. `updatedAt` ne tient lieu d'aucune des deux. Une déclaration tardive ne provoque jamais de purge immédiate : l'échéance effective est la plus tardive entre douze mois après la date réelle et trente jours après l'annonce. Une relance déjà dépassée le jour de la déclaration n'est pas envoyée, et un rattrapage n'envoie que le jalon le plus récent. Après confirmation, la date se corrige par une action auditée du back-office (motif, ancienne et nouvelle valeur), qui recalcule les échéances sans raccourcir une prolongation ni rapprocher une purge annoncée. Le candidat demande une correction depuis son dossier (date et explication, une seule demande en attente) ; un opérateur l'applique par cette action, ou la refuse avec une réponse qui lui est adressée ; la date enregistrée ne change pas d'ici là (S.90). L'export distingue la date réelle du dépôt et la date de sa déclaration (arbitrage S.89).

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
- RG-15.2 : remboursement proratisé selon les **analyses** consommées — l'unité que le candidat voit et achète, et non les jetons (décision de la direction du 06/10/2026). Montant = prix payé × analyses restantes ÷ analyses du pack, arrondi à l'unité mineure inférieure. Automatique tant que le dossier n'est ni déclaré déposé ni clos ; au-delà, revue manuelle. Rien de consommé : prix entier. Tout consommé : rien à rendre, aucune obligation ouverte. La rédaction assistée ne change pas le montant. L'avoir porte la somme rendue.
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
