# Matrice de recette V1 — RF-5

Chantier fonctionnel du 09/10/2026, lot RF-5, entrée S.156 du registre.
Périmètre retenu par le responsable le 09/10/2026 : **la matrice et une
recette locale**. La préproduction, les services réels et la signature
de la matrice restent à faire.

## Comment lire cette matrice

Chaque ligne donne le scénario, le rôle, les préconditions, le résultat
attendu, le résultat observé, la preuve, le statut, la date et le
responsable (critère de preuve du chantier, §RF-5).

Statuts :

- **Vérifié (banc)** : déroulé sur le banc local, résultat conforme.
  Cela ne vaut ni recette en préproduction ni preuve d'exploitation.
- **Anomalie** : déroulé, résultat non conforme. L'anomalie est décrite
  en bas de page.
- **Non vérifié** : pas encore déroulé. Une ligne qui dépend d'un service
  réel (lecture par le modèle, paiement, nginx, certificats, VPS) reste
  ainsi tant qu'elle n'a pas été déroulée là où ce service existe.

Version recettée : `main` en `80b8bc5` (S.155 compris), construite par
`npm run build`. Date : 09/10/2026. Responsable du banc : Claude Code.
La signature de la matrice revient au responsable.

## Le banc

`npm run recette:banc` (après `npm run build`) lance, sur une base
jetable `immipro_recette` :

- l'application telle que l'image la lance : le serveur `standalone` de
  Next, avec `public/` et `.next/static/` copiés à côté, comme le fait le
  `Dockerfile` ;
- le worker de `dist/` ;
- un stockage S3 simulé : CORS et dépôt présigné du navigateur compris,
  copie de promotion, lecture présignée de l'aperçu B-05 ;
- un antivirus simulé : le fichier d'essai EICAR est reconnu, tout le
  reste est déclaré sain ;
- un serveur de courrier qui écrit chaque message dans
  `.recette/courriers/` et affiche le code de vérification ;
- les graines de règles, d'éditorial et de démonstration, avec un mot de
  passe tiré au hasard et affiché au lancement.

Ce que le banc ne simule pas :

- la lecture par le modèle (aucune clé) : une pièce saine part en revue
  humaine, sans débit d'analyse, comme en production sans fournisseur ;
- le paiement : aucun rail n'est branché ;
- nginx et les certificats.

Les parcours ont été pilotés par un navigateur Chromium, à 390 px pour le
candidat et 1 280 px pour l'opérateur. L'état a été relu en base après
chaque geste.

**S.170 / REV11-L0, proposition du 11/10.** L'environnement du banc est
construit par liste autorisée et neutralise aussi Vertex/anciens noms des
clés de paiement. La disponibilité exige l'état privé de cette passe et
une base accessible ; seul le paiement volontairement coupé peut rester
bloquant dans cette recette. Un échec ferme enfants et services.
`smoke:recette` vérifie le vrai banc dans la porte commune ;
`scripts/recette/recette-documentaire.py` rejoue R-K04/R-O01 sur un banc
neuf, avec lecture de la nouvelle version et du quota en base.
Les 45 navigations/neuf contrôles et le dépôt/revue humaine ont été rejoués.
Voir [preuves, commandes et limites](../revue/lot-l0-2026-10-11.md).
Ce complément conserve les statuts antérieurs et les préalables de signature.

**S.171 / REV11-L1, proposition du 11/10.** Une pièce ne suit plus aucune
redirection (DIA-04 vert, repris par `tests/ia-redirections.test.ts`), et
l'autorisation des pièces chez un fournisseur compatible désigne l'origine
validée (`AI_OPENAI_ORIGINE_AUTORISEE`). Éprouvé sur serveurs locaux :
aucun prestataire réel, aucune région ni DPA vérifiés (L5).

**S.176 / REV11-L5, proposition du 12/10.** Banc de qualification corrigé,
trente pièces/dix rédactions/dix lettres de référence, mesures canoniques
par appel et incidents éprouvés sur HTTP local Anthropic/compatible.
[Protocole](../exploitation/qualification-ia.md) et
[preuves/limites](../revue/lot-l5-2026-10-12.md).
Aucun fournisseur réel, DPA, région, coût facturé ou configuration déployée
qualifié. Les lignes dépendantes d'un service réel restent non vérifiées.

**S.180 / L6-L7-L9, proposition du 15/10.** Les parcours authentifiés
entrent dans la porte commune : `npm run test:parcours`, quinze scénarios
par profil sur Chromium, Firefox et WebKit × 390/1 440 px, vraie
application, vrai worker, base jetable, fournisseurs scriptés seulement.
Inscription, achat scripté, dépôt et lecture, coupure, réponse tardive,
signalement et décision B-05, lecture sans mesure, consentement retiré,
rédaction, double onglet, quota épuisé et reprise gratuite, dépôt déclaré,
clôture. B-07 ne déborde plus à 390 px. Deux défauts reproduits et
corrigés : éditeur qui ne suivait pas la version produite, dénominateur du
compteur gonflé par un rendu. [Preuves et limites](../revue/lot-l6-l9-2026-10-15.md).
Aucun fournisseur réel ni encaissement ; lecteur d'écran humain,
préproduction et signature restent à faire.

