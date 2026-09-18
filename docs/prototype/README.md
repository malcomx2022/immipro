# Handoff : prototype ImmiPro (DOC-12)

## Vue d'ensemble

ImmiPro accompagne des candidats béninois dans une démarche de visa long séjour : simulation d'éligibilité sans compte, ouverture d'un dossier payé une fois, dépôt et analyse des pièces, suivi jusqu'à la clôture, plus un back-office de veille réglementaire et de revue de recevabilité.

Le prototype couvre **quarante-cinq écrans**, répartis en cinq sections. Tous ne sont pas dans les deux largeurs : l'index en fin de document dit lesquels.

| Préfixe | Section | Écrans |
|---|---|---|
| `P-` | Public, acquisition | P-01 à P-07 |
| `A-` | Comptes | A-01 à A-05 |
| `C-` | Espace candidat, dossier | C-01 à C-11 |
| `$-` | Paiement | $-01 à $-06 |
| `B-` | Back-office | B-01 à B-07 |
| `R-`, `T-` | Rédaction assistée et transverses | R-01 à R-04, T-01 à T-05 |

## À propos des fichiers de design

Les fichiers de ce dossier sont des **références de design écrites en HTML** : ils montrent l'apparence et le comportement attendus, ce ne sont pas des sources à copier en production. Le travail consiste à **recréer ces écrans dans l'environnement du dépôt** (Vue, avec ses composants et ses conventions) — pas à porter le HTML tel quel.

Chaque fichier `.dc.html` est autonome : il s'ouvre dans un navigateur et contient un document entier (plusieurs cadres d'écran côte à côte, avec leur code d'inventaire et leur workflow en surtitre). Les styles sont **en ligne**, volontairement : aucune feuille de style à reprendre, les valeurs sont lisibles à l'endroit où elles s'appliquent.

## Fidélité

**Haute fidélité.** Couleurs, typographie, espacements, rayons, ombres, états et libellés sont définitifs. Aucun faux texte : tous les contenus sont les copies retenues, y compris les messages d'erreur, les mentions de non-responsabilité et les montants. La recréation doit être fidèle au pixel, avec les composants existants du dépôt.

## Jetons de design

Repris de `tailwind.config.ts`, avec une correction apportée par le prototype.

### Couleurs

```
accent  50  #EEF4FB   fonds de mise en avant
accent 100  #D7E5F5   hachures, aplats secondaires
accent 500  #2E75B6   boutons primaires, barres de progression
accent 600  #255F95   survol du primaire, liens
accent 700  #1F4E79   anneau de focus, texte sur accent-50
ink    100  #F7F7F7   fonds de section
ink    300  #DDDDDD   séparateurs, bordures de champ
ink    500  #6B6B6B   texte secondaire  ← CORRIGÉ, voir ci-dessous
ink    700  #40403F   corps de texte
ink    900  #1A1A1A   titres
success     #0F7B4F
warning     #B45309
danger      #B3261E
blanc       #FFFFFF
```

**`ink.500` vaut `#6B6B6B` et non `#767676`.** L'ancienne valeur donnait 4,24:1 sur `ink-100` et 4,10:1 sur `accent-50`, sous le seuil AA de 4,5:1, alors que c'est précisément sur ces fonds qu'elle sert le plus (légendes, sous-titres, mentions de source). `#6B6B6B` donne 5,33:1 sur blanc, 4,97:1 sur `ink-100` et 4,81:1 sur `accent-50`. **Cette ligne est à changer dans `tailwind.config.ts` : le prototype est en avance sur le code.** Les 803 emplois sont déjà substitués dans les fichiers de design.

Ratios mesurés de toutes les encres sur les trois fonds : voir `ImmiPro Passe de contraste et de tailles.dc.html`.

### Typographie

Inter (400, 500, 600) pour tout le texte, JetBrains Mono (400, 500) pour les codes, références, horodatages et mentions techniques.

Échelle réelle, neuf crans qui portent 99,6 % des déclarations :

```
13 px / 18 px   mentions, légendes, monospace
14 px / 20 px   texte courant dense, libellés
15 px / 22 px   texte courant desktop
16 px / 24 px   texte courant, boutons
19 px / 26–28 px  titres de bloc, intertitres
24 px / 30 px   titres d'écran mobile
28 px / 34 px   titres de section
32 px / 38 px   titres de page, montants
44 px / 50 px   héros desktop
```

