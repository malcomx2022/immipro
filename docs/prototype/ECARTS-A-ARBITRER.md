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
| 6 | A — T-01, T-05 | P1, P2 WF-12 | T-01 **tranché le 18/09** ; T-05 ouvert (lot P2 WF-12) |


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
