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

## Les lectures retenues pendant qu'un arbitrage est ouvert

Un arbitrage se tranche des mois plus tard. D'ici là le code doit bien
faire quelque chose, et il a retenu à chaque fois la lecture la plus
prudente. Rien ne tenait ces lectures : la prudence s'érode d'un écran à
l'autre sans que personne ne le décide, et c'est ainsi qu'une plateforme
se retrouve à faire ce qu'elle a écrit ne pas faire.

`tests/arbitrages-ouverts.test.ts` les tient. Chacun de ces tests est fait
pour être **modifié** le jour où l'arbitrage tombe — jamais contourné, et
jamais supprimé sans que la décision soit écrite ici.

| Arbitrage | Lecture retenue | Ce que le test refuse |
|---|---|---|
| **L.A** — le barème interne relève-t-il du droit d'accès ? | Palier et dénombrement, jamais le nombre (C-09) | Une lecture ou une route qui sérialise `internalScore` |
| **K.A** — RG-13.1 et RG-13.2 se contredisent | Une seule proposition, sur le seul écran qui l'affichait | Une seconde surface commerciale dans l'espace dossier |
| **I.B** — *tranché le 20/09* | Seule la parité fixe du franc CFA convertit ; ailleurs le budget sort du classement | Une seconde parité écrite en dur |
| **N.A** — le rail suit la devise | `provider` se déduit à la création | Une route qui accepte un fournisseur venu du client |
| **I.D** — l'antivirus de WF-06 | Le balayage n'est pas fait, et n'est pas déclaré fait | Un texte ou un champ qui affirmerait qu'un fichier a été analysé |

Trois tests de plus lient le fichier au relevé : les codes cités doivent
exister ici, les ouverts ne doivent pas porter la mention « Tranché », et
les tranchés doivent la porter. Un arbitrage fermé dont le garde-fou survit
continuerait de refuser une dérive que la décision vient peut-être
d'autoriser — c'est ce mécanisme qui a fait relire I.B le 20/09.

Un garde-fou ne disparaît pas forcément avec son arbitrage. Celui d'I.B
reste : la décision ne referme pas la porte, elle pose une condition
d'entrée — pas de taux sans source datée et surveillée — et une condition
se tient mieux qu'une lecture provisoire.

Vérifié par mutation, une par arbitrage : un barème dans l'export, un
cours du franc suisse en dur, un `provider` au schéma d'entrée, une
seconde proposition de partenaire, une mention « fichier sûr ». Les cinq
échouent.

**Les arbitrages restent entiers.** Aucun de ces tests ne décide quoi que
ce soit ; ils empêchent seulement que la décision se prenne toute seule,
par accumulation.

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

*Lot I.A.* L'arbitrage reste entier — brancher un indice ou retirer les deux
composantes est une décision sur DOC-11, pas sur le code. Ce qui a été
fermé est le trou d'honnêteté qui vivait entre les deux : `composantesAbsentes`
sortait de la route depuis le premier jour et **P-03 ne le lisait pas**. Son
interface locale ne déclarait pas le champ ; le serveur savait donc que deux
des six composantes n'avaient été mesurées par personne, et le candidat
lisait un classement présenté comme entier. L'écran nomme désormais ce qui a
été comparé et ce qui n'a pas pu l'être, en deux phrases dérivées de `POIDS`
et de la liste reçue — brancher l'indice demain retire la seconde phrase
sans qu'on relise l'écran. Aucun poids n'est cité : une part affichée est
refusée par le vocabulaire interdit, et elle ordonne sans devoir se lire
(arbitrage C-09).

Deux défauts trouvés en chemin, qui ne relevaient d'aucun arbitrage. La
mention de source vivait **à l'intérieur** du bloc des écartées : une
simulation où toutes les destinations passent n'affichait donc aucune source,
et l'écran où aucune ne passe non plus — celui qui n'est fait que de chiffres
réglementaires. Elle porte maintenant sur l'écran entier. Et les écartées
n'avaient pas de mention du tout dans la réponse de la route : un écart
chiffré — « 12 000 000 F demandés » — est une donnée réglementaire au même
titre qu'un rang. Un test compare désormais les clés rendues par
`/api/simulations` aux clés déclarées par P-03 et refuse qu'elles divergent,
dans un sens comme dans l'autre : c'est ce qui aurait vu le champ non lu.

**I.B — Le budget n'est comparable qu'en zone euro.** ~~La parité du franc
CFA avec l'euro est fixe et se convertit sans risque. Le franc suisse et le
dirham sont des cours de marché : les écrire en dur périmerait. Il faut soit
une source de taux datée, soit renoncer à comparer les budgets hors zone
euro.~~ **Tranché le 20/09/2026.**

ImmiPro ne compare pas les budgets libellés dans une devise à cours variable
tant qu'aucune source de change datée et surveillée n'est intégrée. Les
destinations concernées restent présentées, mais **le budget est exclu de
leur classement**. La conversion euro / franc CFA reste autorisée : sa parité
est fixe, c'est un régime de change et non un cours relevé.

Quatre raisons, dans l'ordre :

- une conversion silencieuse avec un taux écrit en dur violerait la promesse
  de données sourcées et datées (INV-8) ;
- écarter entièrement la Suisse ou les Émirats serait plus dommageable que de
  les conserver avec une limite clairement annoncée ;
- un classement incomplet mais honnêtement qualifié vaut mieux qu'un
  classement artificiellement précis ;
- la décision ferme l'arbitrage fonctionnel sans empêcher une future
  intégration de taux — elle en fixe la condition d'entrée : une source
  datée et surveillée.

Pas de dépendance de lancement.

### Ce que l'application de la décision a trouvé

Le comportement était **presque** conforme, et l'écart tenait dans une
valeur par défaut. Le filtrage strict ignorait déjà le budget d'une
destination non convertible, et la réponse portait la mention. Mais la
pondération, elle, lui donnait `0,5` — la moyenne — au lieu de l'exclure :
dix points sur vingt gagnés sans les avoir mérités, pendant qu'une
destination au budget réellement mesuré et défavorable en gagnait moins. Le
hasard de la monnaie de publication décidait d'un rang.

« Exclu du classement » se code donc comme une composante à `null`, et la
note se renormalise sur celles qui ont été pesées — la même opération que
celle qui renormalise les quatre composantes disponibles sur les six de
DOC-11 (I.A), appliquée cette fois destination par destination.

Même traitement pour un candidat qui n'a pas déclaré de budget : la
composante n'est pas mesurable, elle sort, elle ne se remplit pas au jugé.

**Une conséquence à connaître.** Exclure une composante n'est pas la mettre
à zéro : une destination dont le budget n'est pas évaluable est classée sur
ses autres critères, et peut donc passer devant une destination par ailleurs
identique dont le budget a été mesuré et trouvé médiocre. Vérifié à
l'exécution, deux destinations identiques à cela près : 79 contre 76. C'est
exactement ce que « incomplet mais honnêtement qualifié » veut dire, et la
réserve affichée à côté du rang le dit au candidat — mais cela se voit à
l'écran, et mieux vaut l'avoir écrit ici que le découvrir en production.

La mention affichée le dit désormais : « faute de taux de change vérifié, il
n'est pas comparé à ton budget, et le budget n'entre pas dans le classement
de cette destination. » Elle est distincte de celle des fiches et du
comparateur, où il n'y a pas de classement — la seconde moitié de la phrase
y serait fausse.

