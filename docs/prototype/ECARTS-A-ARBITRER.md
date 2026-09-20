# Écarts du prototype à arbitrer

Relevé le 18/09/2026, sur les trente-trois documents de `docs/prototype/`.

Le prototype est daté du 11/09/2026. Quatre arbitrages ont été rendus le
13/09 et consignés dans `ImmiPro Arbitrages clos.dc.html`, et neuf reports
vers le code dans `ImmiPro Reports vers le code.dc.html`. **Les écrans n'ont
pas été repassés après ces décisions** : plusieurs portent encore la copie
d'avant. Ce document les réunit une fois pour toutes, plutôt que de les
retrouver lot par lot.

Chaque entrée dit où est le texte, ce que l'arbitrage a décidé, et ce qui
reste à trancher. **Rien n'est corrigé ici** : le prototype est une référence
de design, sa mise à jour appartient à qui l'a écrit.

---

## A · La note de complétude, écartée le 13/09

> « Traitement de C-09 : clos. Dénombrement des manques en tête d'écran et
> palier nommé, aucune note sur 100. […] l'API expose une liste ordonnée et
> un palier, pas un entier. »
> — `Arbitrages clos`, report n° 7

La décision porte sur l'API, donc sur **tous** les écrans, pas sur le seul
C-09 : un écran ne peut plus afficher un entier que rien ne calcule.

| Écran | Document | Texte encore en place |
|---|---|---|
| C-01 | `Desktop 1440 Dossier` | « 68 % » en 32 px, barre de progression, puis « Ce score mesure ce qui manque à votre dossier, pas vos chances d'obtenir le visa. » |
| C-02 | `Desktop 1440 Dossier` | « Profil complété à 80 % » et son surtitre « WF-02 · 80 % complété » |
| C-02 | `États Lot P0` | « 80 % » et sa barre |
| C-06 | `Écrans pivots` | en-tête « Complétude de votre dossier » / « 68 / 100 » et sa barre |
| C-06 | `Desktop 1440` | colonne des dossiers : « 68 / 100 · actif », « 12 / 100 · brouillon » ; et « Ce score mesure … pas vos chances d'obtenir le visa. » |
| C-06 | `États Lot P0`, hors ligne | « La version enregistrée sur ton téléphone montre 68 sur 100 et sept pièces sur huit. » |
| C-09 | `Lot P0 Dossier 2` | « Ce qui manque au dossier, pas tes chances d'obtenir le visa. » |
| C-09 | `Desktop 1440 Dossier 2` | « Ce qui manque à votre dossier, pas vos chances d'obtenir le visa. » |
| T-01 | `Lot P1`, `Desktop 1440 Rédaction et transverses` | notification : « Complétude passée de 58 à 68 sur 100. » |
| T-05 | `Lot P2 Transverses WF-12` | « Ta checklist est à 80 % : les deux pièces à reprendre sont … » |

Deux autres ont déjà été repris **dans le code**, sans toucher au prototype :

- P-06, `Lot P0 Public` : « Score de complétude et prochaine action » →
  « Complétude du dossier et prochaine action ».
- A-02, `Lot P0 Comptes` : « Ton dossier Pays-Bas t'attend à 68 sur 100. » →
  « Ton dossier t'attend là où tu l'as laissé. » L'écran est de toute façon
  antérieur à l'authentification et ne connaît aucun dossier.

**À trancher.** Les deux phrases de démenti — « pas tes chances d'obtenir le
visa » — posent une question à part : elles *emploient* le mot pour le nier.
Faut-il les réécrire sans le mot, ou assouplir le garde-fou (voir C) ? Les
notifications de T-01 demandent aussi une formulation de remplacement : dire
la progression sans chiffre d'ensemble n'est pas qu'une suppression.

---

## B · Les tarifs

### B.1 — La mise en avant de $-01 porte sur le mauvais pack

C'est l'écart le plus lourd, et il tombe sur le prochain lot.

> « $-01 cadre le pack **Dossier** et rien d'autre. »
> — `Reports vers le code`, report n° 3
>
> « Trois colonnes à égalité, pack **Dossier** cadré et « Le plus choisi ». »
> — `README.md` du prototype

Or les trois documents qui rendent $-01 — `Lot P0 Paiement`,
`Desktop 1440 Paiement` et `Variantes $-01` — donnent tous :

```
{ key: "essentiel", name: "Essentiel", tag: "Le plus choisi", … border: "2px solid #2E75B6" }
{ key: "dossier",   name: "Dossier",   tag: "Analyse étendue", … border: "1px solid #DDDDDD" }
```

Le cadre **et** le libellé sont sur Essentiel. `pricing.ts` porte
`misEnAvant` sur `dossier`, conformément au report. Les trois écrans
contredisent donc leur propre arbitrage de clôture.

**Tranché le 18/09/2026.** Les deux sources ne répondaient pas à la même
question, d'où la contradiction apparente.

