# Schéma de données

Dérivé de `docs/DOC-11-workflows.md` et des 48 écrans de DOC-12. Ce fichier
note les choix qui ne se lisent pas dans `schema.prisma`.

## Ce que la base tient, et que le code ne tient pas seul

DOC-11 appelle certaines règles des « garde-fous applicatifs, pas des
consignes humaines ». Une règle de ce genre écrite uniquement dans un service
protège ce service — pas un import, pas un worker écrit six mois plus tard,
pas une correction à la main un soir d'incident.

`migrations/20260918000100_garde_fous` les écrit en contraintes `CHECK`.
Treize écritures sont refusées par la base, et `npm run db:garde-fous` le
vérifie sur n'importe quelle instance : chaque essai doit être refusé, et le
script nomme celui qui passerait.

| Invariant | Ce qui devient impossible |
|---|---|
| INV-3 | Un dossier au-delà du brouillon sans version de règle figée |
| INV-4 / RG-14.2 | Publier une règle de source `SECONDAIRE` |
| INV-5 | Une version « purgée » qui garde sa clé d'objet |
| INV-6 | Une écriture de quota à zéro, ou une analyse qui crédite |
| INV-8 | Une règle sans source ni vérificateur |
| RG-06.2 | Deux versions de même empreinte sur une même pièce |
| RG-06.3 | Une revue manuelle décidée sans message au candidat |
| RG-07.2 | `PRET` sans date de passage, ou l'inverse |
| RG-12.2 | Un partage de dossier sans échéance postérieure à l'accord |
| RG-15.1 | Une écriture d'audit sans motif |
| RG-10.4 | Un compte anonymisé qui garde un nom, un téléphone ou une empreinte |
| RG-13.1 | Une proposition de partenaire sans étape de checklist ni motif |
| RG-13.3 | Un taux de commission hors bornes |
| RG-13.4 | Une activation de partenaire sans vérification nommée |
| WF-13 | Une commission inscrite avant l'aboutissement, ou un aboutissement sans redirection |

## Trois choix de modélisation

**Le quota est un grand livre, pas un solde.** `AnalysisCredit` enregistre
des écritures signées : l'achat crédite, l'analyse débite, la revue manuelle
rend. Un solde stocké se désynchronise du jour où une écriture échoue à
mi-chemin ; une somme se recompte. C'est aussi la seule forme qui rend un
recréditement traçable — « 2 analyses rendues après pièces illisibles » est
une ligne, pas une soustraction silencieuse.

**Les versions de pièce portent fichier ou texte.** Une pièce téléversée et
une pièce rédigée sont la même ligne de checklist ; les séparer obligerait
chaque écran à savoir laquelle lire. `DocumentVersion` a donc `objectKey` ou
`body`, et une contrainte interdit les deux nuls.

**`Application.internalScore` porte son périmètre dans son nom.** Le barème
de WF-07 reste calculé et stocké — le back-office en a besoin. Mais
`completeness` se copiait dans une réponse d'API sans qu'on y pense ;
`internalScore` demande un instant de réflexion. Le candidat voit un palier
et un dénombrement (arbitrage C-09), jamais ce nombre.

**Le compte survit à sa suppression, vidé.** `Transaction.userId` ne tombe
pas en cascade — un reçu doit survivre au compte, et C-11 l'annonce au
candidat avant qu'il clôture. RG-10.4 demande donc d'**anonymiser** les
métadonnées, pas de les effacer : `deletedAt` marque la ligne, et deux
contraintes refusent la demi-mesure, une anonymisation sans demande et une
anonymisation qui garderait le nom. `deletionRequestedAt` nomme l'état
intermédiaire — les pièces parties, le compte pas encore vidé — parce que
la purge dépend d'un stockage objet qui peut être indisponible.

**L'affiliation n'est activée nulle part par défaut.** `Partner` ne se
propose que sur une destination où `PartnerActivation` atteste une
vérification : RG-13.4 encadre voire prohibe la rétro-commission selon les
pays, et le modèle refuse l'inverse — une activation mondiale restreinte
ensuite. `PartnerReferral` porte l'étape qui motive la proposition
(RG-13.1) et recopie le taux au moment où elle est faite : le taux annoncé
ce jour-là est celui qui sera facturé, même si la grille change après.

## Ce qui n'est pas là, et pourquoi

- **Aucune table de coûts IA agrégés.** B-07 est livré en état vide :
  `AiUsage` enregistre les appels, et les agrégats se calculent. Une table de
  totaux avant la première mesure figerait des hypothèses en données.
- **Aucun champ de « chances » ni de pronostic**, à aucun niveau (INV-1).
- **Aucune table d'export de données.** « Télécharger mes données » et le
  bouton d'archive de C-11 mènent à des adresses qui n'existent pas. Le
  portage RGPD est un écran à part entière, pas une colonne.
- **Aucune duplication du référentiel dans le dossier** : `Application`
  pointe la version de règle, elle ne la recopie pas. C'est ce qui permet à
  T-02 de comparer N et N+1 sans reconstituer l'ancienne.

## Travailler dessus

```sh
npm run db:migrate          # nouvelle migration en développement
npm run db:deploy           # appliquer les migrations existantes
npm run seed:rules          # référentiel de départ
npm run db:garde-fous       # vérifier que les contraintes refusent bien
```

`tests/schema-domaine.test.ts` compare les enums du schéma aux unions du
domaine, sans base ni client généré. Les deux vocabulaires sont écrits deux
fois ; ce test échoue le jour où l'un bouge sans l'autre.