### Ce qui reste ouvert, et qui n'est pas I.B

Le délai d'instruction inconnu vaut encore `0,5` dans la composante de
facilité administrative. C'est la même valeur inventée, mais le cas n'est
pas le même : la facilité repose sur deux entrées, et le permis employeur,
lui, est connu. Exclure toute la composante jetterait une information
vérifiée ; garder la moyenne en invente une. La décision d'I.B ne tranche
pas ce cas-là, et il est relevé ici plutôt que réglé au passage.

**I.C — Trois dépendances ne sont pas branchées, faute de clés.** Messagerie,
extraction IA, interrogation des fournisseurs de paiement. Chacune a un point
de branchement unique et traite son absence plutôt que de faire semblant :
une pièce non lue part en revue manuelle et l'analyse est rendue, un courrier
manqué est journalisé, un paiement sans confirmation ouvre un écart au-delà
de vingt-quatre heures. Aucune n'est simulée. **Tranché le 20/09/2026.**

Les trois n'ont pas le même statut, et c'est tout l'intérêt de la décision :
les traiter ensemble reviendrait soit à retarder un pilote pour rien, soit à
ouvrir au public un service dont les courriers ne partent pas.

| Dépendance | Statut |
|---|---|
| **Messagerie** | Bloquante avant ouverture publique : vérification, confirmations et notifications doivent réellement parvenir au candidat. |
| **Paiements** | Bloquante avant tout encaissement réel : un paiement ne peut pas reposer sur le seul retour du navigateur. |
| **Extraction IA** | Non bloquante pour un pilote, **à condition** que la revue manuelle ait un propriétaire, un délai cible et une file surveillée. |

Et une règle qui tient les trois : **aucun service absent n'est simulé.**

Le choix contractuel des prestataires reste une tâche d'exécution.

### Ce que l'application de la décision a trouvé

Les mécanismes de dégradation existaient bien, tous les trois. Ce qui
manquait était plus haut : **rien ne distinguait les statuts**, et rien ne
rendait l'inaptitude visible.

`/api/health` répondait « ok » dès que la base répondait. Elle répondait donc
« ok » à une installation sans messagerie, dont aucun courrier de
vérification ne part — et un répartiteur de charge y aurait envoyé du public.
Une décision qui dit « bloquante » et une adresse d'état qui dit « ok » ne
peuvent pas coexister.

L'adresse porte maintenant les trois dépendances et leur statut. Une
bloquante absente rend l'instance inapte, et le 503 le dit à qui surveille
plutôt qu'à personne. Une facultative absente laisse l'instance en service,
sous le nom qui convient : `pilote`.

**La condition de surveillance est la partie qui manquait vraiment.** Le
délai cible existait (quatre heures, WF-15), la file existait, la décision
inscrivait déjà qui l'avait prise. Mais la file ne se regardait que depuis
B-05 — c'est-à-dire qu'elle ne surveillait que ceux qui ouvraient l'écran.
L'état de service porte désormais le nombre de pièces en attente et le
nombre au-delà du délai : une file qui déborde pendant que l'extraction est
absente se voit de l'extérieur.

L'aptitude se lit des seules dépendances, jamais du nom de l'environnement :
une recette à qui il manque un secret de signature est inapte à encaisser,
qu'elle s'appelle production ou non.

**I.D — L'antivirus de WF-06 n'a pas de service.** L'étape 2 demande une
analyse antivirus synchrone avant stockage. Les contrôles de format, de
taille et de type MIME sont faits ; le balayage antivirus ne l'est pas, et
il n'est pas non plus déclaré fait. C'est le seul point de WF-06 qui reste
ouvert.

**I.E — Le courrier de confirmation T-05 attend toujours sa décision.**
~~Le point relevé au lot WF-12 n'a pas bougé : un email ne se recalcule pas
à l'ouverture, la phrase doit donc être datée ou renvoyer vers l'écran.~~
**Tranché.** Les deux issues énoncées ne s'excluaient pas : elles
s'appliquent chacune à une moitié du courrier. Ce qui ne bougera plus est
écrit et daté — le créneau, la durée, le consultant, la référence, la
limite d'annulation opposable, la date où l'accord de partage expire. Ce
qui bouge — les pièces qui restent à traiter — est renvoyé au dossier. Un
courrier relu trois semaines plus tard qui énumérerait les pièces
manquantes ferait préparer les mauvaises.

*Lot I.E.* En écrivant le courrier, on a trouvé que le rendez-vous qu'il
devait confirmer n'existait pas.

### Ce que l'écran a montré, et que la relecture du code n'a pas vu

- **T-05 ne réservait rien.** Le bouton « Confirmer » se contentait de
  passer à l'étape suivante. L'écran affichait « Rendez-vous confirmé »,
  une référence et une limite d'annulation, et aucune ligne n'était
  écrite : ni créneau retenu, ni accord de partage — alors que les deux
  étaient annoncés au candidat, et que la route qui les écrit existait
  depuis le lot WF-12, complète, sans aucun appelant. C'est le même défaut
  que M.B, d'un cran plus haut : là, rien n'écrivait un état que le schéma
  prévoyait ; ici, rien n'appelait une route qui écrivait déjà tout.
- **Les horaires étaient faux d'une heure.** Tous les formateurs du module
  écrivaient en UTC, sous une phrase qui annonce « les horaires sont
  donnés dans ton fuseau, Cotonou ». Un créneau à 10 h se lisait « 9 h ».
  Chaque `timeZone: "UTC"` était défendable isolément ; c'est en
  rapprochant les formateurs de la phrase que l'écart se voit. Le fuseau
  est désormais une constante unique.
- **« Le lien arrive par courriel » ne promettait rien de réel.** Aucune
  visioconférence n'est modélisée : il n'y avait pas de lien à envoyer, et
  pas de courriel non plus. La phrase dit maintenant ce qui arrive.
- **« Ajouter à mon agenda » était un bouton mort**, de la même famille que
  les quatre du lot L.B. Il rend un fichier iCalendar, fabriqué dans le
  navigateur comme le PDF du reçu : trente lignes de texte n'appellent pas
  une bibliothèque. Il porte les faits fixes, jamais l'état de la
  checklist — un agenda se relit longtemps après.

### Ce qui reste ouvert après ce lot

- **Le fuseau est celui du Bénin, pas celui du candidat.** La constante
  vaut pour Cotonou ; la plateforme s'adresse à l'Afrique francophone, de
  UTC à UTC+3. Le faire suivre le candidat demande de décider d'où vient
  son fuseau — le pays déclaré du profil, qui est effacé à
  l'anonymisation, ou une préférence explicite.
- **Rien ne permet d'annuler.** L'écran et le courrier annoncent une
  limite d'annulation sans frais ; aucune route ne l'applique, et K.C —
  qui supporte le coût d'un rendez-vous annulé — n'est pas tranché. La
  limite reste une condition opposable, pas encore un geste.
- **L'accord de partage était annoncé révocable, et ne l'était pas.**
  ~~Traité au lot suivant.~~ **Fermé — voir ci-dessous.**

### Lot suivant — le retrait de l'accord de partage

Le lot I.E a rendu les accords réels : depuis qu'un rendez-vous s'écrit,
`ConsultantAccess` porte de vraies lignes. C'est ce qui a rendu visible
qu'aucune d'elles ne pouvait être retirée.

