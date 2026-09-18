# Démarrer le codage à partir du prototype

Dépôt : `malcomx2022/immipro` (Next.js 15, App Router, Tailwind 3, Prisma, Vitest). État au 18/09/2026 : `src/app` contient un layout, la page P-01 en squelette et une route `api/health`. `src/components/ui` est vide (README seul). Tout le reste est à produire à partir du prototype.

## 1. Où mettre le prototype dans le dépôt

```
docs/
  prototype/                     ← ce dossier, copié tel quel
    README.md                    ← lecture obligatoire (jetons, gabarits, règles clavier, doctrine d'erreur)
    GETTING-STARTED.md           ← ce fichier
    ImmiPro *.dc.html            ← 32 documents, s'ouvrent dans un navigateur
    support.js, doc-page.js      ← runtime du prototype, ne pas modifier
    public/brand/, public/illustrations/
  prototype/exports/             ← exports autonomes (un fichier par lot), lisibles hors ligne
```

Le prototype est une référence, pas du code applicatif : rien de `docs/prototype/` n'est importé par `src/`. Seule exception : `public/illustrations/*.svg` est à copier dans `public/illustrations/` du dépôt — les écrans C-01, C-03, C-04, C-06, C-07, $-04, $-05, $-06 et P-01 les chargent.

Ouvrir un document : `npx serve docs/prototype` puis ouvrir le `.dc.html` voulu (le `file://` direct fonctionne aussi dans Chrome).

## 2. Ordre des opérations

### Étape 0 — déposer `code_patches/` (une demi-journée)

Sept fichiers, chemins dans `code_patches/README.md`. Puis :

```
npm run check
```

Deux changements cassants à traiter : `CompletenessResult.score` n'existe plus à la racine (passer par `palier` + `compteurs` côté candidat, `interne.score` côté back-office) ; `fontSize` Tailwind est fermé à neuf tailles (`text-13` … `text-44`), les classes `text-sm`, `text-lg`, etc. disparaissent.

### Étape 1 — jetons et composants (avant tout écran)

Source : `ImmiPro Fondations.dc.html`, `ImmiPro Bibliothèque de composants.dc.html`, `ImmiPro Parcours clavier.dc.html`.

Ordre de `src/components/ui/README.md`, avec la correspondance prototype :

| Composant | Dans la Bibliothèque | Règle à tenir |
|---|---|---|
| `Button` | Boutons — primaire, secondaire, tertiaire, destructif, lien ; repos, focus, désactivé, chargement | `disabled` réel (pas `aria-disabled` seul), hauteur 44 px, anneau de focus 2 px |
| `Input`, `Select`, `RadioGroup` | Champs et Sélection | libellé visible toujours, erreur sous le champ en constat + action |
| `Card` | Blocs — carte destination | pas de rayon > `rounded-lg` |
| `ChecklistRow` | Blocs — ligne de pièce | c'est un `<button>`, pas un `<div onClick>` (règle clavier 5) |
| `StatusBadge` | Pastilles — Conforme / À corriger / Attendue / Expirée / Déjà conforme | couleur + texte, jamais couleur seule |
| `CompletenessTier` (remplace `ProgressBar`) | C-09 dans `Lot P0 Dossier 2` | palier nommé + trois compteurs. Aucun score, aucun % (arbitrage C-09, test `copy-forbidden`) |
| `BottomSheet` | P-01 dans `Écrans pivots` | `role="dialog"`, piège de tabulation, Échap, retour du focus au déclencheur (règles 3–4) |
| `SourceNote` | présent sur P-03, P-04, C-04, T-02 | INV-8 : source + date, jamais omis |
| `Header`, `Footer`, `SkipLink` | gabarits dans `Fondations` | « Aller au contenu » premier arrêt de tabulation de chaque page (règle 2) |

Chaque composant a un test Vitest minimal : rendu, état désactivé, focus.

### Étape 2 — écrans, par lot

Coder un lot = lire les deux documents (390 px et 1440 px), les `États` associés, puis produire route + page + états. Le 390 px fait foi pour les textes et les règles ; le 1440 px pour la mise en page desktop.

