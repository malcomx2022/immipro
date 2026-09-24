# DOC-12 — Guide de réalisation du prototype ImmiPro

**Version 1.0 — septembre 2026**
Objet : produire dans Claude Design un prototype complet, de la page d'accueil au back-office, destiné à servir de **spécification de développement** et non de simple maquette d'illustration.
Référentiel : DOC-11 (workflows), DOC-01 (architecture), DOC-02 (charte graphique).

---

## 1. Deux arbitrages à poser avant la première maquette

### 1.1 Ce qu'on reprend d'Airbnb, et ce qu'on ne reprend pas

L'identité Airbnb est protégée. Trois éléments sont **hors de portée** et ne doivent apparaître nulle part dans le prototype :

| Élément Airbnb | Statut | Ce qu'on fait à la place |
|---|---|---|
| **Airbnb Cereal** (police propriétaire) | Licence réservée à Airbnb | Inter, Plus Jakarta Sans ou Figtree — mêmes proportions, libres |
| **Rausch `#FF5A5F`** (couleur de marque) | Marque déposée, associée à Airbnb | Accent propre à ImmiPro, voir §2.1 |
| **Le Bélo** (logo) | Marque déposée | Logo ImmiPro de DOC-02 |

En revanche, la **grammaire visuelle** d'Airbnb n'est protégée par rien et c'est précisément ce qui fait sa qualité. Ce qu'on reprend :

- fond blanc dominant, beaucoup d'air, densité d'information faible par écran ;
- une **seule** couleur d'accent saturée sur un décor neutre, utilisée avec parcimonie ;
- cartes à coins largement arrondis, ombres très douces, jamais de bordure dure ;
- typographie de titre serrée et semi-grasse, corps de texte généreux (16 px minimum) ;
- filtres et catégories en **pills** horizontales défilantes ;
- sur mobile, **bottom sheets** plutôt que modales centrées ;
- micro-interactions discrètes, transitions courtes, aucun effet gratuit.

### 1.2 La transposition structurante

Sur Airbnb, l'objet central de la page d'accueil est la barre de recherche : elle transforme un visiteur passif en visiteur qualifié en trois champs.

**L'équivalent ImmiPro est le simulateur d'éligibilité (WF-01).** C'est lui qui doit occuper le héros de la page d'accueil, pas un carrousel de destinations ni une promesse marketing. Un visiteur qui répond à six questions obtient trois destinations classées, sans compte. C'est la seule décision de design qui conditionne réellement le taux de conversion.

### 1.3 La tension à trancher : esthétique photo contre réalité réseau

Airbnb est un produit photographique, conçu pour des écrans larges et des connexions rapides. La cible ImmiPro est majoritairement sur **Android milieu de gamme, en 3G/4G, avec un forfait data compté**.

Décisions à acter avant de dessiner :

- **Mobile d'abord, réellement.** On dessine le 390 px avant le 1440 px, pas l'inverse.
- **Photographie budgétée.** Une image plein cadre par page publique au maximum, jamais dans l'espace dossier. Format AVIF/WebP, chargement différé.
- **Illustration plutôt que photo** dans les parcours applicatifs : c'est plus léger, plus cohérent, et ça évite le piège des banques d'images qui ne représentent jamais des Africains de l'Ouest de façon crédible.
- **Budget de poids par écran** : 400 Ko maximum sur les pages publiques, 200 Ko dans l'application.

---

## 2. Le système de design

À réconcilier avec DOC-02 : si la charte existe déjà, ce sont ses valeurs qui priment et cette section devient une traduction en tokens.

### 2.1 Couleurs

Structure Airbnb — neutre dominant, un accent — mais avec une teinte propre. Pour un produit qui touche à l'administratif et où la confiance prime, l'accent chaud d'Airbnb est adouci vers un registre plus institutionnel sans devenir froid.