RG-12.2 dit que l'accord est révocable à tout moment, et trois textes le
répètent au candidat : la mention de T-04, la description de la case de
T-05, et le courrier de confirmation écrit au lot précédent. Aucun écran
ne le permettait, et les deux liens qui prétendaient y mener menaient
ailleurs.

**Ce qui est fait.** Les accords sont sur A-05, l'écran que la mention
nomme. C'est leur place : un accord nominatif donné à un consultant est un
consentement au sens ordinaire — daté, nominatif, révocable — et A-05 est
déjà l'écran des consentements. Chaque accord porte son état, son
échéance, et un bouton pour le fermer ; le retrait est journalisé
(RG-15.1), idempotent, et la requête filtre sur le propriétaire.

**Trois états, et ils ne se valent pas.** Ouvert, échu, retiré. Un accès
échu s'est fermé tout seul à la date convenue ; un accès retiré l'a été
par quelqu'un. Les confondre ferait croire à un geste qu'on n'a pas fait —
et un retrait prononcé après l'échéance reste un retrait.

**Ce que le retrait ne fait pas est dit avant le geste.** Il ferme
l'accès ; il n'efface pas les consultations déjà inscrites au journal.
Quelqu'un qui croit effacer ce qui a été vu se tromperait sur ce qu'il
obtient.

### Ce que l'écran a montré, et que la relecture du code n'a pas vu

- **Deux liens nommaient une destination qu'ils n'avaient pas.** « Gérer
  mes consentements de partage », dans l'annuaire, menait au profil, qui
  n'en parle pas ; « Mon profil », en tête d'A-05, menait à l'écran de
  connexion. Les deux adresses sont servies : le test des liens morts ne
  pouvait rien y voir. C'est un quatrième genre de lien mort, après
  l'adresse absente, la boucle sur soi et la porte close — le lien qui
  mène quelque part, mais pas là où son libellé promet. Un test compare
  maintenant la mention et le titre de l'écran qu'elle nomme.
- **Une réponse bien formée mais inattendue casse A-05.** L'écran lit
  `donnees.etat` sans vérifier sa présence ; un 200 d'une autre forme
  rend l'écran blanc. Découvert en écrivant le double appel de test.
  Laissé tel quel : c'est le contrat de l'API qui garantit la forme, et
  s'en défier partout coûterait plus que le défaut.

### Ce qui reste ouvert

- **Aucun consultant ne peut rien lire.** `peutLire` n'a toujours aucun
  appelant, et pour cause : il n'existe ni rôle `CONSULTANT`, ni écran
  côté consultant. Le candidat donne donc un accord réel, révocable, à une
  capacité qui n'existe pas encore. Ouvrir cette surface est le « pack
  Accompagné, lot 4 » que le modèle de droits annonce, et une décision de
  produit.
- **A-05 vit dans le gabarit des comptes.** Y venir depuis l'espace
  dossier fait perdre la navigation de l'application : il ne reste que le
  logo et le lien « Mon profil ». Acceptable pour un aller-retour, à
  revoir le jour où l'écran devient un endroit où l'on passe.

---

## Annexe I bis · Les durées de conservation annoncées

Lot sans arbitrage : les durées étaient déjà décidées, déjà affichées, et
deux sur trois n'étaient appliquées par personne. Trouvé en cherchant ce
que le domaine déclare et que le serveur ne lit pas — la même méthode qui
avait montré `composantesAbsentes` (I.A) et `peutLire`.

### Ce qui est tranché

**Trois durées, une seule tenue.** Trente jours pour les pièces d'un
dossier clos (INV-5, RG-10.1), six mois pour les alertes (T-01), cinq ans
pour le journal d'audit (B-06). La première a son job depuis le socle ; les
deux autres n'étaient que des phrases. « Elles sont conservées six mois »
se lit comme un engagement, et une base qui garde tout ne le tient pas.

**Les durées sont lues, jamais recopiées.** La purge lit les constantes qui
composent les phrases affichées. Une conservation qu'on raccourcit change
au même endroit que le texte qui l'annonce — sinon les deux divergent sans
que rien ne le signale, et c'est l'engagement écrit qui devient faux.

**Le mois n'est pas trente jours.** De mars à septembre il y en a cent
quatre-vingt-quatre, de septembre à mars cent quatre-vingt-un. Une durée
annoncée en mois se compte en mois, sinon la purge tombe à quelques jours
de ce qui est écrit — sur une conservation, ces jours-là sont ceux où l'on
garde ce qu'on a promis d'effacer.

**Le journal se purge par échéance, et par rien d'autre.** Sa propre
mention dit « aucune entrée ne peut être supprimée ni modifiée depuis
l'interface ». Une tâche planifiée n'est pas l'interface ; c'est même la
seule façon de tenir les deux moitiés de la phrase, l'immuabilité et la
durée. Un test vérifie qu'aucune route ne supprime d'écriture.

**Les sessions échues partent aussi.** Aucune durée n'est annoncée pour
elles : c'est l'échéance de la session qui fait foi. `lireSession` les
refuse déjà, mais la ligne gardait le contexte de connexion, que le schéma
dit conservé « pour qu'un candidat reconnaisse une session qui n'est pas la
sienne » — une raison qui s'éteint avec la session.

**Le garde-fou.** Un test relève les constantes de conservation déclarées
dans le domaine et refuse qu'une seule ne soit lue par la couche serveur.
Les deux façons de l'appliquer sont légitimes — une purge qui lit la durée,
ou un calcul d'échéance à l'écriture, comme pour les trente jours des
pièces. Ne l'appliquer nulle part ne l'est pas. Vérifié par mutation :
remplacer la constante par son nombre fait échouer le test.

### Ce qui reste ouvert

- **La purge de rétention ne se journalise pas.** Les autres tâches rendent
  un bilan en console ; la purge des pièces, elle, écrit au journal parce
  qu'elle touche les pièces de quelqu'un. Faut-il une écriture d'audit pour
  un balayage de nuit qui n'ôte que des lignes échues ? Cela demanderait un
  code d'action de plus, pour une information dont personne n'a encore
  exprimé le besoin.
- **O.B reste entier.** Combien de temps garder le motif d'un refus de
  paiement sur un compte vivant est toujours une question de politique de
  rétention : aucune durée n'est décidée, donc aucune n'est à appliquer.

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

**J.A — La proposition de partenaire n'a pas de table.** ~~`PartnerReferral`
figure dans la matrice de traçabilité de DOC-11 (WF-13) et n'existe pas au
schéma.~~ **Tranché — voir annexe K.** L'affiliation est modélisée, et
rien n'est proposable tant qu'une activation n'atteste pas la licéité de la
rétro-commission sur la destination (RG-13.4).

**J.B — La suppression de compte bute sur une contrainte, et c'est
correct.** ~~RG-10.4 demande une anonymisation des métadonnées, et elle
n'est pas écrite.~~ **Tranché — voir annexe K.** Le compte survit vidé ;
le reçu lui survit aussi.

**J.C — Les guides et les articles restent éditoriaux.** ~~Ils attendent un
back-office de publication, qui n'est pas au périmètre.~~ **Tranché — voir
annexe P.** B-08 existe, et le vocabulaire interdit protège enfin là où
`CLAUDE.md` promettait qu'il protège.

---

## Annexe K · Suppression de compte et affiliation

Lot RG-10.4 + WF-13. Il ferme J.A et J.B ; il en ouvre trois autres.

### Ce qui est tranché