Aucun texte sous 13 px. `letter-spacing: -0.01em` sur les titres de 24 px, `-0.02em` à partir de 32 px. `text-wrap: pretty` sur tout paragraphe susceptible de faire une veuve.

### Espacements, rayons, élévations

```
Espacements : 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 48 px
Rayons      : 8 px (pastilles internes), 12 px (boutons, champs), 16 px (cartes, cadres), 999 px (pills)
Élévations  : e1  0 1px 2px rgba(0,0,0,.06)
              e2  0 12px 32px rgba(0,0,0,.12)   cadres d'écran, feuilles du bas
Cibles      : 44 px minimum, 48 px pour les actions secondaires, 52 px pour l'action principale mobile
```

## Gabarits

Le mobile 390 px est la référence ; le 1440 px en découle par trois gabarits :

1. **Acquisition** — barre haute (logo, navigation, appel à l'action), contenu centré à 1120 px maximum, pied de page. Sert aux sections P et A.
2. **Dossier** — colonne de navigation de 264 px à gauche, en-tête de contenu avec titre et action principale à droite, corps à deux colonnes. Sert à la section C.
3. **Paiement** — barre haute minimale (logo, fil des trois étapes), pas de navigation latérale, colonne de décision à 640 px et récapitulatif permanent à 416 px. Le bouton principal vit dans le récapitulatif : il reste visible sans défiler, ce que la barre fixe garantissait en 390 px. Sert à la section $.

Les écrans de rédaction assistée et les transverses P1 (R-01 à R-04, T-01 à T-03) reprennent le gabarit dossier. R-03 y sépare l'éditeur du panneau de versions au lieu de les commuter, et la feuille du bas de T-03 devient une boîte de dialogue centrée avec piège de focus et fermeture par Échap.

Le back-office est nativement en 1440 px : colonne latérale, liste dense, panneau de détail.

## Écrans par document

| Document | Écrans | Largeur |
|---|---|---|
| `ImmiPro Arbitrages clos.dc.html` | les quatre dernières décisions, leur motif, ce qu'elles imposent au code | fluide |
| `ImmiPro Reports vers le code.dc.html` | les neuf modifications attendues du dépôt, classées par fichier | fluide |
| `ImmiPro Fondations.dc.html` | jetons, échelles, gabarits | fluide |
| `ImmiPro Bibliothèque de composants.dc.html` | boutons, champs, sélection, pastilles, blocs, tous états | fluide |
| `ImmiPro Écrans pivots.dc.html` | P-01, C-06, $-03, C-09 — les quatre écrans qui décident du reste, chacun en deux traitements commutables | 390 px |
| `ImmiPro Lot P0 Public.dc.html` | P-02 à P-07 | 390 px |
| `ImmiPro Lot P0 Comptes.dc.html` | A-01 à A-05 | 390 px |
| `ImmiPro Lot P0 Dossier 1.dc.html` | C-01 à C-05 | 390 px |
| `ImmiPro Lot P0 Dossier 2.dc.html` | C-07 à C-11 | 390 px |
| `ImmiPro Lot P0 Paiement.dc.html` | $-01, $-02, $-04 à $-06 | 390 px |
| `ImmiPro États Lot P0.dc.html` | C-02, C-06, C-08 à C-10, $-02 en chargement, vide, erreur, hors ligne | 390 px |
| `ImmiPro États Lot P0 suite.dc.html` | C-03 à C-05, C-11, $-01, $-04, $-06, mêmes états | 390 px |
| `ImmiPro Lot P1.dc.html` | R-01 à R-04, T-01 à T-03 | 390 px |
| `ImmiPro Lot P2 Backoffice 1.dc.html` | B-01, B-02, B-05 | 1440 px |
| `ImmiPro Lot P2 Backoffice 2.dc.html` | B-03, B-04, B-06, B-07 | 1440 px |
| `ImmiPro États Lot P2 Backoffice.dc.html` | B-01 à B-06, états vides et erreurs | 1440 px |
| `ImmiPro Desktop 1440.dc.html` | les trois gabarits, sur P-01, C-06, $-03 | 1440 px |
| `ImmiPro Desktop 1440 Public.dc.html` | P-02 à P-07 | 1440 px |
| `ImmiPro Desktop 1440 Comptes.dc.html` | A-01 à A-05 | 1440 px |
| `ImmiPro Desktop 1440 Dossier.dc.html` | C-01 à C-05 | 1440 px |
| `ImmiPro Desktop 1440 Dossier 2.dc.html` | C-07 à C-11 | 1440 px |
| `ImmiPro Lot P2 Transverses WF-12.dc.html` | T-04, T-05, état vide et confirmation | 390 px |
| `ImmiPro Desktop 1440 Transverses WF-12.dc.html` | T-04, T-05 sur le gabarit dossier | 1440 px |
| `ImmiPro Desktop 1440 Paiement.dc.html` | $-01, $-02, $-04, $-05, $-06 | 1440 px |
| `ImmiPro Desktop 1440 Rédaction et transverses.dc.html` | R-01 à R-04, T-01 à T-03 | 1440 px |

Documents de méthode, à lire avant d'implémenter :

| Document | Ce qu'il fixe |
|---|---|
| `ImmiPro Parcours clavier.dc.html` | les douze règles clavier, la séquence de tabulation écran par écran |
| `ImmiPro Langue des messages d'erreur.dc.html` | sept règles d'écriture, les huit messages d'erreur du produit |
| `ImmiPro Protocole d'essai TalkBack.dc.html` | les douze vérifications lecteur d'écran à passer sur appareil réel |
| `ImmiPro Feuille de relevé TalkBack.dc.html` | la feuille imprimable à remplir pendant l'essai, verdict par verdict |
| `ImmiPro Passe de contraste et de tailles.dc.html` | ratios mesurés, échelle de tailles réelle |
| `ImmiPro Revue de recevabilité.dc.html` | les dix critères du §5, l'inventaire, les décisions encore ouvertes |
| `ImmiPro Variantes $-01.dc.html` | trois traitements de l'écran de paiement, avec le coût d'adoption de chacun |

## Index des écrans

Quarante-cinq écrans. Trente-huit existent dans les deux largeurs. Les sept autres sont le back-office, en 1440 px seulement : B-01 à B-07 sont des outils de poste de travail, et une version mobile du journal d'audit ou de la revue manuelle des pièces n'aurait pas d'usage.

| Code | Écran | 390 px | 1440 px |
|---|---|---|---|
| `P-01` | Accueil | Écrans pivots (2 traitements) | Desktop 1440 |
| `P-02` | Simulateur | Lot P0 Public | Desktop 1440 Public |
| `P-03` | Résultats | Lot P0 Public | Desktop 1440 Public |
| `P-04` | Fiche destination | Lot P0 Public | Desktop 1440 Public |
| `P-05` | Guide pays | Lot P0 Public | Desktop 1440 Public |
| `P-06` | Tarifs | Lot P0 Public | Desktop 1440 Public |
| `P-07` | Article | Lot P0 Public | Desktop 1440 Public |
| `A-01` | Inscription | Lot P0 Comptes | Desktop 1440 Comptes |
| `A-02` | Connexion | Lot P0 Comptes | Desktop 1440 Comptes |
| `A-03` | Vérification email | Lot P0 Comptes | Desktop 1440 Comptes |
| `A-04` | Mot de passe | Lot P0 Comptes | Desktop 1440 Comptes |
| `A-05` | Consentements | Lot P0 Comptes | Desktop 1440 Comptes |
| `C-01` | Tableau de bord | Lot P0 Dossier 1 | Desktop 1440 Dossier |
| `C-02` | Profil | Lot P0 Dossier 1 | Desktop 1440 Dossier |
| `C-03` | Comparateur | Lot P0 Dossier 1 | Desktop 1440 Dossier |
| `C-04` | Fiche détaillée | Lot P0 Dossier 1 | Desktop 1440 Dossier |
| `C-05` | Ouverture de dossier | Lot P0 Dossier 1 | Desktop 1440 Dossier |
| `C-06` | Checklist | Écrans pivots (2 traitements) | Desktop 1440 |
| `C-07` | Téléversement | Lot P0 Dossier 2 | Desktop 1440 Dossier 2 |
| `C-08` | Résultat d'analyse | Lot P0 Dossier 2 | Desktop 1440 Dossier 2 |
| `C-09` | Complétude | Écrans pivots (2 traitements) · Lot P0 Dossier 2 | Desktop 1440 Dossier 2 |
| `C-10` | Échéancier | Lot P0 Dossier 2 | Desktop 1440 Dossier 2 |
| `C-11` | Clôture | Lot P0 Dossier 2 | Desktop 1440 Dossier 2 |
| `$-01` | Choix du pack | Lot P0 Paiement · Variantes $-01 (3 traitements) | Desktop 1440 Paiement |
| `$-02` | Récapitulatif | Lot P0 Paiement | Desktop 1440 Paiement |
| `$-03` | Attente Mobile Money | Écrans pivots (2 traitements) | Desktop 1440 |
| `$-04` | Paiement confirmé | Lot P0 Paiement | Desktop 1440 Paiement |
| `$-05` | Échec ou expiration | Lot P0 Paiement | Desktop 1440 Paiement |
| `$-06` | Reçu | Lot P0 Paiement | Desktop 1440 Paiement |
| `R-01` | Type de pièce | Lot P1 | Desktop 1440 Rédaction et transverses |
| `R-02` | Entretien guidé | Lot P1 | Desktop 1440 Rédaction et transverses |
| `R-03` | Éditeur et versions | Lot P1 | Desktop 1440 Rédaction et transverses |
| `R-04` | Analyse critique | Lot P1 | Desktop 1440 Rédaction et transverses |
| `T-01` | Notifications | Lot P1 | Desktop 1440 Rédaction et transverses |
| `T-02` | Divergence réglementaire | Lot P1 | Desktop 1440 Rédaction et transverses |
| `T-03` | Proposition partenaire | Lot P1 | Desktop 1440 Rédaction et transverses |
| `T-04` | Annuaire consultants | Lot P2 Transverses WF-12 | Desktop 1440 Transverses WF-12 |
| `T-05` | Prise de rendez-vous | Lot P2 Transverses WF-12 | Desktop 1440 Transverses WF-12 |
| `B-01` | File de veille réglementaire | — | Lot P2 Backoffice 1 |
| `B-02` | Édition d'une règle versionnée | — | Lot P2 Backoffice 1 |
| `B-03` | Utilisateurs | — | Lot P2 Backoffice 2 |
| `B-04` | Paiements et réconciliation | — | Lot P2 Backoffice 2 |
| `B-05` | Revue manuelle des pièces en échec | — | Lot P2 Backoffice 1 |
| `B-06` | Journal d'audit | — | Lot P2 Backoffice 2 |
| `B-07` | Supervision des coûts IA | — | Lot P2 Backoffice 2 |

## Comportements et états

### Écrans interactifs du prototype

Ces écrans ont un état réel, pas une capture figée — leur logique est dans la classe `Component` du fichier correspondant.

- **P-02, simulateur** (`Lot P0 Public`) — six questions, une par écran ; une réponse par question, mémorisée ; progression en pourcentage ; le focus va au titre de l'étape à chaque changement.
- **P-06, tarifs** (`Lot P0 Public`) — bascule XOF / EUR, qui change les cinq montants affichés et la mention de grille.
- **$-01, choix du pack** (`Lot P0 Paiement`) — trois packs sélectionnables, devise commutable, le pack retenu alimente $-02 et la barre d'action.
- **$-05, échec** (`Lot P0 Paiement`) — deux motifs commutables : délai dépassé, solde insuffisant. Titres et corps distincts.
- **P-01** (`Écrans pivots`) — deux variantes de héros au sélecteur, feuille du bas pour chaque champ du simulateur.
- **$-03, attente Mobile Money** (`Écrans pivots`) — décompte de cinq minutes, relève toutes les trois secondes, apparition de « Réessayer » à 90 secondes.
- **C-07, téléversement** (`Lot P0 Dossier 2`) — quatre états commutables : prêt, envoi en cours, quota épuisé, réseau coupé.
- **B-01 et B-05** (`Lot P2 Backoffice 1`) — listes en `role="listbox"`, sélection au clavier, panneau de détail lié.

### Règles de comportement tenues partout

1. **Aucun `tabindex` positif.** L'ordre de tabulation est l'ordre du DOM ; les réorganisations visuelles se font en grille.
2. **Lien d'évitement en premier arrêt** de chaque écran (« Aller au contenu »), masqué jusqu'au focus, puis pastille de 44 px avec anneau. Il déplace le focus sur le titre de l'écran, rendu focalisable par `tabindex="-1"`.
3. **Anneau de focus jamais supprimé** : contour 2 px `accent-700` à 3 px de décalage sur boutons et liens, anneau `accent-50` de 3 px sur les champs. Aucun `outline: none` sans remplacement.
4. **Groupes de choix en flèches** : les trois packs de $-01 forment un seul arrêt de tabulation, flèches haut et bas pour changer, `aria-checked` sur l'option retenue.
5. **Échap revient, jamais ne valide.**
6. **Le focus ne se déplace qu'au changement d'écran**, jamais pendant une attente.
7. **Chaque étape du simulateur reprend le focus** sur son titre.
8. **La feuille du bas** est un `role="dialog" aria-modal="true"`, piège la tabulation, et rend le focus à l'élément qui l'a ouverte, à la fermeture comme sur Échap.
9. **Une ligne cliquable est un `button`**, jamais un `div` avec un `onClick`.
10. **`aria-live="polite"` sur le texte de statut, pas sur le décompte** : sur $-03, seul « En attente de ta confirmation » est dans une région vivante ; le décompte et la relève sont en `aria-hidden`.
11. **Une longue liste est un seul arrêt** : les listes du back-office sont des `role="listbox"` à tabindex mobile, flèches pour naviguer.
12. **La barre d'action basse s'atteint sans retraverser la liste** : sur C-06 et C-09, un second saut « Aller à l'action » mène droit au bouton principal ; la barre reste le dernier arrêt du DOM.

### Messages d'erreur

Sept règles, détaillées dans le document dédié. Les quatre qui changent l'implémentation :

- Le titre nomme le fait (« Les tarifs ne sont pas disponibles »), jamais le sentiment.
- Le corps dit **ce qui est conservé** : brouillon enregistré, dossier conservé, réponses gardées sur l'appareil.
- **Aucun code technique dans un écran candidat** : pas de statut HTTP, pas de nom de service. Le back-office y a droit, parce que son lecteur agit dessus.
- Rouge `danger` pour ce qui a échoué, ambre `warning` pour ce qui est seulement différé (téléchargement hors ligne).

Langue : **français seul**, `lang="fr"` sur la racine du document. Les intitulés de documents étrangers cités dans une checklist gardent leur langue et portent leur propre `lang`.

## Règles produit à respecter

- **Aucun écran n'annonce de chances d'obtention.** C-09 parle de complétude du dossier, jamais de probabilité de succès.
- **Les frais versés à l'administration ne passent jamais par ImmiPro** et sont annoncés comme non inclus.
- **Toute donnée réglementaire affichée porte sa source et sa date de vérification.** Quand la source est injoignable, l'écran n'affiche rien plutôt qu'une valeur peut-être périmée, et le dit.
- **Aucune case de consentement n'est pré-cochée**, et le consentement pièces d'identité est séparé des autres.
- **Le simulateur ne crée pas de compte** et ne conserve les réponses que le temps de la session.

## Grille tarifaire

Alignée sur `src/domain/payments/pricing.ts`.

| Pack | XOF | EUR | Destinations | `tokensIA` |
|---|---|---|---|---|
| Découverte | gratuit | gratuit | — | — |
| Essentiel | 5 000 F | 12 € | 1 | 120 000 |
| Dossier | 15 000 F | 29 € | 1 | 400 000 |
| Dossier Pro | 45 000 F | 59 € | 3 | 1 200 000 |

- **Deux grilles natives, pas une conversion.** 12 € n'est pas la contrepartie de 5 000 F à un taux ; aucun écran n'affiche de taux de change.
- **Recharge de 10 analyses, 3 000 F / 5 €** (`MONTANT_MINIMUM_XOF`) : ce n'est pas un pack. Elle n'ouvre pas de destination, ne figure pas dans le choix de $-01, et s'achète depuis un dossier ouvert, là où le quota s'épuise (C-07).
- Le pack **Accompagné** est hors grille, en attente des habilitations consultants (lot 4).
- Le coût IA s'absorbe par `tokensIA`, pas par le prix.

## Ressources

- `public/brand/` — logo ImmiPro, variantes primaire et monochrome.
- `public/illustrations/` — douze SVG applicatifs : états vides de C-01, C-03 et C-06, erreur de C-04, hors ligne de $-06, confirmation et échec de paiement, trio de cadrage de C-07, motif de héros de P-01. Couleurs en variables CSS avec valeurs de repli.
- **Photographies manquantes** : P-05 et P-07 ont des emplacements hachurés, annotés du format et du poids attendus (AVIF ou WebP, moins de 120 Ko). P-01 n'en a plus besoin, son héros est un motif.
- `$-03` garde un anneau indéterminé ; `paiement-attente.svg` sert de repli sous `prefers-reduced-motion`.

## Ce qui reste ouvert

Les neuf reports vers le code sont réunis dans `ImmiPro Reports vers le code.dc.html`, classés par fichier (`tailwind.config.ts`, `pricing.ts`, `completeness/`, `consultants/`).

Les quatre arbitrages qui restaient — C-09, $-01, consultants, `tokensIA` — ont été rendus le 13/09/2026 et sont consignés avec leur motif dans `ImmiPro Arbitrages clos.dc.html`. Ils sont réversibles : le motif est écrit pour qu'un désaccord porte sur le raisonnement.

- **Essai lecteur d'écran** : rien n'a été entendu sur appareil réel. Le protocole en douze vérifications est écrit, et la feuille de relevé s'imprime telle quelle. Compter une heure sur un appareil milieu de gamme. C'est le seul point qui peut encore renvoyer du travail de fond.
- **`tokensIA`** : l'arbitrage est clos (valeur interne, back-office seul, jamais affichée au candidat). Ce qui reste est une donnée à réclamer : l'export du fournisseur d'inférence sur les dix premiers dossiers réels, par destination. D'ici là B-07 garde son état vide.
- **`ink.500`** à porter à `#6B6B6B` dans `tailwind.config.ts`.
- **L'échelle de tailles est close** : 13, 14, 15, 16, 19, 24, 28, 32, 44 portent la totalité des déclarations des vingt-neuf documents. Les dix-huit valeurs hors échelle ont été ramenées le 13/09/2026. À inscrire telle quelle dans `tailwind.config.ts`, pour que les autres valeurs deviennent impossibles à écrire.
- **Présentation de $-01** : clos. Trois colonnes à égalité, pack Dossier cadré et « Le plus choisi », aucun prix barré. Les deux autres variantes restent au sélecteur avec leur motif d'écart.
- **Politique consultants** (T-04, T-05) : close. Accès au dossier soumis à deux conditions cumulées — habilitation sur la destination et accord nominatif du client, révocable. Le tarif reste celui de la grille ImmiPro et l'encaissement reste chez ImmiPro ; le consultant voit les pièces et les échanges, jamais le moyen de paiement. Toute lecture s'inscrit au journal d'audit. L'écran d'accord est le 19h de « Lot P2 Transverses WF-12 ».
- **Traitement de C-09** : clos. Dénombrement des manques en tête d'écran et palier nommé (« Dossier incomplet », « Presque complet », « Complet »), aucune note sur 100. Le barème 60 / 20 / 20 peut rester interne au tri des lignes dans `src/domain/completeness/`, il ne remonte plus à l'écran ; l'API expose une liste ordonnée et un palier, pas un entier.
- **Justificatif de ressources néerlandais** : la norme IND 2026 est portée partout à 1 130,77 € par mois, soit 13 569,24 € sur douze mois. Ce montant est une preuve de fonds disponibles, pas une dépense — il n'a pas à être inférieur au coût de la première année, et l'écart avec les 6 900 000 F affichés n'est pas une incohérence.

## Fichiers

Tous les fichiers `.dc.html` de ce dossier, plus `support.js` (le runtime qui les fait tourner, à ne pas modifier), `doc-page.js` (la mise en page imprimable de la feuille de relevé) et le dossier `public/`. Ouvrir n'importe quel `.dc.html` directement dans un navigateur.