```
Accent (actions, sélection)
  --accent-50   #EEF4FB
  --accent-100  #D7E5F5
  --accent-500  #2E75B6   ← couleur d'action principale
  --accent-600  #255F95
  --accent-700  #1F4E79   ← survol, texte sur clair

Neutres (structure)
  --ink-900     #1A1A1A   ← titres
  --ink-700     #40403F   ← corps
  --ink-500     #767676   ← secondaire
  --ink-300     #DDDDDD   ← séparateurs
  --ink-100     #F7F7F7   ← fonds de section
  --white       #FFFFFF

Sémantiques (états de dossier et de pièce)
  --success     #0F7B4F   ← CONFORME, paiement confirmé
  --warning     #B45309   ← A_CORRIGER, pièce expirante
  --danger      #B3261E   ← ILLISIBLE, échec de paiement
  --info        #2E75B6   ← alerte réglementaire
```

**Règle d'usage** : l'accent ne sert qu'aux actions et à la sélection. Un écran bien fait n'en contient qu'une ou deux occurrences. Tout le reste est neutre.

### 2.2 Typographie

```
Famille   Inter (ou Plus Jakarta Sans)
Titre 1   32 / 38   600   -0.02em
Titre 2   24 / 30   600   -0.01em
Titre 3   19 / 26   600
Corps     16 / 24   400      ← jamais en dessous
Petit     14 / 20   400
Légende   13 / 18   400   ink-500   ← sources et dates de vérification
```

La légende a un rôle fonctionnel : c'est elle qui porte « Information vérifiée le 11/09/2026 — source : ind.nl » (INV-8). Elle doit être lisible, pas décorative.

### 2.3 Espacement, rayons, élévation

```
Espacement   4 · 8 · 12 · 16 · 24 · 32 · 48 · 64
Rayons       sm 8   md 12   lg 16   pill 999
Élévation    e1  0 1px 2px rgba(0,0,0,.06)
             e2  0 6px 16px rgba(0,0,0,.08)    ← cartes
             e3  0 12px 32px rgba(0,0,0,.12)   ← bottom sheet
Cible tactile  44 px minimum
```

### 2.4 Traduction Tailwind

Le prototype ne vaut comme spécification que si ses tokens sont directement transposables. À produire en même temps que la charte :

```js
// tailwind.config.js — extrait
theme: {
  extend: {
    colors: {
      accent: { 50:'#EEF4FB',100:'#D7E5F5',500:'#2E75B6',600:'#255F95',700:'#1F4E79' },
      ink:    { 100:'#F7F7F7',300:'#DDDDDD',500:'#767676',700:'#40403F',900:'#1A1A1A' },
      success:'#0F7B4F', warning:'#B45309', danger:'#B3261E',
    },
    borderRadius: { sm:'8px', md:'12px', lg:'16px' },
    boxShadow: {
      e1:'0 1px 2px rgba(0,0,0,.06)',
      e2:'0 6px 16px rgba(0,0,0,.08)',
      e3:'0 12px 32px rgba(0,0,0,.12)',
    },
  },
}
```

---

## 3. Inventaire des écrans

39 écrans, dérivés des workflows de DOC-11. La colonne priorité correspond aux lots de mise en œuvre.

### 3.1 Public et acquisition (P0)

| # | Écran | Workflow | Points d'attention |
|---|---|---|---|
| P-01 | Accueil | WF-01 | Simulateur en héros, pas de carrousel |
| P-02 | Simulateur — étapes 1 à 6 | WF-01 | Une question par écran sur mobile, barre de progression |
| P-03 | Résultats du simulateur | WF-01 | 3 cartes destination + destinations écartées avec motif |
| P-04 | Fiche destination publique | WF-01 | Source et date de vérification visibles (INV-8) |
| P-05 | Guide pays (contenu SEO) | WF-01 | Angle « après-études » et angle « bourses » |
| P-06 | Tarifs | WF-05 | Deux grilles, XOF et EUR, bascule explicite |
| P-07 | Article de blog | — | Gabarit de contenu long |

### 3.2 Compte (P0)

| # | Écran | Workflow |
|---|---|---|
| A-01 | Inscription | WF-02 |
| A-02 | Connexion | WF-02 |
| A-03 | Vérification email | WF-02 |
| A-04 | Mot de passe oublié / réinitialisation | WF-02 |
| A-05 | Consentements détaillés | WF-02 — consentement pièces d'identité séparé |

### 3.3 Espace candidat (P0)