- **Essentiel reste premier dans l'ordre de lecture**, sans badge. Son rôle
  est défensif — tenir le prix d'entrée face à l'offre locale — et il répond
  à « combien ça coûte ».
- **La mise en avant va sur Dossier**, parce que le badge répond à « lequel
  me faut-il » : sur un dossier Campus France, la lettre de motivation et le
  projet d'études sont la partie difficile, et Essentiel ne les couvre pas.
  Recommander Essentiel, c'est une recommandation que le produit contredit
  quarante-huit heures plus tard, en support.
- **Le badge est factuel, pas commercial** : « Couvre l'ensemble des pièces
  exigées pour cette destination », jamais « le plus populaire ». Même règle
  qu'INV-1 — on justifie, on ne survend pas.
- **Pas de présélection du bouton radio** sur $-01 : mise en avant visuelle
  oui, case cochée d'avance non. Le montant est répété sur $-02 avant le
  déclenchement du paiement.

La décision sort de `pricing.ts` — `misEnAvant: boolean` et `justification` —
et un test garantit qu'un seul pack la porte. L'écran ne peut donc plus
rediverger du code comme le prototype l'a fait.

En v2, le pack mis en avant se calculera contre les pièces obligatoires de la
destination retenue. Pas en lot 1.

### B.2 — Recharge de 10 analyses : 5 € ou 7 €

| Source | Montant |
|---|---|
| `README.md` du prototype, grille tarifaire | 3 000 F / **5 €** |
| P-06, `Lot P0 Public` (`p4: eur ? "5 €" : "3 000 F"`) | **5 €** |
| `src/domain/payments/pricing.ts` | **7 €** |

Le plancher de 3 000 F est cohérent partout (RG-05.5). Seul l'euro diverge.
Le prix affiché vient du domaine, donc l'écran montre aujourd'hui 7 €.

**Reformulé le 18/09/2026 : le choix 5 € / 7 € est indécidable tel qu'il est
posé.** La recharge est libellée en analyses, les packs sont contingentés en
tokens ; tant que les deux ne sont pas dans la même unité, n'importe quel
prix crée un arbitrage sans qu'on le voie.

La décision porte donc sur la règle, pas sur le nombre :

> **Le prix au millier de tokens d'une recharge doit être strictement
> supérieur à celui du pack le plus cher au token, avec une marge d'au moins
> 50 %.**

Elle est encodée — `MARGE_MINIMALE_RECHARGE`, `pireTauxParPack` — et le test
`tarification` dit ce qui manque encore pour l'appliquer.

Ce qui manque, c'est le volume. Prix au millier de tokens de la grille :

| Pack | analyses annoncées | tokens | €/1k | F/1k |
|---|---|---|---|---|
| Essentiel | 10 | 120 000 | 0,100 | 41,7 |
| Dossier | 30 | 400 000 | 0,073 | 37,5 |
| Dossier Pro | 90 | 1 200 000 | 0,049 | 37,5 |

Essentiel est le pack le plus cher au token : c'est lui que la recharge doit
dépasser de moitié, soit **plus de 0,150 €/1k et 62,5 F/1k**.

Les packs annoncent donc **12 000 à 13 333 tokens par analyse**. À ce volume,
une recharge de dix analyses vaut 120 000 tokens — un quota Essentiel entier —
et revient à 0,058 €/1k à 7 €, ou 25 F/1k à 3 000 F : **elle échoue à la règle
dans les deux devises, d'un facteur 2,5**. Aucun prix compatible avec le
plancher de 3 000 F ne la sauve : il faudrait dépasser 18 € et 7 500 F.

**C'est le volume qu'il faut reprendre, pas le montant.** Ramenée à une
analyse, la recharge passe largement : 0,58 €/1k et 250 F/1k. Mais cela
change le produit — tout le prototype écrit « Recharge de 10 analyses » — et
les quotas `tokensIA` sont eux-mêmes des hypothèses.

**En attente :** la mesure du coût réel d'une analyse sur les dix premiers
dossiers. La règle et son test survivront à la mesure ; ni le volume ni le
montant.

### B.3 — Consultation consultant : 20 000 F / 45 min, sauf sur T-03

> « Consultation consultant : 20 000 F, 45 minutes, par défaut. »
> — `Reports vers le code`, report n° 5, repris dans `pricing.ts`

T-03, dans `Lot P1`, annonce sur la carte du cabinet partenaire :
« Premier entretien : **25 000 F, une heure** ». Deux montants et deux durées
pour le même acte.

### B.4 — Commission partenaires de 15 %

`Desktop 1440 Comptes` (A-05) et `Desktop 1440 Rédaction et transverses`
(T-03) annoncent « ImmiPro perçoit une commission de 15 % ». Rien dans
`pricing.ts` ne porte cette commission, et le seul 15 % du code est
`SEUIL_MARGE_IA`, qui est un **seuil de marge sur le coût IA** (RG-16.1), pas
une commission partenaire. Homonymie à lever avant de coder T-03.

---

## C · Le garde-fou lui-même

La règle, telle qu'elle est écrite :

