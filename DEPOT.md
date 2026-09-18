# Dépôt dans immipro

Décompresser cette archive à la racine d'un clone de `malcomx2022/immipro` (branche `main`). Elle est organisée selon l'arborescence du dépôt :

```
docs/prototype/            prototype complet (32 documents, runtime, GETTING-STARTED.md, CODE-PATCHES.md)
docs/prototype/exports/    exports autonomes, un fichier par lot
public/illustrations/      12 SVG chargés par les écrans
src/domain/…               pricing.ts, completeness/score.ts, consultants/access.ts
tests/                     completeness, consultants, copy-forbidden
tailwind.config.ts         ink.500, échelle de neuf tailles, mono
```

Fichiers remplacés : `tailwind.config.ts`, `src/domain/payments/pricing.ts`, `src/domain/completeness/score.ts`, `tests/completeness.test.ts`. Tous les autres sont nouveaux.

```bash
unzip -o repo_drop.zip -d .
rm DEPOT.md
npm run check
git checkout -b chore/prototype-et-reports
git add -A
git commit -m "Prototype dans docs/prototype et reports vers le code (arbitrages du 13/09)"
git push -u origin chore/prototype-et-reports
```

Ensuite : `docs/prototype/GETTING-STARTED.md`.