**K.1 — La suppression anonymise, elle n'efface pas.** Le compte survit
vidé, parce qu'un reçu de paiement pointe dessus et que C-11 l'annonce déjà
au candidat à la clôture. La frontière retenue tient en une phrase : *ce qui
décrit une personne s'en va, ce qui décrit une transaction reste.* Partent
le nom, l'adresse, le téléphone, le pays, le profil, les alertes, les
sessions, le motif de refus déclaré. Restent les reçus, le grand livre
d'analyses, le décompte de jetons, l'historique des consentements — sur un
compte qui ne nomme plus personne.

**K.2 — L'adresse de remplacement est tirée au sort, pas dérivée.** Un
condensat de l'adresse d'origine se retrouve par dictionnaire : l'espace des
adresses est énumérable. Ce serait une pseudonymisation déguisée en
anonymisation, et le compte resterait rattachable à une personne par
quiconque tient la liste. Le domaine `comptes.invalid` est réservé par la
RFC 2606 : aucun courrier ne partira jamais vers ces adresses.

**K.3 — Rien n'est proposable par défaut.** Un partenaire ne se propose que
sur une destination où une activation atteste la licéité de la
rétro-commission (RG-13.4). Tant qu'aucun partenaire n'est signé, T-03 ne
s'affiche pas — c'est l'état normal, pas une panne.

### Ce que l'écran a montré, et que la relecture du code n'a pas vu

- **La purge laissait une copie du contenu.** Le fichier partait, mais
  l'analyse gardait les champs lus dans la pièce — nom, numéro de passeport,
  date de naissance — et son message les citait. La relecture critique
  gardait les deux valeurs qui divergeaient, l'entretien les réponses du
  candidat. INV-5 ne distingue pas l'original de la copie.
- **La purge d'un brouillon butait sur INV-3.** La suppression de compte
  purge tous les dossiers, y compris les brouillons, ce que la clôture ne
  faisait jamais : un brouillon sans version de règle figée ne peut pas
  passer en `ARCHIVE`, et la base le refusait à juste titre.
- **T-03 parlait de consultant sous un courtier.** L'écran annonçait
  « Premier entretien : 20 000 F, 45 minutes » — le tarif d'une consultation
  — sous une assurance maladie, proposait de « continuer sans consultant »
  et renvoyait vers l'annuaire des consultants. Six énoncés dépendent
  désormais du genre du partenaire ; la divulgation du taux, les engagements
  et la mention d'indépendance n'en dépendent pas.
- **Deux autorisations partageaient une catégorie.** `consultants_partenaires`
  et `mesure_audience` s'écrivaient toutes deux en `MARKETING`, et A-05
  lisait « la dernière ligne de ce genre » : retirer l'une affichait l'autre
  comme retirée. Une preuve de consentement qui répond pour une autre n'en
  est pas une.

### Ce qui reste à arbitrer

**K.A — RG-13.1 et RG-13.2 se contredisent.** La première demande une
proposition « contextuelle à l'étape » de checklist ; la seconde interdit
« toute proposition commerciale dans l'espace dossier lui-même ». L'étape de
checklist *est* l'espace dossier. Le lot a retenu la lecture la plus
restrictive compatible avec les deux — une seule proposition, rattachée à
une étape, sur le seul écran qui l'affichait déjà, et aucune nouvelle
surface commerciale — mais la règle est à réécrire dans un sens ou dans
l'autre.

**K.B — L'export de données n'existe pas.** ~~« Télécharger mes données »
(A-05) et « Télécharger mon dossier » (C-11) mènent l'un à l'écran
lui-même, l'autre à une adresse qui répond 404.~~ **Tranché — voir annexe
L.** Les deux écrans existent, et un test refuse désormais tout lien
interne qui ne mène nulle part.

**K.C — Qui supporte le coût d'un rendez-vous annulé par une suppression ?**
La suppression libère les créneaux à venir chez le consultant — c'est sans
ambiguïté meilleur pour lui que de l'attendre. Mais le créneau est payé et
la grille prévoit des frais au-delà de vingt-quatre heures
(`CONSULTATION_ANNULATION_HEURES`). Personne n'a tranché entre rembourser,
retenir, ou traiter la suppression comme un cas de force majeure.

**K.D — Le premier partenaire reste à signer.** Le modèle porte cinq genres
— assurance santé, logement, équivalence de diplôme, transfert de fonds,
consultant — et le jeu de démonstration en active un seul, sur une seule
destination. Tant qu'aucun contrat n'existe, le taux réel, la devise de
facturation et le mode de rapprochement des commissions sont des
hypothèses : `enregistrerLAboutissement` est écrite et n'est appelée par
rien.


---

## Annexe L · Export des données

Lot K.B. Il ferme K.B ; il en ouvre deux autres.

### Ce qui est tranché

**L.1 — Deux sorties, pas une.** « Mes données » répond au droit d'accès et
de portabilité : du JSON, structuré, relisible par une machine, pour le
compte entier. « Mon dossier » répond à un geste, pas à un droit — quelqu'un
qui va clôturer veut garder ce qu'il a réuni avant que la purge l'emporte :
une page qui s'imprime, dossier par dossier. Un seul fichier aurait mal
servi les deux.

