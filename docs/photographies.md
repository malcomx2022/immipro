# Photographies publiques — S.179

Le responsable a validé l'ensemble le 15/10/2026 : cinq scènes, huit familles
publiques, variantes mobile/bureau et priorité au simulateur sur l'accueil.
Les consignes et décisions Claude ont été relues depuis `de85961` (#288).

## Emplacements livrés

| Famille | Placement et règle |
|---|---|
| Accueil `/` | Simulateur à gauche, photo à droite sur bureau ; photo après titre, trois champs et bouton sur mobile. Petites vignettes dans les cartes pays. |
| Comment ça marche | Photo après introduction, avant les étapes. |
| Destinations | Vignettes des pays dans les cartes ; pays/procédure et sources restent écrits. |
| Fiche destination | Photo après l'encadré de source et sa date, avant les conditions. |
| Index guides | Vignette du pays sur les guides effectivement publiés. |
| Guide pays | Une photo après le chapeau ; sommaire et source conservés. |
| Index articles | Vignette seulement si une association éditoriale existe. |
| Article | Une photo après le chapeau pour les sujets explicitement associés. |

Les autres écrans gardent leur composition : formulaires, tarifs, simulateur,
résultats, dossier, paiement et administration sans photo décorative. Les
portraits/logos professionnels réels ne sont pas remplacés par des visages
IA. Aucun nouveau guide Suisse, article ou pays n'est créé par les médias.

## Catalogue et association

`src/lib/photographies.ts` est le catalogue des cinq scènes locales. Pays :
NL → Pays-Bas, CH → Suisse. Guides : slugs `pays-bas`, `suisse`. Articles :
`releve-bancaire-quatre-mois` et `preparer-ses-pieces` → préparation ;
`relire-ses-documents` → accompagnement. Les deux derniers sont des
associations disponibles, pas des créations/publications automatiques.

Chaque entrée porte chemins bureau/mobile/vignette, texte alternatif et
classe de point focal. Un pays ou sujet inconnu reçoit `undefined` : le
composant ne crée ni cadre vide ni URL improvisée. Les gardes des lecteurs
serveur (`PUBLIE`, source, validité) précèdent le rendu ; aucune requête,
condition métier, date ou règle n'est modifiée par le catalogue.

**P.C reste fermé** : corps éditoriaux textuels, aucun nouveau bloc média,
URL saisie ou téléversement B-08. Le catalogue est distinct des anciens
contenus éditoriaux de `src/lib/contenu/` : le test qui interdit un retour
aux textes statiques dans les écrans publics reste inchangé.

Les scènes sont générées par IA et illustratives. Elles ne prouvent pas un
campus, un client, une équipe réelle ou l'exercice d'une profession.
Logo SVG d'origine inchangé ; ses couleurs et zones de protection restent
celles de BRAND.md. Typographie, rayons, couleurs et cadrages passent par
les jetons Tailwind. Aucun appel IA/provider d'exécution, coût ou débit L5.

## Chargement et dimensions

`PhotoPublique` utilise `picture` et `next/image` avec les WebP locaux déjà
optimisés (`unoptimized`). Une seule image par placement ; source mobile
jusqu'à 767 px, fichier bureau au-delà. Le navigateur choisit le fichier,
sans deux balises cachées ni double préchargement. Vignettes séparées à
320 px, alt vide lorsqu'elles répètent le titre du lien.

Les médias principaux ont un alt descriptif ; les dimensions HTML et ratios
CSS réservent la place. Aucun texte sur la photo. Tous les médias sont
chargés paresseusement ; la photo d'accueil arrive après le formulaire en
mobile. Les mesures LCP sont enregistrées en recette pour guider une
priorisation ultérieure si nécessaire ; aucun préchargement bureau n'est
ajouté au téléphone. Les ressources restent de même origine, sans changer
CSP, Referrer-Policy ou autorisation de domaine tiers.

| Actif livré | Largeur | Octets |
|---|---|---|
| `public/photos/preparation-bureau.webp` | 1536 px | 107042 |
| `public/photos/preparation-mobile.webp` | 780 px | 42888 |
| `public/photos/pays-bas-bureau.webp` | 1536 px | 116270 |
| `public/photos/pays-bas-mobile.webp` | 780 px | 85600 |
| `public/photos/accompagnement-bureau.webp` | 1536 px | 109998 |
| `public/photos/accompagnement-mobile.webp` | 780 px | 44396 |
| `public/photos/accueil-bureau.webp` | 1536 px | 95952 |
| `public/photos/accueil-mobile.webp` | 780 px | 37698 |
| `public/photos/suisse-bureau.webp` | 1536 px | 117634 |
| `public/photos/suisse-mobile.webp` | 780 px | 73970 |
| `public/photos/accueil-vignette.webp` | 320 px | 7284 |
| `public/photos/preparation-vignette.webp` | 320 px | 8610 |
| `public/photos/pays-bas-vignette.webp` | 320 px | 14878 |
| `public/photos/accompagnement-vignette.webp` | 320 px | 8632 |
| `public/photos/suisse-vignette.webp` | 320 px | 11550 |

Les fichiers principaux sont sous 120 000 octets, les vignettes sous
24 000 octets. Cela ne certifie pas à lui seul le budget d'écran DOC-12
(400 Ko public, 200 Ko applicatif) ni les Core Web Vitals en production.
Les relevés de laboratoire distinguent le premier affichage et les
ressources après défilement. LCP/CLS dépendent aussi du navigateur, des
scripts, polices et de la connexion. Le contrôle CLS initial doit rester
au plus à 0,1 dans les navigateurs qui fournissent cette mesure.

## Refaire la recette

```sh
npm ci
npx prisma generate
npm run check
npm run check:audit
npm run build
# OpenSSL est requis pour le certificat local éphémère.
npx playwright install --with-deps chromium firefox webkit
# DATABASE_URL doit désigner un serveur PostgreSQL local de recette.
npm run test:photos
```

La configuration refuse une URL de serveur distant ou manquante avant tout
lancement. Le banc crée/recrée `immipro_recette_photos` sur ce serveur,
lance le vrai standalone et son worker, puis ferme ses processus/services.
S3, antivirus et SMTP sont locaux ; aucun fournisseur IA/paiement n'est branché.
Ne pas utiliser une base de travail à conserver sous ce nom.

Le navigateur accède au banc via `https://localhost:3173`, un proxy de recette
vers le standalone local sur 3172. OpenSSL crée un certificat éphémère supprimé
à l'arrêt ; Playwright accepte ce seul certificat local non signé. La CSP de
production, notamment `upgrade-insecure-requests`, reste intacte et vérifiée.
WebKit la respecte aussi sur localhost : une recette HTTP seule bloquerait ses
scripts, styles et images. Aucun réglage de sécurité de production n'est changé.

Pour Chromium système installé localement :

```sh
CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:photos -- \
  --project=chromium-390 --project=chromium-1440
```

Six profils : Chromium, Firefox, WebKit × 390/1440 px. **84 scénarios** :
11 pages réelles par profil, simulateur au clavier et conservation de sa
réponse, variante mobile sans téléchargement du grand accueil, sujets
sans association, contenu retiré/brouillon, écrans sans photo et décodage
réel des 15 WebP. Pas de débordement horizontal, erreur JS ou image cassée.

Les fixtures sont explicitement synthétiques, dans la seule base jetable :
guide Suisse/article de relecture pour éprouver tous les médias, article
publié sans association, article retiré dont le slug possède une photo,
guide brouillon. Elles ne sont pas des graines de production. La lecture
publique et le 404 sont ceux des vraies routes.

Le HTML Playwright, captures Chromium, traces des échecs et mesures JSON
sont conservés sept jours dans l'artefact CI `photographies-publiques`.
Aucun journal SMTP/banc contenant les mots de passe synthétiques n'y entre.
Cette étape fait partie de la porte commune de CI et de prédéploiement.

[Suivi de validation et limites](revue/implementation-photos-2026-10-15.md).