> « Aucune chaîne de l'interface candidat ne contient « % », « score » ni
> « chances » **à propos du dossier**. »
> — `Reports vers le code`, « Trois interdits à faire tenir par le code »

`tests/copy-forbidden.test.ts` applique `/\bscore\b/`, `/\bchances?\b/` et
`/\d\s?%/` à toute chaîne de `src/app` et `src/components`. **Le qualificatif
« à propos du dossier » a été perdu.** Le test est donc plus large que
l'invariant, et il refuse déjà, ou refusera, des textes corrects :

| Cas | Écran | Texte |
|---|---|---|
| La phrase de démenti elle-même | C-09 | « … pas tes chances d'obtenir le visa » |
| Le score d'un test d'anglais | C-10 | « Ton score arrive à échéance le 3 mars 2027 » |
| Idem, en rédaction assistée | R-02 | « Donne le score et la date du test » |
| Une action d'échéancier | C-10 | « Demander l'IELTS si le score expire » |
| Un avancement de téléversement | C-07 | « 62 % envoyés · environ 20 secondes restantes » |
| Un zoom de visionneuse | B-05 | « page 1 sur 3 · zoom 100 % » |

Les deux derniers sont des pourcentages qui ne parlent pas du dossier ;
B-05 est déjà hors périmètre, le segment `(admin)` étant exclu du test.

**Tranché le 18/09/2026 : l'interdit reste large, avec deux issues
mécaniques.**

Resserrer sur « à propos du dossier » a été écarté pour une raison technique :
c'est une portée sémantique qu'un script ne peut pas trancher. Dès qu'une
règle demande du jugement, elle cesse d'être mécanique — et c'était toute sa
raison d'être. Une règle qu'un script ne décide pas sans ambiguïté finit
désactivée en six mois.

Mais l'interdit large avait un trou réel : il empêchait d'écrire la phrase
qui protège. « ImmiPro ne garantit pas l'obtention du visa » contient
« garanti ». Les conditions d'utilisation, la page des limites et la charte
anti-arnaque étaient mécaniquement impossibles à rédiger.

Trois ajustements, tous lexicaux :

1. **La négation est reconnue.** Un motif précédé d'une négation explicite
   — *ne*, *n'*, *pas*, *aucune*, *sans*, *jamais*, *ni*, *non* — est
   autorisé. Une négation ne peut pas devenir une promesse. La portée est
   bornée à la proposition : « Pas de doute, visa garanti » reste refusé,
   la virgule coupant la portée comme à la lecture.
2. **Une liste d'exceptions bornée et justifiée** pour le reste, dans
   `copy-exceptions.json` : chaîne exacte, chemin, motif, date. Le coût de
   l'échappatoire est qu'elle apparaît dans la diff. Au-delà de cinq entrées,
   ce n'est plus une exception, c'est une dérive du vocabulaire.
3. **Le périmètre s'étend au contenu**, pas au seul code : `src/lib/contenu`,
   les seeds, `content/`. Et la liste est extraite dans
   `src/domain/copy/vocabulaire-interdit.ts` pour que la validation à
   l'enregistrement du back-office lise la même. **C'est le vrai trou :** un
   administrateur qui saisit « 95 % de réussite » dans un guide pays
   contourne aujourd'hui tout le dispositif.

La liste s'élargit au passage : « taux d'acceptation », « visa assuré »,
« réussite garantie », « sans risque de refus », « on s'occupe de tout », et
le versant juridique, qui relève du même invariant — « nous vous conseillons
juridiquement », « notre avocat », « nous déposons votre dossier ».

**Fait le 18/09** avec le lot P2 Back-office : la validation est branchée sur
B-02 (libellé et réserve affichés au candidat) et sur B-05 (message envoyé
après une revue manuelle). Les trois points d'application existent.

---

## D · Ce qui n'est pas un écart

Relevé pour ne pas le re-signaler à chaque passe :

- **`4G · 78 %`, `hors ligne · 76 %`** — habillage de la barre d'état du
  téléphone dans les cadres du prototype. Jamais du code applicatif.
- **Les documents de méthode** — `Arbitrages clos`, `Revue de recevabilité`,
  `Reports vers le code`, `Parcours clavier` — citent le vocabulaire interdit
  pour énoncer la règle. C'est leur travail.
- **Le traitement « score agrégé » de C-09**, dans `Écrans pivots` : écarté le
  13/09, conservé au sélecteur avec son motif de rejet, comme le demande le
  §4.5 de la revue. Il ne doit simplement jamais être codé.
- **Les seuils du back-office** — « 15 % du prix du pack », « 80 % du budget »
  (B-07) : des ratios d'exploitation, pas une note de dossier, sur des écrans
  hors périmètre candidat.
- **Le taux de change de 655,957 F** : retiré de P-06, $-02 et de l'état de
  paiement. Il ne subsiste que dans la note qui acte son retrait.

---

## Ordre d'urgence, par rapport aux lots restants

