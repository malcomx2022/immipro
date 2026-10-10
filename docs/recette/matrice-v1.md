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

## Candidat

| N° | Scénario | Préconditions | Attendu | Observé | Preuve | Statut |
|---|---|---|---|---|---|---|
| R-C01 | Visiteur → simulateur → résultats → inscription → code → tableau de bord | Banc vierge, 390 px | Six questions, résultats sourcés, code reçu par courriel, compte vérifié, tableau de bord | Conforme. Aucune erreur dans la console. Observation O-1 | Code relevé dans `.recette/courriers/001.eml` ; compte vérifié en base | Vérifié (banc) |
| R-C02 | Ouverture d'un dossier, achat d'essai | Compte vérifié | Dossier ouvert, pack acheté, quota crédité | Non déroulé : aucun rail de paiement sur le banc | — | Non vérifié |
| R-C03 | Dépôt d'une pièce saine | Dossier de démonstration, autorisation « pièces » donnée | Accusé « bien arrivé », contrôle, promotion, lecture annoncée | Avant S.155 : la préparation répondait **503** (défaut bloquant, corrigé en S.155). Après : accusé, balayage SAINE, analyse sans débit (aucun fournisseur), revue humaine ouverte | Version 1 SAINE, analyse `creditConsumed = false` | Vérifié (banc) |
| R-C04 | Dépôt du fichier EICAR | Idem | Fichier écarté, non conservé, message qui dit quoi faire, aucune analyse débitée | « Fichier écarté au contrôle… Dépose une nouvelle version de la pièce. » Analyses restantes inchangées | Version INFECTEE, `objectKey` vide | Vérifié (banc) |
| R-C05 | Résultat d'une revue humaine sur l'écran de la pièce (C-08) | R-C03, puis décision B-05 « Conforme » | La pièce se lit conforme, avec le message de l'opérateur | L'alerte dit « Ta pièce a été acceptée après relecture », la checklist compte la pièce conforme, mais C-08 affiche encore « Illisible — Un opérateur regarde ta pièce » et propose « Reprendre la photo » | Capture `r-cas-3-avant` ; `Document.status = CONFORME`. Rejoué après S.157 : « Conforme », titre de l'avis, message de l'opérateur, « Revenir à la checklist », plus de « Reprendre la photo » | Corrigé en S.157 (banc) |
| R-C06 | Remplacement d'une pièce | Pièce déjà déposée | Nouvelle version courante ; l'ancienne reste à l'historique ; la pièce suit la version courante (RG-06.8) | Version 2 créée, version 1 gardée, l'état suit la version 2 | Deux versions en base | Vérifié (banc) |
| R-C07 | Historique des versions et signalement d'une erreur de lecture | Écran C-08 | Les deux liens mènent à leur écran | Les deux liens répondent **404** | Réponses 404 sur `…/versions` et `…/signalement`. Rejoué après S.157 : le signalement ouvre la revue (motif « Signalé par le candidat »), B-05 montre la valeur désignée ; l'historique liste les versions, sans défilement à 390 px | Corrigé en S.157 (banc) |
| R-C08 | Complétude, rédaction assistée, échéancier | Dossier avec pièces lues | Complétude recalculée, rédaction débitée puis soldée (S.153) | Non déroulé : la lecture et la rédaction demandent un fournisseur | — | Non vérifié |
| R-C09 | Déclaration du dépôt, issue, purge et portabilité | Dossier prêt | RG-10.8, RG-10.9 | Non déroulé | — | Non vérifié |

## Cas indispensables