| Lot | Écrans | Documents 390 px | Documents 1440 px | États | Routes suggérées (`src/app`) |
|---|---|---|---|---|---|
| P0 Public | P-01 à P-07 | `Écrans pivots` (P-01), `Lot P0 Public` | `Desktop 1440` (P-01), `Desktop 1440 Public` | `États Lot P0` | `(public)/page.tsx`, `(public)/simulateur`, `(public)/resultats`, `(public)/destinations/[slug]`, `(public)/guides/[pays]`, `(public)/tarifs`, `(public)/articles/[slug]` |
| P0 Comptes | A-01 à A-05 | `Lot P0 Comptes` | `Desktop 1440 Comptes` | `États Lot P0` | `(auth)/inscription`, `(auth)/connexion`, `(auth)/verification`, `(auth)/mot-de-passe`, `(auth)/consentements` |
| P0 Paiement | $-01 à $-06 | `Lot P0 Paiement`, `Écrans pivots` ($-03) | `Desktop 1440 Paiement`, `Desktop 1440` ($-03) | `États Lot P0 suite` | `(app)/paiement/pack`, `/recapitulatif`, `/attente`, `/confirme`, `/echec`, `/recu/[id]` |
| P0 Dossier 1 | C-01 à C-05 | `Lot P0 Dossier 1` | `Desktop 1440 Dossier` | `États Lot P0`, `États Lot P0 suite` | `(app)/tableau-de-bord`, `(app)/profil`, `(app)/comparateur`, `(app)/destinations/[slug]`, `(app)/dossiers/nouveau` |
| P0 Dossier 2 | C-06 à C-11 | `Écrans pivots` (C-06, C-09), `Lot P0 Dossier 2` | `Desktop 1440` (C-06), `Desktop 1440 Dossier 2` | `États Lot P0 suite` | `(app)/dossiers/[id]` (checklist), `/pieces/[pieceId]` (C-07, C-08), `/completude`, `/echeancier`, `/cloture` |
| P1 | R-01 à R-04, T-01 à T-03 | `Lot P1` | `Desktop 1440 Rédaction et transverses` | — | `(app)/dossiers/[id]/redaction/…`, `(app)/notifications`, T-02 et T-03 sont des surfaces modales, pas des routes |
| P2 WF-12 | T-04, T-05 | `Lot P2 Transverses WF-12` | `Desktop 1440 Transverses WF-12` | inclus dans le document | `(app)/consultants`, `(app)/consultants/[id]/rendez-vous` |
| P2 Back-office | B-01 à B-07 | — (desktop seul) | `Lot P2 Backoffice 1`, `Lot P2 Backoffice 2` | `États Lot P2 Backoffice` | `(admin)/veille`, `(admin)/regles/[id]`, `(admin)/utilisateurs`, `(admin)/paiements`, `(admin)/revue`, `(admin)/journal`, `(admin)/couts-ia` |

Le segment `(admin)` est celui que `tests/copy-forbidden.test.ts` suppose ; si un autre nom est retenu, adapter le filtre du test.

### Étape 3 — écrans à logique réelle

Ces écrans ont un état dans la classe `Component` du document (`<script data-dc-script>` en bas du fichier). Lire ce code : il contient les transitions, les délais et les libellés par état.

- P-02 simulateur : six questions, focus au titre à chaque étape
- $-01 : pack + devise, alimente $-02
- $-03 : décompte 5 min, relève toutes les 3 s, « Réessayer » à 90 s, `aria-live` sur le statut seul
- $-05 : deux motifs (délai, solde)
- C-07 : quatre états (prêt, envoi, quota épuisé, réseau coupé)
- B-01, B-05 : `role="listbox"` à tabindex mobile, flèches, Origine/Fin
- T-04 : case d'accord non pré-cochée qui débloque le bouton

## 3. Comment lire un écran du prototype

1. Ouvrir le `.dc.html`, repérer le cadre `data-screen-label="X-NN"`.
2. Les styles sont inline : chaque valeur (`color`, `font-size`, `padding`, `border-radius`) correspond à un jeton de `tailwind.config.ts`. Ne jamais recopier le hex ; retrouver la classe (`#6B6B6B` → `text-ink-500`, `16px` → `text-16`, etc.). La table de correspondance est dans `Fondations`.
3. Les attributs `role`, `aria-*`, `tabindex` du prototype sont à reprendre tels quels — ils ont été vérifiés.
4. Les textes sont définitifs, en français, relus contre `Langue des messages d'erreur`. Pas de reformulation.
5. Les états chargement / vide / erreur / hors ligne se codent avec l'écran (case PR « états traités »), pas après.

## 4. Vérifications par PR

- `npm run check` (lint, typecheck, test, check:copy)
- Règle DOC-11 citée dans la description
- Tabulation complète de l'écran au clavier, sans souris : ordre d'arrêts identique à `Parcours clavier`
- Aucun texte < 13 px, aucun hex hors jetons
- Comparaison à l'œil avec le cadre 390 px et le cadre 1440 px du prototype

## 5. Ce que le prototype ne couvre pas

- Schéma Prisma et migrations : à dériver de `docs/DOC-11-workflows.md` et de `src/domain/rules/schema.ts`, le prototype ne modélise pas la donnée.
- Intégrations Mobile Money / Stripe : $-03 montre l'attente et les délais côté interface ; le webhook est INV-7.
- Emails transactionnels (A-03, $-04, T-05) : non prototypés.
- Essai TalkBack sur appareil réel : protocole et feuille de relevé dans ce dossier, une heure.
