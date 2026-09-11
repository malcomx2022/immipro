# ImmiPro — Guide d'usage de la marque

**Version 1.0 — septembre 2026**

---

## 1. Le signe

Le signe ImmiPro est **un chemin jalonné** : un point d'origine ouvert, une trajectoire qui s'élève, un point de destination plein.

- Le **point ouvert** est le départ : une situation, un projet encore à construire.
- La **trajectoire** part presque à plat avant de s'élever. La progression est réelle mais elle demande un parcours, pas un saut.
- Le **point plein** est la destination atteinte.

Ce choix écarte délibérément la coche, trop utilisée et trop proche d'une promesse de résultat, ce que la plateforme ne peut pas faire (INV-2). Le signe décrit un **parcours accompagné**, pas une garantie.

Le signe fonctionne seul dès que la marque est connue : icône applicative, favicon, avatar, filigrane.

---

## 2. Le logotype

**Inter SemiBold**, approche resserrée de −0,5 %, sans modification des lettres.

« Immi » en `accent-700`, « Pro » en `accent-500`. Le contraste marque la double nature du produit : l'immigration, et la rigueur professionnelle de la préparation du dossier.

Le logotype n'est **jamais recomposé à la main**. Il n'existe que sous forme vectorielle, lettres converties en tracés — aucune police n'est requise pour l'afficher.

---

## 3. Déclinaisons

| Fichier | Usage |
|---|---|
| `immipro-logo-primary` | Usage par défaut, fonds clairs |
| `immipro-logo-mono-white` | Fonds accent, photos sombres |
| `immipro-logo-mono-dark` | Impression noir et blanc, télécopie, tampon |
| `immipro-logo-mono-accent` | Aplats monochromes, sérigraphie une couleur |
| `immipro-logo-vertical` | Formats étroits, en-têtes centrés, goodies |
| `immipro-mark` | Signe seul — application, favicon, avatar |
| `immipro-app-icon` | Icône iOS et Android, fond accent |
| `immipro-app-icon-light` | Variante fond clair, contextes où l'accent domine déjà |
| `favicon.svg` | Onglet navigateur — tracé épaissi, voir §6 |

---

## 4. Couleurs

| Token | Valeur | Rôle |
|---|---|---|
| `accent-500` | `#2E75B6` | Signe, « Pro », fond d'icône |
| `accent-700` | `#1F4E79` | « Immi » |
| `ink-900` | `#1A1A1A` | Version monochrome sombre |
| `white` | `#FFFFFF` | Version en réserve |

Ces valeurs sont celles du design system (DOC-12). Le logo n'introduit aucune couleur qui lui soit propre : c'est ce qui garantit qu'il ne jurera jamais avec l'interface.

---

## 5. Zone de protection

La zone de protection vaut **la hauteur du point de destination** sur les quatre côtés — soit environ 28 % de la hauteur du signe.

Aucun texte, aucun filet, aucun bord de page ne pénètre cette zone. Sur une photographie, augmenter la zone de moitié.

---

## 6. Tailles minimales

| Support | Minimum | Version à utiliser |
|---|---|---|
| Écran, logo complet | 120 px de large | `immipro-logo-primary` |
| Écran, signe seul | 32 px | `immipro-mark` |
| Écran, sous 32 px | — | `favicon.svg` (tracé épaissi, sur pastille) |
| Impression, logo complet | 28 mm de large | vectoriel |
| Impression, signe seul | 8 mm | vectoriel |

Sous 32 px, le creux du point d'origine se referme et le signe se brouille. C'est pourquoi le favicon est une version distincte, au tracé épaissi de 22 % et posée sur une pastille pleine — jamais une simple réduction du signe.

---

## 7. Ce qu'on ne fait pas

- Ne pas recolorer le signe en dehors des couleurs du système.
- Ne pas appliquer de dégradé, d'ombre portée, de contour ou de relief.
- Ne pas déformer, incliner, faire pivoter ni étirer.
- Ne pas recomposer le logotype avec une autre police, ni modifier l'approche.
- Ne pas intervertir les couleurs de « Immi » et « Pro ».
- Ne pas inscrire le logo complet dans une pastille : seul le signe y est admis.
- Ne pas placer le logo couleur sur un fond dont le contraste est insuffisant — passer à la version en réserve.
- Ne pas ajouter de baseline permanente accolée au logo. La signature est un élément de communication, pas un composant de la marque.

---

## 8. Intégration web

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:image" content="https://immipro.example/og-image-1200x630.png">
```

Servir le logo en SVG partout où c'est possible : le fichier pèse moins de 4 Ko, reste net à toutes les densités et n'ajoute aucune requête d'image lourde — un point qui compte sur la cible mobile du produit.

---

## 9. Contenu du package

```
immipro-logo/
├── svg/              12 fichiers vectoriels, lettres en tracés
├── png/              logos et icônes, fond transparent
├── favicon/          favicon.svg, .ico multi-résolutions, apple-touch-icon
├── social/           avatar 512, bannières Open Graph claire et accent
├── planche-de-controle.png
└── BRAND.md
```

Tous les SVG sont autonomes : aucune police à installer, aucun lien externe, aucune dépendance.

---

## 10. Points ouverts

1. **Dépôt de marque.** Avant l'immatriculation de la SAS, vérifier la disponibilité de « ImmiPro » à l'INPI et à l'EUIPO en classes 42 et 45, ainsi que la disponibilité du nom de domaine.
2. **Licence Inter.** Inter est sous licence SIL Open Font, libre d'usage commercial, y compris pour un logo. Les lettres étant converties en tracés, aucune redistribution de la police n'a lieu.
3. **Déclinaison d'usage sombre.** À produire quand le mode sombre de l'application sera arbitré.
