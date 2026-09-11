# Bibliothèque de composants

Construite à partir du prototype Claude Design, **composants avant écrans**.

Ordre de production (DOC-12 §4.1) :

1. `Button` — 5 variantes × 4 états
2. `Input`, `Select`, `RadioGroup`
3. `Card` — carte destination
4. `ChecklistRow` — ligne de pièce avec pastille d'état
5. `StatusBadge` — Conforme / À corriger / Attendue / Expirée
6. `ProgressBar` — complétude du dossier
7. `BottomSheet` — modale mobile
8. `SourceNote` — « Information vérifiée le … — source : … » (INV-8)
9. `Header`, `Footer`

Contraintes : tokens Tailwind uniquement, cible tactile 44 px minimum,
une seule occurrence de la couleur d'accent par écran.