| # | Écran | Workflow | Points d'attention |
|---|---|---|---|
| C-01 | Tableau de bord — liste des dossiers | WF-09 | État, score, prochaine action |
| C-02 | Profil | WF-02 | Complétion progressive |
| C-03 | Comparateur de destinations | WF-03 | 3 colonnes, ligne « travail étudiant » avec mention du permis employeur |
| C-04 | Fiche destination détaillée | WF-03 | Réserves affichées en contexte |
| C-05 | Ouverture de dossier | WF-04 | Aperçu gratuit de la checklist |
| C-06 | Dossier — checklist | WF-06 | Écran le plus vu du produit |
| C-07 | Pièce — téléversement | WF-06 | Conseils de prise de vue |
| C-08 | Pièce — résultat d'analyse | WF-06 | Message actionnable, jamais « non conforme » |
| C-09 | Score de complétude | WF-07 | Libellé « complétude », jamais « chances » |
| C-10 | Échéancier | WF-09 | Calendrier à rebours |
| C-11a | Déclaration de dépôt | WF-10 | Déclaré, jamais transmis ; conservation annoncée (S.78) |
| C-11 | Clôture et déclaration d'issue | WF-10 | Purge annoncée comme une garantie |

### 3.4 Rédaction assistée (P1)

| # | Écran | Workflow |
|---|---|---|
| R-01 | Choix du type de pièce | WF-08 |
| R-02 | Entretien guidé | WF-08 |
| R-03 | Éditeur et versions | WF-08 |
| R-04 | Analyse critique et incohérences croisées | WF-08 |

### 3.5 Paiement (P0 — le plus critique)

| # | Écran | Workflow | Points d'attention |
|---|---|---|---|
| $-01 | Choix du pack | WF-05 | Devise déduite du pays, bascule possible |
| $-02 | Récapitulatif avant paiement | WF-05 | Montant en XOF en gros, équivalent EUR en petit |
| $-03 | **Attente Mobile Money** | WF-05 | Polling 3 s, timeout 5 min, « confirme sur ton téléphone » |
| $-04 | Paiement confirmé | WF-05 | |
| $-05 | Paiement échoué / expiré | WF-05 | Bouton réessayer, proposition du pack inférieur |
| $-06 | Reçu | WF-05 | |

L'écran $-03 est celui qui décide du taux de conversion réel. Trente à cent vingt secondes d'attente, sur un produit qu'on vient de découvrir, avec un code PIN à saisir : tout doit rassurer. Il mérite trois à quatre itérations à lui seul.

### 3.6 Transverses (P1)

| # | Écran | Workflow |
|---|---|---|
| T-01 | Centre de notifications | WF-11 |
| T-02 | Alerte de divergence réglementaire | WF-11 — écran d'arbitrage migrer / conserver |
| T-03 | Proposition partenaire contextuelle | WF-13 |
| T-04 | Annuaire consultants | WF-12 (P2) |
| T-05 | Prise de rendez-vous | WF-12 (P2) |

### 3.7 Back-office (P2)

| # | Écran | Workflow |
|---|---|---|
| B-01 | File de veille réglementaire | WF-14 — requête des fiches à relire |
| B-02 | Édition d'une règle versionnée | WF-14 — comparaison N / N+1 |
| B-03 | Utilisateurs | WF-15 |
| B-04 | Paiements et réconciliation | WF-15 |
| B-05 | Revue manuelle des pièces en échec | WF-15 |
| B-06 | Journal d'audit | WF-15 |
| B-07 | Supervision des coûts IA | WF-16 |

### 3.8 États — la partie qu'on oublie toujours

Un prototype qui ne montre que le cas nominal ne sert pas de spécification. Pour chaque écran de la section C et de la section $, produire :