**S.178 / L6, proposition du 12/10.** Gestes candidat automatisés dans Chromium
390/1280 px avec la vraie application, worker et PostgreSQL, fournisseurs
scriptés locaux uniquement. Téléphone normalisé conservé, code email réel capturé,
ouverture/checklist, paiement signé/attribution, dépôt/mesure et retrait du
consentement. [Preuves détaillées et limites](../revue/lot-l6-2026-10-12.md).
Ne remplace pas la qualification L5, Firefox/WebKit ou un lecteur d'écran humain.
Les lignes non couvertes restent non vérifiées.

## Candidat

**S.182, complément du 15/10 sur `29e9f20`, numéroté S.181 à l'ouverture.** La recette conserve les
correctifs de stabilité de Claude `2c5a3c0` : la CI de base est verte
([run](https://github.com/malcomx2022/immipro/actions/runs/38805109198)).
La protection de saisie R-03 est complétée par une réponse retardée, la
conservation du brouillon et son enregistrement relu en SQL. B-04/B-07 sont
mesurés sur chaque largeur ; les exceptions WebKit se limitent aux
préchargements Next de l'application interrompus par une navigation, sans
ignorer une erreur d'accès vers une autre origine. La suite passe à
96 parcours en plus des 84 scénarios publics. Résultats du complément et
limites : [rapport S.182](../revue/finition-s182-2026-10-15.md).
Ces ajouts ne constituent pas une signature humaine ou une qualification réelle.

| N° | Scénario | Préconditions | Attendu | Observé | Preuve | Statut |
|---|---|---|---|---|---|---|
| R-C01 | Visiteur → simulateur → résultats → inscription → code → tableau de bord | Banc vierge, 390 px | Six questions, résultats sourcés, code reçu par courriel, compte vérifié, tableau de bord | Conforme. Aucune erreur dans la console. Observation O-1. S.194 : comparateur C-03 joint depuis l'état vide, colonnes égales aux règles lisibles en base, cinq critères égaux au référentiel, source datée, fiche et ouverture | Code relevé dans `.recette/courriers/001.eml` ; compte vérifié en base ; `tests/parcours/candidat.spec.ts`, Chromium 390/1440 (S.194) | Vérifié (banc) |
| R-C02 | Ouverture d'un dossier, achat d'essai | Compte vérifié | Dossier ouvert, pack acheté, quota crédité | Dossier ouvert en brouillon, règle figée ; checkout intercepté localement, notification signée reçue par la vraie route, 30 analyses attribuées, rejeu sans double attribution. Paiement **scripté**, pas un encaissement réel | `tests/parcours/candidat.spec.ts`, six profils, preuves CI `parcours-candidat` (S.180) | Vérifié (porte CI, paiement scripté) |
| R-C03 | Dépôt d'une pièce saine | Dossier de démonstration, autorisation « pièces » donnée | Accusé « bien arrivé », contrôle, promotion, lecture annoncée | Avant S.155 : la préparation répondait **503** (défaut bloquant, corrigé en S.155). Après : accusé, balayage SAINE, analyse sans débit (aucun fournisseur), revue humaine ouverte | Version 1 SAINE, analyse `creditConsumed = false` | Vérifié (banc) |
| R-C04 | Dépôt du fichier EICAR | Idem | Fichier écarté, non conservé, message qui dit quoi faire, aucune analyse débitée | « Fichier écarté au contrôle… Dépose une nouvelle version de la pièce. » Analyses restantes inchangées | Version INFECTEE, `objectKey` vide | Vérifié (banc) |
| R-C05 | Résultat d'une revue humaine sur l'écran de la pièce (C-08) | R-C03, puis décision B-05 « Conforme » | La pièce se lit conforme, avec le message de l'opérateur | L'alerte dit « Ta pièce a été acceptée après relecture », la checklist compte la pièce conforme, mais C-08 affiche encore « Illisible — Un opérateur regarde ta pièce » et propose « Reprendre la photo » | Capture `r-cas-3-avant` ; `Document.status = CONFORME`. Rejoué après S.157 : « Conforme », titre de l'avis, message de l'opérateur, « Revenir à la checklist », plus de « Reprendre la photo » | Corrigé en S.157 (banc) |
| R-C06 | Remplacement d'une pièce | Pièce déjà déposée | Nouvelle version courante ; l'ancienne reste à l'historique ; la pièce suit la version courante (RG-06.8) | Version 2 créée, version 1 gardée, l'état suit la version 2 | Deux versions en base | Vérifié (banc) |
| R-C07 | Historique des versions et signalement d'une erreur de lecture | Écran C-08 | Les deux liens mènent à leur écran | Les deux liens répondent **404** | Réponses 404 sur `…/versions` et `…/signalement`. Rejoué après S.157 : le signalement ouvre la revue (motif « Signalé par le candidat »), B-05 montre la valeur désignée ; l'historique liste les versions, sans défilement à 390 px | Corrigé en S.157 (banc) |
| R-C08 | Complétude, rédaction assistée, échéancier | Dossier avec pièces lues | Complétude recalculée, rédaction débitée puis soldée (S.153) | Entretien, premier texte scripté débité puis soldé, version manuelle, export DOCX, relecture débitée ; l'éditeur suit désormais la version produite (défaut corrigé en S.180). Échéancier non rejoué S.188 : échéancier rejoué — date fixée depuis l'écran (C-15 corrigé), intenable signalé, date proposée reprise. | Preuves CI `parcours-candidat` (S.180) ; `tests/parcours/candidat.spec.ts`, Chromium 390/1440 (S.188) | Vérifié (porte CI, IA scriptée) ; échéancier vérifié (banc, S.188) |
| R-C09 | Déclaration du dépôt, issue, purge et portabilité | Dossier prêt | RG-10.8, RG-10.9 | Précondition explicite « dossier prêt » ; date hors bornes refusée, déclaration datée, conservation douze mois annoncée, dépôt refusé sur dossier figé, clôture avec issue, purge annoncée, archive consultable. Purge effective (RG-10.9) et portabilité non rejouées S.188 : purge effective lancée à la main après l'échéance (précondition), archive sans fichier ; portabilité téléchargée, deux dossiers, journalisée. | Preuves CI `parcours-candidat` (S.180) ; `tests/parcours/candidat.spec.ts`, Chromium 390/1440 (S.188) | Vérifié (banc, S.188) |

## Cas indispensables

| N° | Scénario | Préconditions | Attendu | Observé | Preuve | Statut |
|---|---|---|---|---|---|---|
| R-K01 | Perte réseau pendant l'envoi des octets | Fichier choisi ; envoi vers le stockage coupé | Bandeau « Connexion perdue » ; fichier gardé ; envoi possible au retour du réseau | Bandeau et fichier gardé : conforme. Le bandeau promet « sera envoyé dès le retour du réseau », mais rien ne part de lui-même : 8 s après le retour, aucune version. Un nouvel appui envoie bien | Aucune version avant l'appui, une après. Rejoué après S.157 : la version arrive sans appui (coupure du stockage, puis hors ligne au moment d'appuyer) ; une relance coupée elle aussi dit d'appuyer sur « Réessayer l'envoi » | Corrigé en S.157 (banc) |
| R-K02 | Double clic sur l'envoi | Fichier choisi | Une seule version | Une seule version (1 → 2) | Décompte en base | Vérifié (banc) |
| R-K03 | Session expirée | Cookies effacés | Page → connexion avec retour ; API → message actionnable | `/connexion?suite=…` ; 401 « Ta session a expiré. Il faut te reconnecter pour continuer. Ton dossier est conservé en l'état. » | Réponse de l'API relevée | Vérifié (banc) |
| R-K04 | Fournisseur de lecture indisponible | Aucune clé | Revue humaine, analyse non débitée, message honnête | « La lecture automatique n'est pas active sur cette installation. Un opérateur regarde ta pièce » ; aucun débit | `engineLog`, `creditConsumed = false` | Vérifié (banc) |
| R-K05 | Quota nul, reprise après « illisible » | Solde à zéro | Le dépôt reste ouvert ; la reprise après « illisible » est lue (FON-03) | Pack Essentiel : neuf lectures débitées, lecture illisible débitée puis rendue, reprise non débitée, dernière lecture débitée, « Tes 10 analyses du pack Essentiel sont utilisées », dépôt conservé sans analyse. Le dénominateur ne compte plus les rendus (défaut « 1 sur 11 » corrigé en S.180) | Preuves CI `parcours-candidat` (S.180) ; `smoke:balayage` | Vérifié (porte CI) |
| R-K06 | Réponse perdue, ancien onglet, changement de fuseau, pièce périmée | — | DOC-11 | Réponse tardive du fournisseur : version conservée, lecture publiée à l'arrivée, un seul débit ; deux onglets sur la relecture : une seule analyse, réservation retrouvée. Changement de fuseau et pièce périmée non rejoués S.188 : fuseau Toronto enregistré, navigateur à UTC+14 sans écart ; pièce périmée déclassée, « prêt » retiré et dépôt refusé (C-16, C-17 corrigés). | Preuves CI `parcours-candidat` (S.180) ; `tests/parcours/candidat.spec.ts`, Chromium 390/1440 (S.188) | Vérifié (banc, S.188) |

## Opérateur

| N° | Scénario | Préconditions | Attendu | Observé | Preuve | Statut |
|---|---|---|---|---|---|---|
| R-O01 | Revue d'une pièce en échec (B-05) | Pièce en revue | Ouverture impossible sans motif ; aperçu présigné ; ouverture et décision au journal avec motif ; alerte au candidat | Bouton désactivé sans motif ; aperçu servi par l'URL présignée ; `piece.consultation` et `revue.decision` au journal avec le motif ; pièce CONFORME ; alerte avec le message tel quel. Observations O-2 et O-3 | Journal d'audit ; captures `r-b05-*` | Vérifié (banc) |
| R-O02 | Message de revue contenant une promesse | R-O01 | Enregistrement bloqué, consigne de reformulation | « « visa garanti » ne peut pas s'afficher chez le candidat — INV-2 — aucune promesse de résultat. Reformule sans ce terme. » ; bouton désactivé | Capture `r-b05-refus-vocabulaire` | Vérifié (banc) |
| R-O03 | Publication par un second lecteur → divergence → arbitrage | Règle en brouillon | WF-14, A-3 | Seuil bloquant CH abaissé par la route de l'administrateur (B-02 n'édite pas les valeurs) ; sa propre publication refusée en nommant la condition ; le veilleur corrige et ne peut pas publier ; l'administrateur publie depuis B-02 ; v1 archivée, journal « rédigée par » le veilleur ; divergence MAJEURE propagée par le worker sans pause ; le candidat migre depuis T-02. Deux défauts relevés et corrigés : « Publier » faisait du publieur le rédacteur (S.183) ; une règle à fin prévue n'était pas remplacée (C-7, S.184). Depuis S.184, joué sur la règle NL : v1 archivée avec sa fin prévue, une seule version publiée, T-02 annonce « avant le 31 décembre 2026 » | `tests/parcours/candidat.spec.ts`, Chromium 390/1440 (S.183, S.184) ; `smoke:publication` | Vérifié (banc, règle NL) |
| R-O04 | Remboursement → rapprochement → facture et avoir ; tranche à zéro (S.154) | Paiement réel | WF-15, RG-15.2, RG-15.4 | Non déroulé : aucun rail | — | Non vérifié |
| R-O05 | Suppression de compte demandée → reprise | Compte candidat | RG de suppression | Stockage du banc en panne de suppression : demande enregistrée, sessions fermées, écran sans fausse annonce ; même mot de passe refusé (401) ; relance B-03 « non achevée » ; stockage rétabli, relance achevée, compte anonymisé, dossiers purgés, deux relances au journal. Trois défauts relevés et corrigés en S.183 : purge impossible d'une lettre relue (C-8, migration), reconnexion d'un compte en suppression demandée, écran « pièces supprimées » sur une purge inachevée | `tests/parcours/candidat.spec.ts`, Chromium 390/1440 (S.183) ; `smoke:purge` | Vérifié (banc) |

## Interfaces

| N° | Scénario | Attendu | Observé | Statut |
|---|---|---|---|---|
| R-I01 | Mobile 390 px, parcours candidat | Pas de défilement horizontal ; navigation basse | Toutes les pages visitées par la recette des parcours mesurent la largeur de l'écran, sans erreur JavaScript, sur Chromium, Firefox et WebKit à 390 px (S.180) | Vérifié (porte CI) |
| R-I02 | Clavier, TalkBack selon le protocole du dépôt | — | Non déroulé | Non vérifié |
| R-I03 | États vide, chargement, erreur | — | Tableau de bord sans dossier, file B-05 vide, « Connexion perdue » avec fichier gardé, « Un opérateur regarde ta pièce », « Trop de demandes en peu de temps » avec saisie conservée, « Analyse en cours… » et « déjà en cours » (S.180) | Vérifié (porte CI) |
| R-I04 | Formulaires du back-office terminés | — | B-05 : motif obligatoire, décision, message refusé puis accepté par le vocabulaire, enregistrement ; B-07 mobile corrigé (S.180). Les autres formulaires ne sont pas rejoués. S.188 : B-04 rapprochement à la main et grand livre exporté ; B-08 brouillon qui promet enregistré, publication refusée (écran et route), négation publiée et retirée — `tests/parcours/candidat.spec.ts`, Chromium 390/1440. B-04 remboursements (M.C) et autres formulaires non rejoués S.191 : B-03 suspension et rétablissement (motif court refusé, sessions fermées, connexion refusée), B-06 habilitation puis retrait, veille (écart sans note refusé, écart noté consigné), textes juridiques (variable refusée à l'écran et par la route, validation fermée sans attestation). | Vérifié (banc, S.188–S.191) sauf B-04 remboursements (M.C) et publication d'un texte juridique (Q.A) |

## Exploitation

Toutes les lignes suivantes demandent la préproduction ou le VPS : elles
sont **non vérifiées**.

- nginx réellement servi, et certificats du stockage ;
- CORS du stockage réel (le CORS simulé du banc ne le prouve pas) ;
- URL présignée de 5 minutes, et aperçu B-05 sur le stockage réel ;
- retour FedaPay ;
- six services en bonne santé, worker et alertes observés ;
- répétition du runbook de déploiement ;
- un dépôt réel de bout en bout après le déploiement de S.155.

## Anomalies

**R-01 — C-08 ignore la décision de la revue humaine.**
`analyseDeLaPiece` (`src/server/lecture/dossiers.ts`) construit l'écran à
partir de la dernière analyse automatique. Une décision B-05 écrit l'état
et le retour sur la pièce, puis envoie l'alerte, mais l'écran de la pièce
continue d'afficher le verdict de la machine et son texte (« Un opérateur
regarde ta pièce »). Il propose aussi « Reprendre la photo » sur une pièce
validée par un opérateur. Reprendre remplacerait la version validée par
une nouvelle version, non lue.

- Gravité : majeure. L'écran contredit l'alerte et la checklist, et pousse
  le candidat à défaire une validation.
- Règle : RG-06.8 (la version courante commande l'état de la pièce, revue
  humaine comprise).
- Correctif proposé : la décision de la revue de la version courante
  prime sur le verdict de la machine (verdict, titre, message de
  l'opérateur).

**R-02 — « Connexion perdue » promet un envoi automatique qui n'a pas
lieu.** Au retour du réseau, l'écran revient à « prêt » sans renvoyer le
fichier ; la personne qui attend, comme on le lui a dit, attend en vain.

- Gravité : moyenne. Un nouvel appui envoie bien le fichier.
- Correctif proposé, au choix du responsable : relancer l'envoi au retour
  du réseau, ou dire « appuie de nouveau sur Ajouter la pièce ».

**R-03 — deux liens morts dans C-08.** « Signaler une erreur de lecture »
et « Voir l'historique des versions » mènent à des routes absentes, donc
à un 404.

- Gravité : moyenne.
- Correctif proposé, au choix du responsable : retirer les liens en V1,
  ou construire les deux écrans.

**Suite, 09/10/2026.** Les trois anomalies sont corrigées en S.157, aux choix du responsable : la décision prime (R-01), relance automatique (R-02), signalement et historique construits (R-03). Un test vérifie désormais qu'aucun lien interne ne mène à une route absente. Leur vérification en préproduction reste à faire.

## Instance pilote `immipro.app` — 09/10/2026 (S.159)

Il n'existe pas de préproduction distincte. Le responsable a choisi, le
09/10/2026, des **contrôles sans écriture** depuis la session de
développement, puis un protocole pour le reste
(`docs/recette/protocole-pilote.md`). Version servie : main `a2ea746`
(S.157), déploiement réussi à 19 h 14 UTC. Responsable des contrôles :
Claude Code.

| N° | Scénario | Attendu | Observé | Statut |
|---|---|---|---|---|
| R-P01 | Certificats des trois noms | Let's Encrypt, trois noms, échéance lointaine | Illisible d'ici : le proxy de sortie de la session présente son propre certificat | Non vérifié (protocole §2) |
| R-P02 | HTTP vers HTTPS, `www` vers le domaine nu | 301, chemin conservé | `http://`, `http://www.` et `https://www.` donnent 301 vers `https://immipro.app/…`, chemin conservé | Vérifié (pilote) |
| R-P03 | En-têtes de sécurité | HSTS, CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy | Tous présents ; CSP avec `'unsafe-inline'` (choix F1) ; `camera=()` ne gêne pas la photo, qui passe par `<input capture>` | Vérifié (pilote) |
| R-P04 | `/api/health` public | `{status, db}` seulement, `no-store` | `{"status":"pilote","db":"up"}`, `cache-control: no-store` | Vérifié (pilote) |
| R-P05 | Pages publiques et plan du site | 200 ; plan du site sans page absente | 12 adresses du plan du site en 200 (0,4 à 0,8 s) ; `robots.txt` ferme l'espace privé | Vérifié (pilote) |
| R-P06 | Pages juridiques avant Q.A | Introuvables, et aucun lien vers elles | Les quatre en 404 ; aucun lien dans l'accueil (M14) | Vérifié (pilote) |
| R-P07 | Espace privé sans session | Redirection vers la connexion ; API refusée | `/tableau-de-bord`, `/revue`, `/paiements` en 307 vers `/connexion?suite=…` ; `/api/admin/revue` en 401 | Vérifié (pilote) |
| R-P08 | CORS du stockage, prévol `OPTIONS` | 200 pour `https://immipro.app`, 403 ailleurs | 09/10 : **403 pour toutes les origines, `immipro.app` comprise**. 10/10, après la pose : 200 pour `https://immipro.app` en `GET` et `PUT` sur les deux seaux ; 403 pour `https://exemple.test`, `https://www.immipro.app` et `DELETE` | **Conforme le 10/10/2026** (R-E01 levée) ; dépôt réel encore à faire (R-P15) |
| R-P09 | Lecture anonyme d'un seau | Refusée | 403 | Vérifié (pilote) |
| R-P10 | Pages publiques à 390 px, console | Pas de défilement horizontal, aucune erreur | Neuf pages sans défaut ; **`/tarifs` déborde (436 px)** | **Conforme le 10/10/2026** : R-E02 corrigée en S.162 ; sur `immipro.app` après déploiement (ad50d39), `/tarifs`, `/`, `/simulateur` et `/destinations` font 390 px, sans erreur de console |
| R-P11 | Détail de `/api/health` | Bloquantes expliquées | Lecture laissée au responsable (choix du 09/10) | Non vérifié (protocole §1) |
| R-P12 | Six services, worker, alertes | `healthy`, limites, battement, sondes | — | Non vérifié (protocole §3) |
| R-P13 à R-P17 | Parcours candidat sur téléphone | Voir le protocole §4 | — | Non vérifié |
| R-P18, R-P19 | Parcours opérateur B-05, B-04 | Voir le protocole §5 | — | Non vérifié |
| R-P20 | Runbook de déploiement | Trois répétitions | — | Non vérifié (protocole §7) |

**R-E01 — aucune règle CORS sur les seaux du stockage (bloquante).**
- Constat : tous les prévols vers `stockage.immipro.app` répondent 403,
  quelles que soient l'origine et la méthode. Un nœud Garage v2.4.1 sans
  règle reproduit le message mot pour mot.
- Effet : le navigateur ne peut déposer aucune pièce. Le `PUT` présigné
  est refusé avant de partir, et l'écran affiche une coupure.
- Cause : le dépôt décrivait la règle en prose, sans commande.
  Garage ne la pose que par `PutBucketCors`, avec une clé propriétaire du
  seau, ce que la clé de l'application n'est pas.
- Correctif : opération sur le VPS, procédure éprouvée dans
  `docs/INSTALLATION-GITHUB.md` (S.159).
- Vérification : les deux `curl` de la procédure, puis un dépôt réel
  (protocole §0 et §4c).
- **Levée le 10/10/2026.** Le responsable a posé la règle sur les deux
  seaux et retiré le droit propriétaire. Variante : `aws-cli` sur le réseau
  `immipro_internal`, `--network host` étant refusé sur le VPS (procédure
  corrigée). Contrôle depuis la session de développement : 200 et
  `access-control-allow-origin: https://immipro.app` pour `GET` et `PUT` ;
  403 pour une autre origine, pour `www` et pour `DELETE`. Les refus portent
  `access-control-allow-origin: *`, posé par Garage sur ses réponses
  d'erreur : sans effet, un prévol refusé bloque la requête. Reste le dépôt
  réel d'une pièce (protocole §4c, R-P15).

**R-E02 — `/tarifs` déborde à 390 px (mineure).** Le badge de
justification du pack mis en avant (`Tarifs.tsx`, classe `flex-none`)
porte une phrase qui ne peut pas passer à la ligne : la page fait 436 px.
**Corrigée en S.162** : le badge peut rétrécir et replier son texte
(`max-w-full`). Mesuré au banc dans Chromium : `/tarifs` fait 390 px à
390 px, et le badge tient dans sa colonne de 260 px sur grand écran.
Relevé sur `immipro.app` le 10/10/2026 après le déploiement de ad50d39 :
`/tarifs` fait 390 px, le badge 314 px sur deux lignes (S.163).

## Signature

| | |
|---|---|
| Version recettée | |
| Lignes vérifiées | |
| Lignes « non vérifié » assumées | |
| Anomalies ouvertes | |
| Nom et fonction | |
| Date | |
| Décision | Recette signée / à reprendre |

## Observations mineures

- **O-1.** Les résultats du simulateur affichent « Pays-Bas » deux fois,
  une par dispositif, sans nommer le dispositif.
- **O-2.** En B-05, l'aide sous la décision dit « la lecture a rendu un
  résultat » même quand aucune lecture n'a eu lieu (fournisseur absent).
- **O-3.** L'état vide de B-05 dit « Les pièces en échec d'analyse
  d'hier ont toutes été traitées » juste après le traitement d'une pièce
  du jour.

## Complément local du 10/10/2026 — RC

O-1, O-2 et O-3 sont corrigées sur la branche RC ; leur relevé initial
ci-dessus est conservé. [La revue complémentaire](../revue/revue-complementaire-2026-10-10.md)
porte les scénarios supplémentaires : lecture remplacée avant signalement,
aperçu/erreur/décision arrivant après changement de pièce, revue gratuite,
revue payée et drapeau sans débit dans le grand livre.

P-03 est éprouvé dans Chromium sur le banc : 390 et 1 280 px, trois
procédures pour deux pays, libellés et liens distincts, sans défilement
horizontal ni erreur JavaScript. B-05 et C-08 ont leurs tests d'interface ;
le signalement et le quota sont éprouvés sur PostgreSQL jetable, fournisseurs
simulés. Ces résultats locaux ne modifient aucun statut de la recette
pilote ni son bloc de signature.

## Complément de revue du 11/10/2026 — REV11

Base `bbf1500` / S.168, après fusion S.167 ; PR #272 / Prisma 7 recensée,
non incluse dans cette base testée. Voir la
[revue complète](../revue/revue-complete-2026-10-11.md) et son
[chantier](../revue/chantier-complet-2026-10-11.md).

179 fichiers / 3 582 tests passent, 26 fumées PostgreSQL passent, build et
contrôles de types/copie/audit passent. Chromium : 45 navigations mobile
390 px et back-office bureau, trois connexions par formulaire/Entrée,
session API reconnue et deux refus HTTP 403 sur API admin. Aucun débordement
ni erreur JavaScript observé sur ces visites. Les quatre pages juridiques
du banc restent volontairement 404 avant validation des textes.

Dépôt PDF synthétique par le navigateur puis antivirus/worker : version
saine, `ILLISIBLE` sans provider et `creditConsumed=false`, file de revue
technique affichée. Une décision opérateur conforme, avec motif et message,
est enregistrée via UI et vérifiée en base. Ce parcours utilise S3/SMTP/AV
simulés ; il ne qualifie pas l'extraction par un modèle réel.

Diagnostics complémentaires : six attentes IA et une attente de concurrence
échouent, réparties en cinq groupes. Ils restent ouverts au chantier et
ne sont pas assimilés à des tests verts. Sandbox paiement sans clé : non
éprouvé. Nginx local : image indisponible et téléchargement refusé ; contrôle
à terminer sur la porte CI / environnement prévu. Pas de preuve locale
supplémentaire d'image, Firefox/WebKit, TalkBack, sauvegarde/restauration,
qualité fournisseur IA ni encaissement réel.

Cette entrée ajoute des preuves locales ciblées ; elle ne coche pas les
gestes non rejoués et ne modifie ni signature pilote ni Q.A/M.C.

**Après fusion S.169.** Base finale `ec32f65` / Prisma 7.10.0. Les contrôles
sont rejoués : 179 fichiers / 3 586 tests, 26 fumées, audit et build passent.
Nouveau banc et nouvelle base : 45 navigations et neuf contrôles de session,
connexion et droits conformes, sans erreur JS ni débordement. Diagnostics
toujours rouges. REV-BANC-01 (annonce de disponibilité malgré échec du
serveur sur port occupé) est ajouté au chantier L0. Aucun préalable de
lancement n'est levé par cette actualisation.

## Complément REV11-L1 / S.172 — preuves worker, confidentialité et interfaces

WF-06 / RG-06.3 et RG-06.7, WF-08 / RG-08.6, C-08 et B-05 : transports
HTTP locaux, job réel sur PostgreSQL et rendu React candidat/opérateur.
301/302/303/307/308 : même origine, autre origine, chaîne, HTTP distant et
Location absent ; zéro appel aux destinations de renvoi. OAuth et vrai SDK
Anthropic éprouvés. Réservation/rendu 5 → 5, revue technique, rejeu sans
second appel/rendu ; aucune conformité ou avis fabriqué.
Voir [le relevé et les limites](../revue/lot-l1-2026-10-11.md). Le navigateur
n'est pas rejoué dans L1 ; les deux assertions de rendu UI sont exécutées
sous jsdom. Fournisseur réel/région/DPA, mesure inconnue, avis mal formés et
concurrence de relecture restent à qualifier/corriger dans leurs lots.

## REV11-L2 — S.173, 11/10/2026

Base finale `16636d4`, après relevé Claude du pilote L1. D1 en analyses,
publication prudente sans mesure complète, historique conservé.

| Scénario | Résultat observé | Preuve | Statut |
|---|---|---|---|
| Usage absent/partiel/négatif/fractionnaire/hors INTEGER | Aucun verdict automatique ; compteur inconnu NULL, revue humaine et rendu unique | HTTP/SDK + `smoke:extraction` PostgreSQL, deux fournisseurs | Vérifié, simulations |
| Enveloppe vide annonçant 120/30 | Aucun verdict ; usage et coût connus conservés | DIA-03 et worker | Vérifié, simulations |
| Vrai 0/0 | Ligne CONNUE ; publication selon règles ; une analyse payée | Tests et worker | Vérifié, simulations |
| Rejeu et deux workers | Rejeu sans appel supplémentaire ; course avec un verdict/un rendu et mesure par appel effectivement parti | PostgreSQL | Vérifié, simulations |
| Texte/avis sans mesure | Aucun texte publié ; POST réel : pas de date ni remarque, solde 30 → 30 | `smoke:redaction`, `smoke:usages-ia` | Vérifié, simulations |
| Migration/historique | Trois anciennes lignes inchangées ; états non requalifiés et diagnostic sans écriture | `smoke:usages-ia` | Vérifié, base jetable |
| B-07/API/CSV | Alerte malgré tarif, coût incomplet indisponible, cellules inconnues vides | Next standalone, API et export ; React/jsdom et Chromium bureau/tablette | Vérifié, banc |
| B-07 mobile 390 px | Débordement horizontal ; reprise dans L7 | Chromium | Anomalie, non validé |
| Modèle/facture/DPA réels | Aucun service réel appelé | L5 | Non vérifié |

[Suivi et limites L2](../revue/lot-l2-2026-10-11.md),
[workflow du provider et rapprochement](../exploitation/mesure-ia.md).
Aucune signature de recette globale, fusion ou levée Q.A/M.C par L2.

## REV11-L3 — S.174, 11/10/2026

Base `3d985f8`, L2 #280 fusionné, arbitrage Claude #282 conservé.

| Scénario | Résultat observé | Preuve | Statut |
|---|---|---|---|
| Vraie liste vide | Avis daté sans remarque, une analyse ; rejeu séquentiel gratuit | Domaine, deux fournisseurs, POST Next et R-04 | Vérifié, simulations |
| Liste entièrement invalide ou mixte | Aucun avis daté ni remarque publiée ; texte intact | 58 POST authentifiés, PostgreSQL | Vérifié, simulations |
| Genre/texte/écarts invalides, plus de huit remarques | Avis entier refusé, aucune troncature | Domaine et HTTP/SDK Anthropic/compatible | Vérifié, simulations |
| Formulation interdite dans titre/corps/source/valeur | Avis refusé ; motif candidat existant | HTTP, PostgreSQL, UI | Vérifié, simulations |
| Consommation et réservation | 120/30 et coût conservés ; rendu unique sur refus, pas de double rendu horaire | Grand livre et AiUsage | Vérifié, base jetable |
| Adaptateur injecté annonçant RELUE avec contenu invalide | La vraie route refuse la publication | Traitement compilé, acteur/service injectés ; sans gardes HTTP | Vérifié, simulations |
| Message candidat et chargement | Pas d'avis favorable après refus, quota/texte intact, retour éditeur | React/jsdom, HTML Next et Chromium réel sur les deux fournisseurs, bureau/mobile 390 px | Vérifié, banc |
| Ancien avis douteux sans réponse source | Aucune date ni remarque historique réécrite | Snapshot avant/après | Vérifié, base jetable |
| Deux relectures concurrentes | Hors correction L3, DIA-07 reste L4 | Diagnostic de concurrence | Non corrigé |
| Qualité, modèle, OAuth, DPA et facture réels | Aucun fournisseur réel appelé | L5 | Non vérifié |

[Rapport L3](../revue/lot-l3-2026-10-11.md),
[contrat des avis et rôle du provider](../exploitation/avis-ia.md).
Aucune signature de recette globale ou levée Q.A/M.C.

## REV11-L4 — S.175, 11/10/2026

Base main `2066230`, L3 #283 fusionné, instructions et code Claude relus avant
modification ; L2 #280 et arbitrage #282 conservés. Proposition de correction,
recette locale synthétique ; aucun déploiement ou préalable de lancement attesté.

| Cas WF-08/R-04 | Attendu | Preuve exécutée | État |
|---|---|---|---|
| Deux demandes même version, quota 1/30 | Un appel, un débit ; second « en cours » | Traitement PostgreSQL, DIA-07 inchangé et vrais POST sur deux fournisseurs | Corrigé, banc |
| Deux onglets anciens | Attente, recharge durable, consultation sans POST supplémentaire | Chromium sur Anthropic/compatible, base un avis/un usage/un débit | Éprouvé localement |
| Réponse retardée | Aucun verrou SQL gardé pendant réseau, second POST termine en cours | Traitement et HTTP avec rendez-vous fournisseur | Éprouvé |
| Nouvelle version pendant appel | Ancien avis non publié, débit rendu, usage gardé | Traitement et POST réel | Éprouvé |
| v2 rapide, v1 lente | Avis v2 conservé, seul quota net v2 payé, deux usages | Traitement réel et PostgreSQL | Éprouvé |
| Arrêt avant appel / après retour et usage | Débit durable sans faux avis ; rendu à échéance, reprise explicite | Processus réellement arrêtés aux checkpoints injectés | Éprouvé, adaptateur synthétique |
| Expiration et deux reprises | Une nouvelle propriétaire ; ancien jeton sans effet | PostgreSQL, course reprise horaire/publication | Éprouvé |
| Fournisseur sans avis / exception | Rendu et libération uniques, aucun avis daté | Traitement et régressions L2/L3 | Éprouvé |
| Unicité / état-date / échéance / publication interrompue | Refus SQL et rollback atomique | Nouvelle fumée PostgreSQL | Éprouvé |
| Session/origine/propriété/pack refusés | Aucun appel ni réservation supplémentaire | Vrais POST Next authentifiés | Éprouvé |
| R-04 mobile | Attente et résultat consultables, sans débordement | Chromium 390/390, zéro erreur JS, deux fournisseurs | Éprouvé localement |

188 fichiers / 3 805 tests ; 30 suites PostgreSQL vertes. Nouvelle fumée :
64 assertions de traitement, 32 HTTP ; quatre contrôles supplémentaires quand
Chromium est activé. DIA-07 et la fumée sont dans la porte commune. Les 29
suites existantes et diagnostics IA conservent leurs attentes métier.
[Rapport](../revue/lot-l4-2026-10-11.md) · [Fournisseur, reprise et migration](../exploitation/relecture-concurrente.md).
Qualification fournisseur réelle L5, mobile B-07 L7 ; autres parcours, supports,
préalables Q.A/M.C et reports V2 restent à qualifier dans leurs lots.

## Photographies publiques — S.179, 15/10/2026

Les huit familles publiques approuvées sont couvertes par 16 nouveaux tests
unitaires/interface et une recette navigateur sur le banc PostgreSQL isolé.
Les 28 scénarios Chromium locaux passent ; la porte commune exige également
Firefox et WebKit, soit 84 scénarios sur les deux dimensions 390 et 1440 px.
Les variantes réellement chargées, dimensions, poids, absence de débordement,
sources/dates, réponse du simulateur et refus des contenus non publiés sont
contrôlés. Les mesures initiales de performance restent des diagnostics locaux.

[Rapport et limites](../revue/implementation-photos-2026-10-15.md) ·
[Catalogue, commandes et preuves CI](../photographies.md).
Cette recette ne clôt ni les préalables L5/Q.A/M.C ni les contrôles humains L6.

## Revue des tests — S.183, 22/10/2026

Aucune ligne ne change de statut. La [revue des tests](../revue/revue-tests-2026-10-22.md)
rapproche les lignes « non vérifié » (R-O03, R-O04, R-O05, R-C08
échéancier, R-K06 fuseau et péremption, R-I02, R-I04) des routes API qui
n'ont encore aucune preuve HTTP exécutée, et propose leur ordre de reprise.
Les quatorze écritures concernées ont reçu leur test de route le 22/10
(`tests/routes-ecritures.test.ts`) ; la preuve navigateur de ces lignes
reste à faire. **O-4**, corrigée le 22/10 : la suspension B-03 exige
dix caractères de motif, comme les autres actions de compte.
La signature reste à apposer.