| N° | Scénario | Préconditions | Attendu | Observé | Preuve | Statut |
|---|---|---|---|---|---|---|
| R-K01 | Perte réseau pendant l'envoi des octets | Fichier choisi ; envoi vers le stockage coupé | Bandeau « Connexion perdue » ; fichier gardé ; envoi possible au retour du réseau | Bandeau et fichier gardé : conforme. Le bandeau promet « sera envoyé dès le retour du réseau », mais rien ne part de lui-même : 8 s après le retour, aucune version. Un nouvel appui envoie bien | Aucune version avant l'appui, une après. Rejoué après S.157 : la version arrive sans appui (coupure du stockage, puis hors ligne au moment d'appuyer) ; une relance coupée elle aussi dit d'appuyer sur « Réessayer l'envoi » | Corrigé en S.157 (banc) |
| R-K02 | Double clic sur l'envoi | Fichier choisi | Une seule version | Une seule version (1 → 2) | Décompte en base | Vérifié (banc) |
| R-K03 | Session expirée | Cookies effacés | Page → connexion avec retour ; API → message actionnable | `/connexion?suite=…` ; 401 « Ta session a expiré. Il faut te reconnecter pour continuer. Ton dossier est conservé en l'état. » | Réponse de l'API relevée | Vérifié (banc) |
| R-K04 | Fournisseur de lecture indisponible | Aucune clé | Revue humaine, analyse non débitée, message honnête | « La lecture automatique n'est pas active sur cette installation. Un opérateur regarde ta pièce » ; aucun débit | `engineLog`, `creditConsumed = false` | Vérifié (banc) |
| R-K05 | Quota nul, reprise après « illisible » | Solde à zéro | Le dépôt reste ouvert ; la reprise après « illisible » est lue (FON-03) | Couvert par `smoke:balayage` (S.155), pas par le navigateur | Fumée | Non vérifié (navigateur) |
| R-K06 | Réponse perdue, ancien onglet, changement de fuseau, pièce périmée | — | DOC-11 | Non déroulés | — | Non vérifié |

## Opérateur

| N° | Scénario | Préconditions | Attendu | Observé | Preuve | Statut |
|---|---|---|---|---|---|---|
| R-O01 | Revue d'une pièce en échec (B-05) | Pièce en revue | Ouverture impossible sans motif ; aperçu présigné ; ouverture et décision au journal avec motif ; alerte au candidat | Bouton désactivé sans motif ; aperçu servi par l'URL présignée ; `piece.consultation` et `revue.decision` au journal avec le motif ; pièce CONFORME ; alerte avec le message tel quel. Observations O-2 et O-3 | Journal d'audit ; captures `r-b05-*` | Vérifié (banc) |
| R-O02 | Message de revue contenant une promesse | R-O01 | Enregistrement bloqué, consigne de reformulation | « « visa garanti » ne peut pas s'afficher chez le candidat — INV-2 — aucune promesse de résultat. Reformule sans ce terme. » ; bouton désactivé | Capture `r-b05-refus-vocabulaire` | Vérifié (banc) |
| R-O03 | Publication par un second lecteur → divergence → arbitrage | Règle en brouillon | WF-14, A-3 | Non déroulé | — | Non vérifié |
| R-O04 | Remboursement → rapprochement → facture et avoir ; tranche à zéro (S.154) | Paiement réel | WF-15, RG-15.2, RG-15.4 | Non déroulé : aucun rail | — | Non vérifié |
| R-O05 | Suppression de compte demandée → reprise | Compte candidat | RG de suppression | Non déroulé | — | Non vérifié |

## Interfaces

| N° | Scénario | Attendu | Observé | Statut |
|---|---|---|---|---|
| R-I01 | Mobile 390 px, parcours candidat | Pas de défilement horizontal ; navigation basse | Tableau de bord, checklist et pièces sans défilement horizontal | Vérifié (banc) |
| R-I02 | Clavier, TalkBack selon le protocole du dépôt | — | Non déroulé | Non vérifié |
| R-I03 | États vide, chargement, erreur | — | État vide de B-05 vu (observation O-3) ; les autres non déroulés | Non vérifié |
| R-I04 | Formulaires du back-office terminés | — | Non déroulé | Non vérifié |

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