- **vide** (aucun dossier, aucune pièce) ;
- **chargement** (squelettes, pas de spinner plein écran) ;
- **erreur** (réseau coupé — cas fréquent sur la cible) ;
- **quota épuisé** (WF-06, RG-06.5) ;
- **hors ligne** (l'utilisateur a saisi des données, la connexion est tombée).

C'est environ 25 écrans supplémentaires. C'est aussi ce qui fait la différence entre une maquette et une spécification.

---

## 4. Méthode de travail dans Claude Design

### 4.1 Ordre de construction

Ne jamais commencer par un écran. L'ordre qui évite de tout refaire trois fois :

1. **Fondations** — palette, typographie, espacement, rayons, élévations. Un seul document.
2. **Composants** — bouton (5 variantes × 4 états), champ de saisie, carte destination, ligne de checklist, pastille d'état, barre de progression, bottom sheet, en-tête, pied de page, bandeau de source.
3. **Trois écrans pivots** — P-01 accueil, C-06 checklist, $-03 attente Mobile Money. Ces trois-là fixent le langage : un écran d'acquisition, un écran d'application dense, un écran d'état transitoire. Tout le reste en découle.
4. **Parcours complets**, un lot à la fois, dans l'ordre P0 → P1 → P2.
5. **États** de chaque écran produit.
6. **Passage au 1440 px** — seulement une fois le mobile figé.

### 4.2 Découpage des conversations

Une conversation Claude Design par lot, jamais tout dans la même. Au-delà d'une quinzaine d'écrans, le contexte se dilue et la cohérence dérive.

Commencer **chaque** nouvelle conversation en recollant le bloc de tokens de la §2. C'est la seule façon de garantir que le lot 4 ressemble au lot 1.

### 4.3 Gabarit de prompt

Un prompt qui produit un écran exploitable contient toujours ces six blocs :

```
CONTEXTE     ImmiPro, plateforme d'accompagnement à l'immigration.
             Utilisateur : candidat béninois, mobile Android, 4G.
ÉCRAN        [code et nom de l'inventaire]
OBJECTIF     Ce que l'utilisateur doit pouvoir faire sur cet écran.
CONTENU      Les éléments réels, avec le texte français définitif.
CONTRAINTES  Tokens (collés), 390 px de large, cible tactile 44 px,
             une seule occurrence d'accent.
INTERDITS    Les règles de DOC-11 qui s'appliquent à cet écran.
```

Le bloc INTERDITS est celui qui évite les reprises coûteuses. Exemple pour C-09 : « ne jamais afficher de pourcentage de chances d'obtention, le libellé est "complétude de votre dossier" ».

### 4.4 Prompts prêts à l'emploi

**Fondations**

> Crée la page de fondations du design system ImmiPro : nuancier complet (accent, neutres, sémantiques) avec les valeurs hexadécimales et le nom du token sous chaque pastille, échelle typographique Inter avec un exemple de rendu par niveau, échelle d'espacement, rayons, trois niveaux d'élévation. Registre visuel : blanc dominant, beaucoup d'air, coins arrondis, ombres très douces. Présentation sur une seule page, sobre, sans décoration.

**Accueil (P-01)**

> Écran d'accueil ImmiPro, mobile 390 px. L'élément central est un simulateur d'éligibilité en carte flottante sur un fond photographique unique : titre « Où pouvez-vous étudier ou travailler ? », trois champs repliés (objectif, plus haut diplôme, budget), bouton d'accent « Voir mes destinations ». Sous le pli : trois cartes de destinations populaires avec drapeau, coût annuel, durée de la fenêtre post-diplôme ; une bande de réassurance en trois points ; pied de page riche. Tokens : [coller]. Une seule occurrence de la couleur d'accent. Texte définitif en français, pas de faux texte.

**Checklist (C-06)**

> Écran de dossier ImmiPro, mobile 390 px. En-tête : destination (Pays-Bas — séjour études), pastille d'état ACTIF, score de complétude 68 sur 100 en barre de progression avec le libellé « complétude de votre dossier ». Corps : liste de 8 pièces groupées en Obligatoires / Complémentaires. Chaque ligne : icône de type, nom, pastille d'état (Conforme, À corriger, Attendue, Expirée), et pour « À corriger » un message actionnable en dessous — « votre passeport expire 4 mois après la date de retour prévue, il en faut 6 ». Barre d'action basse : « Continuer ». Tokens : [coller]. Interdit : toute mention de chances de succès ou de probabilité.

**Attente Mobile Money ($-03)**

> Écran d'attente de paiement Mobile Money, mobile 390 px. Illustration animée légère au centre, titre « Confirme le paiement sur ton téléphone », sous-titre « Saisis ton code PIN MTN MoMo pour valider 15 000 F ». Indicateur de progression circulaire indéterminé, compte à rebours de 5 minutes, rappel des trois étapes (notification reçue, code PIN saisi, confirmation), lien discret « Je n'ai rien reçu » et bouton secondaire « Réessayer » apparaissant après 90 secondes. Ton rassurant et tutoiement. Aucun élément qui laisse croire que la page s'est bloquée.

**File de veille (B-01)**

> Écran back-office ImmiPro, desktop 1440 px. Tableau des fiches réglementaires à relire : pays, type de visa, niveau de source (badge Officiel / Institutionnel / Secondaire), date de dernière vérification, date de prochaine relecture, statut (Publié / Brouillon / Archivé). Filtres en pills au-dessus, tri par échéance, les fiches en retard signalées en rouge. Panneau latéral de comparaison N / N+1 sur sélection. Densité d'information élevée, registre outil interne, mêmes tokens.

### 4.5 Itérer efficacement

- Une demande de modification à la fois, formulée par l'intention et non par la solution : « le score n'est pas assez lisible sur petit écran » vaut mieux que « agrandis la police à 28 px ».
- Corriger un composant à la source, jamais écran par écran.
- Conserver les versions rejetées et la raison du rejet : elles documentent les décisions de design autant que les versions retenues.

---

## 5. Critères d'acceptation du prototype comme spécification

Le prototype n'est recevable pour le développement que si **tous** ces points sont vrais :

| # | Critère |
|---|---|
| 1 | Chaque token porte un nom identique à celui de la configuration Tailwind |
| 2 | Aucune valeur de couleur, d'espacement ou de rayon en dur hors de la palette |
| 3 | Chaque composant existe avec toutes ses variantes et tous ses états, y compris désactivé et focus clavier |
| 4 | Chaque écran des sections C et $ existe en versions vide, chargement, erreur |
| 5 | Tous les textes sont définitifs, en français, tutoiement cohérent — aucun faux texte |
| 6 | Les mentions de non-responsabilité contextuelles apparaissent sur les écrans concernés, pas ajoutées après coup |
| 7 | Les écrans existent en 390 px et en 1440 px |
| 8 | Le contraste atteint le niveau AA sur tous les textes |
| 9 | Aucune cible tactile inférieure à 44 px |
| 10 | Chaque écran renvoie au workflow et aux règles de gestion de DOC-11 qu'il implémente |

Le critère 5 n'est pas cosmétique. Dans un produit administratif, **la formulation est le produit**. « Document non conforme » et « votre passeport expire 4 mois après la date de retour prévue, il en faut 6 » décrivent le même état technique et produisent deux expériences opposées. Si la rédaction est repoussée au développement, elle sera écrite par défaut, et mal.

---

## 6. Du prototype au développement

1. **Export des tokens** vers `tailwind.config.js` — fait une fois, source unique de vérité.
2. **Composants avant écrans** : construire la bibliothèque React à partir de la section Composants, pas en découpant les écrans.
3. **Un écran de prototype = un ticket** portant le code de l'inventaire, le workflow de rattachement et ses règles de gestion.
4. **Prototype cliquable déployé** : Claude Design peut être importé vers Vercel ou Netlify. Utile pour les interviews clients de WF-01 — tester le simulateur et le prix face à la concurrence sur un lien réel plutôt que sur des images.
5. **Le prototype reste la référence** : toute divergence constatée en développement se tranche dans le prototype d'abord, jamais dans le code.

---

## 7. Séquencement proposé

| Étape | Contenu | Résultat attendu |
|---|---|---|
| 1 | Fondations et composants | Bibliothèque cohérente, tokens figés |
| 2 | Trois écrans pivots | Langage visuel validé |
| 3 | Lot P0 — public, compte, dossier, paiement | Parcours complet du visiteur au dossier payé |
| 4 | États du lot P0 | Spécification exploitable |
| 5 | Lot P1 — rédaction, transverses | |
| 6 | Lot P2 — back-office | |
| 7 | Version 1440 px | |
| 8 | Revue contre les 10 critères | Prototype recevable comme spécification |

Ne pas lancer l'étape 3 avant que les trois écrans pivots soient validés. C'est le seul point de contrôle qui évite de redessiner quarante écrans.