**L.2 — Les fichiers ne sont dans aucun des deux.** Ils se téléchargent un
par un, par une URL signée créée au clic et valable cinq minutes (règle
d'architecture 4). Ce n'est pas un pis-aller : une archive unique de
plusieurs dizaines de méga-octets, sur une connexion mobile qui coupe,
échoue au bout de quatre minutes et ne laisse rien. Pièce par pièce, ce qui
est passé est passé. Et aucune bibliothèque d'archivage n'entre au
dépôt pour cela.

**L.3 — Le PDF est celui du navigateur.** L'archive s'imprime ; « Imprimer »
puis « Enregistrer au format PDF » suffit. Une bibliothèque de génération
pèserait plus que le reste de l'application et rendrait un document moins
fidèle que la page elle-même.

**L.4 — L'export rend ce que le candidat voit.** Le barème interne de WF-07
n'y est pas : l'arbitrage C-09 interdit de le montrer, et un nombre sur cent
lu dans un fichier se retient comme un pronostic aussi sûrement qu'affiché à
l'écran (INV-1). L'export porte la complétude en palier et en dénombrement.

### Ce que l'écran a montré, et que la relecture du code n'a pas vu

- **Un quatrième bouton mort, après paiement.** « Ouvrir ma checklist »
  ($-05) pointait sur `/dossiers`, qui n'existe pas — la liste est le
  tableau de bord. Une page introuvable au moment précis où quelqu'un vient
  de payer. Trouvé non pas à l'œil mais en écrivant le test qui refuse
  désormais tout lien interne sans page.
- **L'archive affichait l'URL entière du référentiel.** Cent trente
  caractères sur six lignes en 390 px, là où toute l'application affiche le
  domaine seul (`mentionDe`). L'export, lui, garde l'adresse exacte : un
  fichier relu par un autre service doit permettre de retrouver la page, et
  il n'a pas de largeur à tenir.
- **La règle d'impression emportait le contenu.** Elle masquait `header`,
  `nav` et `footer` par nom de balise, donc aussi l'en-tête de l'archive —
  titre, pays, dates — et sa mention de source. La page imprimée commençait
  à « Pièces (6) ». Visible uniquement en rendant la page en média
  « print », jamais à l'écran. Le gabarit marque maintenant sa propre chrome.

### Ce qui reste à arbitrer

**L.A — Le barème interne relève-t-il du droit d'accès ?** L'article 20
(portabilité) ne couvre que les données fournies par la personne, ce qui
exclut les données calculées. L'article 15 (accès) ne fait pas cette
distinction. L'export retient la lecture compatible avec l'arbitrage C-09 —
palier et dénombrement, pas le score — et le point mérite une réponse
juridique, pas seulement produit.

**L.B — Deux boutons morts restent, sur le reçu de paiement ($-06).**
~~« Télécharger » et « Renvoyer par email » ne font rien : ce sont deux
`<button>` sans gestionnaire sur une page serveur.~~ **Tranché — voir
annexe M.** Les deux font maintenant quelque chose, et le reçu qu'ils
impriment ou envoient est celui de la base, non plus celui du prototype.

---

## Annexe M · Le reçu de paiement

Lot L.B. Il ferme les deux boutons morts, et découvre que le tunnel de
paiement n'avait jamais été branché.

### Ce qui est tranché

**M.1 — Un bouton ne pouvait pas être honnête sur un écran qui ne l'est
pas.** $-06 servait le premier pack de la grille, une date de septembre et
un numéro d'opérateur écrits en dur — à l'identique pour n'importe quelle
référence dans l'URL. Imprimer ce document, ou l'envoyer par courrier,
aurait produit une pièce comptable fausse. Brancher l'écran n'était donc
pas un élargissement du lot : c'en était la condition. $-04 suivait, parce
qu'il portait la référence `IMP-2609-4471` qui menait au reçu.

**M.2 — « Télécharger » devient « Imprimer ».** Rien ne descendait ni ne
descend dans les téléchargements : la fenêtre d'impression s'ouvre, et la
mention en dessous dit où trouver « Enregistrer au format PDF ». C'est la
doctrine de L.3, appliquée une seconde fois — le navigateur fait le PDF, et
aucune bibliothèque de rendu n'entre au dépôt. Le libellé change parce
qu'un bouton qui annonce un téléchargement qui n'a pas lieu est un bouton
mort d'une autre façon.

**M.3 — « Renvoyer par email » expédie, et nomme l'adresse atteinte.** La
route passe par `courrier.ts`, le point de branchement unique (I.C) : le
transport reste non branché, le courrier est donc journalisé et non
expédié, exactement comme le reçu d'origine envoyé à la confirmation du
paiement. La route est en `candidat_verifie` — un montant et une référence
ne partent pas vers une adresse que personne n'a prouvé lire — et en régime
`sensible`, parce que chaque clic déclenche un envoi. La confirmation
affiche l'adresse : c'est le seul moyen de s'apercevoir qu'on attend son
reçu sur une boîte qu'on ne lit plus.

**M.4 — Un reçu ne s'établit qu'après confirmation, et se défait au
remboursement.** Une transaction en attente n'a pas de reçu, elle a une
promesse : l'écran dit lequel des deux, plutôt que d'imprimer « Payé » sur
un paiement que l'opérateur n'a pas confirmé. Un statut inconnu de la table
de correspondance tombe du côté sûr — un état ajouté au schéma sans passer
par le domaine ne produit pas un document qui atteste d'un encaissement. Un
remboursement garde son reçu, parce que l'obligation comptable ne s'efface
pas, mais change de mot et ferme le renvoi.

**M.5 — Le reçu nomme le moyen, pas le téléphone.** Le prototype affichait
« MTN MoMo · 97 •• •• 42 ». Le numéro du portefeuille n'est pas conservé en
base, et c'est une bonne chose : le reçu dit « Mobile Money ». La référence
de l'opérateur, elle, n'arrive qu'avec la notification signée — sa ligne
est absente tant qu'elle n'est pas venue, une ligne vide sur un reçu se
lisant comme une donnée perdue.

### Ce que l'écran a montré, et que la relecture du code n'a pas vu

- **Le refus nommait un autre fait que le corps.** Le renvoi d'un reçu
  remboursé répondait « Cette étape n'est pas encore ouverte » — le titre
  générique de `etat_incompatible` — alors que rien n'attend d'être ouvert
  et que le paiement est venu puis reparti. DOC-12 §16 règle 1 : le titre
  nomme le fait. Le catalogue porte désormais `recu_indisponible`, de ton
  `limite` : rien n'est en panne, et l'écrire comme une panne ferait
  chercher un défaut là où il n'y en a pas. Trouvé en appelant la route,
  pas en la lisant.
- **« Dossier / Dossier Pays-Bas ».** Le pack acheté s'appelle « Dossier »,
  et la ligne de destination répétait le mot juste en dessous. La
  destination suffit.
- **Les deux boutons ne tenaient pas côte à côte à 390 px.** « Renvoyer par
  email » passait sur deux lignes et dépassait la hauteur d'action de la
  bibliothèque. Ils s'empilent sous 640 px, action principale en premier.
- **« Pack : 10 analyses supplémentaires ».** L'intitulé de $-04 était
  « Pack », alors qu'une recharge aboutit sur le même écran. C'est
  « Achat ».

### Ce qui reste à arbitrer

**M.A — Le tunnel de paiement reste à brancher, sauf ses deux derniers
écrans.** ~~L'annexe J annonçait vingt-neuf écrans branchés ; $-03 n'en
faisait pas partie et personne ne l'avait relevé.~~ **Tranché — voir
annexe N.** Les cinq écrans du tunnel lisent la base, la relève appelle la
route qui existait, et le parcours va de la checklist au reçu sans qu'on
construise une adresse à la main.

---

## Annexe N · Le tunnel de paiement

Lot M.A. Il ferme le trou que l'annexe M avait rendu visible, et découvre
que $-01, $-02 et $-05 n'étaient pas branchés non plus.

### Ce qui est tranché

**N.1 — Le tunnel n'était pas à moitié branché, il ne l'était pas du
tout.** M.A ne nommait que $-03. En le branchant, on constate que $-01
affichait « Pays-Bas — séjour études » et « le Bénin » pour tout le monde,
que $-02 vendait le premier pack de la grille quel que soit le dossier, et
que $-05 citait la référence `IMP-2609-4471`. Les cinq écrans lisent
maintenant la transaction ou le dossier que l'adresse désigne, et refusent
celui d'autrui.

**N.2 — Un seul écran ouvre une transaction.** Le récapitulatif, et lui
seul, appelle la route de création puis rejoint l'attente avec la référence
rendue. Deux écrans qui créent un paiement, c'est un double débit en
attente d'arriver ; un test relit les quatre composants du tunnel pour
qu'il n'y en ait jamais qu'un. « Continuer » sur $-01 est un lien, pas un
appel : il retient un pack, il ne débite pas.

**N.3 — La relève ne conclut rien, et la décision est dans le domaine.**
Seul un `CONFIRMEE` conduit à « paiement confirmé » : tout autre état y
menant annoncerait un débit que l'opérateur n'a pas fait. Le rebours épuisé
ne vaut pas échec — la transaction reste ouverte tant que la base ne l'a
pas fermée, et un webhook en retard la confirme encore (RG-05.1). L'écran
cesse alors de relever et dit que le délai est dépassé, sans rien affirmer
de l'argent. La navigation remplace au lieu d'empiler : un retour arrière
depuis $-04 ne doit pas ramener sur une attente qui relèverait un paiement
déjà abouti.

**N.4 — La porte d'entrée manquait.** $-01 n'était atteignable que depuis
le bloc de quota épuisé, qui ne concerne qu'un dossier **déjà** ouvert — et
ce bloc menait aux packs pour acheter une recharge, que l'écran des packs
dit lui-même ne pas vendre. Un brouillon porte désormais son propre bloc
sur la checklist, et la recharge va droit au récapitulatif.

### Ce que l'écran a montré, et que la relecture du code n'a pas vu

- **Un refus s'annonçait comme un délai dépassé.** Le webhook `declined`
  arrivait en deux secondes, et $-05 répondait « Les cinq minutes se sont
  écoulées sans confirmation » : un fait faux, qui envoie vérifier le
  réseau au lieu du compte. Le repli unique paraissait prudent et ne
  l'était pas. Deux motifs de plus, chacun ne disant que ce qui est su —
  « ton opérateur n'a pas confirmé le paiement », sans accuser le solde, et
  « la notification n'est pas arrivée » pour un paiement encore ouvert.
- **Le numéro masqué montrait l'indicatif du pays.** `+22997000042` donnait
  « 22 •• •• 42 » : l'indicatif, que tous les numéros du compte partagent,
  au lieu du préfixe d'opérateur qui les distingue. Le prototype ne l'avait
  pas vu, parce qu'il écrivait « 97 •• •• 42 » en dur.
- **La référence de paiement ne se dictait pas.** `base64url` produisait
  `IMP-260920--AJX4Q` — deux tirets de suite, et un alphabet qui mêle `0`
  et `O`, `1` et `I`. C'était l'usage même pour lequel la référence est
  dite lisible : la réclamation au téléphone. Elle sort maintenant d'un
  alphabet de trente et un caractères sans ambiguïté.
- **« Changer de pack » s'affichait sous l'échec d'une recharge**, et
  menait à un écran qui redirige les dossiers déjà ouverts. Une recharge
  n'est pas un pack : il n'y avait rien à changer.

### Ce qui reste à arbitrer

**N.A — Le rail de paiement suit la devise, et rien d'autre.** Francs CFA
par Mobile Money, euros par carte. Les trois « autres moyens » du
prototype — Moov Money, carte bancaire, autre numéro Mobile Money —
supposaient un choix d'opérateur qui n'est modélisé nulle part :
`provider` se déduit de la devise à la création. Ils cèdent la place à la
seule alternative réelle, changer de grille. Reste à savoir si le produit
veut un choix d'opérateur, ce qui suppose que FedaPay en expose un.

**N.B — La raison d'un refus n'est pas conservée.** ~~Le cycle la reçoit du
fournisseur et ne l'écrit nulle part ; $-05 la déduit donc du statut.~~
**Tranché — voir annexe O.** Six valeurs fermées, écrites en base, et
jamais le texte du fournisseur.

---

## Annexe O · La raison d'un refus

Lot N.B. Il ferme le dernier point ouvert par le branchement du tunnel, et
trouve que le back-office souffrait du même défaut que l'écran candidat.

### Ce qui est tranché

**O.1 — Une catégorie à nous, jamais le texte du fournisseur.** La question
posée était une question de rétention : le motif d'un refus bancaire est
une donnée sensible. La réponse tient dans ce qu'on choisit de retenir.
`PaymentFailure` a six valeurs — solde insuffisant, refus de l'émetteur,
annulation du payeur, moyen invalide, incident technique, délai dépassé —
et aucune ne désigne une carte ni un portefeuille. Le message rédigé et les
quatre derniers chiffres, qui voyagent dans le même objet Stripe, ne sont
pas déclarés au schéma de lecture : ce qui n'y est pas n'atteint pas le
code qui écrit.

**O.2 — L'information était déjà là, et on la jetait.** FedaPay distingue
`declined`, `canceled` et `failed` par son seul `status` ; les trois se
lisaient comme un seul `ECHOUEE`. Une annulation du payeur n'est pas un
refus de l'émetteur, et aucun des deux n'est une panne. Ce rail ne nomme
jamais le solde, faute de code normalisé — l'y lire serait une accusation
sans source.

**O.3 — Stripe donne un code, et un tableau fermé décide de ce qu'on en
fait.** `decline_code` est normalisé par le réseau. Onze codes sont
traduits ; un code inconnu retombe sur le refus sans raison, jamais sur le
solde. C'est la même prudence qu'ailleurs : l'inconnu tombe du côté qui
n'accuse pas.

**O.4 — Le motif part avec le compte.** L'obligation comptable tient au
montant, à la date et à la référence. Savoir qu'une carte a été refusée
pour solde un jour de septembre ne lui sert pas, et décrit une personne :
l'anonymisation l'efface, comme elle efface déjà le motif de refus de
visa. Le garde-fou n'est pas en base — une contrainte `CHECK` n'interroge
pas une autre table — mais dans le service, à côté de son jumeau.

**O.5 — Trois garde-fous de plus, vingt-neuf sur vingt-neuf.** Un motif sur
un paiement encaissé, une expiration qui accuserait le payeur, un échec
annoncé par l'émetteur qui se dirait hors délai : la base refuse les trois.
Le remboursement non plus n'en porte pas — rendre l'argent n'est pas le
refuser.

### Ce que l'écran a montré, et que la relecture du code n'a pas vu

- **Le back-office souffrait du même défaut, en pire.** B-04 classait tout
  échec en « Solde insuffisant » : l'état de rapprochement nommait une
  cause, la même pour tous. Un opérateur qui rappelle un candidat en lui
  parlant de son solde alors qu'il a simplement fermé la page se trompe de
  conversation. L'état s'appelle « Échec », et la cause est une colonne à
  part, remplie seulement quand l'émetteur l'a donnée.
- **Deux titres se lisaient l'un pour l'autre.** « Le paiement n'a pas
  abouti » pour un solde insuffisant, « Le paiement n'a pas pu aboutir »
  pour une panne : à un mot près, et aucun des deux ne nommait son fait
  (DOC-12 §16 règle 1). Ce sont maintenant « Ton solde n'a pas couvert le
  paiement » et « Une panne a interrompu le paiement ».
- **Un motif dans l'adresse pouvait contredire la base.** Tant que rien
  n'était conservé, `?motif=` était la seule source. Elle ne l'est plus :
  la cause conservée prime, et une adresse fabriquée n'annonce plus un
  solde insuffisant sur une panne.

### Ce qui reste à arbitrer

**O.A — FedaPay ne dit pas pourquoi, et c'est une limite du rail.** Le
candidat béninois qui paie en francs CFA verra « ton opérateur n'a pas
confirmé le paiement » là où le candidat qui paie par carte verra « ton
solde n'a pas couvert le paiement ». La différence tient au fournisseur,
pas au produit. Savoir si FedaPay expose un code d'erreur par un autre
canal — l'API de consultation d'une transaction, plutôt que le webhook —
demande la documentation que nous n'avons pas encore.

**O.B — Combien de temps garder le motif d'un compte vivant ?** Il part
avec la suppression, c'est acquis. Mais un refus de 2026 reste lisible en
2030 sur un compte actif, et personne n'en a l'usage passé la réclamation.
Une purge à l'échéance — trois mois, un an — relève de la politique de
rétention et non de ce lot.

**N.C — La case des conditions passe sous la barre d'action.** Sur un écran
de 390 px, la barre collante de $-02 recouvre la case qui déverrouille son
propre bouton tant qu'on n'a pas fait défiler jusqu'en bas. Elle reste
atteignable, et c'est la structure du prototype — mais faire dépendre
l'action principale d'un élément que sa propre barre masque mérite une
décision de maquette, pas un correctif au passage.

**M.B — Le remboursement n'a pas d'écrivain.** L'état `REMBOURSEE` est au
schéma, le reçu sait le présenter, `paiement.remboursement` est une action
journalisable — mais rien ne fait passer une transaction dans cet état. Le
chemin sera-t-il une décision de back-office, un webhook du fournisseur, ou
les deux ? Tant que la question n'est pas tranchée, la présentation du
remboursement est vérifiée en essai, pas en production.

*Lot M.B.* La question posée reste entière, et elle porte sur
l'**initiation** : qui décide de rendre l'argent, depuis quel écran, avec
quelle trace. Ce qui a été livré est la **réconciliation**, que les deux
réponses supposent également — INV-7 dit que tout paiement est réconcilié
par webhook signé, et un remboursement prononcé chez le fournisseur n'y
arrivait pas.

La cause tenait dans une colonne. `providerTxId` servait à la fois
d'identifiant de la transaction chez le fournisseur et de clé d'idempotence
du webhook, c'est-à-dire à désigner deux choses différentes : *de quelle
transaction parle-t-on* et *ai-je déjà vu cette notification*. Une
transaction en reçoit plusieurs au cours de sa vie, et les deux rails s'y
cassaient de façon opposée.

- **FedaPay** renvoie l'entité : `approved` et `refunded` portent le même
  `entity.id`. Le remboursement se lisait donc comme un rejeu de la
  confirmation et disparaissait en silence — sur ce rail, aucun
  remboursement n'était écrivable, par construction.
- **Stripe** numérote ses objets : l'événement de remboursement cite la
  charge quand la confirmation citait la session. Le remboursement
  s'écrivait, mais en remplaçant la référence opérateur qu'un reçu déjà
  imprimé porte — une pièce comptable dont la référence change après coup.

La clé descend donc sur la notification (`PaymentEvent.providerEventId`,
unique, écrit dans la même transaction de base que le changement d'état), et
`providerTxId` redevient ce que son nom dit, posé une fois. La table laisse
au passage la trace de ce qui est arrivé et dans quel ordre, que l'ancienne
colonne écrasait à chaque notification.

Le remplacement a découvert une course que l'ancienne clé ne couvrait pas :
`checkout.session.completed` et `payment_intent.succeeded` décrivent le même
paiement sous deux identifiants d'objet, et arrivant ensemble ils créditaient
deux fois. La mise à jour exige désormais l'état qui vient d'être lu ; la
perdante n'écrit rien.

### Ce que l'écran a montré, et que la relecture du code n'a pas vu

- **B-04 classait un remboursement en « Écart à traiter ».** Faute d'état
  pour lui, il retombait sur le cas par défaut du rapprochement, qui bascule
  en écart passé dix minutes. Un opérateur ouvrait donc une enquête sur une
  somme rendue exprès, et le compteur d'écarts la comptait. Rendre l'argent
  est une issue, pas un désaccord.
- **Une somme rendue ne comptait nulle part.** Elle sort de l'encaissé, ce
  qui est juste, et n'entrait dans aucun autre total : une journée où trois
  paiements ont été rendus se lisait comme une journée où ils n'avaient
  jamais eu lieu.
- **Les totaux additionnaient des francs et des euros.** Vingt-cinq mille
  francs plus vingt-neuf euros donnaient « 25 029 F ». Le défaut était
  antérieur au lot et portait déjà sur l'encaissé et l'attente ; il ne s'est
  vu qu'avec les deux rails côte à côte à l'écran, et ajouter un quatrième
  total l'aurait recopié. Chaque monnaie a maintenant sa ligne — c'est
  exactement ce que ce module refuse deux paragraphes plus haut, « un chiffre
  partiel présenté comme un total ».
- **« Échecs du jour » expliquait encore « délai dépassé ou solde
  insuffisant ».** N.B avait retiré cette cause de la colonne d'état juste à
  côté ; elle était restée dans le sous-titre de la carte.
- **Le reçu datait le paiement et pas le remboursement**, et sa ligne
  s'appelait « Date » — sans ambiguïté tant qu'il n'y en avait qu'une. La
  date existe maintenant en base, la mention la porte, et la ligne s'appelle
  « Date du paiement ».

### Ce qui reste ouvert après ce lot

- **Qui prononce le remboursement.** La question d'origine, inchangée.
- **Le pack reste crédité.** Rendre l'argent ne retire pas les analyses déjà
  ouvertes, et le lot n'y touche pas : les révoquer est une décision de
  produit, du côté de l'initiation. Les analyses consommées ne se rendent
  pas de toute façon.
- **Personne n'est prévenu.** Un reçu confirmé part par courrier ; un
  remboursement n'en déclenche aucun. Le texte dépend de qui l'a prononcé,
  donc de la même décision.

**M.C — Le reçu n'a pas de numérotation de facture.** Il porte la référence
interne de la transaction, qui est non séquentielle par choix (une suite
d'entiers dit le nombre de paiements du mois à qui en voit deux). Une
facture, elle, se numérote en continu dans la plupart des régimes
comptables. Savoir si ImmiPro doit émettre des factures en plus des reçus,
et sous quel régime, est une question de comptabilité, pas de produit.

---

## Annexe P · Le back-office de publication

Lot J.C. Il ferme le dernier écran public qui lisait un fichier du dépôt,
et rend vraie une phrase de `CLAUDE.md` qui ne l'était pas.

### Ce qui est tranché

**P.1 — Le trou n'était pas la lourdeur, c'était le garde-fou.** Qu'un
guide demande un développeur et un déploiement pour changer une phrase est
un inconfort. Que `CLAUDE.md` annonce « un administrateur qui saisit une
promesse dans un guide pays bute sur la même règle qu'un développeur »
alors qu'aucun écran ne permettait de saisir un guide est autre chose : la
liste unique avait trois points d'application et se réclamait d'un
quatrième. Elle en a quatre.

**P.2 — Le brouillon s'enregistre, la publication se refuse.** La nuance
est dans la phrase de `CLAUDE.md` — « sa **publication** est bloquée » — et
elle compte. Refuser aussi l'enregistrement empêcherait de sauver un texte
en cours d'écriture, et pousserait à rédiger dans un traitement de texte
pour coller à la fin : c'est-à-dire à écrire hors du garde-fou. Les fautes
s'affichent pendant la saisie, avec la formulation exacte et le champ où la
corriger.

**P.3 — Rien de dérivable n'est saisi.** Le sommaire d'un guide se tire de
ses intertitres. Il était écrit à côté d'eux, et un test surveillait la
duplication — que le prototype avait déjà ratée, en annonçant « Le permis de
recherche d'emploi », section que le corps ne contenait pas. La durée de
lecture se compte. La mention « ce guide est informatif » suit le genre.
Trois champs de moins, trois classes de contradiction qui disparaissent
avec eux, et un test qu'on supprime parce que le défaut qu'il guettait ne
peut plus exister.

**P.4 — Régénéré à la demande, pas pré-généré.** L'annexe J voyait dans la
pré-génération « exactement ce qu'on veut d'un contenu de référencement ».
Ce qu'on veut, précisément, c'est une page servie en HTML complet et sans
attente — pas qu'elle soit fabriquée au build, ce qui exigerait une base de
données là où il n'y en a pas (J.8). Les pages se rendent à la première
demande, restent en cache une heure, et la publication invalide leur
adresse. Le référencement y gagne même : une correction est en ligne tout
de suite, sans déploiement.

**P.5 — Cinq garde-fous de plus, trente-quatre sur trente-quatre.** Une
publication sans source ni date (INV-8), un brouillon daté, un publié sans
date, une adresse qui ne tient pas dans une URL, un guide sans pays, un
article sans rubrique ni signature.

### Ce que l'écran a montré, et que la relecture du code n'a pas vu

- **Le refus de publication empruntait un message de questionnaire.**
  `champs_invalides` titre « Certaines réponses ne sont pas exploitables »
  et parle de questions, sur un écran de rédaction qui n'en a aucune. Et le
  document n'est pas invalide : il est bien formé, c'est sa formulation qui
  ne peut pas s'afficher. Le catalogue porte `publication_refusee`, dont le
  titre nomme le fait et dont la phrase de conservation rassure sur le seul
  point qui inquiète — « rien de ce que tu as écrit n'est perdu ».
- **Un paragraphe de guide se tapait sur une ligne.** Quatre ou cinq lignes
  de prose dans un champ où l'on ne voit que la fin de ce qu'on écrit : le
  genre de détail qui pousse à rédiger ailleurs et à coller ensuite —
  c'est-à-dire, encore une fois, à écrire hors du garde-fou.
- **« Adresse publique » affichait « pays-bas ».** Le libellé promet une
  adresse, l'en-tête en montrait une complète deux lignes plus haut, et le
  champ n'en montrait que le fragment.

### Ce qui reste à arbitrer

**P.A — L'index des guides et des articles n'existe pas.** ~~Il n'y a pas de
page `/guides` ni `/articles`.~~ **Tranché — voir annexe Q.** Les trois
index existent, et le lot a trouvé bien pire que ce que P.A annonçait.

**P.B — Une seule version, pas d'historique.** Une règle est versionnée
parce qu'un dossier fige la sienne (INV-3) ; un guide n'a rien qui le fige,
et republier ne casse rien. Mais un texte réécrit efface le précédent sans
trace, alors que le journal d'audit garde qui a publié et pourquoi. Faut-il
conserver les versions d'un guide ? C'est une question de gouvernance
éditoriale, pas de produit.

**P.C — Les images ne sont pas au périmètre.** Les cinq formes de bloc sont
celles que le prototype dessine, toutes textuelles. Un guide illustré
demanderait un téléversement, un stockage, une purge — c'est-à-dire tout le
dispositif des pièces de dossier, pour un besoin qui n'est pas exprimé.

---

## Annexe Q · Les index, et neuf liens morts

Lot P.A. Il devait ajouter deux pages de rubrique. Il a surtout trouvé que
l'en-tête et le pied de page promettaient neuf adresses en 404, sur
**toutes** les pages publiques, depuis le premier lot.

### Ce qui est tranché

**Q.1 — Le test des liens morts ne voyait pas les liens.** Il lisait les
attributs `href="…"` du JSX. Or une barre de navigation ne s'écrit jamais
comme ça : elle s'écrit `{ href: "/tarifs", libelle: "Tarifs" }` dans une
table, qu'un `.map()` transforme en attributs. Le test regardait partout
sauf à l'endroit où les liens se rassemblent — et c'est précisément
l'endroit dont une erreur se voit sur chaque écran. Trois des quatre
entrées de l'en-tête menaient en 404.

**Q.2 — Un guide ne se classe pas comme un article.** C'était la question
que P.A laissait ouverte. Un article est daté : le plus récent d'abord,
parce qu'un texte de l'an dernier sur une règle qui a changé depuis n'est
pas ce qu'on veut lire en premier. Un guide porte un pays, et celui qu'on
cherche est celui où l'on veut aller, pas le dernier écrit : ordre
alphabétique, qui a le mérite d'être prévisible — on sait où regarder avant
d'avoir lu.

**Q.3 — Et la date affichée non plus.** Un guide montre sa date de
**vérification**, un article sa date de **parution**. Un guide écrit il y a
deux ans mais revérifié le mois dernier vaut mieux qu'un guide publié le
mois dernier et jamais relu depuis ; c'est déjà la date qu'INV-8 impose en
pied de document, la rubrique la remonte pour qu'on choisisse quoi lire sur
le bon critère.

**Q.4 — Les six pages manquantes ne sont pas écrites, et leurs liens sont
retirés.** « Comment ça marche », « À propos », « Contact », « Mentions
légales », « Données personnelles », « Conditions ». Les trois dernières
demandent un siège, un numéro RCCM, un hébergeur, un contrat : les
inventer produirait un document juridique faux, ce qui est pire qu'une
colonne absente. Le lien, lui, promettait déjà ce document sans l'avoir —
le retirer ne crée pas le manque, il cesse de le cacher.

**Q.5 — Un index sans paramètre ne peut pas être régénéré.** Les pages de
document gardent leur cache d'une heure : leur segment dynamique n'est
énumérable par rien, donc Next ne les pré-rend pas au build. Une page
d'index n'a pas de segment : elle est pré-rendue, la base n'existe pas au
build (J.8), et la construction échoue. Les trois index sont donc rendus à
la demande. La différence tient au segment, pas au contenu, et il valait
mieux le constater que le supposer.

### Ce que l'écran a montré, et que la relecture du code n'a pas vu

- **Le pied de page menait à une fiche en 404.** Il nommait trois
  destinations tirées du registre éditorial, qui connaît les slugs mais
  pas ce qui est **publié** : « Émirats arabes unis » est au registre et sa
  règle est en brouillon. Aucun test statique ne peut voir cet état de
  base ; la cause, si — une liste figée dans un composant partagé. La
  colonne pointe maintenant vers le catalogue, qui lit la base.
- **« Consultants partenaires » était une porte close.** L'écran existe,
  derrière la garde candidat : un visiteur anonyme arrivait sur la page de
  connexion sans savoir pourquoi. Ce n'est pas un lien mort, c'en est un
  troisième genre, et le test le refuse désormais — un écran public ne
  mène pas derrière une garde, sauf vers les portes elles-mêmes.
- **Le pied de page annonçait « Toutes les fiches » vers `/resultats`**,
  qui est le classement du simulateur, pas le catalogue. Les deux pages
  existent maintenant et ne disent pas la même chose : P-02 liste ce qui
  est couvert, P-03 classe selon des réponses.

### Ce qui reste à arbitrer

**Q.A — Six pages publiques manquent, dont trois obligatoires.** Retirer
les liens ne retire pas l'obligation : une plateforme qui traite des
données personnelles et encaisse des paiements doit publier ses mentions
légales, sa politique de données et ses conditions. Elles demandent des
informations d'entreprise et une rédaction juridique qui ne sont pas de
notre ressort. « Comment ça marche », « À propos » et « Contact » sont du
marketing, et attendent la même décision : qui les écrit.

**Q.B — Le pied de page ne mène plus à une destination précise.** C'était
sa fonction : donner trois entrées directes vers les pays les plus
demandés, ce qui vaut pour le référencement interne. Le faire correctement
demande de lire la base depuis un composant partagé par toutes les pages
publiques — donc de les rendre toutes dynamiques, y compris le simulateur
et les tarifs, qui n'ont aucune raison de l'être. La question se rouvrira
le jour où l'on mesurera ce que le pied de page apporte vraiment.
