# Instructions projet — ImmiPro

À lire avant toute contribution, humaine ou assistée.

## Invariants — non négociables

| # | Règle |
|---|---|
| INV-1 | La plateforme informe et prépare. Elle ne conseille pas juridiquement et ne se prononce jamais sur les chances d'obtention d'un visa. |
| INV-2 | Aucune promesse de résultat, nulle part : interface, emails, documents générés, contenu marketing. |
| INV-3 | Un dossier fige la version de règle utilisée (`Application.visaRuleId`). Une évolution réglementaire ne casse jamais une checklist en cours. |
| INV-4 | Une règle de source `SECONDAIRE` n'est jamais visible par l'utilisateur. Le filtrage se fait dans la requête, pas dans l'affichage. |
| INV-5 | Les pièces d'identité sont purgées automatiquement selon la politique de rétention. |
| INV-6 | Tout appel IA est débité d'un quota d'analyses rattaché au pack ; les jetons consommés sont mesurés et surveillés. Jamais de dépassement silencieux. |
| INV-7 | Tout paiement est idempotent et réconcilié par webhook signé. |
| INV-8 | Toute information réglementaire affichée porte sa source et sa date de vérification. |

## Vocabulaire interdit dans le code et l'interface

La liste vit dans `src/domain/copy/vocabulaire-interdit.ts`. Elle est lue par
`npm run check:copy`, par le test de l'interface candidat, et par la
validation à l'enregistrement du back-office — B-02 pour les textes d'une
règle, B-05 pour le message envoyé après une revue manuelle, B-08 pour un
guide pays ou un article. Une seule liste, quatre points d'application : un
administrateur qui saisit une promesse dans un guide pays bute sur la même
règle qu'un développeur, et sa publication est bloquée tant que la
formulation est refusée.

L'enregistrement d'un brouillon n'est pas bloqué, la publication l'est. Un
texte en cours d'écriture doit pouvoir être sauvé ; le refuser pousserait à
rédiger ailleurs et à coller à la fin, c'est-à-dire à écrire hors du
garde-fou.

Deux portées :

- **Partout** — les promesses de résultat : « chances d'obtention », « taux
  d'acceptation », « visa garanti », « visa assuré », « réussite garantie »,
  « sans risque de refus », « on s'occupe de tout », « nous déposons votre
  dossier », « nous vous conseillons juridiquement », « notre avocat ».
- **Interface candidat seule** — le vocabulaire de la note de dossier :
  « score », « chances », un pourcentage, « sur 100 ». Ils restent légitimes
  dans `domain/completeness/`, où le barème interne vit sans jamais s'afficher.

Deux issues, et deux seulement :

1. **La négation est reconnue.** « ImmiPro ne garantit pas l'obtention du
   visa » passe : une négation ne peut pas devenir une promesse. La portée
   s'arrête à la proposition — « Pas de doute, visa garanti » reste refusé.
2. **`copy-exceptions.json`** pour le reste : chaîne exacte, chemin, motif,
   date. L'échappatoire apparaît dans la diff et se justifie. Au-delà de cinq
   entrées, ce n'est plus une exception, c'est une dérive du vocabulaire.

Le score affiché s'appelle **complétude du dossier**. Jamais autre chose.

## Messages d'erreur

Un message d'échec est toujours actionnable.

- Non : « Document non conforme. »
- Oui : « Votre passeport expire 4 mois après la date de retour prévue, il en faut 6. »

## Règles d'architecture

1. `src/domain/` ne connaît ni Prisma, ni Next, ni le réseau. Logique pure, testée sans infrastructure.
2. Tout ce qui est vérifiable sans IA l'est sans IA. L'IA n'intervient que sur l'extraction et la cohérence narrative.
3. Aucune valeur de couleur, d'espacement ou de rayon en dur : uniquement les tokens Tailwind.
4. Aucun accès direct à MinIO depuis le client. URLs présignées de 5 minutes, générées à la demande.
5. Les webhooks sont exclus du rate limiting mais leur signature est vérifiée systématiquement.
6. Aucun secret dans le dépôt. `.env.example` liste les clés, jamais les valeurs.

## Avant d'ouvrir une pull request

- [ ] `npm run lint && npm run typecheck && npm run test && npm run check:copy`
- [ ] La règle de gestion de DOC-11 implémentée est citée dans la description
- [ ] Les états vide, chargement et erreur sont traités
- [ ] Aucune chaîne de caractères en anglais dans l'interface

## Suivi du chantier fonctionnel — 09/10/2026

### S.209 — D-35, exception d'audit `decode-uri-component` — 31/10/2026

