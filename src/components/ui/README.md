# Bibliothèque de composants

Construite à partir du prototype Claude Design, **composants avant écrans**.
Références : `docs/prototype/ImmiPro Fondations.dc.html`,
`ImmiPro Bibliothèque de composants.dc.html`, `ImmiPro Parcours clavier.dc.html`.

## Produits (DOC-12 §4.1, étape 1)

| Composant | Fichier | Ce qu'il tient |
|---|---|---|
| `Button` | `ui/Button.tsx` | 5 variantes × repos, survol, focus, chargement, désactivé. `disabled` réel, hauteur 48 px, la raison du désactivé est reliée par `aria-describedby` |
| `Input`, `Select` | `ui/Input.tsx`, `ui/Select.tsx` | libellé visible toujours ; l'erreur remplace l'aide, elle ne s'y ajoute pas ; un champ désactivé garde sa valeur |
| `RadioGroup` | `ui/RadioGroup.tsx` | un seul arrêt de tabulation, flèches, Origine et Fin, `aria-checked` (règle clavier 4) |
| `useGroupeRadio`, `BasculeDeDevise` | `ui/useGroupeRadio.ts`, `ui/BasculeDeDevise.tsx` | le clavier de `RadioGroup` pour un groupe d'une autre apparence (simulateur, onglets de la rédaction) ; une seule bascule de devise pour les tarifs et le choix du pack (revue M12) |
| `EtatDEcran` | `ui/EtatDEcran.tsx` | page introuvable, échec du rendu, hors ligne : `h1#contenu`, conservé **avant** l'action, une action et une sortie. Rendu par `etats/PageIntrouvable`, `etats/EchecDeRendu` et `global-error` (revue E8) |
| `Checkbox` | `ui/Checkbox.tsx` | composant contrôlé sans `defaultChecked` : aucune case ne peut être pré-cochée (A-05) |
| `Switch` | `ui/Switch.tsx` | `role="switch"`, relié à son titre et à sa description : il s'annonce avec ce qu'il autorise, pas « activé, bouton » |
| `LienBouton` | `ui/LienBouton.tsx` | allure de bouton, sémantique de lien. Partage ses classes avec `Button` via `bouton-styles.ts`, hors frontière client |
| `Card` | `ui/Card.tsx` | rayon plafonné à `rounded-lg` |
| `ChecklistRow` | `ui/ChecklistRow.tsx` | un `button`, jamais un `div` cliquable (règle clavier 9) |
| `StatusBadge` | `ui/StatusBadge.tsx` | couleur **et** mot ; les états viennent de `DocumentState`, pas d'une liste recopiée |
| `CompletenessTier` | `ui/CompletenessTier.tsx` | remplace `ProgressBar` : palier nommé et dénombrement des manques, aucune note d'ensemble (arbitrage C-09) |
| `BottomSheet` | `ui/BottomSheet.tsx` | `role="dialog"`, piège de tabulation, Échap, retour du focus au déclencheur (règles 5 et 8) |
| `SourceNote` | `ui/SourceNote.tsx` | source et date de vérification obligatoires par le type (INV-8) |
| `SkipLink`, `Header`, `Footer` | `layout/` | « Aller au contenu » premier arrêt de chaque page (règle clavier 2) ; second saut « Aller à l'action » sur C-06 et C-09 (règle 12) |
| `LienDeNavigation` | `layout/LienDeNavigation.tsx` | `aria-current` et style actif dans toute barre de navigation ; les sections rattachées viennent de `domain/navigation/courant.ts` (règle 11, D-17) |

## Contraintes

- Jetons Tailwind uniquement : aucune couleur, aucun espacement, aucun rayon en dur.
- Aucune largeur en dur non plus (`max-w-[640px]`, `w-[340px]`…) : les largeurs
  de mise en page ont un nom dans `tailwind.config.ts` (`max-w-decision`,
  `w-panneau`, `grid-cols-revue`…), et `tests/jetons-de-mise-en-page.test.ts`
  refuse toute valeur arbitraire numérique (revue du 07/10/2026, F7).
- Un lien qui ouvre un nouvel onglet passe par `LienNouvelOnglet`, qui
  l'annonce aux lecteurs d'écran (F8, D-21).
- L'échelle de tailles est fermée à neuf crans (`text-13` … `text-44`). `text-sm`,
  `text-lg` et les autres n'existent pas.
- Cible tactile 44 px minimum, 48 px pour les boutons, 52 px pour l'action
  principale mobile.
- Une seule occurrence de la couleur d'accent par écran.
- L'anneau de focus n'est jamais supprimé — il est posé dans `globals.css`,
  pas composant par composant.
- Un test Vitest minimal par composant : rendu, état désactivé, focus.
  Ils vivent dans `tests/ui/`.
- Les classes partagées vivent dans `bouton-styles.ts`, sans `"use client"` :
  au travers de cette frontière, un composant serveur ne reçoit qu'une
  référence au module, pas ses valeurs. `tests/frontiere-client.test.ts`
  refuse qu'une constante la retraverse.

## Une action qui aboutit se dit, comme une action qui échoue

`BlocEchec` existe parce qu'un échec doit se lire là où le geste a été fait.
La réussite obéit à la même règle, et on l'a découvert en la manquant : l'écran
d'arbitrage d'une divergence fermait sa feuille sur un succès et jetait la
réponse du serveur, qui nommait pourtant les pièces ajoutées et celles qui ne
sont plus demandées.

Trois lots avaient enrichi cette réponse sans que rien ne la regarde.

La règle qui en sort : **un écran qui promet au futur rend au passé.** « Ta
checklist sera mise à jour » appelle une confirmation qui dit ce qui a
effectivement changé — surtout quand le geste n'est pas rejouable, et que le
serveur a déjà écrit la liste. La fermeture appartient alors à la personne, pas
au code.

Et la phrase de clôture vient du serveur, jamais d'une seconde copie côté
écran : deux rédactions de la même phrase finissent par diverger, et c'est
celle qui accompagne l'écriture qui fait foi.