| Rang | Écart | Bloque | État |
|---|---|---|---|
| 1 | B.1 — mise en avant de $-01 | P0 Paiement | **tranché le 18/09**, encodé |
| 2 | C — le garde-fou | P0 Dossier 2, puis P1 | **tranché le 18/09**, encodé |
| 3 | B.2 — volume et prix de la recharge | P0 Paiement | règle encodée, **volume en attente de mesure** |
| 4 | A — C-01, C-02, C-06, C-09 | P0 Dossier 1 et Dossier 2 | **appliqué** le 18/09 sur les quatre écrans |
| 5 | B.3, B.4 — consultation et commission | P1 (T-03), P2 WF-12 | **tranché le 18/09** : T-03 lit la grille, commission en code |
| 6 | A — T-01, T-05 | P1, P2 WF-12 | **tranchés le 18/09**, les deux |


---

## E · Divergences internes du prototype, relevées au codage du lot Dossier 2

Aucune ne demande d'arbitrage : dans chaque cas, deux cadres du prototype se
contredisent, et le 390 px fait foi pour les textes et les règles. Elles sont
consignées pour que la reprise du prototype les corrige à la source.

| # | Où | Ce que dit le prototype | Ce qui est codé |
|---|---|---|---|
| E.1 | C-06 en-tête | « Complétude de votre dossier — 68 / 100 » | palier et dénombrement (arbitrage C-09, qui porte sur l'API) |
| E.2 | C-06 vs C-09 | la même pièce y porte « Ajouter » puis « Déposer » ; la photo d'identité y est illisible puis déjà conforme | une seule description de pièce, l'action déduite du remède ; C-09 regroupe la même liste |
| E.3 | C-06, test d'anglais | pastille « Expire bientôt » sur un score valable sept semaines *après* le dépôt visé | « Valable jusqu'au 3 mars 2027 » ; « Expire le …, avant le dépôt visé » est réservé au cas qui bloque |
| E.4 | C-07, envoi | « 62 % envoyés » | volume envoyé sur volume total — un pourcentage sur un écran de dossier se relit comme une note |
| E.5 | C-07, conseils | « Prendre une photo », les trois cadrages et le conseil du relevé bancaire s'affichent sous toutes les pièces | conseils de prise de vue réservés aux pièces à numériser, conseil bancaire porté par la pièce |
| E.6 | C-07, quota | « Une recharge de 10 analyses coûte 3 000 F » écrit en dur | lu dans la grille tarifaire, volume compris : le montant et le volume attendent encore la mesure du coût d'une analyse |
| E.7 | C-08, verdict « à corriger » | « Il manque 1 391 € » au-dessus d'un solde de 10 000 € et d'une exigence de 13 569,24 € | l'écart annoncé est celui des montants affichés |
| E.8 | C-10, relevé bancaire | échéance au 20 décembre pour une pièce de moins de trois mois au 15 janvier | calculée à rebours : 15 octobre 2026 |
| E.9 | C-10, rappels | « Rappels par email activés », sans moyen de les couper | la mention renvoie au profil |
| E.10 | C-10 / C-11 en 1440 px | vouvoiement, purge à 12 mois, compteurs différents du 390 px | tutoiement et purge à 30 jours, comme le 390 px et INV-5 |

Une seule correction ne vient pas du prototype : le test `copy-forbidden`
extrayait les chaînes du code par expression régulière et prenait une
apostrophe de commentaire pour un début de littéral. Le commentaire qui
*explique* l'interdit se faisait refuser par l'interdit. L'extraction est
maintenant un balayage (`src/domain/copy/source.ts`), commentaires et
expressions régulières écartés, et elle est testée — y compris sur le fait
qu'elle voit encore la faute qu'elle doit voir.


---

## F · Lot P1 — ce qui a été tranché et ce qui a divergé

### Les deux décisions restées ouvertes

**T-01, la progression du dossier.** Le prototype notifiait « Complétude
passée de 58 à 68 sur 100 » : le dernier endroit où la note avait survécu à
l'arbitrage C-09, et le plus tenace, puisque retirer le chiffre ne suffisait
pas — il fallait dire ce qu'une progression annonce sans nombre d'ensemble.

Retenu : **une pièce de moins, et combien il en reste.** « Une pièce
obligatoire de moins à réunir : il en reste 2. » Le candidat peut le vérifier
sur sa checklist, et rien là-dedans ne se relit comme une probabilité. C'est
aussi ce que le score avait pour lui — la progression visible d'une session à
l'autre — rendu sans le chiffre. La phrase est calculée par
`libelleProgression`, à partir des deux états de la complétude ; elle se tait
quand rien n'a progressé, plutôt que d'annoncer un mouvement nul.

**T-03, le prix de la consultation.** Le prototype affiche 25 000 F pour une
heure, l'arbitrage du 13/09 a retenu 20 000 F pour 45 minutes. L'écran lit
désormais `CONSULTATION` et `CONSULTATION_DUREE_MINUTES` : entre deux prix
pour la même prestation, c'est celui qui est facturé qui fera foi, et un
écran qui affiche l'autre ment.

**La commission de 15 %** n'avait aucun support en code : elle n'existait que
dans le texte de T-03. Elle vit maintenant dans `COMMISSION_PARTENAIRE`
(`domain/payments/pricing.ts`), et un test vérifie que la phrase de l'écran
reprend ce taux. La phrase elle-même déclenche l'interdit du pourcentage :
c'est la **première entrée de `copy-exceptions.json`**, motivée et datée.
L'écrire en lettres pour passer le garde-fou aurait affaibli une obligation
de transparence — c'est exactement l'usage prévu pour l'échappatoire.

### Divergences internes du prototype, lot P1

| # | Où | Ce que dit le prototype | Ce qui est codé |
|---|---|---|---|
| F.1 | R-02, avancement | `Math.round((i + 1) / 8 * 100) + "%"` | « Question 3 sur 8 » ; la barre compte des questions dans `aria-valuenow`, aucune part n'est écrite |
| F.2 | R-01, durées | « 8 questions · environ 15 minutes » à côté de « prévois vingt minutes pour l'entretien et la relecture » | deux minutes par question, sans arrondi : 16 minutes, compatible avec l'avertissement de la même page |
| F.3 | R-01, jeux de questions | les quatre pièces partagent le même questionnaire | chaque pièce reprend les questions qui la concernent — une attestation de prise en charge ne demande pas le niveau d'anglais |
| F.4 | R-04, remarque de forme | « 412 mots pour une limite conseillée de 400 » au-dessus d'une lettre de 134 mots | calculée sur le texte réel ; absente quand le texte tient dans la limite |
| F.5 | T-01, alerte d'échéance | « Échéance dans 7 jours » écrit dans le titre | délai recalculé à l'affichage : le titre figé restait affiché le jour même, puis une semaine après |
| F.6 | T-02, impact | « il te faut 696 € de plus, soit environ 456 000 F » | montant en euros seul : le taux de 655,957 F a été retiré de P-06 et de $-02, l'afficher ici le réintroduirait |
| F.7 | T-02, arbitrage | option « migrer » présélectionnée | aucune présélection : un arbitrage pré-coché n'est pas un arbitrage |
| F.8 | R-03, dates de version | « il y a 12 heures » pour un enregistrement de la veille | seuil au jour civil : « hier à 21 h 04 » dit quand, le relatif oblige à le calculer |
| F.9 | Partout | `Intl` écrit « 1 janvier 2027 » | « 1er janvier 2027 » — le français met l'ordinal au premier du mois, et nulle part ailleurs |


---

## G · Lot P2 Back-office — le troisième point d'application, et le reste

### Le trou est fermé

Jusqu'à ce lot, le vocabulaire interdit protégeait le code. Un administrateur
qui saisissait « 95 % de réussite » dans le libellé d'une checklist passait à
travers `check:copy` comme à travers le test de l'interface, et son texte
s'affichait tel quel chez le candidat.

Deux écrans écrivent pour le candidat, et tous deux valident maintenant à la
saisie, avec la même liste et la même reconnaissance de la négation :

- **B-02** — le libellé de checklist et la réserve affichée en contexte. La
  publication est bloquée tant qu'une formulation est refusée, et le message
  de refus cite la formulation exacte plutôt que de renvoyer à une règle : un
  administrateur qui ne voit pas quel mot bloque réécrit la phrase entière,
  au hasard, jusqu'à ce que ça passe.
- **B-05** — le message envoyé au candidat après une revue manuelle. Il y
  passe en plus l'exigence de RG-06.3 : un constat nu — « non conforme »,
  « illisible », « KO » — est refusé, comme le code se l'interdit à lui-même.

Une correction est sortie de là : le motif du pourcentage capturait un seul
chiffre, et le message de refus citait « 5 % » pour un texte qui disait
« 95 % ». Il reconnaît exactement les mêmes textes qu'avant, mais rend
maintenant le nombre entier.

### Divergences et décisions du lot

| # | Où | Ce que dit le prototype | Ce qui est codé |
|---|---|---|---|
| G.1 | B-05, file de revue | âges figés (« 2 h 12 »), avec un délai cible de 4 h | dépôts posés en minutes écoulées : figés, la file entière basculait hors délai au fil de la journée |
| G.2 | B-05, `late: true` sur la première ligne | marquée en retard à 2 h 12 pour un délai cible de 4 h | le dépassement se calcule ; une seule pièce du jeu de démonstration le franchit |
| G.3 | B-01, colonne « Vérifiée le » | — | date courte dans le tableau : le format long y passait sur deux lignes une ligne sur deux |
| G.4 | B-01, source secondaire | niveau affiché seul | « jamais affiché (INV-4) » porté sur la ligne : l'opérateur doit voir ce qu'il produit |
| G.5 | B-06, période vide | un seul cas vide | deux vides distingués — une période sans écriture et un filtre trop étroit n'appellent pas le même geste |

### Ce que le back-office refuse de faire seul

Quatre automatismes écartés, et c'est le fond de la section B :

- une source muette ne dépublie rien (RG-14.3) ;
- publier une règle ne migre aucun dossier (INV-3) ;
- le silence d'un opérateur de paiement ne met aucun paiement en échec ;
- pendant un incident, aucun total n'est affiché — un chiffre partiel
  présenté comme un total est une erreur comptable, et elle se propage dans
  l'export puis dans le rapport.

### B-07 reste vide, et c'est la livraison

Aucune valeur de coût n'est affichée tant que dix dossiers réels n'ont pas
alimenté `AiUsage`. Ce qui est affiché est vrai sans mesure : le nom de
chaque métrique, sa source de calcul, et les garde-fous exprimés en ratio.
C'est le même chantier que le volume de la recharge — une semaine de pipeline
réel referme les deux.


---

## H · Lot P2 WF-12 — le dernier pourcentage, et les quatre décisions déjà prises

### T-05 : « Ta checklist est à 80 % »

C'était le dernier pourcentage de l'interface candidat, et le plus facile à
retirer une fois posé le bon critère : la phrase du prototype nommait déjà
les deux pièces concernées. Or c'est la seule chose utile avant un appel de
quarante-cinq minutes — le chiffre n'ajoutait qu'une note à retenir de
travers.

Retenu : **les pièces nommées, sans part.** « 2 pièces obligatoires restent à
traiter : passeport et attestation de ressources. » Calculé par
`libelleAPreparer` depuis la checklist, avec bascule sur les complémentaires
quand rien ne bloque, et une phrase distincte quand tout est conforme.

Restait la question que j'avais signalée — un email ne se recalcule pas à
l'ouverture. Elle ne se pose pas ici : l'écran T-05 est dans l'application.
Elle se posera au courriel de confirmation, qui n'est pas prototypé (§5) ; la
réponse y sera la même, à ceci près qu'il faudra dater la phrase ou renvoyer
à la checklist plutôt que de la recopier.

### Les quatre décisions du 13/09 étaient déjà en code

Les écrans les appliquent sans rien redéclarer, et c'est ce qui les rend
vérifiables :

| Décision | Où elle vit |
|---|---|
| Tarif unique, 20 000 F la consultation de 45 minutes | `CONSULTATION`, `CONSULTATION_DUREE_MINUTES` |
| ImmiPro encaisse, le consultant ne manipule aucun paiement | parcours `$`, inchangé |
| Annulation sans frais jusqu'à 24 h avant | `CONSULTATION_ANNULATION_HEURES` |
| Ce que le consultant voit, sous double condition révocable | `domain/consultants/access.ts` |

La dernière a donné le point le plus utile du lot : l'écran d'accord dérive
sa liste « ce qu'il verra » de `PORTEE_CONSULTANT`, au lieu de l'énumérer à
part. Un écran de consentement qui recopie sa propre liste finit par
promettre autre chose que ce que `peutLire` autorise, et c'est le sens du
consentement qui se perd.

### Divergences et corrections du lot

| # | Où | Ce que dit le prototype | Ce qui est codé |
|---|---|---|---|
| H.1 | T-05 confirmé | « Ta checklist est à 80 % : les deux pièces à reprendre sont… » | les pièces nommées, sans part |
| H.2 | T-05, créneaux | horaires figés (15, 17, 18 sept.) | disponibilités posées en jours à venir : figées, elles finissent toutes dans le passé et l'écran propose des rendez-vous impossibles |
| H.3 | T-05, limite d'annulation | « jusqu'au mardi 22 septembre, 10 h 00 » sur un écran, au jour près sur l'autre | toujours avec l'heure : écrite au jour près, elle fait annuler trop tard quelqu'un qui s'y fie, et la consultation est due |
| H.4 | T-04, état vide | « Trois consultants sont habilités pour les Pays-Bas et deux pour le Canada » écrit en dur | compté sur la table des habilitations |
| H.5 | T-04, filtres | « Pays-Bas · Langue · Sous 48 h » fixes | langues proposées = celles réellement couvertes par la destination |
| H.6 | T-05, référence | « RDV-2609-8814 » | dérivée du créneau et du consultant : une réservation rejouée n'en crée pas deux (INV-7) |

Une dernière, trouvée à l'écran : le libellé du groupe radio répétait le
titre du jour, annoncé deux fois par un lecteur d'écran.

---

## Annexe I — API et routes serveur

Le prototype ne couvre pas cette couche : il décrit des écrans, et §5 du
guide de démarrage dit que le schéma et les intégrations sont à dériver de
DOC-11. Les écarts relevés ici ne sont donc pas des divergences entre deux
maquettes, mais des endroits où DOC-11, le prototype et le code existant ne
disaient pas la même chose — ou ne disaient rien.

### Ce qui a été tranché, et pourquoi

| # | Point | Ce qui existait | Ce qui est codé |
|---|---|---|---|
| I.1 | Vérification de l'adresse | DOC-11 WF-02 : lien à usage unique, 24 h. Prototype A-03 : code à six chiffres, 10 min | le code à six chiffres. Le prototype fait foi pour les règles d'écran, et un code se recopie sans quitter le formulaire — ce qui compte quand l'email arrive sur le même téléphone |
| I.2 | Sessions | DOC-11 : « NextAuth, sessions en base ». Le schéma n'avait ni table de session ni rôle | sessions en base, écrites ici. NextAuth v4 force le jeton signé dès qu'on accepte un mot de passe, et un jeton ne se révoque pas : une suspension (WF-15) n'aurait pris effet qu'à son expiration |
| I.3 | Rôles | RG-15.3 exige un RBAC strict ; `User` n'avait pas de rôle | `Role { CANDIDAT, VEILLEUR, ADMIN }`, repris des acteurs de DOC-11. Un veilleur relit des sources et ne voit ni paiements ni pièces |
| I.4 | Rétention | `PURGE_JOURS = 30` dans le domaine, annoncé au candidat ; `RETENTION_DOCUMENTS_DAYS=90` dans l'environnement, jamais lu | la variable est retirée. Un engagement affiché ne se règle pas par variable d'environnement : la valeur pourrait s'écarter de la phrase qui la promet sans que rien ne le signale |
| I.5 | Remède d'une pièce | déduit du code par expression régulière, côté serveur | champ `nature` du référentiel. Le motif se trompait là où ça compte : « visite_medicale » devenait un téléversement, et la ligne aurait proposé d'ajouter un fichier pour un rendez-vous à prendre |
| I.6 | Analyses par pack | 10, 30 et 90 écrits dans un commentaire de la grille | champ `analyses` sur `Pack`. La première écriture de quota aurait dû recopier un nombre à la main |
| I.7 | Messages de validation | messages Zod par défaut, en anglais | table française posée globalement, à l'import du composeur. Traduire schéma par schéma se serait oublié au premier champ ajouté |
| I.8 | Vocabulaire interdit dans le référentiel | vérifié sur les deux champs du formulaire B-02 | vérifié sur tous les textes du payload : libellé, messages d'échec, libellés de pièce, réserves. Le message d'échec est le plus exposé — il se lit au moment précis où une condition ne passe pas |
| I.9 | Durée d'un accord de partage | `expiresAt` obligatoire, valeur non décidée | 14 jours après le rendez-vous : de quoi revenir sur une pièce après l'entretien, pas de quoi laisser un accès ouvert après que la question est réglée |
| I.10 | Slug d'une fiche | fiches statiques à slug de pays | le serveur joint le référentiel et une part éditoriale (`EDITORIAL`). Le nom français d'un pays ne se vérifie pas sur le site de l'autorité : le ranger sous `verifiedAt` affaiblirait ce que cet horodatage veut dire |

### Ce qui reste à arbitrer

**I.A — Deux composantes du classement n'ont aucune source.** WF-01 donne six
composantes pondérées ; « qualité de vie » (10 %) et « coût de la vie » (5 %)
ne sont dans aucun référentiel, et rien ne les y met. Fabriquer une note par
pays serait une information sans source sur une plateforme dont c'est la
promesse inverse (INV-8). Les quatre composantes disponibles sont
renormalisées sur 100 et `composantesAbsentes` le dit à l'appelant. Deux
issues : brancher un indice public avec sa source et sa date de relevé, ou
retirer ces deux composantes de DOC-11. La seconde est plus honnête que la
première tant que personne ne relit l'indice.

**I.B — Le budget n'est comparable qu'en zone euro.** La parité du franc CFA
avec l'euro est fixe et se convertit sans risque. Le franc suisse et le
dirham sont des cours de marché : les écrire en dur périmerait, et les
afficher demanderait leur source et leur date comme toute autre donnée. En
attendant, la Suisse et les Émirats ne sont pas filtrés sur le budget, et la
réponse porte la mention correspondante. Il faut soit une source de taux
datée, soit renoncer à comparer les budgets hors zone euro.

**I.C — Trois dépendances ne sont pas branchées, faute de clés.** Messagerie,
extraction IA, interrogation des fournisseurs de paiement. Chacune a un point
de branchement unique et traite son absence plutôt que de faire semblant :
une pièce non lue part en revue manuelle et l'analyse est rendue, un courrier
manqué est journalisé, un paiement sans confirmation ouvre un écart au-delà
de vingt-quatre heures. Aucune n'est simulée.

**I.D — L'antivirus de WF-06 n'a pas de service.** L'étape 2 demande une
analyse antivirus synchrone avant stockage. Les contrôles de format, de
taille et de type MIME sont faits ; le balayage antivirus ne l'est pas, et
il n'est pas non plus déclaré fait. C'est le seul point de WF-06 qui reste
ouvert.

**I.E — Le courrier de confirmation T-05 attend toujours sa décision.** Le
point relevé au lot WF-12 n'a pas bougé : un email ne se recalcule pas à
l'ouverture, la phrase doit donc être datée ou renvoyer vers l'écran. Le
courrier d'alerte critique (RG-11.3) suit déjà cette règle et peut servir de
modèle.

---

## Annexe J — Branchement des écrans

Les vingt-neuf écrans lisaient `src/lib/contenu`. Ils lisent maintenant la
base, par la couche `src/server/lecture/`, partagée avec les routes. Le
prototype n'a pas d'avis sur cette couche ; ce qui suit sont les écarts que
le branchement a révélés — pour la plupart en regardant les écrans, pas en
lisant le code.

### Ce qui a été tranché

| # | Point | Ce qui existait | Ce qui est codé |
|---|---|---|---|
| J.1 | Code reçu par email pour le mot de passe | A-04 prévoyait un lien et une étape « J'ai suivi le lien » qui n'ouvrait rien : elle avançait sur un clic | un code à six chiffres, comme A-03. Un seul mécanisme pour deux parcours voisins, et l'étape fictive disparaît |
| J.2 | « Destinations les plus demandées » | titre écrit en dur | l'intitulé suit la donnée : « les plus demandées » n'est écrit qu'au-delà de trente dossiers ouverts, sinon « Destinations couvertes », qui est exactement vrai |
| J.3 | Dates de dépôt proposées à l'ouverture | « 15 janvier 2027 » et « 2 mai 2027 » figées | calculées depuis aujourd'hui. Figées, elles finissent dans le passé et l'écran propose des dépôts impossibles (même défaut que les créneaux du lot WF-12) |
| J.4 | Pied de page | liens vers le Canada et l'Allemagne, non couverts | tirés du registre éditorial, qui est la source des slugs. Lu en base, il aurait rendu **toutes** les pages publiques dynamiques, guides et articles compris |
| J.5 | Bandeau d'alerte du tableau de bord | affiché en permanence | affiché seulement s'il y a une divergence à arbitrer. Un bandeau qui ne s'éteint jamais cesse d'être lu |
| J.6 | Opérateur du back-office | « M. Agossou · Analyste réglementaire » écrit en dur | l'opérateur connecté, avec son rôle réel |
| J.7 | Encadré « le travail étudiant se lit de près » | citait l'Allemagne et le Canada | dérivé du tableau affiché : il nomme les destinations qui exigent un permis employeur et celles qui n'en exigent pas |
| J.8 | Pages publiques | pré-générées au build | rendues à la demande. Le build ne doit pas exiger de base de données : l'image se construit en intégration continue, où il n'y en a pas |

### Défauts trouvés à l'écran, corrigés

Aucun de ces cinq n'aurait été vu par un test.

- **Deux cartes « Pays-Bas » indistinguables** sur l'accueil et deux colonnes
  homonymes dans le comparateur : un pays peut publier plusieurs procédures.
  La carte et la colonne portent désormais l'intitulé.
- **La date « au plus tôt » d'une pièce périssable** était calculée depuis la
  date cible et non depuis le dépôt : elle tombait deux jours avant le dépôt
  au lieu de trois mois, c'est-à-dire trop tard pour une pièce qui met trois
  semaines à venir.
- **Une pièce déjà déposée proposait « Ajouter »** au lieu de « Remplacer ».
  Le remède suit maintenant l'état réel : chercher une pièce qu'on vient
  d'envoyer est le genre de perte de temps que cet écran existe pour éviter.
- **Une alerte affichait l'identifiant technique du dossier.** Elle nomme la
  destination — c'est un écran d'alertes, pas un journal d'audit.
- **« 1 consultants »** sur l'annuaire. Une faute d'accord sur un écran qui
  promet une vérification d'habilitation entame la confiance dans la
  vérification elle-même.
- **Une cellule de tableau contenait une phrase de trois lignes** (« montant
  publié dans une autre monnaie… »). Elle porte une valeur ; l'explication
  vit sur la fiche, où il y a la place de la lire.

### Ce qui reste à arbitrer

**J.A — La proposition de partenaire n'a pas de table.** `PartnerReferral`
figure dans la matrice de traçabilité de DOC-11 (WF-13) et n'existe pas au
schéma. L'écran C-06 affiche donc encore un partenaire écrit dans le
contenu. Deux issues : modéliser l'affiliation, ou retirer WF-13 du
périmètre tant que le premier partenaire n'est pas signé — RG-13.4 demande
de toute façon une vérification destination par destination avant
activation.

**J.B — La suppression de compte bute sur une contrainte, et c'est
correct.** `Transaction.userId` ne tombe pas en cascade : un reçu survit à
la suppression du compte, comme C-11 l'annonce au candidat. RG-10.4 demande
donc une **anonymisation** des métadonnées, pas un effacement — et elle
n'est pas écrite. Le jeu de démonstration contourne la contrainte ; le
produit ne le pourra pas.

**J.C — Les guides et les articles restent éditoriaux.** Ils attendent un
back-office de publication, qui n'est pas au périmètre. Ce sont les deux
seuls écrans publics qui ne lisent pas la base, et ils sont les seuls à
rester pré-générés — ce qui est exactement ce qu'on veut d'un contenu de
référencement.