Lot dédié demandé par le responsable. Base `46c8b76` (#333 fusionnée).
L'avis GHSA-qr28-fpjm-wq7f (élevée), porté par `minio` 8.0.7 ›
`query-string` 7.1.3, faisait échouer `check:audit` sur toute branche.
Mise à jour impossible : la 0.5.1 est ESM seule, `query-string` 7 la
charge par `require()`. `minio` n'appelle que `stringify` : le décodage
vulnérable n'est pas atteint. Exception motivée et datée ; à retirer à
la prochaine version de `minio`. Ne pas forcer la 0.5.1 par `overrides`.
Lire le registre, entrée S.209.

### S.207 — D-26 révisé : sauvegardes sur Cloudflare R2 — 29/10/2026

Demandé par le responsable après le relevé du 29/10 : aucune sauvegarde
ne quittait le VPS. Un `restic` local écrivait dans le Garage du même
disque, et les scripts du dépôt ne tournaient pas. Un seau R2 en
juridiction UE remplace B2. Clé GPG hors ligne, Healthchecks.io et
conservation de trente jours inchangés. `r2:immipro-backups` devient la
destination par défaut. `sauvegarde.sh` refuse toute destination restée
sur le VPS : ne pas retirer ce refus. Rien n'est éprouvé contre R2.
Avant la première nuit, Cloudflare doit être nommé dans `sous_traitants`
et la page validée nommément en B-08, car la variable seule republie sous
l'ancienne relecture. Lire [la revue, § 27](docs/revue/revue-tests-2026-10-22.md).

### S.206 — Q.A levé, les quatre pages publiées — 29/10/2026

Lot documentaire demandé par le responsable. Base `7ad8ce2` (#331
fusionnée). Relecture de la version 2 des données personnelles (Stripe
ajouté aux sous-traitants, republiée le 29/10 à 18:20) confirmée par le
juriste le 29/10 ; le relecteur est nommé en base. Relu sur
`immipro.app` : mentions légales v3, conditions v1, données personnelles
v2, contact v1, toutes en 200. Backblaze hors service en production
(déclaration du responsable) : D-27 sans objet. Activer B2 demande une
nouvelle version relue. Q.A quitte `PREALABLES` et passe « tranché » ; ne
pas l'y remettre pour une page servie. La validation se lit en base. M.C
reste ouvert. Sauvegardes réelles : `restic` vers un Garage local, même
VPS, aucune externalisation (L7, D-26 non appliqué) ; contenu, rétention
et restauration à relever. Production IA sur Vertex, région
`europe-west1` déclarée : à rapprocher du relevé du 16/10. Lire
[la revue, § 26](docs/revue/revue-tests-2026-10-22.md).

### S.205 — L5 : relevé console de L09, facture attendue — 29/10/2026

Lot documentaire demandé par le responsable. Base `5bb55ec` (#330
fusionnée). Minute du 29/10 à 14:01 UTC : une seule 200, entrée 941,
sortie 23, pour 990 / 32 mesurés : pas de réflexion cachée sur L09, et
la mesure du banc reste prudente. La métrique par minute compte environ
5 % d'entrée de moins que `prompt_tokens` les deux jours : elle attribue
les requêtes, la facturation par SKU fait foi pour les jetons. L09 (3 s)
ne départage rien pour les appels lents ; suspect du 28/10 : L07 (52 s,
29 jetons). Reprise suspendue ; décision du responsable : attendre la
facture du 29/10 (L09 seule), sans appel. Lire
[le suivi L5](docs/revue/lot-l5-vertex-2026-10-28.md).

### S.204 — L5 : diagnostic de l'usage, aucun compteur de réflexion — 29/10/2026

Décision du responsable : lot avec une invocation de diagnostic. Le banc
écrit les seuls compteurs numériques du bloc `usage` (`usageBrut`,
`usageNumerique`) ; la production n'inscrit aucun observateur. L09 le
29/10 à 14:01 UTC : 990 / 32, `total_tokens` 1 022, aucun champ de
réflexion. Réserve 835,95 XOF pour 19 invocations, journal `93175249…`.
Lire `reasoning_tokens` n'aurait rien à lire : relever la sortie de cette
minute dans la console pour départager réflexion cachée et écart venu
d'ailleurs. Reprise toujours suspendue. Lire
[le suivi L5](docs/revue/lot-l5-vertex-2026-10-28.md).

### S.203 — L5 : L14 rapprochée, sortie sous-mesurée — 29/10/2026

Demandé par le responsable. Base `5ad75a7`. Relevé console du 29/10 :
sept 200 pour L07 à L13, une seule 499 à 18:16 pour L14 ; inscrite
`NON_FACTUREE` par `banc:ia:rapprocher`, blocage levé, réserve 791,95 XOF
pour 18 invocations, journal `ff04b4ad…`. Facture du 28/10 : sortie 3 201
pour 1 631 mesurés (× 2,18 sur L07 à L13) ; l'adaptateur ne lit que
`completion_tokens`, la réflexion `low` facturée n'est pas comptée.
**Ne pas reprendre la campagne** avant que l'adaptateur lise la sortie
complète (lot de code à décider). Entrée facturée +3 952, presque l'entrée
des trois requêtes annulées : coïncidence non prouvée, attribution à
obtenir. Montant 0,03 $. Lire
[le suivi L5](docs/revue/lot-l5-vertex-2026-10-28.md).

### S.202 — relevé serveur L7 du 28/10, consigné — 29/10/2026

Lot documentaire demandé par le responsable. Base `471837b` (#323
fusionnée, déployée). Relevé de l'exploitant sur le VPS, en lecture seule :
certificats des trois noms jusqu'au 06/01/2027, six services sains,
sondes messagerie et antivirus, disque 62 %, nginx et base OK. R-P01 et
R-P12 passent « partiel » (`certbot renew --dry-run`, `nginx -T`, limites,
battement, réconciliation non relevés), R-P11 reste « non vérifié ». La
version 46 de `taches` vient de pg-boss (12.38.0, 22/10), pas d'une
migration des lots. Swap à 1,6 Go à surveiller. Sauvegarde et
restauration sur clone : accord du responsable avant tout lancement.
Lire [la revue, § 25](docs/revue/revue-tests-2026-10-22.md).

### S.201 — L5, passages Vertex du 28/10 — 28/10/2026

Demandé par le responsable. Base `de63b49` (#322 fusionnée). Premier
passage `--pieces L01,R03` : quatre appels `CONNUE` ; entrée 1 668 / 10 240,
sortie 656 / 5 120. Restant lancé ensuite : L02 à L05 justes, PDF compris ;
L06 (PDF) dépasse le délai de 120 s, mesure `INCONNUE`, campagne arrêtée
en `MESURE_A_RAPPROCHER`. Réserve 395,97 XOF pour 9 invocations, restant
4 604,03. Reprise interdite avant le rapprochement de L06 dans la console
`projetanatt` : ne pas retirer le blocage à la main, ne pas ouvrir de
second journal. Seule copie du journal :
`docs/revue/preuves-l5-vertex-2026-10-16/journal/budget.json`, à remettre
en place avant toute reprise. À vérifier aussi : la sortie facturée
compte-t-elle le raisonnement `low` ? Le délai client d'un PDF passe à
180 s (`delaiDeLecture`), l'image garde 120 s, dans les deux adaptateurs
et donc en production ; ne pas dépasser la marge de 300 s du jeton
Google. Ce délai ne lève pas le blocage. L06 rapproché « non
facturée » par `npm run banc:ia:rapprocher` (journal tracé, réserve
gardée ; ne jamais éditer le blocage à la main). Le troisième passage
s'arrête de nouveau sur L06 à 180 s : comportement propre à la pièce, pas
un délai à allonger. Réserve 439,97 XOF pour 10 invocations. Second
rapprochement consigné (499, non facturée). Quatrième passage sans L06 :
L07 à L13 justes, puis L14 (JPEG) dépasse 120 s. Examen local sans
appel : demandes identiques à L05/L13, L08 (sous le seuil) passe, format
et rendu sains ; seule piste propre à L06/L14, des attestations de fonds
d'un tiers. Durées (L07 : 52 s pour 29 jetons) : vérifier en facturation
que la réflexion `low` est comptée, avant toute reprise. Réserve 791,95 XOF
pour 18 invocations. Rapprochement de L14 et suite au responsable. L5, Q.A et M.C restent ouverts.
Lire [le suivi](docs/revue/lot-l5-vertex-2026-10-28.md).

### S.200 — C-13, la fin prévue sans relais annoncée en B-01 — 28/10/2026

Lot dédié demandé par le responsable après le point du 28/10. Base
`feb4334` (#320 fusionnée). La file de veille ne suit que la relecture :
rien n'annonçait qu'une version en vigueur (`estEnVigueur`) arrive à sa
fin prévue (`effectiveTo`) sans successeur, alors que le filtre candidat
la retire le lendemain (graine NL au 31/12/2026). `finsSansRelais`
(domaine) les relève à quatre-vingt-dix jours ; B-01 les annonce en
tête, avec l'écart en jours, l'effet chez le candidat, le brouillon
suivant s'il attend, et le lien vers la fiche. Rien n'est publié ni
prolongé : le contenu 2027 reste au responsable, depuis la source
officielle. Ne pas prolonger `effectiveTo` pour faire taire l'alerte.
Lire [la revue, § 24](docs/revue/revue-tests-2026-10-22.md).

### S.199 — le restant relu après les lots du 26/10 — 28/10/2026

Lot documentaire demandé par le responsable. Base `feb4334` (#320
fusionnée). La revue du 22/10 est remise à jour : WF-02 n'a plus la
portabilité en reste (déroulée en S.188), C-3 ne garde que R-O04 (M.C)
et R-I02 (humain), § 6 relu au 28/10 avec C-13 et les lignes R-P de la
matrice. Plus aucun code applicatif sans préalable, hors l'alerte C-13.
Aucun code, schéma ni service touché. Lire
[la revue, § 23](docs/revue/revue-tests-2026-10-22.md).

### S.198 — B-04 au jour civil du paiement — 27/10/2026

Lot dédié demandé par le responsable. Base `72963b4` (#316 fusionnée).
B-04 attendait le paiement de l'achat scripté dans le livre de la journée
affichée ; une exécution franchissant minuit à Cotonou (porte de #317,
27/10) le trouvait vide, à raison. Le test lit le jour civil du paiement :
même jour, présent ; sinon absent du livre du jour et présent dans celui
de son jour, demandé à la route du bouton. Ne pas supposer que l'achat
et l'export tombent le même jour. Rouge reproduit en reculant le
paiement d'un jour. Lire [la revue, § 22](docs/revue/revue-tests-2026-10-22.md).

### S.197 — `connecter()` sans navigation de document de trop — 26/10/2026

Quatrième des quatre lots du 26/10, sur sa branche ; préventif, à la
demande du responsable. Base `73e1e30` (#315 fusionnée). `connecter()` et
`operateur()` passent par `ouvrirLaConnexion` : pas de rechargement quand
l'écran est déjà `/connexion` (reconnexion B-03 après un refus, le geste
de R-O05), sinon `aller` et formulaire hydraté avant la saisie ;
`connecter()` attend la suite de l'adresse quand elle en porte une. Ne
pas réintroduire de `goto("/connexion")` dans les parcours. Un refus de
connexion s'attend au réseau (401), jamais sur « une alerte » : l'annonceur
de route de Next en est une. Lire
[la revue, § 21](docs/revue/revue-tests-2026-10-22.md).

### S.196 — création d'un consultant à l'écran (B-09) — 26/10/2026

Troisième des quatre lots du 26/10, sur sa branche ; le responsable a
retenu l'écran. Base `73e1e30` (#315 fusionnée). `POST
/api/admin/consultants` n'avait aucun appelant : B-09 porte désormais
« Ajouter un consultant », un `<form>` dont les refus sont ceux de la
route, dits avant l'envoi. Les bornes vivent dans le domaine
(`BORNES_CONSULTANT`) et la route les lit : ne pas les réécrire en dur.
La fiche créée n'a aucune habilitation et l'écran le dit (RG-12.1).
Lire [la revue, § 20](docs/revue/revue-tests-2026-10-22.md).

### S.195 — relecture de la complétude en navigateur (WF-07) — 26/10/2026

Deuxième des quatre lots du 26/10, sur sa branche. Base `73e1e30`
(#315 fusionnée). Parcours de l'avis L.A : demande depuis C-09 (moins de
vingt caractères refusée), une seule en attente (écran et route), réponse
B-05 promettante refusée par la route, réponse relue en alerte, au
journal comme motif et sur C-09. Deux mutations de `repondreALaRelecture`
détectées. Aucun défaut relevé. WF-07 passe « éprouvé ». Lire
[la revue, § 19](docs/revue/revue-tests-2026-10-22.md).

### S.194 — comparateur en navigateur (WF-03) — 26/10/2026

Premier des quatre lots demandés par le responsable le 26/10, une branche
par lot. Base `73e1e30` (#315 fusionnée, déployée). Parcours C-03 depuis
l'état vide du tableau de bord : colonnes comparées aux règles relues en
base sous les conditions de la requête candidate (INV-4, RG-14.1, en
vigueur), cinq critères recalculés depuis le JSON des règles, encadré
RG-03.3, mention INV-8/INV-1, fiche et ouverture sans rien créer. Deux
mutations de `comparaison` détectées. Aucun défaut relevé. WF-03 passe
« éprouvé ». Lire [la revue, § 18](docs/revue/revue-tests-2026-10-22.md).

### S.193 — R-O05 fiabilisé sous Firefox — 25/10/2026

Lot dédié demandé par le responsable. Base `5221dcc` (#314 fusionnée,
déployée). Le 24/10, R-O05 a échoué une fois en firefox-390 sur #314 :
après la confirmation de suppression, `goto("/connexion")` aboutissait
puis Firefox doublait la navigation de document (304) sans jamais
l'achever, et la saisie l'attendait trente secondes (trace). Le
parcours suit désormais les liens du candidat, « Revenir à l'accueil »
puis « Connexion » de l'en-tête, comme WF-03 en S.188 ; ses attentes
sont inchangées. Ne pas revenir à un `goto` à cet endroit. Correction
fondée sur la trace, défaut non reproductible à la demande. Lire
[la revue, § 17](docs/revue/revue-tests-2026-10-22.md).

### S.192 — navigateurs de la porte, reprise sur le miroir officiel — 24/10/2026

Lot dédié demandé par le responsable. Base `6ee07be` (#311 fusionnée).
Le 23/10, `azure.archive.ubuntu.com` à 30 Ko/s a épuisé deux fois les
quinze minutes de « Navigateurs de recette photographique » sur #312
(157 paquets reçus, aucun test lancé) ; `main` passait une heure avant.
Relever seul le plafond ne suffit pas : le 22/10, le miroir est resté
figé plus de trente minutes. Première tentative bornée à six minutes,
puis miroir réécrit vers `archive.ubuntu.com`, `dpkg` remis d'aplomb,
seconde tentative de douze minutes ; plafond de l'étape à 20 minutes,
la borne que `tests/workflows.test.ts` tenait déjà. Ce test vérifie
aussi les deux tentatives bornées sous le plafond, la réécriture du
miroir et la réparation de `dpkg` avant la reprise. Aucun navigateur
changé. Ne pas retirer le plafond : sans lui, GitHub attend six heures.

### S.191 — formulaires du back-office en navigateur — 23/10/2026

Lot dédié demandé par le responsable. Base `8a4eaba` (#312 fusionnée). Quatre
parcours au bureau, lus en base : B-03 suspension et rétablissement
(motif court refusé, sessions fermées, reconnexion), B-06 habilitation
puis retrait, veille (écart noté, jamais « à jour » : il viderait la
file des profils suivants), variables juridiques refusées sans rien
écrire. Rejouables sur les six profils d'un banc ; aucun texte juridique
publié (Q.A). Aucun défaut relevé. Lire
[la revue, § 16](docs/revue/revue-tests-2026-10-22.md).

### S.190 — O-5, une suite déjà donnée ne rouvre rien — 23/10/2026

Lot dédié demandé par le responsable. Base `6ee07be` (#311 fusionnée).
« Continuer seul » clôt la proposition pour ce dossier : la lecture ne
repropose plus `SANS_SUITE` ni `DECLINEE`, une redirigée reste listée.
T-06 n'ouvre le site que sur `etat: REDIRIGEE`, à l'adresse rendue par la
route ; sinon `SUITE_DEJA_DONNEE`, sans ouvrir. Ne jamais ouvrir le
partenaire sur une réponse acceptée sans redirection enregistrée. Trois
tests d'écran et `smoke:partenaires` rouges avant. Lire
[la revue, § 15](docs/revue/revue-tests-2026-10-22.md).

### S.189 — WF-13, une seule suite par proposition — 23/10/2026

Demandé par le responsable après le point du restant. Base `ce8de25`
(#310 fusionnée, déployée). `enregistrerLaSuite` lisait `PROPOSEE` puis
écrivait sans condition : deux suites simultanées se contredisaient
(18 réponses sur 10 courses, base jetable). Écriture conditionnelle,
suite devancée qui rend l'état retenu, dossier de l'adresse vérifié dans
la requête, aboutissement unique. Ne pas revenir à une lecture suivie
d'une écriture inconditionnelle. `smoke:partenaires` dans la porte.
O-5, relevé ici, corrigé en S.190. Lire [la revue, § 14](docs/revue/revue-tests-2026-10-22.md).

### S.188 — parcours navigateur manquants — 23/10/2026

Lot dédié demandé par le responsable. Base `ddd22cf` (#308 fusionnée).
Huit parcours, effets lus en base : profils WF-03, échéancier (R-C08),
fuseau et péremption (R-K06), purge effective et portabilité (R-C09),
B-04 et B-08 (R-I04). Préconditions bornées au candidat synthétique ;
`purgerALaMain` lance la commande d'exploitation sur le banc. Trois
défauts corrigés, rouges avant : C-15, l'échéancier sans date porte le
champ qui la fixe ; C-16, une pièce obligatoire échue retire « prêt » et
refuse le dépôt avant la passe de nuit ; C-17, l'écran de la pièce dit la
péremption plutôt que « conforme ». Ne pas réintroduire de lecture du
`PRET` stocké sans la péremption du jour. Restent R-O04 (M.C), R-I02,
rappel réellement reçu, autres formulaires. Lire
[la revue, § 13](docs/revue/revue-tests-2026-10-22.md).

### O-1 — la procédure ouverte est nommée — 23/10/2026, S.187

Lot dédié demandé par le responsable. Base `d0ed9a1` (#307 fusionnée).
S.167 nommait déjà la procédure aux résultats ; le doublon du 22/10
venait des fixtures P-03. Restait C-05 : « Ouvre ton dossier Pays-Bas »
pour études comme pour emploi, au moment où le dossier fige sa règle.
L'intitulé s'affiche sous le titre et nomme le formulaire. Un pays peut
publier plusieurs procédures : ne jamais afficher le pays seul là où l'on
choisit. Test d'écran rouge avant ; R-O03 vérifie « kennismigrant ». Lire
[la revue, § 12](docs/revue/revue-tests-2026-10-22.md).

### C-12 — B-02 montre et modifie les seuils — 23/10/2026, S.186

Lot dédié demandé par le responsable, affichage et modification. Base
`3d05ccf` (#306 fusionnée). B-02 ne montrait aucune condition : « 0 champ
modifié » sur un seuil bloquant changé, et WF-14 §4 relisait à l'aveugle.
Section « Conditions » : seuils chiffrés en saisie (lecture française),
références `exists` en lecture seule. La branche `textes` du `PUT` porte
les seuils modifiés, recollés sur la ligne en base, jamais la copie du
client ; INV-3, C-10 et vocabulaire inchangés. Preuves : 22 tests du
domaine, cinq d'écran, onze vérifications `smoke:publication` rouges
avant ; R-O03 saisit le seuil dans B-02. Lire
[la revue, § 11](docs/revue/revue-tests-2026-10-22.md).

### C-14 — la confirmation d'arbitrage reste — 23/10/2026, S.185

Lot dédié demandé par le responsable. Base `f8f0419` (#305 fusionnée,
plafond de 15 minutes sur l'installation des navigateurs).
T-02 lance `router.refresh()` après l'arbitrage ; la page ne passe plus la
divergence tranchée, et la feuille rendue sur la prop disparaissait avec
la confirmation que le candidat doit fermer. Une divergence suivante
héritait de l'état « arbitré ». `Alertes` fige la divergence à
l'ouverture, la feuille est clée par migration. Ne pas revenir à une
feuille rendue sur la prop. Deux tests d'écran (`tests/ui/p1.test.tsx`),
rouges avant ; relevé par R-O03 en webkit-1440. Lire
[la revue, § 10](docs/revue/revue-tests-2026-10-22.md).

### C-7 — une fin prévue n'est pas un remplacement — 22/10/2026, S.184

Lot dédié demandé par le responsable. Base `78cdbeb` (#302 fusionnée).
« En vigueur » = mis en vigueur un jour et non `ARCHIVED` : c'est la
définition d'`estEnVigueur` (domaine, B-02). `publierLaRegle`,
`consignerLeReleve` et la graine lisaient « `effectiveTo` nul ». Or
`effectiveTo` porte aussi la fin prévue par l'autorité : graine NL au
31/12/2026, et T-02 l'affiche. La version 2027 n'aurait rien archivé ni
prévenu personne. Les trois sites sont alignés, et l'archivage garde la
fin prévue. Ne pas réintroduire `effectiveTo: null` comme preuve de
non-remplacement ; le filtre candidat la lit toujours comme fin prévue.
Preuves : 15 vérifications dans `smoke:publication`, test du relevé,
parcours R-O03 ramené sur la règle NL (36/36 Chromium). Sans migration ni
donnée réécrite. C-13 : versions NL 2027 à publier avant le 31/12/2026,
sinon plus aucune destination néerlandaise n'est affichée et les parcours
« pays-bas » échouent. Lire [la revue, § 9](docs/revue/revue-tests-2026-10-22.md).

### Revue des tests et état des modules — 22/10/2026, S.183

Demande du responsable : revue des tests unitaires, d'intégration et
fonctionnels, point du restant, modules et statuts. Base `a857390` (#297) ;
#298–#300 (Dependabot) ouvertes, non reprises. Lire
[la revue et la table des modules](docs/revue/revue-tests-2026-10-22.md).
Trois niveaux, à ne pas confondre : **unitaire** (Vitest, 199 fichiers,
3 940 tests, domaine pur, routes à Prisma simulé, écrans), **intégration**
(30 fumées de la porte sur PostgreSQL jetable, deux diagnostics IA),
**fonctionnel** (Playwright, 16 parcours et 14 scénarios photographiques
× six profils, IA et checkout scriptés). Aucun ne qualifie un fournisseur.
Rejoué le 22/10 : porte unitaire, audit, build, 30 fumées et diagnostics
verts ; parcours (32) et photographies (28) verts sur Chromium 390/1440,
Firefox/WebKit laissés à la CI ; bac à sable non éprouvé faute de clé.
Lint désormais sans avertissement.
Statuts : WF-01/02/04 éprouvés ; WF-05 bloqué par M.C ; WF-06/08 bloqués
par L5 ; WF-03/07/09/10/11/13/14/15/16 partiels ; WF-12 en phase 3.
Constat C-1 traité le même jour : `tests/routes-ecritures.test.ts`
(66 tests) couvre les quatorze écritures sans test de route — rôle, limite
sensible, corps refusé avant effet, motif journalisé avant l'écriture,
propriété, rejeu ; huit mutations détectées. C-6 : le banc relevait
parfois un faux code de vérification (en-têtes recollés jusqu'au
`Message-ID`) ; `codeDuCourrier` ne lit plus que le corps. Suite :
201 fichiers, 4 009 tests. Ne pas affaiblir ces attentes pour accepter un défaut. O-4
tranchée par le responsable : la suspension B-03 exige désormais
`MOTIF_MINIMUM_COMPTE` (dix caractères), comme l'écran et les autres
actions de compte.
R-O03 et R-O05 joués en navigateur le même jour (18 parcours par
profil) ; six défauts relevés. Corrigés : C-8, purge d'une lettre relue
refusée par la base (migration `20261022180000_relecture_purgee`, choix
du responsable) ; C-9, reconnexion d'un compte en suppression demandée ;
C-10, « Publier » de B-02 faisait du publieur le rédacteur (WF-14 §4
impossible depuis l'écran) ; C-11, écran « pièces supprimées » sur une
purge inachevée. C-7 (règle à fin prévue non remplacée) corrigé en S.184 ;
C-12 (B-02 sans valeurs de conditions) corrigé en S.186. Le faux stockage du banc `--parcours` sait refuser les
suppressions (`POST /stockage`).
Gestes absents : échéancier, fuseau, péremption, lecteur d'écran.
Sécurité : `next` 16.4.2 reporté de #300 (GHSA-2464-fhr4-w9xw critique,
GHSA-p3m5-59mp-jv5r élevée, publiés le 22/10) ; le VPS reste exposé
jusqu'au redéploiement de `main`. Seules retouches : fixtures P-03 (`slug`) et une directive ESLint
inutile. Aucun préalable levé, aucune fusion ni déploiement par ce lot.

### Complément S.182 — saisie conservée et recette renforcée, 15–16/10/2026

Lot parallèle du responsable, ouvert le 15/10 sur `29e9f20` sous le numéro
S.181 ; renuméroté S.182 à la fusion du 16/10 sur `ee43301`, S.181 étant
pris par le lot Vertex ci-dessous. Le complément Claude `2c5a3c0` et le
relevé documentaire #294 sont relus et conservés.
Le responsable autorise les corrections supplémentaires : une réponse lente
d'enregistrement, génération ou restauration ne remplace plus une saisie
faite depuis le geste. Une restauration explicite reste appliquée si rien
n'a été saisi depuis ; un changement de version sans geste garde le brouillon
non enregistré. Ne pas revenir au remplacement inconditionnel de S.180.
La recette retarde une vraie réponse de sauvegarde, vérifie le texte gardé
puis sa persistance et son export ; elle attend le nouveau rang avant la
relecture à deux onglets. B-04 empile ses métriques et laisse le tableau
défiler dans sa région au clavier. B-07/B-04 sont mesurés dans les six profils.
Le filtre WebKit ne retire qu'un préchargement Next (`_rsc`) de l'origine
même de l'application, interrompu par une navigation principale dans les
deux secondes : le réseau voit ces préchargements terminés en 200 ou sans
trace, jamais tous annulés (porte du 15/10, rejeu local du 16/10) ; les
requêtes observées sont jointes aux preuves. Une erreur vers une autre origine (CORS), sans `_rsc`, hors
navigation ou d'un autre moteur reste bloquante. Lire [preuves et limites S.182](docs/revue/finition-s182-2026-10-15.md).
Le tarif officiel Vertex est référencé ; ni campagne, ni clé, ni région
autorisée, ni plafond global ne sont modifiés. Aucun préalable Q.A/M.C levé.

### L5 — campagne Vertex sur le point multi-région `eu` — 16/10/2026, S.181

Relevé officiel du 16/10 (pages Google du 15/10, cellules lues dans le DOM) :
`gemini-3.8-flash` n'est servi sur aucune région simple, `europe-west1`
comprise, seulement sur `global`, `us` et `eu` ; tarif hors global 0,825 $
en entrée et 4,125 $ en sortie par million, raisonnement facturé en sortie,
jusqu'au 31/12/2026. Décision du responsable : point multi-région `eu`
(`aiplatform.eu.rep.googleapis.com`, traitement garanti dans l'Union) et
raisonnement `low`. `AI_OPENAI_RAISONNEMENT` envoie `reasoning_effort` au
fournisseur compatible quand elle est définie, rien sinon ; la destination
Vertex autorisée exige `eu` et `low`. Campagne bornée (10 240 / 5 120
jetons, 620 XOF par USD, frais 20 %, 44 XOF réservés par invocation, 113
possibles pour 60 prévues) et manifeste, sans secret, dans
`docs/revue/preuves-l5-vertex-2026-10-16/`. Lire
[le suivi](docs/revue/lot-l5-vertex-2026-10-16.md). La clé du compte se
fournit en secret d'environnement, jamais dans le dépôt ni le chat ; aucun
appel payant tant qu'elle manque. Premier passage `--pieces L01,R03`, usage
à confirmer sous les bornes ; dans une session éphémère, archiver le journal
`.qualification-vertex` sans secret et le remettre avant toute reprise.
Devise de facturation et taxes du compte à confirmer par le responsable.
L5, Q.A et M.C restent ouverts ; aucune fusion ni déploiement par ce lot.

### Finalisation L6, L7, L9 et vérification L5 — 15/10/2026, S.180

Instruction du responsable : finaliser les cinq lots restants, le
développement se faisant en parallèle avec un autre outil, Claude Code
gardant la main. Base `552312f` (#289 fusionnée) ; PR #290 à #292, Dependabot seulement,
porte verte, relues et non reprises par le lot.
Lire [le suivi du lot](docs/revue/lot-l6-l9-2026-10-15.md).
`npm run test:parcours` (six profils, banc `--parcours`, relais HTTPS pour
l'application **et** le stockage présigné) rejoue les parcours authentifiés
de la matrice ; il est dans la porte commune après `test:photos`. Préconditions
explicites limitées au candidat synthétique : lettre facultative, dossier prêt.
Deux défauts corrigés avec tests : l'éditeur suit la version produite ; le
dénominateur du compteur d'analyses compte les octrois, jamais un rendu.
B-07 ne déborde plus à 390 px (navigation empilée sous `md`, métriques sur
deux colonnes sous `lg`, export pleine largeur sous `sm`) ; le back-office
reste conçu pour le bureau. L5 : `gemini-3.8-flash` existe en GA, deux pages
officielles divergent sur `europe-west1`, tarif non lu officiellement ; région
et tarif à confirmer par le responsable avant tout appel, aucune substitution.
Audit : exception `deepmerge-ts` maintenue, quatre modérées tenues par `minio`
8.0.7, dernière version. Restent au responsable : L5 réel, lecteur d'écran et
signature L6, diagnostics/sauvegardes L7 sur le VPS, L8 entier, Q.A et M.C.
Le lot n'a rien fusionné ni déployé. Le 15/10 au soir, sur instruction du
responsable, Claude Code a fusionné #293 (`a4ccc39`) puis #291, #292 et #290
(`29e9f20`), chacune après sa porte complète rejouée sur la nouvelle base ;
le pipeline de déploiement de `main` a suivi de lui-même, comme à chaque
poussée : `29e9f20` en service sur le VPS à 21 h 26 UTC, `clamav` prêt en
35 s avec sa nouvelle empreinte ; puis une relance manuelle, hors Claude
Code, a redéployé l'état intermédiaire `07c29cb` à 21 h 56 UTC, en retrait
de #290 tant que `main` n'est pas redéployée. Lire le relevé des fusions à
la fin du suivi du lot.
Ces fusions ne lèvent aucun préalable.

### Photographies publiques — validation du 15/10/2026, S.179

Le responsable a validé les huit familles publiques, les cinq scènes et les
placements mobile/bureau, puis demandé l'implémentation et tous les tests.
Base `de85961` (#288 fusionnée), code et décisions Claude relus.
Lire [le catalogue et les règles de photographie](docs/photographies.md).
Accueil : simulateur à gauche, photo à droite sur bureau ; titre/champs/bouton
avant la photo sur mobile. S.164 et les réponses de session restent inchangés.
Bibliothèque locale `src/lib/photographies.ts` : associations explicites
pays/slug, aucun tiers, upload éditorial ou appel IA. Slug sans image : texte
seul ; guide retiré ou règle non publiée : gardes existantes avant tout rendu.
Le corps éditorial P.C reste fermé aux images/URLs libres. Les photographies
générées ne représentent ni clients, ni équipe, ni consultants réels.
Paiement, dossier et administration gardent leurs SVG/pictogrammes.
`npm run test:photos` lance la vraie app/worker/base jetable et six profils
Chromium/Firefox/WebKit × 390/1440. Lire les résultats et limites dans
[le suivi d'implémentation](docs/revue/implementation-photos-2026-10-15.md).
Ce chantier ne ferme pas les critères restants de L5/L6 et ne vaut pas déploiement.

### Revue complète du 11/10/2026 — REV11

**S.178 / L6 — téléphone conservé et parcours candidat locaux.**
Base `f216611` / #287 fusionné ; décisions Claude relues avant correction.
Le téléphone Mobile Money était saisi mais perdu avant le POST : normalisation
internationale partagée, validation UI/API/service et persistance à la création.
Facultatif, aucun indicatif deviné ; l'inscription répétée ne modifie aucun compte.
`recette:banc -- --parcours` active seulement des réponses IA/Stripe scriptées
locales : aucun fournisseur réel, pas une preuve de qualification L5.
[Recette, preuves et reprise](docs/revue/lot-l6-2026-10-12.md).
L6 : Firefox/WebKit, refusés par la politique CDN le 12/10, sont installés par
la porte depuis S.179 et couverts par S.180 ; le lecteur d'écran humain et la
signature de la matrice restent à faire. Aucun déploiement implicite.

**S.177 / complément L5 — campagne Vertex autorisée, 5 000 XOF au total.**
Base `5ada263` / #286 fusionné ; dernière logique Claude et S.176 relus.
Décision du responsable : Gemini 3.8 Flash sur Vertex seulement, projet
`projetanatt`, région `europe-west1`, compte `immipro-vertex-ai`. Aucun autre
prestataire pour ces essais, aucun changement de production implicite.
Lire [la campagne et la reprise](docs/exploitation/qualification-vertex-l5.md).
Disponibilité/modèle exact, tarifs, limites facturées, change et frais restent
à vérifier ; ne pas substituer un autre Gemini. Exemple volontairement bloqué.
Clé à configurer par le responsable, jamais lire/copier le coffre de production.
Conserver le journal privé global `.qualification-vertex` entre tous les
passages/machines : verrou exclusif, réserve prudente synchronisée avant
réseau, deux échanges possibles couverts, arrondi supérieur, pas de rendu ni
reset automatique. Plafond insuffisant : arrêt avant OAuth/modèle. Usage
inconnue ou borne dépassée : arrêt et rapprochement ; crash/journal illisible
ne permettent pas de reprendre à zéro. Pas de baisse de réserve sans preuve.
Réserve prudente distincte de facture/coût mesuré ; hypothèses tarifaires
non vérifiées → aucun appel payant. Destination/projet/région/compte/modèle
contrôlés, manifeste et campagne cohérents ; L1–L4 et D1 conservés.
Tests HTTP/SDK synthétiques ne qualifient pas Vertex. Deux grilles humaines
pour le seul fournisseur, aucun second prestataire pour le mélange. S.99,
L5 et Q.A/M.C restent ouverts ; revue avant intégration/déploiement.


**S.176 / REV11-L5 — banc de qualification, essais réels à compléter.**
Autorisation « lot suivant » puis « L5 » ; base `0d82d23` / #284 fusionné,
aucune PR concurrente à la première relecture. Base finale `186008f` :
#285 consigne le déploiement pilote L2–L4 ; relevé Claude relu et conservé,
aucun code changé par ce relevé. S.99 et les décisions L1–L4 relus,
#280/L2 et arbitrage Claude #282 conservés. Lire
[le suivi L5](docs/revue/lot-l5-2026-10-12.md) et
[le protocole fournisseur](docs/exploitation/qualification-ia.md).
Refuser sélection vide/inconnue avant réseau, toutes les pièces présentes
avant appels, manifeste obligatoire pour fournisseur. Conserver mesure
canonique L2, inconnus NULL, vrai zéro, absence d'appel distincte ; aucun
zéro de compatibilité transformé en mesure. Dix références fixes complètent
trente pièces/dix rédactions ; témoins et avis respectent L3. Dossier unique,
identité/adresse déclarées, commit/empreintes et relevé par fonction/appel.
Simulation et HTTP local ne qualifient aucun fournisseur ; code 0 n'est pas
une qualification, prix déclaré n'est pas facture, URL n'est pas DPA/région.
Aucun fournisseur réel accessible ni appelé : modèles/tarifs actuels,
incidents distants, deux grilles humaines, DPA/conservation/résidence,
rapprochement, choix séparés et configuration déployée restent à prouver.
Ne pas marquer L5 terminé ni lever Q.A/M.C. D1, INV-1/2/6, WF-06/08/16.
Les nouveaux tests passent par check/porte commune ; attentes L1–L4 intactes.
Proposition sans fusion/déploiement. L6 seulement sur les parcours indépendants.


**S.175 / REV11-L4 — relecture exclusive par version.** Autorisation « L4 »,
main `2066230` relu avant modification : #283/L3 fusionné, arbitrage Claude
#282 et version L2 #280 conservés, aucune PR concurrente au démarrage.
Lire [le suivi L4](docs/revue/lot-l4-2026-10-11.md) et
[réservation, fournisseur et exploitation](docs/exploitation/relecture-concurrente.md).
Conserver le verrou du grand livre/FIFO : réservation durable et débit
atomiques avant réseau, une seule `EN_COURS` par version. Le second onglet
consulte sans POST payant, même à quota 1. Aucune transaction SQL pendant
l'appel. Usage L2 avant refus/publication ; contrôles d'avis L3 inchangés.
Date, remarques, débit soldé et fin du jeton dans la même transaction ;
propriété/échéance/version courante vérifiées dans l'écriture. Une réponse
ancienne/expirée ne publie pas, ne touche pas au débit de la reprise ; une
version remplacée rend le débit encore dû (A-2). Reprise horaire S.153 et
reprise explicite après échéance ferment le jeton avec son rendu unique.
Migration additive avant app/worker, drainage des anciens processus ; aucun
backfill de réservations anciennes sans preuve, aucun grand livre effacé.
Conserver DIA-07 inchangé, `smoke:relecture-exclusive`, L2/L3 et diagnostics
IA dans la porte commune. Pas de garantie d'appel fournisseur unique après
arrêt brutal et reprise : ne pas inventer les jetons perdus. D1, INV-1/2/6,
WF-08/RG-08.10, R-04/B-07. Proposition sans fusion/déploiement ni levée Q.A/M.C.
Prochain lot : L5, qualification réelle des fournisseurs ; mobile B-07 reste L7.

**S.174 / REV11-L3 — validité des avis.** Autorisation « L3 », base
`3d985f8` : L2 #280 fusionné, arbitrage Claude #282 conservé ; les règles
de #280 font foi, ne pas réintroduire la version #281.
Lire [le suivi L3](docs/revue/lot-l3-2026-10-11.md) et
[le contrat des avis](docs/exploitation/avis-ia.md).
Politique : une seule remarque invalide refuse tout l'avis, même liste
mixte ; aucune troncature au-delà de huit. Une vraie liste vide est valide.
Genres produits uniquement, titres/corps et deux sources/valeurs d'une
incohérence non blancs, autres genres sans écarts. Vocabulaire commun sur
tous les champs affichés. Deux adaptateurs + garde de publication dans
la route ; motif candidat `avis_mal_forme`, formulation refusée conservée.
Usage L2 enregistré avant refus, aucune date ni remarque publiée,
réservation rendue une fois et aucun rejeu automatique pour ce motif.
Ne pas requalifier les avis historiques sans réponse source. Conserver
DIA-05/CTRL-02 et `smoke:avis-ia` dans la porte commune. D1, INV-1/2/6,
WF-08/RG-08.4/08.9. DIA-07/concurrence reste L4 ; mobile B-07 reste L7.
Proposition sans fusion/déploiement ni levée Q.A/M.C. Prochain lot : L4.

**S.173 / REV11-L2 — mesure des usages.** Autorisation « L2 », main
`47b39b0` relu : S.171/S.172 et #278 intégrés, aucune PR concurrente au
démarrage. Base finale `16636d4` : #279 conserve le relevé Claude du
déploiement pilote L1 ; aucun changement de code par ce relevé. Lire [le suivi L2](docs/revue/lot-l2-2026-10-11.md) et
[la procédure de mesure](docs/exploitation/mesure-ia.md).
Politique de publication retenue : réponse reçue sans mesure complète
valide → aucune publication automatique, revue humaine en extraction,
aucun texte/avis daté en rédaction ; quota réellement dû rendu, sans
relance automatique pour cette cause. D1 reste en analyses.
Conserver le validateur pur et les états `CONNUE`, `PARTIELLE`, `INCONNUE`,
`INVALIDE` ; inconnus en `NULL`, vrai zéro enregistré, mesure conservée
avant validation du contenu et après interruption du flux. Ne pas
réécrire les états nuls historiques. B-07 signale le rapprochement et
son export distingue les inconnus. Migration avant app/worker ;
`smoke:usages-ia` dans la porte, diagnostic en lecture seule dans l'image.
DIA-01/02/03 passent ; DIA-05 reste L3, DIA-07 reste L4. Aucune attente
historique des tests de transport Claude n'est assouplie. Mobile B-07
390 px : débordement à reprendre en L7. Proposition L2 sans fusion,
déploiement ni levée Q.A/M.C. Prochain lot : L3.

**S.172 / complément REV11-L1, PR #277.** Claude a ouvert #276 / S.171
pendant le travail L1. Cette proposition est désormais basée sur sa branche
`claude/elegant-dijkstra-86egeb`, sans remplacer son lot ou son arbitrage.
Conserver `AI_OPENAI_ORIGINE_AUTORISEE` : l'origine des pièces compatibles
doit être celle explicitement autorisée ; le banc la neutralise.
Le complément ajoute la suppression du corps/en-têtes 3xx avant le SDK,
les logs SDK coupés et les preuves worker/quota/rejeu/rendus C-08/B-05.
Voir [suivi L1](docs/revue/lot-l1-2026-10-11.md) et
[destination IA](docs/exploitation/destination-ia.md). L'origine est une
garde automatique, mais ne prouve pas société, région ou DPA. Le manifeste
complémentaire reste une comparaison manuelle pour L5. DIA-04/06 passent ;
DIA-01/02/03/05 et DIA-07 restent à corriger. D1 reste en analyses.
Prochain lot L2, sans inventer de mesures historiques. S.171 et S.172 sont
des propositions distinctes ; aucun déploiement ou préalable Q.A/M.C
n'est attesté ici.

**Démarrage des corrections, S.170 / REV11-L0.** Le responsable a demandé le
11/10 de commencer en dix lots prioritaires. Lire le
[suivi L0](docs/revue/lot-l0-2026-10-11.md) et ses preuves. Cette proposition
reprend main `d4fb08c` (#273 et #274 fusionnées), conserve Prisma 7 et pg-boss 12.
Elle isole l'environnement du banc, contrôle son propre démarrage et arrête
ses enfants/services après échec. `smoke:recette` rejoint la porte commune.
DIA-06 passe ; DIA-01 à DIA-05 et DIA-07 restent rouges, sans attentes assouplies.
Le 503 de paiement attendu est toléré seulement par le banc ; la santé de
production reste inchangée. Le script `recette-documentaire.py` rejoue une
nouvelle version sur un banc neuf puis vérifie le quota et la décision humaine.
S.170 est fusionné (PR #275) ; déploiement et lancement restent des états
distincts.

**S.171 / REV11-L1, destination des documents.** Aucune redirection n'est
suivie (compatible, jeton Google, client Anthropic) : une 3xx devient
`non_configure`. Arbitrage du 11/10 : l'autorisation des pièces chez un
fournisseur compatible désigne l'origine validée (`AI_OPENAI_ORIGINE_AUTORISEE`,
égale à celle de `AI_OPENAI_URL`). Ne pas rouvrir ce choix. Poursuivre par
L2, après relecture de main et du registre.

Lire la [revue complète](docs/revue/revue-complete-2026-10-11.md), le
[chantier](docs/revue/chantier-complet-2026-10-11.md) et la
[documentation IA/workflows](docs/IA-workflows.md) après les décisions du
registre. Base initiale : `bbf1500` / S.168 ; base finale : `ec32f65` / S.169.
S.167 / PR #268 et S.169 / PR #272 (Prisma 7) sont fusionnées.
Conserver leur code, le client Prisma et ses outils. Aucun chantier concurrent
de dépendances ne doit remplacer les corrections fonctionnelles proposées.

REV11 apporte une revue, des diagnostics et un plan avant intégration ;
elle ne corrige pas les cinq groupes d'anomalies IA reproduits. Les
diagnostics manuels `scripts/recette/diagnostic-ia.mts` et
`diagnostic-relecture.mts` expriment les résultats voulus et sont encore
rouges. Les faire passer par une correction puis les intégrer à la porte
du lot concerné ; ne pas modifier leurs attentes pour accepter le défaut.

Conserver D1 : quota en **analyses**, jetons pour consommation et marge.
Une mesure inconnue n'est pas une consommation nulle. Un parseur JSON ne
prouve pas la vérité des champs extraits. Vérifier destination des octets,
validité d'un avis et revendication de la relecture par version, au-delà
du verrou du grand livre. Le banc sans fournisseur doit aussi neutraliser
Vertex et vérifier son propre démarrage (REV-BANC-01) ; les simulations
ne prouvent ni DPA, ni modèle réel, ni paiement.

Les lots REV11-L0 à L9 sont un ordre de travail proposé, pas des numéros
S.xxx réservés. Ne marquer un préalable levé qu'avec sa preuve réelle ;
les règles Q.A/M.C et les reports V2 restent inchangés.

L'autorisation initiale RF-0 (09/10) portait sur les documents ; sa PR #244
est fusionnée. Claude Code a ensuite réalisé les lots jusqu'à S.166.
A-1 et A-3 sont tranchés en S.146, A-2 en S.147 : relire leurs décisions
au registre, sans redemander des choix déjà rendus.

Le 10/10, le responsable a demandé de revoir les travaux récents, puis de
corriger les bugs front et backend et d'actualiser les documents. Cette
instruction autorise le lot complémentaire RC / S.167 décrit dans la
[revue du 10/10](docs/revue/revue-complementaire-2026-10-10.md).
Les autorisations et décisions déjà consignées restent acquises.

Ordre de lecture : ce fichier, [DOC-11](docs/DOC-11-workflows.md),
[DOC-12](docs/DOC-12-prototype.md), les dernières décisions du
[registre](docs/prototype/ECARTS-A-ARBITRER.md), le
[plan historique](docs/revue/plan-de-traitement-2026-10-07.md), puis la
[revue fonctionnelle](docs/revue/revue-fonctionnelle-2026-10-09.md) et le
[chantier RF](docs/revue/chantier-fonctionnel-2026-10-09.md), puis la
[revue complémentaire](docs/revue/revue-complementaire-2026-10-10.md).

Base du lot 0 : main dd2b58f, S.125 à S.144 intégrés. Claude Code a livré
S.142 (Stripe-Version et dépendances SMTP, PR #241), S.143 (ESLint plat,
PR #242) et S.144 (Next 16, PR #243). Relire main et les PR ouvertes avant
chaque lot ; conserver ces changements et leurs décisions.
Base initiale de la revue du 10/10 : main 065bde4/S.165. La PR #267/S.166
(pg-boss 11 et transfert), initialement en brouillon, a été fusionnée
pendant la validation. Base finale de RC/S.167 : main 9ade7ea/S.166 ;
conserver le schéma neuf, le transfert et les preuves de ce lot.
Les identifiants
RF ne réservent aucun numéro S.xxx : attribuer celui-ci au démarrage d'un
lot applicatif, après vérification du registre et du travail en cours.

Trois preuves distinctes : code implémenté, parcours éprouvé, préalable de
lancement levé. Une PR ouverte reste proposée ; une fusion ne démontre ni
recette ni déploiement. Un contrôle non exécuté reste « non vérifié ».

Pour chaque lot applicatif autorisé :

- une PR, une entrée de suivi, un rattachement WF/RG/écran et les écarts restants ;
- reproduction du comportement, puis test du résultat voulu ; courses et
  interruptions éprouvées sur une base jetable ;
- conserver FON-01 à FON-04, E5 et C-05/M11 corrigés en S.146 à S.148
  et S.155 ; ne les rouvrir qu’avec une nouvelle reproduction ;
- rattacher un signalement à l’identité de la lecture affichée ; un
  champ de même nom ne prouve pas que la lecture est la même ;
- rattacher une réponse asynchrone B-05 à sa demande et sa pièce ;
  conserver la saisie suivante après une décision tardive ;
- ne rendre que le débit réel encore dû : le grand livre fait foi,
  et décision, rendu, avis et audit tiennent dans la même transaction ;
- garder l'historique des anciennes pièces ; empêcher ses effets sur la
  pièce courante ; partager la règle de reprise gratuite et respecter les
  états figés lors d'un arbitrage ;
- diagnostiquer les données antérieures sans réécrire les règles figées,
  le journal ou les pièces comptables ; attribuer et tracer les traitements ;
- conserver les reports V2 de DOC-11 §0 et les huit invariants ci-dessus ;
- Q.A commande l'ouverture publique, M.C l'encaissement réel ; leur levée
  exige les validations et preuves prévues, au-delà de la présence du code.

Appliquer la porte de qualité de `.github/workflows/validation.yml` et
les critères du chantier : verrou, check, audit, build, schéma, migrations,
garde-fous et fumées concernés ; image si les artefacts ou le déploiement
changent. Documenter les résultats dans le lot. RF-0 ne modifie aucun code,
schéma, drapeau commercial ou service ; sa validation ne certifie pas la V1.
