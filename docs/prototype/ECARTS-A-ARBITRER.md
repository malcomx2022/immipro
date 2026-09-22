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
| **L.A** — *décidé sous réserve, 20/09* | Palier, dénombrement, manques ordonnés et explication des facteurs — jamais le nombre (C-09) | `internalScore` sérialisé, ou une explication qui donnerait les coefficients |
| **K.A** — *tranché le 20/09* | Une aide fonctionnelle dans le dossier, les offres sur les surfaces dédiées | Une offre, ou son vocabulaire, dans un écran de l'espace dossier |
| **I.B** — *tranché le 20/09* | Seule la parité fixe du franc CFA convertit ; ailleurs le budget sort du classement | Une seconde parité écrite en dur |
| **N.A** — *tranché le 20/09* | Le rail se déduit de la devise, dans le domaine | Une route qui accepte un fournisseur venu du client, ou un écran du tunnel qui nomme un opérateur |
| **I.D** — *tranché le 20/09* | Quarantaine, puis balayage, puis promotion — et rien ne sort avant | Un repli vers « saine » quand le moteur ne répond pas, ou un texte qui promet un fichier sain |
| **M.C** — *décidé sous réserve, 20/09* | Un reçu, et une référence non séquentielle | Le mot « facture » dans un texte rendu, ou une référence incrémentée |

Un troisième état existe depuis L.A et M.C : **décidé sous réserve**. Le
produit a tranché, mais une compétence qui n'est pas la sienne doit se
prononcer avant un jalon — une validation juridique avant l'ouverture, une
expertise comptable avant le premier encaissement. « Ouvert » laisserait
croire que personne n'a décidé ; « tranché » ferait disparaître la réserve.
Le registre `domain/exploitation/prealables` la porte, et un test vérifie
que le relevé et lui se répondent.

Quatre tests de plus lient le fichier au relevé : les codes cités doivent
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

**I.D — L'antivirus de WF-06 n'a pas de service.** ~~L'étape 2 demande une
analyse antivirus synchrone avant stockage. Les contrôles de format, de
taille et de type MIME sont faits ; le balayage antivirus ne l'est pas, et
il n'est pas non plus déclaré fait.~~ **Tranché le 20/09/2026.**

Tout fichier est d'abord déposé dans une zone de quarantaine dont rien ne
sort, puis balayé avant d'être promu vers le stockage de confiance. Aucun
fichier non balayé n'est téléchargeable, prévisualisable ni transmis à
l'extraction. L'antivirus est un prérequis de mise en production des
téléversements.

« Avant stockage » ne se tient pas littéralement : le moteur doit bien
accéder aux octets quelque part, et les octets sont écrits directement dans
le stockage objet par le navigateur, sans transiter par l'application. La
frontière utile n'est donc pas avant toute écriture, elle est **avant
l'admission dans le stockage de confiance**. Les contrôles de nom, de taille
et de type MIME ne remplacent rien : un PDF de la bonne taille et du bon
type peut porter une charge, et c'est précisément le cas qu'ils ne voient
pas. Scanner indisponible, enfin, veut dire fichier en attente, jamais
fichier accepté par défaut.

### Ce que l'application de la décision a trouvé

**Trois états suffisent, et le quatrième aurait été le défaut.** Un fichier
est en quarantaine, sain, ou écarté. L'indisponibilité du moteur n'en est
pas un de plus : un fichier que personne n'a pu lire *reste* en quarantaine.
C'était la tentation — un état « balayé, probablement sain » pour ne pas
bloquer un pilote — et c'est exactement ce que la décision refuse.

**Deux seaux plutôt qu'un préfixe.** La quarantaine est un seau distinct, et
aucune URL de lecture n'y est jamais signée. Un préfixe dans le même seau se
contourne d'une faute de frappe dans une clé ; une politique de seau non.

**La troisième sortie était l'export.** Écran et aperçu se ferment de la même
fonction — `urlDeLecture` est la seule qui signe une URL de lecture. L'export
de portabilité, lui, décidait tout seul : `telechargeable` regardait la clé
d'objet et la purge, rien d'autre. C'est la sortie qu'on oublie, parce
qu'elle ne s'affiche pas.

**Le méta-test des arbitrages passait grâce au paragraphe d'à côté.** Le bloc
d'un arbitrage était découpé au nombre de caractères — neuf cents — si bien
que celui d'I.D débordait sur celui d'I.E, et que la mention « Tranché » du
voisin répondait pour lui. Le découpage s'arrête maintenant à l'arbitrage
suivant. Un test qui passe grâce à la section d'à côté ne teste rien, et
c'est le genre de défaut qu'un test vert ne signale jamais.

Effet d'exploitation : une instance sans `ANTIVIRUS_URL` refuse les dépôts,
avec un message qui dit que le contrôle manque, et `/api/health` la déclare
inapte. Les versions déjà déposées passent en quarantaine — aucune n'a été
balayée, aucune ne peut donc être déclarée saine.

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

**K.A — RG-13.1 et RG-13.2 se contredisent.** ~~La première demande une
proposition « contextuelle à l'étape » de checklist ; la seconde interdit
« toute proposition commerciale dans l'espace dossier lui-même ». L'étape de
checklist *est* l'espace dossier.~~ **Tranché le 20/09/2026**, en faveur de
la règle la plus protectrice.

Aucune proposition commerciale n'apparaît dans l'espace dossier ni dans sa
checklist. RG-13.1 est réécrite : elle autorise une aide contextuelle liée à
l'étape, et non une offre. Les offres vivent sur les surfaces qui leur sont
dédiées — tarifs, services, annuaire des consultants.

La décision ne cherche pas le compromis, elle déplace la frontière. La
distinction utile n'est pas entre une proposition et plusieurs, mais entre
deux natures : **une aide fonctionnelle** explique quoi faire, **une offre
commerciale** vend une prestation. L'espace dossier est une surface de
confiance et d'exécution ; une recommandation rémunérée posée au moment où
une pièce manque s'y lit comme un péage, quelle que soit sa rédaction.

### Ce que l'application de la décision a trouvé

**Retirer la carte ouvrait un trou que la carte masquait.** Sur les quatre
étapes concernées — assurance, logement, équivalence de diplôme, preuve de
fonds — la plateforme ne fournit pas la pièce, et la checklist ne le disait
nulle part : elle proposait un partenaire, et c'est tout. Sans l'aide
écrite en remplacement, il serait resté « Assurance maladie — à obtenir »
sans dire où ni comment, c'est-à-dire un candidat qui attend la plateforme.
C'est l'aide, et non l'offre, qui manquait vraiment.

**La checklist comptait une offre avant qu'on l'ait regardée.** La lecture
qui l'alimentait inscrivait une ligne de suivi au simple affichage de
l'écran — délibérément, pour ne pas ne mesurer que ce qui rapporte. Mais
rapportée à la décision, cette écriture était elle-même l'acte commercial
qu'on retire : ouvrir sa checklist enregistrait une proposition. Elle a
suivi l'offre sur la surface dédiée, où elle garde son sens.

**Deux des trois issues de T-03 n'ont plus de déclencheur.** L'écran offrait
« voir les créneaux », « continuer seul » et « ne plus me proposer ». Sur une
page où l'on vient de son plein gré, les deux dernières n'ont plus d'objet :
on ne décline pas ce qui n'est pas proposé, et l'interrupteur qui coupe les
offres vit avec les autres consentements. `SANS_SUITE` et `DECLINEE` restent
des états valides d'une ligne de suivi, et le back-office les lit ; plus
rien dans l'interface ne les produit.

**Le mot proscrit se trouve d'abord dans le commentaire qui le proscrit.**
Le garde-fou qui interdit le vocabulaire commercial dans l'espace dossier
échouait sur le commentaire expliquant pourquoi une offre n'y a pas sa
place. Il balaie maintenant les sources débarrassées de leurs commentaires,
comme le fait déjà le contrôle du vocabulaire interdit.

**K.B — L'export de données n'existe pas.** ~~« Télécharger mes données »
(A-05) et « Télécharger mon dossier » (C-11) mènent l'un à l'écran
lui-même, l'autre à une adresse qui répond 404.~~ **Tranché — voir annexe
L.** Les deux écrans existent, et un test refuse désormais tout lien
interne qui ne mène nulle part.

**K.C — Qui supporte le coût d'un rendez-vous annulé par une suppression ?**
~~La suppression libère les créneaux à venir chez le consultant. Mais le
créneau est payé et la grille prévoit des frais au-delà de vingt-quatre
heures.~~ **Tranché le 20/09/2026.**

La suppression du compte n'annule pas les conditions commerciales du
rendez-vous. Avant la limite, il est annulé et remboursé ; après, les frais
prévus restent dus, sauf geste manuel pour force majeure. Le créneau se
libère immédiatement, indépendamment du traitement financier. Les écritures
nécessaires à la comptabilité sont conservées ou anonymisées comme le
prévoit déjà RG-10.4.

Les deux autres issues avaient chacune leur défaut. Rembourser à tout
moment ferait de la suppression un contournement des conditions
d'annulation : il suffirait de supprimer son compte une heure avant pour ne
rien payer. Retenir systématiquement, même la veille d'un créneau à trois
semaines, serait plus dur que la règle ordinaire — et la suppression de
compte est précisément le moment où l'on ne veut pas surprendre.

*Réserve conservée : la rédaction des conditions générales reste à faire
valider.*

### Ce que l'application de la décision a trouvé

**Décidé n'est pas versé, et la base devait distinguer les deux.** Écrire
`REMBOURSEE` au moment de la décision aurait annoncé un virement que
personne n'a fait : aucune API de remboursement n'est branchée (I.C).
`refundDueAt` ouvre l'obligation, `refundedAt` la solde, et c'est la
notification signée du fournisseur qui écrit la seconde. Entre les deux, le
back-office voit une dette — et un compteur, sans quoi un remboursement
décidé vieillirait sans se signaler nulle part.

**Une dette prime sur un rapprochement réussi.** L'état de rapprochement se
lisait dans un ordre où `CONFIRMEE` répondait le premier : une transaction
rapprochée dont on doit l'argent se serait affichée « Rapproché », et
personne n'aurait rendu la somme. La condition passe devant.

**Le candidat doit lire la retenue avant le bouton, pas après.** L'écran de
suppression écrit déjà « ce qui reste » avant de confirmer, pour cette
raison exactement : découvrir après coup qu'une trace subsiste, c'est avoir
été trompé même quand la trace est légitime. Une consultation retenue est
du même ordre, en plus cher. L'écran nomme donc chaque rendez-vous à venir
et dit lequel est remboursé, lequel reste dû, et pourquoi.

**L'ordre des écritures n'est pas indifférent.** L'annulation des créneaux
vit dans la transaction d'anonymisation ; l'ouverture des remboursements
vient après. Une obligation qui échouerait ne doit pas faire échouer une
suppression, qui est la promesse faite au candidat. Et les rendez-vous sont
lus **avant** d'être annulés : lus après, la condition d'état ne trouverait
plus rien et le traitement financier ne porterait sur personne.

**K.D — Le premier partenaire reste à signer.** **Tranché le 21/09/2026 :
aucune activation avant contrat réel.**

Aucun partenaire, aucun taux de commission et aucun parcours partenaire
n'est activé en production avant la signature d'un contrat. Le jeu de
démonstration reste utilisable en démonstration et en test seulement ; en
production, l'absence d'activation explicite continue de rendre le
partenaire invisible. Ni taux par défaut inventé, ni partenaire de
démonstration pris pour un partenaire réel.

Le premier contrat devra fixer au minimum : le genre de prestation, les
destinations couvertes, le taux ou le montant de la commission, la devise
de facturation, le fait générateur, le traitement des annulations et
remboursements, la méthode et la périodicité du rapprochement, et les
dates d'entrée en vigueur et de fin.

### Ce que l'application de la décision a trouvé

**Les trois interdits tenaient déjà, et par trois mécanismes différents.**
Le filtre d'activation est dans la requête — `activations: { some: {
countryCode: pays, revokedAt: null } }` — et non dans l'affichage ; le jeu
de démonstration refuse de s'écrire quand `NODE_ENV` vaut `production` ;
`enregistrerLAboutissement` n'a aucun appelant. Rien n'était à corriger,
et c'est ce qu'il fallait vérifier plutôt que supposer.

**Aucun des trois ne se voit en relisant un écran**, et c'est ce qui les
rend fragiles : une requête dont on retire une ligne, un garde de
démarrage qu'on désactive « le temps d'un essai », une fonction qu'on
branche parce qu'elle est écrite. Chacun a désormais son test, et les
quatre sont éprouvés par mutation — le quatrième sort le nom du fichier
qui a branché la fonction.

**Le registre énumère ce que le contrat doit fixer ; il ne modélise pas un
contrat.** Inventer un modèle `PartnerContract` maintenant reviendrait à
deviner la forme d'un accord qui n'existe pas, et ses colonnes prendraient
des valeurs par défaut — exactement ce que K.D interdit. Un test refuse
d'ailleurs qu'un chiffre s'y glisse : un taux d'exemple écrit là
deviendrait, par copie, le taux appliqué. C'est la faute que Q.A évitait
sur les mentions légales, au même endroit du raisonnement.


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
distinction, et l'information sur la logique d'un traitement automatisé est
encore autre chose. **Décision produit provisoire du 20/09/2026 —
validation juridique obligatoire avant lancement.**

L'export individuel porte les données fournies par la personne, les
résultats effectivement utilisés pour son dossier, le palier, le
dénombrement et une explication intelligible des principaux facteurs. Il
n'expose ni le nombre que C-09 a retiré, ni le barème exhaustif comme s'il
s'agissait d'une donnée personnelle brute.

Ce que la réserve couvre : la validation juridique doit confirmer si le
contexte d'utilisation impose une information supplémentaire sur la logique
du calcul. L'arbitrage entre portabilité, droit d'accès et information sur
un traitement automatisé dépend du cadre applicable et de l'usage réel du
calcul — il ne revient pas à l'équipe produit de le trancher seule.

### Ce que l'application de la décision a trouvé

**Le relevé n'avait que deux états, et aucun ne convenait.** « Ouvert »
aurait laissé croire que personne n'a décidé ; « tranché » aurait fait
disparaître la réserve, qui est précisément ce qu'il ne faut pas perdre de
vue. Un troisième état existe désormais — décidé, sous condition — et un
test exige qu'un arbitrage qui le porte **nomme** sa condition : qui doit
valider, quoi, et avant quand. Une réserve qui ne dit pas cela devient,
six mois plus tard, un arbitrage que tout le monde croit fermé.

**L'explication devait décrire le calcul qui décide, pas celui que le
document décrit.** WF-07 énumère quatre composantes pondérées : pièces
obligatoires, conditions bloquantes, cohérence inter-documents, qualité
rédactionnelle. Le palier montré au candidat n'en pèse qu'une. Les
conditions chiffrées sont reportées sur la pièce qui les porte — leur
résultat *est* le verdict de cette pièce — et les deux composantes
confiées à l'IA sont neutres dans ce calcul-là. Réciter les quatre aurait
été plus flatteur et faux : quelqu'un qui lit « la cohérence entre tes
pièces compte » en tire une conclusion sur un calcul qui ne la regarde
pas. L'explication dit donc les deux : ce qui décide, et ce que le
référentiel prévoit sans que cela pèse ici.

**L'ordre des manques est la seule trace visible de la pondération, et il
est désormais dans l'export.** C'était le point le plus utile à restituer
et le plus facile à oublier : le classement des manques n'est pas
arbitraire, il sort du gain interne de chacun. Le dire sans l'exporter
aurait été une affirmation invérifiable par qui lit le fichier.

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
par Mobile Money, euros par carte. ~~Reste à savoir si le produit veut un
choix d'opérateur, ce qui suppose que FedaPay en expose un.~~ **Tranché
pour la V1 le 20/09/2026.**

Aucun choix d'opérateur ni d'autre numéro n'est affiché tant que le
fournisseur ne l'expose pas réellement et que le besoin n'est pas
constaté. Une option d'interface sans capacité derrière est un faux choix,
et un faux choix coûte plus cher qu'une absence de choix : il fait
chercher un réglage qui n'existe pas, au moment précis où un paiement
vient d'échouer. La seule alternative réellement prise en charge est de
changer de grille, et elle en est une — les deux grilles sont distinctes,
ce n'est pas une conversion. Un choix d'opérateur pourra s'ajouter si
l'API permet de le piloter et si cela améliore réellement le taux de
paiement.

### Ce que l'application de la décision a trouvé

**La règle du sujet n'était écrite nulle part.** « Le rail suit la devise »
vivait dans un `create` Prisma — `provider: devise === "XOF" ? "FEDAPAY" :
"STRIPE"` — et quatre écrans la redisaient chacun à leur façon. C'est
exactement ainsi que les pastilles du prototype ont survécu à leur propre
correction : la page d'échec avait été reprise au lot N, et la page des
packs annonçait toujours « MTN MoMo · Moov Money · Carte bancaire » en
trois pastilles, c'est-à-dire en trois options. Une règle sans domicile se
recopie, et une copie ne se corrige pas avec l'original.

**La section répond maintenant à la question qu'elle posait.** « Par quoi
vais-je payer ? » a une réponse, et le candidat vient de la déterminer sur
le même écran en choisissant sa grille. S'y ajoute la précision qui évite
la question suivante : le débit passe par l'opérateur du numéro, quel
qu'il soit, et il n'y a personne à désigner.

**La devise d'un paiement était typée `string`.** L'écran d'échec propose
de repayer dans l'autre grille ; il lisait donc une chaîne de trois
caractères pour décider laquelle. Elle est désormais reconnue à la
lecture, avec la même doctrine que l'état d'un reçu : une valeur inconnue
ne devient pas une devise par défaut.

*Point relevé, hors décision :* la page d'accueil et la page des tarifs
annoncent « MTN MoMo et Moov Money ». C'est une annonce de couverture et
non un choix — donc hors de ce que N.A tranche — mais elle nomme deux
opérateurs dont la prise en charge dépend du contrat FedaPay, qui n'est
pas signé (I.C).

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

**O.A — FedaPay ne dit pas pourquoi, et c'est une limite du rail.**
~~La différence tient au fournisseur, pas au produit.~~ **Tranché pour la
V1 le 20/09/2026** : le motif reste générique et non accusatoire.

Tant que FedaPay n'expose pas un code fiable et documenté, le produit ne
déduit pas un solde insuffisant et n'interroge pas une seconde API dans le
seul but de fabriquer une précision incertaine. La parité entre les rails
n'est pas plus importante que l'exactitude : « l'opérateur n'a pas
confirmé » est moins précis, mais ne donne pas une fausse cause. Une étude
de la documentation dira plus tard si un code stable peut enrichir la
catégorie interne ; elle ne bloque rien.

### Ce que l'application de la décision a trouvé

**L'accusation ne vivait pas là où le garde-fou la cherchait.** N.B avait
déjà rendu le titre et le corps honnêtes — « la raison ne nous est pas
communiquée » — et un test vérifiait ces deux champs. Mais l'encadré
« ce que tu peux vérifier » s'ouvrait sur **« le solde disponible doit
couvrir 5 000 F au moment de la confirmation »** : la ligne la plus lue de
l'écran nommait la cause que les deux autres champs disaient ignorer. Le
candidat recharge un portefeuille qui n'était pas en cause, réessaie, et
échoue une seconde fois.

C'est la même leçon qu'en N.C, à un lot d'intervalle : un garde-fou qui
connaît deux champs sur trois garde deux champs sur trois. Il lit
maintenant les vérifications, avec une seule phrase nommée en exception —
« compose le *880# pour consulter ton solde », qui est une action et non
un diagnostic.

**Le rail n'était pas dans la phrase.** En cherchant ce que le refus
générique pouvait dire sans cause, un second défaut est apparu : les
textes d'échec parlaient à tout le monde comme à un payeur Mobile Money.
Un candidat qui paie par carte en euros — Stripe, code de refus inconnu,
même case générique — lisait « ton **opérateur** n'a pas confirmé » et
« compose le **\*880#** », un code USSD d'opérateur béninois. Le rail entre
désormais dans `echecPourMotif`, et le vocabulaire suit : la banque plutôt
que l'opérateur, le relevé plutôt que le code USSD.

**Les trois actions utiles sont déjà là.** La décision en nomme trois —
réessayer, vérifier son portefeuille, employer l'autre grille. Vérifié à
l'exécution sur les deux rails : le bouton « Réessayer le paiement » et la
section « Autre moyen de paiement » les portent déjà, et l'encadré porte la
vérification de l'instrument. Les redire dans l'encadré en aurait fait un
doublon des commandes situées dessous — c'est la faute de N.A, une règle
sans domicile recopiée partout où elle sert.

**Un commentaire décrivait un comportement disparu.** L'en-tête de $-05
annonçait encore « un motif inconnu retombe sur le délai dépassé », que
N.B avait remplacé. Un commentaire faux se lit comme une intention, et la
prochaine correction se serait appuyée dessus.

*Reste ouvert :* les cinq autres motifs d'échec supposent toujours le rail
Mobile Money dans leur prose — « la notification Mobile Money peut arriver
avec du retard », « sur ton téléphone ». Seul le code USSD, qui affirmait
une fausse instruction, a été corrigé partout. Réécrire les cinq est un
travail de rédaction sur six écrans, qu'O.A n'a pas tranché : à arbitrer.

**O.B — Combien de temps garder le motif d'un compte vivant ?**
~~Une purge à l'échéance relève de la politique de rétention et non de ce
lot.~~ **Tranché le 20/09/2026 : quatre-vingt-dix jours.**

Le motif détaillé s'efface quatre-vingt-dix jours après l'échec définitif.
Un dossier ouvert pendant ce délai suspend l'effacement jusqu'à sa
clôture, puis trente jours de sursis. Le paiement — montant, date, statut,
référence — suit sa propre politique comptable et n'est pas touché : c'est
parce que le motif vit dans sa propre colonne que la minimisation est
réelle plutôt que déclarative.

### Ce que l'application de la décision a trouvé

**Rien ne datait l'échec.** `createdAt` date l'ouverture de la
transaction, pas son échec, et pour une expiration prononcée par la
réconciliation il y a des heures entre les deux. Une durée annoncée en
jours se compte depuis le fait qu'elle mesure : une colonne `failureCauseAt`
est née, que la base refuse de séparer du motif dans un sens comme dans
l'autre.

**Le sursis de trente jours, lu littéralement, raccourcissait la
conservation.** « Puis intervient trente jours plus tard » se lit comme une
échéance de remplacement : une réclamation ouverte le deuxième jour et
refermée le cinquième aurait fait disparaître le motif au
trente-cinquième, soit bien avant les quatre-vingt-dix jours que la même
décision garantit au support — et ouvrir puis refermer une réclamation
serait devenu un moyen d'effacer plus tôt que la règle. Les deux échéances
valent donc ensemble, et c'est la plus tardive qui s'applique. Le sursis ne
peut qu'ajouter du temps.

**Une des deux branches du litige ne pouvait pas se produire.** La
première version lisait deux signaux de dossier ouvert : l'écart de
réconciliation, et le remboursement dû non versé (K.C). Semer le second
contre PostgreSQL a échoué —
`transaction_remboursement_du_suppose_un_encaissement` veut `CONFIRMEE` ou
`REMBOURSEE`, `transaction_motif_seulement_sur_un_echec` veut `ECHOUEE` ou
`EXPIREE`. Les deux ensembles sont disjoints : une transaction qui porte un
motif ne peut pas porter d'obligation de remboursement. La branche était
morte, et une règle qui ne peut pas s'appliquer se relit comme une
protection qu'on aurait.

**Quatre garde-fous existants passaient pour la mauvaise raison.** Les
insertions interdites de N.B écrivent `failureCause` sans date : la
nouvelle contrainte les refusait toutes les quatre en premier, avant celle
que chacune teste. Le décompte restait à quarante-cinq refus et rien ne
signalait rien. Elles portent désormais la date, et chacune bute à nouveau
sur sa propre contrainte — vérifié une par une. Le fichier en compte
quarante-huit.

**La requête écartait un motif que la règle effaçait.** La purge réduit
grossièrement par la date avant de laisser le domaine trancher. Elle le
faisait avec `lt` quand la règle inclut sa borne : un motif échu du jour
même n'était pas présenté à la règle, et partait le lendemain. Les deux
côtés avaient raison séparément — c'est le défaut même que le lot des
conservations existe pour empêcher, arrivé par la requête au lieu de la
constante.

**Un garde-fou se laissait berner par un import.** Remplacer
`echeanceEnJours(CONSERVATION_MOTIF_JOURS, …)` par `echeanceEnJours(90, …)`
ne faisait tomber aucun test : le nom de la constante restait visible dans
l'import et dans le motif du journal, et « une durée déclarée a un
exécutant » cherche le nom quelque part dans `src/server`. La conservation
aurait pu être raccourcie à la constante sans que la purge change d'un
jour. Aucune échéance ne se calcule plus sur un nombre écrit à la main, et
un test le tient pour les trois.

**La dégradation est la bonne.** Vérifié à l'écran : un échec dont le motif
a été effacé retombe sur le refus générique d'O.A — « l'opération a été
refusée, et la raison ne nous est pas communiquée ». L'écran perd une
précision, il ne gagne pas une erreur.

*Reste ouvert :* **le sursis de trente jours n'a aucun déclencheur.** Le
seul dossier qui peut coexister avec un motif est l'écart de
réconciliation, et rien n'enregistre sa résolution — le bouton « Traiter
les écarts » de B-04 n'a pas d'action derrière lui. Un écart suspend donc
tant qu'il est là, ce que la décision demande, mais sa clôture ne se date
pas. La règle est écrite et vérifiée ; il lui manque l'événement. À
reprendre avec la résolution des écarts en back-office, qui est un manque
à elle seule.

**N.C — La case des conditions passe sous la barre d'action.** ~~Elle reste
atteignable, et c'est la structure du prototype.~~ **Tranché le
20/09/2026**, en faveur de la visibilité du consentement.

La case d'acceptation fait partie de la zone d'action, immédiatement
au-dessus du bouton de paiement. La barre ne recouvre jamais le contrôle
qui déverrouille son propre bouton. Pas de marge compensatoire calée sur
une hauteur : la zone d'action contient structurellement le consentement.
Et si l'ensemble ne tient pas proprement, la barre cesse d'être collante
sur cet écran — conserver la barre est secondaire, rendre son prérequis
accessible ne l'est pas.

### Ce que l'application de la décision a trouvé

**Le défaut se mesure, et il a été mesuré.** À 390 × 844, la barre occupait
715→844 et la case 757→865 : l'élément qui déverrouille le bouton était
exactement sous le bouton, et débordait sous la ligne de flottaison.

**La barre ne tenait pas, case comprise.** Une fois le consentement placé
dedans, elle mesurait 245 px — 29 % d'un écran de 390 × 844, et **38 %
d'un 360 × 640**, avant le bloc d'échec qui la fait grandir au moment
précis où le candidat cherche la case. La décision prévoyait ce cas : la
barre cesse d'être collante ici. Sur écran large, la colonne d'action ne
bouge pas.

Après correction, aux deux largeurs : case et bouton visibles ensemble,
case immédiatement au-dessus, et rien ne la recouvre — vérifié par
`elementFromPoint` au centre de la case, pas seulement à l'œil.

**Le garde-fou écrit une heure plus tôt ne voyait pas ce cas, et son
élargissement non plus.** Le test du tutoiement des boutons désactivés,
ajouté pendant N.A, ne lisait que la forme littérale
`raisonDesactivation="…"`. L'écran de paiement porte
`raisonDesactivation={coche ? undefined : "Acceptez…"}` — une expression —
et passait à travers : cinq phrases sont sorties en l'élargissant. Une
fois les expressions lues, l'inscription passait encore, parce qu'elle
range sa phrase dans un `const raison = …` et que l'expression ne porte
alors aucune chaîne : une sixième. Le garde-fou résout maintenant les
constantes et les fonctions du même fichier, et il s'arrête là — suivre
les imports ferait de lui un compilateur, et ce qui vient d'ailleurs est
une constante de domaine que le balayage lit dans son propre fichier.

Trois formes d'écriture, trois élargissements, un vouvoiement de plus à
chaque fois. Un garde-fou ne garde que la forme qu'il connaît.

*Reste ouvert :* la décision mentionne « la case **et son lien** vers les
conditions ». Le lien n'existe pas, faute de page : les conditions
générales font partie des trois pages en attente de Q.A. La case nomme
donc les conditions sans y mener, et un lien mort serait pire. À reprendre
dès que Q.A tombe.

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
comptables. **Décision produit provisoire du 20/09/2026 — expertise
comptable obligatoire avant tout encaissement commercial.**

Le document continue de s'appeler « reçu » et n'est pas présenté comme une
facture. Avant le premier encaissement commercial, un comptable détermine
si une facture est requise, quelles mentions elle doit porter et selon
quelle séquence de numérotation. Si elle l'est, elle devient un document
**distinct** du reçu, avec sa propre numérotation continue — le reçu
restant utile comme preuve immédiate du paiement.

Une référence de transaction ne se renomme pas en numéro de facture : la
numérotation dépend du régime comptable, de l'entité qui encaisse et
éventuellement de séries autorisées. Définir une convention avant de
connaître l'entité juridique reviendrait à la redéfinir ensuite, sur des
pièces déjà émises.

### Ce que l'application de la décision a trouvé

**Deux arbitrages du même jour ont produit une réserve que rien ne tenait.**
L.A attend une validation juridique, M.C une expertise comptable, et les
deux ne vivaient que dans ce fichier — c'est-à-dire surveillées par qui
l'ouvre. C'est le défaut exact qu'I.C a corrigé pour les services absents.
Un registre les nomme désormais (`domain/exploitation/prealables`) : la
question posée, la compétence qui tranche, le jalon bloqué, et ce que le
produit fait en attendant.

Le registre ne prétend pas les tenir, et c'est délibéré. Aucun test ne peut
vérifier qu'un comptable a rendu son avis ; un drapeau « validé » à cocher
serait coché. Ce qu'il garantit est plus modeste et vérifiable : aucune de
ces réserves ne disparaît en silence, le relevé et lui se répondent.

**Le méta-test des réserves ne valait que pour la première.** Écrit la
veille pour L.A, il épelait « validation juridique » et « avant lancement ».
M.C, dont la réserve est comptable, l'aurait fait échouer sans rien
apprendre à personne — le test aurait dit « réserve mal formulée » là où la
réserve était simplement d'une autre nature. Il s'appuie maintenant sur le
registre, qui porte la condition, plutôt que sur des mots attendus dans de
la prose.

**Le mot « facture » désignait déjà un document inexistant.** Un commentaire
du reçu disait « Émetteur, sur le reçu comme sur la facture ». Une phrase
suffit à installer l'idée qu'il y en a une, et c'est précisément ce que la
décision réserve à un comptable.

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

**P.B — Une seule version, pas d'historique.** ~~C'est une question de
gouvernance éditoriale, pas de produit.~~ **Tranché le 20/09/2026** en
faveur d'un historique des publications uniquement.

Une version immuable à chaque publication, aucune à l'enregistrement d'un
brouillon. La précédente reste consultable par les administrateurs et peut
être restaurée ; le journal d'audit référence la version publiée. Ne pas
figer un guide dans un dossier ne dispense pas de savoir ce qui était
public : la trace désignait un contenu que la republication avait effacé.

### Ce que l'application de la décision a trouvé

**« À chaque publication » ne voulait pas dire « à chaque clic sur
Publier ».** La route d'enregistrement invalide le cache de la page dès
qu'elle écrit sur un document déjà publié : le texte change sous les yeux
du public à la seconde, sans passer par le bouton. Ne versionner que le
bouton aurait donné un historique troué **sur le chemin le plus courant**
— corriger un guide en ligne — tout en promettant une preuve de ce qui
était public. La règle appliquée est donc : une version à chaque fois que
ce que le public lit change. Un brouillon n'est lu par personne et n'en
crée aucune, ce que la décision demande.

Le motif n'y est pas saisi : cette route n'en demande pas, et exiger une
justification pour corriger une coquille pousserait à ne pas corriger. La
version porte donc « Correction enregistrée sur un document déjà publié »,
qui décrit le fait sans prétendre le justifier.

**Restaurer n'est pas ressusciter.** Republier le texte d'une ancienne
version crée une version de plus, dont le contenu se trouve être l'ancien.
L'histoire s'allonge, elle ne se réécrit pas — et c'est ce qui permet de
lire plus tard « le 20 septembre, retour au texte du 3 mars ». Vérifié
contre PostgreSQL : brouillon → aucune version ; publication → v1 ;
correction en ligne → v2 ; restauration de la v1 → v3 portant le texte de
la v1, la v1 elle-même intacte.

**L'immuabilité n'est pas une contrainte SQL, et le dire vaut mieux que le
laisser croire.** Aucun `CHECK` n'empêche un `UPDATE`, et le dépôt
n'emploie aucun déclencheur : en introduire un pour cette table seule
aurait ajouté un mécanisme à connaître là où la table voisine — le journal
d'audit — tient la même promesse autrement. L'immuabilité tient donc par
l'absence d'écrivain, et un test refuse tout appel à `editorialVersion` en
mise à jour ou en suppression. La migration l'écrit noir sur blanc.

**Un champ optionnel aurait fait parler la route dans le mauvais
vocabulaire.** Le rang à restaurer n'avait de sens que pour une action sur
trois ; en faire un champ facultatif obligeait la route à le vérifier à la
main, puis à refuser une requête mal formée avec le vocabulaire d'un refus
de publication. Un test existant l'a signalé — il interdit précisément
cette confusion. Une union discriminée met la règle dans le schéma.

**Et deux défauts vus en lisant l'écran, pas le code.** La section rendait
« veilleur-1 · vérifiée le 2026-09-01 » : un identifiant brut et une date
ISO au milieu d'une phrase française. La table garde l'identifiant, qui est
durable ; c'est la lecture qui résout l'adresse, avec l'identifiant en
repli — un compte supprimé (RG-10.4) n'a plus d'adresse, et la ligne doit
survivre à son auteur. Les deux chemins ont été vérifiés.

*Observé sans être corrigé :* l'écran du journal d'audit affiche lui aussi
l'identifiant brut de l'acteur, sur toutes ses lignes. C'est la convention
existante, et la changer touche une surface qui n'est pas celle de ce lot.

**P.C — Les images ne sont pas au périmètre.** **Fermé hors périmètre V1
le 20/09/2026.**

Aucun téléversement générique d'images n'est ajouté, et aucune illustration
extérieure appelée par son adresse : elle troquerait le stockage et la
sécurité contre la pérennité du lien et la confidentialité du lecteur, dont
l'adresse IP partirait chez un tiers à chaque ouverture du guide. Le besoin
sera rouvert **à partir de contenus identifiés** que les cinq formes
textuelles n'expriment pas correctement — pas quand le temps le permettra.
Un cas justifié donnera lieu à un périmètre média conçu pour lui.

### Ce que l'application de la décision a trouvé

**La frontière tenait déjà, et c'est ce qu'il fallait vérifier plutôt que
supposer.** Les cinq formes sont une union fermée, les textes sont rendus
comme enfants JSX — React les échappe —, l'appel à l'action n'accepte
qu'une adresse interne, et aucune page publique ne rend d'image pilotée
par le contenu. Rien n'était à retirer.

**Mais une décision de ne rien construire ne laisse aucun code derrière
elle**, et c'est précisément ce qui la rend fragile : il n'y a rien à
relire pour s'apercevoir qu'elle a cessé d'être vraie. Deux des trois
côtés étaient déjà tenus par des tests — un type inconnu est refusé, une
adresse externe aussi. Les deux qui manquaient sont ceux par lesquels
l'image serait entrée :

- **Le vocabulaire des blocs n'était pas énuméré.** Le test existant refuse
  un type *inconnu* ; ajouter `image` à l'union l'aurait rendu connu, et il
  serait passé. Les cinq types sont maintenant listés, et aucun champ de
  bloc ne peut porter un nom d'adresse de média.
- **Le rendu du texte n'était pas tenu.** Un paragraphe est une chaîne
  libre : rendu en HTML, il aurait suffi d'y écrire une balise pour
  illustrer un guide, sans toucher au schéma. Le test refuse désormais
  `dangerouslySetInnerHTML` dans tout le produit — c'est le seul mécanisme
  par lequel une chaîne saisie devient du balisage.

**Et l'écran pouvait diverger du schéma sans bruit** : une forme ajoutée au
schéma et absente du formulaire serait invisible, une forme du formulaire
absente du schéma serait refusée à l'enregistrement sans que rien ne dise
pourquoi. Les deux listes sont vérifiées identiques.

La condition de réouverture est écrite là où l'on ajouterait un sixième
type, et un test refuse qu'elle se dilue en « quand on aura le temps ».

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

**Q.A — Six pages publiques manquent, dont quatre obligatoires.**
**Arbitrage d'attribution clos le 20/09/2026**, le contenu des quatre
pages obligatoires restant suspendu à une validation juridique avant
l'ouverture au public.

Retirer les liens ne retire pas l'obligation. La question n'était pas
« faut-il ces pages » mais **qui les écrit**, et c'est elle qui est
tranchée : mentions légales et conditions à la direction avec un conseil
juridique, politique de données au responsable conformité avec le même
conseil, contact aux opérations. Ces quatre-là commandent l'ouverture au
public. « Comment ça marche » revient au produit — souhaitable avant un
lancement public, pas bloquant pour un pilote fermé — et « À propos » à la
direction, sans porte. **Aucun lien n'est rétabli avant que sa page soit
complète et validée.**

| Page | Responsable | Porte |
|---|---|---|
| Mentions légales | Direction et conseil juridique | Ouverture publique |
| Données personnelles | Conformité et conseil juridique | Ouverture publique |
| Conditions | Direction et conseil juridique | Ouverture publique |
| Contact | Opérations et support | Ouverture publique |
| Comment ça marche | Produit et contenu | Souhaitable |
| À propos | Direction et marketing | Aucune |

### Ce que l'application de la décision a trouvé

**Contact change de camp, et ce n'est pas un détail.** Le relevé le
rangeait avec « Comment ça marche » et « À propos », sous l'étiquette
marketing. Il n'y est pas : une plateforme qui encaisse doit offrir une
voie de recours réellement relevée, et une adresse qui ne répond pas est
pire que pas d'adresse. Il passe donc de trois pages bloquantes à quatre.

**Le registre ne comble pas le manque, il le décrit — et un test l'y
tient.** La tentation d'écrire « un brouillon en attendant » est réelle et
mauvaise : une phrase plausible dans un fichier du dépôt devient, par
copie, le texte publié. Le registre porte ce qui manque à chaque page — un
siège et un numéro d'immatriculation, un contrat, quelqu'un derrière
l'adresse — et un test refuse qu'il se mette à ressembler à un document
juridique rédigé.

**Il ne prétend pas davantage qu'une page est validée.** Aucun test ne
peut vérifier qu'un juriste a relu un texte, et un drapeau « validé »
serait coché — c'est la leçon de M.C, et elle vaut ici. Ce que le registre
tient est vérifiable, et c'est la moitié utile de la règle des liens : une
page déclarée absente l'est réellement, et rien ne pointe vers elle. **Le
jour où la route apparaît, fût-ce une ébauche, le test tombe** et oblige à
revenir au registre, là où le responsable et la condition sont écrits. Une
page à moitié faite ne devient pas liable en silence.

**Le méta-test des arbitrages s'était sur-ajusté une seconde fois.** Il
exigeait des décisions « sous réserve » la formule « **Décision produit
provisoire** », qui décrit L.A et M.C — un produit décide, un avis
extérieur peut le renverser. Q.A n'est pas de cette forme : son
attribution est close pour de bon, et ce qui reste suspendu est le contenu
que d'autres doivent écrire. Le faire se décrire comme provisoire aurait
été faux. C'est exactement le reproche que ce test s'était déjà adressé à
propos de L.A, revenu par le vocabulaire au lieu de la condition.

**Et les quatre pages bloquantes rejoignent les préalables d'ouverture**,
plutôt que de vivre dans un troisième registre qui ne se lit avec aucun
autre. Qui prépare l'ouverture au public lit désormais la même liste.

**Q.B — Le pied de page ne mène plus à une destination précise.**
**Fermé sans liens dynamiques pour la V1, le 20/09/2026.**

Le pied de page reste stable et mène au catalogue. Les trois destinations
du moment ne reviendront que si des mesures montrent un gain de navigation
ou de référencement qui justifie le coût. « Les plus demandées »
demanderait d'ailleurs de définir une période, une mesure, et ce qu'on
fait d'une fiche qui cesse d'être publiée — trois décisions pour trois
liens. Une liste codée en dur recréerait à l'identique le défaut trouvé en
P.A : elle ne sait pas ce qui est publié.

### Ce que l'application de la décision a trouvé

**Un des trois mécanismes sur lesquels la décision s'appuie n'existait
pas.** Elle dit que les liens profonds sont assurés par le catalogue, les
pages éditoriales **et le plan du site**. Les deux premiers existaient ; le
troisième, non. Mieux : `adressesPubliees` avait été écrite pour lui — son
commentaire dit « pour le plan du site » — et **aucun appelant ne la
lisait**. Une fonction en attente d'une page qui n'a jamais été faite.

Le plan du site existe maintenant, et c'est exactement le compromis que
Q.B défend : **une seule route dynamique**, celle dont les moteurs se
servent pour trouver les pages profondes, au lieu de toutes les pages du
gabarit.

**Le piège de Q.5, au même endroit et pour la même raison.** Un plan du
site n'a pas de segment dynamique : Next le pré-rend au build, et le build
tourne sans base de données. Vérifié en retirant `force-dynamic` :

    Error occurred prerendering page "/sitemap.xml"
    Error [PrismaClientInitializationError]:
    error: Environment variable not found: DATABASE_URL.

**La clé d'environnement existait déjà.** J'allais en introduire une
seconde — `NEXT_PUBLIC_SITE_URL` — alors que `.env.example` porte `APP_URL`
depuis le premier lot, sans aucun lecteur dans `src/`. Le plan du site est
son premier.

**Et le domaine ne lit pas l'environnement.** La première version y plaçait
`process.env.APP_URL` : aucun module de `src/domain/` ne l'avait jamais
fait, et la règle d'architecture le dit — le domaine ne connaît ni Prisma,
ni Next, ni le réseau. L'origine est passée à la fonction pure, et c'est la
route qui la lit.

**Rien de non publié n'y figure**, vérifié contre PostgreSQL sur les quatre
états : la fiche en brouillon est absente — c'est « Émirats arabes unis »,
précisément celle qui menait en 404 depuis le pied de page — et le guide en
brouillon comme l'article retiré le sont aussi. Un plan du site est lu par
des moteurs : y faire figurer un brouillon serait la version automatisée du
défaut de P.A.

**Enfin, une supposition fausse rattrapée par la lecture.** Le premier
garde-fou affirmait que l'accueil n'avait aucune raison d'être dynamique.
Il l'est, et pour sa propre raison : il liste les fiches publiées, qu'une
dépublication doit pouvoir vider en minutes. Ce que Q.B refuse n'est pas
qu'une page lise la base, c'est qu'un composant partagé rende dynamiques
celles qui ne lisent rien.

---

## Annexe R · Les constats accumulés, arbitrés

Cinq manques relevés au fil des lots, qu’aucune décision ne couvrait.
Arbitrés le 21/09/2026, et traités un par un.

### R.1 — La résolution des écarts en back-office

**Tranché : la résolution appartient au back-office, la vérité financière
non.**

B-04 affichait « Traiter les N écarts » sur un bouton sans action. Un
écart s'ouvrait au bout de vingt-quatre heures et ne se refermait jamais.
Il ouvre désormais la file : constat sous les yeux, issue fermée parmi
quatre, note obligatoire, date, acteur, journalisation. L'écart n'est pas
effacé — l'historique garde la question à côté de la réponse.

**Une action manuelle ne déclare jamais un paiement encaissé ou
remboursé.** « Remboursement à initier » est une issue de guichet, pas un
virement. Seule la notification signée du fournisseur fait bouger l'argent
(INV-7), et un test le vérifie sur le `data` de l'écriture plutôt que sur
l'intention du commentaire.

**Et c'est le déclencheur qu'O.B attendait.** O.B avait écrit la règle du
sursis de trente jours en constatant qu'aucun événement ne pouvait la
dater. La date de résolution est cet événement : l'échéance du motif
devient la plus tardive entre quatre-vingt-dix jours après l'échec et
trente jours après la clôture.

#### Ce que l'application de la décision a trouvé

**Une contrainte CHECK écrite et qui ne gardait rien.** Elle disait
`btrim("discrepancyNote") <> ''` sur une colonne nullable. Sur `NULL`,
l'expression vaut `NULL`, et une contrainte CHECK **passe** quand elle
vaut `NULL` — seul `FALSE` rejette. Une clôture sans note entrait donc en
base, et le script de vérification l'a **acceptée** : cinquante-six refus
au lieu de cinquante-sept, un écart d'une ligne dans un décompte qu'on lit
comme un total. Le `IS NOT NULL` est désormais explicite. Le piège ne vaut
que pour les colonnes nullables ; ailleurs, la même forme porte sur des
colonnes `NOT NULL`, où elle est sûre.

**Le compteur ne pouvait toujours pas redescendre après la correction.**
Vu en refermant un écart dans l'écran : la base portait l'issue, la note
et la date, et la ligne réaffichait « Écart à traiter » au rechargement.
La dernière ligne de `etatDuRapprochement` ne lit pas `discrepancy` du
tout — elle déduit l'écart de l'**âge** de la transaction — et rouvrait
donc ce que la résolution venait de refermer. Le test unitaire ne voyait
rien : il vérifiait la première ligne de la fonction, pas la dernière.
Après correction, le paiement reste « en attente de rapprochement », ce
qui est vrai, mais sort de la file, parce qu'il a été travaillé.

**La chaîne complète, exécutée contre PostgreSQL :**

    au départ                     motif=DELAI_DEPASSE  écart=présent clos=non
    purge → 0 motif effacé        (écart ouvert : suspendu)
    écart refermé il y a 20 j     clos=2026-09-01
    purge → 0 motif effacé        (sursis en cours)
    clôture reculée à 31 j
    purge → 1 motif effacé        motif=null, écart=présent

Montant, statut et référence intacts ; l'issue et la note conservées après
l'effacement du motif.

### R.2 — Le rail de remboursement sortant

**Tranché : trois faits distincts, et aucune simulation du fournisseur.**

K.C ouvrait l'obligation de rembourser, M.B enregistrait la confirmation
que l'argent était reparti. Entre les deux, rien : la demande envoyée au
fournisseur n'existait nulle part. Une somme décidée et une demande
acceptée se lisaient pareil en B-04, et une tentative échouée ne laissait
aucune trace — personne ne pouvait dire si le silence venait d'un envoi
jamais fait ou d'un envoi resté sans réponse.

Trois horodatages désormais, dans l'ordre, et aucun ne se substitue à un
autre : `refundDueAt` (décidé), `refundRequestedAt` (le fournisseur a
accusé réception), `refundedAt` (sa notification signée dit que l'argent
est parti — elle seule, INV-7). Un compteur de tentatives accompagne la
demande, parce qu'un rail qui échoue échoue plusieurs fois.

**Aucun service absent n'est simulé** — la règle d'I.C, appliquée une
quatrième fois après le balayeur et l'interrogation. Sans clé fournisseur,
`NON_BRANCHE` rend `null` : l'issue est `en_attente_d_envoi`, la dette
reste visible dans la file, et rien ne prétend qu'un virement a eu lieu.
La dépendance `remboursement` rejoint les quatre autres dans
`dependances.ts`, marquée bloquante pour l'encaissement.

**Les droits partent à l'initiation, pas à la confirmation.** Entre les
deux il peut s'écouler des jours ; laisser un pack utilisable pendant
qu'on en rend le prix revient à l'offrir. Et **une consommation partielle
ne se rembourse jamais automatiquement en entier** : ce que vaut une
analyse déjà rendue est une question commerciale, pas arithmétique. Le
cas passe en revue manuelle, sans rien retirer.

La clé d'idempotence est dérivée de la référence, jamais tirée au sort ni
stockée : deux tentatives portent la même clé, et le fournisseur reconnaît
la seconde comme un rejeu plutôt que d'envoyer l'argent deux fois.

#### Ce que l'application de la décision a trouvé

**Une contrainte existante refusait le motif neuf.**
`credit_sens_coherent_avec_motif` énumérait les motifs autorisés à porter
un `delta` négatif, et `REMBOURSEMENT` n'en faisait pas partie — la
contrainte est antérieure au besoin. Elle est reprise dans une migration
dédiée plutôt qu'élargie en douce : la liste des motifs qui retirent des
droits mérite d'apparaître dans une diff.

**La migration cassait le déploiement, et pas les tests.** PostgreSQL
refuse (`55P04`) d'**employer** une valeur d'énumération ajoutée dans la
même transaction que l'`ALTER TYPE ... ADD VALUE`. Le fichier ajoutait
`REMBOURSEMENT` puis s'en servait aussitôt dans la nouvelle contrainte.
Rien ne le signalait avant l'exécution réelle contre une base : la
migration est scindée en deux, `…000200` ajoute, `…000300` emploie.

**Une nouvelle tentative retirait les droits une seconde fois.** L'appel
au fournisseur était idempotent — la clé y veillait — mais pas l'écriture
au grand livre qui l'accompagne. Deux tentatives sur un pack de trente
donnaient un solde de moins trente. Vu en rejouant la demande dans la
fixture, pas en test : le test vérifiait la clé, c'est-à-dire l'endroit
déjà protégé. Une ligne `REMBOURSEMENT` existante sur la transaction
interdit désormais la seconde.

**Les deux chemins, exécutés contre PostgreSQL.** Sans rail branché :

    pack intact      1re : en_attente_d_envoi   2e : en_attente_d_envoi
                     solde 30 → 0 · tentatives=2 · versée=non
                     grand livre : ACHAT_PACK +30 · REMBOURSEMENT −30
    pack entamé      1re : revue_manuelle       2e : revue_manuelle
                     solde 27 → 27 · tentatives=0 · rien retiré
                     grand livre : ACHAT_PACK +30 · ANALYSE −1 ×3

Avec un rail branché, les deux tentatives rendent `envoyee`, la date de
demande ne bouge pas à la seconde, la clé est identique aux deux, et le
statut reste `CONFIRMEE` : seul le webhook signé écrit le versement.

### R.3 — La prose adaptée au rail

**Tranché : le motif est commun aux deux rails, sa prose ne l'est pas.**

O.A avait adapté un motif d'échec sur sept. Les six autres continuaient de
parler Mobile Money à un payeur par carte en euros : « la notification
Mobile Money peut arriver avec du retard », « vérifie que le 97 •• •• 42
est bien ton numéro actif », « compose le *880# ». Aucun de ces conseils
n'est exécutable par quelqu'un qui paie par carte, et le dernier est un
code d'opérateur béninois.

Ce que chaque rail a le droit de nommer — Mobile Money : portefeuille,
opérateur, téléphone, notification ; carte : banque, carte, relevé,
confirmation bancaire. Et les interdits, qui sont le vrai garde-fou :
aucun texte de carte ne mentionne une notification Mobile Money, un
opérateur, un téléphone, un code USSD ou un portefeuille, et « banque »
ne s'écrit pas sur un échec Mobile Money, où aucune banque n'intervient.
Une phrase partagée reste neutre — c'est la condition pour être partagée,
et un test vérifie que les phrases identiques d'un rail à l'autre ne
nomment aucun instrument.

Les phrases sont écrites en entier de chaque côté plutôt qu'assemblées
autour d'un nom variable : c'est la leçon d'O.A, où « ton portefeuille
Mobile Money est active » est sorti d'une phrase à trous.

**Le texte Mobile Money n'a pas bougé d'un caractère.** Sept motifs,
quatorze écrans, et seule la moitié carte est neuve.

#### Ce que l'application de la décision a trouvé

**Le même défaut vivait une page plus tôt.** La décision porte sur les
motifs d'échec, mais les deux devises mènent à `/paiement/attente`, et
$-03 n'y parlait que Mobile Money : « Confirme le paiement sur ton
téléphone » en titre, « Saisis ton code PIN » sous lui, « vérifié auprès
de l'opérateur » dans le rebours, et les trois étapes du fil. Le titre
d'un écran est la phrase la plus lue de l'écran. Corriger $-05 en
laissant $-03 aurait réparé l'écran d'après en gardant celui d'avant :
l'interdit s'applique où il est vrai, pas où il a été énoncé.

**Le garde-fou du JSX ne gardait rien.** Il lisait `extraireChaines`,
c'est-à-dire les chaînes entre guillemets. En remettant « Confirme le
paiement sur ton téléphone » à la place de `{TITRE_ATTENTE[rail]}`, les
dix tests passaient encore : un texte JSX n'est pas une chaîne, et c'est
pourtant la façon la plus naturelle d'écrire une phrase dans un
composant. Le garde connaissait la forme pour laquelle il avait été
écrit — N.C, O.B, Q.A, R.1 et R.2 ont chacun donné la leçon sous un
autre visage. Il lit maintenant tout le source, commentaires retirés.

**Et un mot juste dans un écran faux.** « Je n'ai rien reçu », le lien
d'échappement de $-03, ne contient aucun terme proscrit : les deux listes
le laissent passer. Il décrit pourtant une notification qu'on attend, et
par carte rien ne s'envoie — une page s'affiche, ou elle ne s'affiche
pas. Vu à l'écran, pas en test. Une prose adaptée au rail ne se réduit
pas à éviter des mots : elle décrit ce qui se passe réellement de ce
côté-là.

**Les quatorze écrans, lus au navigateur** contre une base réelle, un
paiement XOF et un paiement EUR du même compte :

    $-03  XOF   Confirme le paiement sur ton téléphone
                Saisis ton code PIN sur la notification…
                vérifié auprès de l'opérateur · Je n'ai rien reçu
          EUR   Confirme le paiement auprès de ta banque
                Valide la demande de confirmation que ta banque…
                vérifié auprès de ta banque · La confirmation ne s'affiche pas

    $-05  XOF   sept motifs · *880#, notification, numéro, portefeuille
          EUR   sept motifs · relevé, page de confirmation, carte, banque

### R.4 — L'identité de l'acteur au journal d'audit

**Tranché : l'identifiant reste dans la donnée, il n'est plus le libellé.**

B-06 affichait `7f3c1a02-…` dans une colonne intitulée « Acteur ». Un
identifiant n'est pas un nom, et une colonne qui promet une personne doit
en nommer une : un contrôleur qui relit six mois de journal voyait
trente-six identifiants sans savoir si c'était le même opérateur.

L'identifiant durable ne bouge pas de la table — c'est lui qui garantit
que deux opérateurs portant le même nom, ou ayant porté la même adresse à
six mois d'écart, ne seront pas confondus. La décision porte sur sa
présentation : nom d'abord, identifiant dessous, là où on le cherche
quand on enquête.

Trois replis, et ils ne disent pas la même chose :

| Cas | Libellé | Ce que ça dit |
|---|---|---|
| Compte résolu | son nom, ou son adresse | c'est cette personne |
| Compte supprimé | « Compte supprimé » | la personne est partie, la trace reste |
| Résolution échouée | « Acteur non résolu » | on ne sait pas, et on le dit |

Le troisième est celui qui manquait : un identifiant qui ne résout pas
s'affichait tel quel, c'est-à-dire comme un nom de personne. Dire « je ne
sais pas » vaut mieux que présenter une clé primaire comme quelqu'un.

#### Ce que l'application de la décision a trouvé

**`candidat:` n'était pas une forme prévue.** Le journal affichait
`candidat:7f3c1a02-…`, un préfixe collé à une clé primaire, en guise de
nom — et l'origine de la ligne disait « back-office », parce que le
préfixe retombait sur le cas par défaut. Une suppression demandée par un
candidat depuis son espace se lisait donc comme une action
d'administrateur, ce qu'un contrôle lirait de travers.

**L'historique éditorial portait le même défaut, et son commentaire
disait le contraire.** `par: auteurs.get(…) ?? v.publishedBy` était
documenté « un compte supprimé n'a plus d'adresse, l'identifiant est le
repli ». Il ne retombait pas : RG-10.4 anonymise l'adresse sans supprimer
la ligne, donc l'historique affichait `supprime-x7k2@…`, qui nomme moins
que rien. Le repli ne servait que le cas où la ligne manque vraiment, et
il y affichait une clé primaire. Un test affirmait cette forme ; il
affirmait une explication fausse.

**Un identifiant affiché deux fois.** Vu à l'écran : une tâche planifiée
donnait « systeme:purge » sur deux lignes, l'une sous l'autre, puisque son
identifiant **est** son nom — et dans un vrai journal ces lignes-là sont
les plus nombreuses. L'identifiant ne se répète plus quand il est déjà le
libellé.

**Les sept formes, lues au navigateur** contre une base réelle :

    Koffi Houngbo            56e8efee-…              back-office
    ops-ainfql@immipro.test  9dfc665b-…              back-office
    Compte supprimé          815443ea-…              back-office
    Awa Diallo               candidat:efaa7d4e-…     espace candidat
    Acteur non résolu        aa000000-…              back-office
    systeme:purge                                    tâche planifiée
    webhook:MOBILE_MONEY                             webhook

### R.5 — Le tutoiement, voix générale des contenus candidat

**Tranché : le tutoiement n'est pas un cas particulier des boutons
désactivés.**

DOC-12 §16 règle 5 le demandait déjà, et le produit l'appliquait par
endroits. Il s'applique désormais partout où l'on s'adresse à un
candidat ou à un visiteur : l'espace candidat, le tunnel de paiement, les
erreurs et confirmations, les courriels transactionnels, les guides et
articles, les pages publiques de présentation, et les textes de pied de
page adressés au lecteur.

**Le back-office garde sa voix**, professionnelle et neutre, de
préférence sans interpellation personnelle : son lecteur est un opérateur
au travail. Et les corps juridiques de Q.A pourront employer le registre
retenu par le conseil juridique — l'exception s'arrête au corps du
document, les intitulés de navigation et les explications autour de lui
restent au tutoiement. Les six pages n'existent pas encore ; la ligne
d'exception est écrite pour que celui qui les rédigera trouve
l'autorisation déjà accordée plutôt qu'un garde-fou à contourner.

**Vingt-et-une occurrences corrigées**, dont le titre de la page
d'accueil.

#### Ce que l'application de la décision a trouvé

**Le garde-fou cherchait la mauvaise chose.** Celui de N.C lisait
`raisonDesactivation`, et il avait fallu l'élargir trois fois — littéral,
puis expression JSX, puis constante déclarée dans le même fichier —
chacune sortant un vouvoiement de plus. Il ne pouvait pas voir les
autres, parce qu'il suivait une forme syntaxique plutôt qu'une surface.
Son remplaçant lit tout le source de chaque surface candidat,
commentaires retirés, et un texte JSX y compte comme un littéral : le
lecteur ne fait pas la différence. Il a trouvé du premier coup les
occurrences que quatre lots successifs avaient laissées.

**Deux d'entre elles n'étaient pas des chaînes.** Le `<h1>` de la page
d'accueil — « Où pouvez-vous étudier ou travailler ? », la première
phrase du produit — et une relance sur l'écran des résultats. Un balayage
des littéraux ne les voyait pas ; c'est la même leçon qu'en R.3, deux
lots plus tôt, sur un autre sujet.

**Et un vouvoiement en cachait un du rail.** La description de
`/paiement/attente` disait « Confirmez le paiement sur votre
téléphone » : un `metadata` n'est pas un composant, et le garde-fou de
R.3 ne lisait que les composants. Un payeur par carte lisait donc la
version Mobile Money dans l'onglet de son navigateur. La phrase est
désormais tutoyée **et** neutre — une description de page ne connaît pas
la transaction — et le garde-fou du rail lit aussi les `page.tsx`.

**Les onze pages publiques, relues au navigateur** — titres, descriptions
et corps — sans une occurrence restante.

## Annexe S · La revue des écrans restants

Faite le 21/09/2026, en confrontant l'inventaire de DOC-12 et les règles
de DOC-11 au code. **Aucun écran ne manque** : les quarante-cinq codes ont
tous un fichier, les seize workflows sont représentés, et le worker
enchaîne balayage, analyse, purge, réconciliation et divergence.

L'écart est ailleurs. **Le back-office est un écran de lecture avec des
commandes qui ne partent nulle part** : dix-sept boutons inertes sur six
surfaces, et pour trois d'entre elles la route existe déjà, écrite et
journalisée, sans appelant.

### S.1 — B-02 annonçait une publication qui n'avait pas lieu

**Le plus grave, et corrigé en premier.** « Enregistrer le brouillon »
n'était relié à rien. « Publier » posait un drapeau local, et l'écran
répondait en région vivante :

> Publication demandée. La version 5 devient la référence des nouveaux
> dossiers ; les 214 dossiers existants gardent la leur.

Aucune requête ne partait. Un veilleur repartait en croyant la règle
publiée, et les candidats continuaient de lire la version d'avant. C'est
la faute que le produit refuse partout ailleurs — aucun service absent
n'est simulé (I.C) — portée sur l'acte que protège INV-3.

Les deux routes existaient depuis le début, avec leurs trois garde-fous
et leur ligne d'audit. Seule la moitié cliente manquait.

**Ce que l'écran édite, et rien de plus.** B-02 ne montre que deux textes
destinés au candidat ; lui faire porter le payload complet aurait été le
plus court, et le plus faux — la copie chargée à l'ouverture de la page
écraserait à l'enregistrement tout ce qu'un autre veilleur aurait changé
entre-temps dans les champs que l'écran n'affiche pas. La route reçoit
donc les deux textes, relit la version en base et les y recolle. Vérifié
contre PostgreSQL : après enregistrement, `libelle` et `reserves[0]`
changent, les conditions et les pièces requises sont intactes.

**Publier enregistre d'abord.** La publication relit le payload en base
pour le valider : publier sans enregistrer aurait mis en vigueur le texte
d'avant pendant que l'écran montrait celui d'après. Si l'enregistrement
est refusé, rien n'est publié ; s'il passe et que la publication échoue,
l'écran dit les deux, parce que c'est ce qui s'est produit.

**RG-14.2 se voit avant le clic.** Enregistrer est ouvert au veilleur,
publier ne l'est pas. Le bouton porte la raison plutôt que de laisser un
veilleur enregistrer puis buter sur un refus d'accès.

#### Ce que l'application de la décision a trouvé

**Le garde-fou lisait la fonction, pas le bouton.** Cinq mutations sur
six mordaient ; celle qui comptait passait. Rebrancher « Publier » sur
`setFait("publie")` laisse la fonction d'envoi intacte, orpheline, plus
bas dans le fichier — et tout test qui l'inspecte continue de passer,
pendant que l'écran est revenu exactement au défaut qu'on venait de
corriger. Les garde-fous de B-02 cliquent désormais, avec l'appel réseau
remplacé : lire le source était le mauvais outil pour cette question.

**Et le compteur de la revue elle-même était faux.** Le balayage qui a
trouvé les boutons inertes lisait `<Button\b[^>]*?>`, et s'arrêtait au
premier `>` — or `disabled={fautes.length > 0}` en contient un, si bien
que le `onClick` placé après passait inaperçu. Deux écrans déjà branchés
ressortaient muets. Le balayage équilibre maintenant les accolades. C'est
la troisième fois de la série qu'un garde-fou ne connaît que la forme
pour laquelle il a été écrit, après R.3 et R.5.

### S.2 — Le registre des commandes qui n'écrivent encore rien

Corriger B-02 sans nommer les autres laisserait la même découverte à
refaire. La liste est donc explicite, comme `copy-exceptions.json` et
comme `PREALABLES` : une commande inerte hors de cette liste fait échouer
le test, et la liste ne peut que rétrécir.

| Écran | Ce qui manque |
|---|---|
| ~~B-05 revue~~ | ~~`POST revue/[id]` écrite, écran muet~~ — branché en S.2 |
| ~~B-03 utilisateurs~~ | ~~`PUT utilisateurs` écrite, écran muet~~ — branché en S.4 |
| ~~B-01 veille~~ | ~~aucune route~~ — `PUT veille` écrite en S.5 |
| ~~B-07 coûts IA~~ | ~~les plafonds sont calculés, jamais modifiables~~ — retiré en S.6, l'arbitrage est nommé |
| ~~B-06 journal · B-04 paiements~~ | ~~aucun export, aucun rapprochement manuel~~ — exports écrits en S.7, rapprochement retiré |

### S.3 — Ce que la revue a relevé et qui reste ouvert

**WF-08, la rédaction assistée, est en lecture seule.** Les modèles
existent, le chemin de lecture aussi, les quatre écrans R-01 à R-04
également — mais aucune route d'écriture, et `InterviewAnswer` comme
`CritiqueFinding` ne sont écrits nulle part sauf par la purge, qui les
efface. Un candidat peut répondre à l'entretien guidé : rien n'est
conservé. C'est le seul workflow entier dont la moitié serveur manque.

*S.3 a branché l'entretien, S.8 les versions — mise en forme, réécriture,
restauration — et les deux états que R-04 confondait. `CritiqueFinding`
reste sans écrivain : les remarques demandent le service d'analyse.*
~~*Leur moitié déterministe (RG-08.3) attend `extraction`, pas la
rédaction.*~~ **Faux, corrigé en S.12** : une partie des recoupements ne
lit aucune pièce jointe et ne demandait rien. Elle est écrite, et elle ne
se stocke pas — voir S.12.

**Six routes admin sur huit n'ont aucun test.** Les deux qui en ont —
`paiements` et `contenus` — sont exactement les deux qui étaient
branchées. La corrélation dit ce qu'elle dit.

**Les exports n'existent pas.** Quatre boutons les promettent, et pas une
ligne de CSV dans le dépôt. B-06 promet pourtant qu'exporter une période
vide atteste l'absence d'écriture. *(Réglé en S.6 pour B-07 et en S.7 pour
les deux derniers ; l'écrivain de CSV manquait au dépôt.)*

Hors du code, le registre est à jour : zéro arbitrage ouvert, trois
réserves extérieures (L.A, M.C, Q.A), six pages publiques dont quatre
bloquantes avant ouverture, quatre dépendances non branchées dont la
dégradation est écrite et testée.

### S.2 — B-05 décide, et trace enfin l'ouverture d'une pièce

**Deux défauts, et le second est un invariant.**

« Enregistrer et passer à la suivante » n'était relié à rien. La route
existait, validait le message, journalisait et recréditait le quota ;
seule la moitié cliente manquait. La file de revue est le repli de
l'extraction non branchée — le filet — et elle ne décidait rien.

**Et « Ouvrir la pièce » ne traçait pas.** RG-15.1 : « Tout accès
administrateur à une pièce d'identité est journalisé avec motif
obligatoire. » Le bouton posait un drapeau local, affichait un aperçu
inventé — « aperçu de la pièce · page 1 sur 3 », qui ne correspondait à
aucun fichier — et n'écrivait aucune ligne. Aucun motif n'était demandé.
L'action `piece.consultation` figurait dans la table des actions auditées
sans qu'aucun code ne l'emploie jamais.

L'écran affirmait pourtant, trois lignes au-dessus du bouton, que
l'ouverture était « un acte tracé, avec son motif ». La phrase qui énonce
la règle était contredite par le bouton qu'elle accompagne.

**Un motif, deux lignes d'audit.** L'opérateur ouvre la pièce *pour* la
trancher ; lui faire écrire deux justifications du même geste produirait
deux textes dont l'un serait recopié de l'autre. Le motif est demandé
avant l'ouverture — demandé après, il justifierait un accès déjà eu, ce
qui n'est pas une justification — et il accompagne ensuite la décision.

**La ligne d'audit part avant l'URL.** Signer d'abord laisserait, si
l'écriture échoue, un accès réel sans trace. Dans l'autre ordre, un échec
de signature laisse la trace d'un accès qui n'a rien montré : une trace
de trop se relit, une trace manquante ne se retrouve pas.

**Aucun aperçu ne s'invente.** L'URL vient de `urlDeLecture`, la seule
fonction du dépôt qui en signe, et qui porte ses propres refus — pièce
purgée, pièce non balayée (I.D). Quand le stockage ne répond pas, l'écran
le dit : « Ton accès est consigné, et rien n'a été affiché. »

**Deux commandes retirées.** « Rendre l'analyse au candidat » proposait un
choix que le produit n'offre pas : c'est la décision qui recrédite le
quota, et la ligne au-dessus du bouton dit déjà laquelle. « Voir les
pièces traitées » et « Motifs d'échec les plus fréquents » menaient à des
écrans qui n'existent pas — la règle de Q.A, qui a fait retirer neuf liens
du pied de page plutôt que d'inventer leurs pages.

#### Ce que l'application de la décision a trouvé

**Le garde-fou général a trouvé plus que son sujet.** Écrit pour vérifier
que `piece.consultation` a un écrivain, il vérifie que *chaque* action
déclarée en a un — et il a fallu deux essais pour qu'il dise vrai. La
première version cherchait `action: "<nom>"` : elle a accusé
`compte.suspension` et `compte.retablissement`, que la route des
utilisateurs écrit pourtant toutes les deux, par un ternaire que le motif
ne voyait pas. La seconde cherchait le littéral n'importe où : elle a
laissé passer `dossier.consultation`, qui n'apparaît que dans la table des
catégories de B-06 — un lecteur, pas un écrivain. Le critère juste est
qu'une action est écrite là où `journaliser` est appelé.

C'est la quatrième fois de la série qu'un garde-fou ne connaît que la
forme pour laquelle il a été écrit, après R.3, R.5 et S.1 — et la
première où il s'est trompé dans les deux sens, en accusant du code
correct avant de laisser passer le défaut.

**`dossier.consultation` reste sans écrivain**, et rejoint le registre :
B-03 et B-04 ouvrent le dossier d'un candidat sans le consigner. C'est le
même défaut que celui corrigé ici, sur un autre écran.

**Exécuté contre PostgreSQL :**

    ouverture sans motif            HTTP 422   (le schéma refuse)
    ouverture avec motif            apercu=null
                                    « le stockage n'a pas répondu.
                                      Ton accès est consigné, et rien
                                      n'a été affiché. »
    message « Non conforme »        refusé — constat sans suite (RG-06.3)
    décision ILLISIBLE recevable    decidee=true · quotaRendu=true

    journal : piece.consultation  document:6bac5d6c  motif conservé
                                  {revue, dossier, version: 1}
              revue.decision      document:6bac5d6c  motif conservé
                                  {decision: "ILLISIBLE"}
    pièce   : ILLISIBLE · message conservé · analyzedAt posé
    quota   : ANALYSE_RENDUE +1

### S.3 — L'entretien guidé conserve enfin ses réponses

**La promesse était écrite sous le champ, et elle était fausse.**

> Tes réponses sont conservées à mesure : tu peux interrompre l'entretien
> et le reprendre.

L'état partait de `{}` à chaque chargement, rien ne quittait le
navigateur, et `InterviewAnswer` n'était écrite nulle part — seule la
purge la connaissait, pour l'effacer. Un candidat qui répondait à huit
questions puis fermait l'onglet perdait tout, **après avoir lu qu'il
pouvait s'interrompre**. C'est la faute de B-02 et de B-05, mais dite au
candidat et payée par lui.

La lecture existait pourtant depuis le début : `reponsesDeLEntretien`
était écrite, testée, et personne ne la passait à l'écran.

**À mesure veut dire à chaque question quittée**, pas à chaque frappe :
une écriture par caractère saturerait le réseau d'un téléphone lent, qui
est le cas ordinaire de ce produit. Suivant, précédent, passer et le
passage à l'éditeur enregistrent avant de bouger. **Et la navigation
n'attend pas le réseau** — bloquer « Question suivante » le temps d'un
aller-retour ferait cliquer deux fois. L'écran avance, l'écriture suit,
et un refus s'affiche sans défaire la saisie.

**Une réponse identique ne se réenregistre pas.** Revenir sur une
question pour la relire n'écrit rien : c'est ce qui distingue une
navigation d'une modification, et ce qui évite huit écritures identiques
par aller-retour dans l'entretien.

**Le client n'envoie que le rang et le texte.** L'intitulé et la section
décrivent la question posée, pas la réponse donnée ; les laisser voyager
permettrait d'enregistrer une réponse sous une question jamais posée.
C'est la règle de B-02, appliquée à un formulaire candidat.

**`lecture` et non `sensible`.** Le régime `sensible` couvre « ce qui
coûte de l'argent ou du quota, et ce qui devine un secret » : une réponse
d'entretien ne fait ni l'un ni l'autre, et dix appels par minute
couperaient un entretien de huit questions en plein milieu.

#### Une sixième dépendance, que personne n'avait nommée

WF-08 reste à moitié écrit, et il faut dire pourquoi. L'entretien tient
debout seul ; la **mise en forme du texte** et l'**analyse critique**
demandent un service d'IA qui n'était consigné nulle part. Le registre
n'avait que `extraction` — « Extraction documentaire par IA » — qui lit
les pièces déposées. Les deux emploient la même clé et n'ont rien
d'autre en commun : se tromper sur un montant lu est un défaut de
lecture, mettre une phrase dans la bouche de quelqu'un est autre chose.

`redaction` rejoint donc les cinq autres, facultative en pilote sous
trois conditions qui lui sont propres : le candidat sait que le texte
proposé reste le sien et qu'il le relit, aucune version n'est déposée
sans relecture, et la limite de l'analyse critique est dite — elle relève
des incohérences, elle ne juge pas un dossier (INV-1).

#### Ce que l'application de la décision a trouvé

**Le compteur d'avancement ne s'accordait pas.** « 1 réponses sur 8 »,
visible seulement quand il y a exactement une réponse — c'est-à-dire
rarement, tant que le compteur repartait de zéro à chaque chargement. Il
s'affiche maintenant dès l'ouverture, et la faute avec lui. Rendre une
donnée réelle rend visibles les défauts de ce qui la rapporte.

**Et la mutation qui compte, encore.** Débrancher `conserverPuis` des
boutons en laissant la fonction intacte plus bas dans le fichier : les
garde-fous qui lisent le source passent tous. Ceux de R-02 cliquent, et
ils ont mordu — la leçon de S.1, appliquée avant d'être réapprise.

**Exécuté contre PostgreSQL :**

    deux réponses enregistrées     conservee=true · repondues 1 puis 2
    réponse vidée                  conservee=false · repondues 1
    rang 42                        « Cette question n'existe pas dans
                                     l'entretien de cette pièce. »
    dossier d'un autre             HTTP 404

    en base : rang 0 · PARCOURS · « Quel diplôme as-tu obtenu, et quand ? »
              section et intitulé résolus par le serveur, pas envoyés

    au rechargement : le champ porte la réponse, « 1 réponse sur 8 »

### S.4 — B-03 offrait ce qu'il ne savait pas faire, et cachait ce qu'il savait

**La liste d'actions était fausse dans les deux sens.**

Elle proposait trois boutons — renvoyer l'email de vérification,
recréditer des analyses, traiter une demande de suppression — dont aucun
n'était relié à quoi que ce soit et dont **aucun n'avait de route**. Et
elle omettait la seule action que le produit sait faire : la suspension,
dont la route existe depuis le début, journalise son motif et ferme les
sessions ouvertes.

Un écran qui offre ce qu'il ne peut pas et cache ce qu'il peut se trompe
deux fois. Ce qui reste est ce qui part vraiment au serveur.

**La conséquence est dite avant le clic.** Suspendre ferme les sessions
ouvertes — sans quoi la suspension ne prendrait effet qu'à l'expiration
du cookie, trente jours plus tard. Rétablir ne les rouvre pas. Les deux
phrases sont sous leur bouton, et l'exécution les a vérifiées.

**Le motif conditionne l'action**, à dix caractères au moins : c'est lui
qu'on relit quand une suspension est contestée, et « suspendu le 12 » ne
répond à rien. Même forme qu'en R.1 et en B-05 — la raison plutôt qu'un
booléen, parce que c'est elle que porte le bouton désactivé.

**Une suppression demandée n'ouvre aucune action.** La suspendre en plus
ne ferait que retarder une purge que le candidat a réclamée.

**Les trois retirées sont nommées**, avec ce qui manque à chacune, dans
`ACTIONS_ATTENDUES` — comme `PREALABLES` pour les arbitrages et
`DEPENDANCES` pour les services. Les retirer sans les nommer ferait
disparaître le besoin avec le bouton.

| Action | Ce qui lui manque |
|---|---|
| Renvoyer l'email de vérification | une route, une action auditée, et la messagerie branchée |
| Recréditer des analyses | une décision commerciale : combien, à quelles conditions, à la charge de qui |
| Traiter la demande de suppression | une route de relance ; la reprise automatique existe déjà |

Le recrédit n'est pas qu'une route manquante, et c'est pourquoi il ne
s'ajoute pas ici. `rendreUneAnalyse` rend **une** analyse identifiée, et
son idempotence tient à cet identifiant : elle répare une lecture qui n'a
rien rendu. Un recrédit de guichet n'a pas d'analyse à nommer — c'est un
geste commercial, et combien, à quelles conditions et à la charge de qui
sont des décisions qui ne s'inventent pas depuis un écran.

« Exporter la sélection » est parti pour la raison de Q.A : aucun code
d'export n'existe dans le dépôt.

#### Une correction à la revue elle-même

**Ma note sur `dossier.consultation` était fausse.** S.2 l'avait inscrite
au registre en disant que « B-03 et B-04 ouvrent un dossier sans le
consigner ». Vérifié depuis : **aucun écran du back-office n'ouvre le
dossier d'un candidat.** B-03 en affiche le nombre et dit en toutes
lettres que les pièces ne sont accessibles que depuis la file de revue ;
B-04 ne les mentionne pas.

Le défaut n'est donc pas un accès non tracé — c'est une action auditée
écrite d'avance, pour un écran que le produit n'a pas. Elle reste
déclarée : le jour où cet écran existera, la ligne d'audit devra partir
avec lui, et non six mois plus tard. La note dit maintenant cela.

**Exécuté contre PostgreSQL :**

    suspension sans motif        HTTP 422   (le schéma refuse)
    suspension avec motif        suspendu=true · sessionsFermees=2
    rétablissement               suspendu=false · sessionsFermees=0
    en base                      suspendedAt=null · 0 session restante
                                 — les sessions fermées ne se rouvrent pas,
                                   ce que la phrase sous le bouton annonce

    journal : compte.suspension      « Compte signalé pour usurpation… »
              compte.retablissement  « Vérification faite, le signalement… »

    écran   : [Suspendre le compte] désactivé, avec sa raison
              motif, conséquence présents ; les trois boutons morts absents

### S.5 — B-01 disait l'inverse de la règle qu'il citait

**Trois erreurs en une phrase.** L'écran annonçait, sous la file :

> Rien n'est dépublié automatiquement : la décision de retirer une règle
> appartient à l'opérateur (RG-14.3).

L'affirmation est fausse. RG-14.1 dit l'inverse : « une fiche dont
`nextReviewAt` est dépassée repasse automatiquement en `DRAFT` et
disparaît de l'affichage utilisateur. Une donnée non relue ne peut pas
continuer à se présenter comme fiable. » Un cron l'applique chaque nuit à
trois heures, et il le fait correctement depuis le début.

La citation est fausse aussi : RG-14.3 parle de périodicité de relecture,
pas de dépublication.

Et l'effet était le contraire de celui voulu. RG-14.1 existe pour presser
le veilleur ; la phrase le rassurait. Celui qui la lisait ne s'attendait
pas à voir ses fiches quitter le site public dans la nuit.

**Deux cas y étaient confondus**, et l'écran les sépare désormais : une
source qui ne répond pas ne dépublie rien — les règles affichées restent
celles de la dernière collecte réussie — tandis qu'une fiche que personne
n'a relue part toute seule. La première phrase était vraie et méritait de
rester ; c'est de l'avoir étendue à la seconde qui produisait le
mensonge.

#### La relecture sans changement

« Marquer comme relue sans changement » n'était relié à rien. C'est
pourtant l'issue la plus fréquente de la veille — WF-14 étape 2, branche
« inchangé » : `verifiedAt` et `nextReviewAt` mis à jour, pas de nouvelle
version.

La conséquence de cet oubli n'était pas qu'un bouton inerte : **une fiche
relue et trouvée identique restait en retard**, et le cron de trois
heures finissait par la dépublier. Le travail était fait, et le produit
se comportait comme s'il ne l'avait pas été.

**L'échéance court depuis la relecture, pas depuis l'ancienne échéance.**
Repartir de l'ancienne enchaînerait les retards : une fiche relue avec
trois semaines de retard serait déjà à relire dans soixante-neuf jours.

**Une fiche dépubliée par l'échéance redevient publiée.** Le retour en
brouillon dit « personne n'a relu », pas « cette règle est douteuse » :
une fois relue, la raison du retrait n'existe plus. Un brouillon en
préparation, lui, n'est pas republié par une relecture — seule l'échéance
dépassée est réversible ainsi.

**Pas de ligne d'audit, et c'est voulu.** RG-14.4 désigne la preuve de
diligence : « chaque version conserve son `sourceUrl`, `verifiedAt` et
`verifiedBy` ». C'est le champ qui porte qui a relu et quand. En ajouter
une entrée de journal doublerait la preuve sans l'améliorer, et les deux
finiraient par diverger.

**La seconde moitié de RG-14.3 est écrite et inatteignable.** « Ramenée à
30 jours avant une date connue de révision » : aucune colonne ne porte
cette date. La règle vit entière dans la fonction pure, la route passe
`null`, et le manque est nommé — inventer une colonne au passage ferait
décider à une route ce qu'un veilleur doit saisir.

Les quatre autres commandes — journal des collectes, nouvelle fiche,
relever la source, déclarer un incident — sont parties comme en B-03 :
aucune route, et la règle de Q.A.

**Exécuté contre PostgreSQL :**

    fiche CH publiée, échéance au 2026-08-31
    cron de 3 h        → 1 dépubliée · statut DRAFT
                         (ce que l'écran niait)
    relecture          → relueLe 2026-09-21 · prochaineLe 2026-12-20
                         republiee=true
    en base            → PUBLISHED · verifiedBy veilleur-…@immipro.test
                         1 version (aucune créée) · 0 ligne de journal

    écran              → « repasse automatiquement en brouillon, chaque
                           nuit à 3 h … (RG-14.1) »
                         bouton actif, conséquence adaptée au retard
                         les quatre boutons morts absents

### S.6 — B-07 devenait faux au moment de recevoir des données

Cet écran avait été livré vide par décision : tant que dix dossiers réels
n'ont pas alimenté `AiUsage`, aucune valeur n'est affichée. La décision
tient. **Ce qui ne tenait pas, c'est sa condition de sortie.**

Elle portait sur le nombre de dossiers. Or le seul endroit du produit qui
écrit dans `AiUsage` enregistrait `costMicros: 0` — un zéro littéral,
parce qu'aucun tarif de jeton n'existe dans le dépôt. Le premier dossier
analysé faisait donc quitter l'état vide et affichait :

    Coût IA par dossier payant   0,00 F sur 1 dossiers
    Part du prix du pack         0,0 % au plus haut

sous un garde-fou qui annonce 15 % du prix du pack.

L'écran devenait faux à l'instant précis où il recevait des données, et
son mensonge était **rassurant** : un superviseur qui lit 0 % face à un
plafond de 15 % conclut qu'il reste de la marge. Un tiret ne dit rien ; un
zéro affirme. Le jeu de démonstration aggravait le cas — il écrivait
18 400 micro-unités pour 4 510 jetons, si bien que la seule situation où
l'écran paraissait savoir tarifer était celle où le montant était inventé.

#### Ce qui se compte, ce qui se tarife

Les jetons sont mesurés pour de vrai : le lecteur les rend, la table les
garde. **Le prix du jeton, lui, n'est nulle part.** Les deux grandeurs sont
désormais séparées, et c'est la règle d'I.C appliquée à une donnée plutôt
qu'à un service : aucun service absent n'est simulé, et un tarif manquant
ne vaut pas zéro.

| Grandeur | Sans tarif | Avec tarif |
|---|---|---|
| Jetons consommés, analyses exécutées | affichés | affichés |
| Dépense, coût par dossier, part du pack | absents, et l'absence est nommée | affichés dans la devise du tarif |
| Dépassements individuels | non calculables, et l'écran le dit | le dossier est nommé |

Le coût est **recalculé à la lecture**, depuis les jetons conservés et le
tarif du jour ; `AiUsage.costMicros` n'est plus lu. Deux raisons, et la
seconde décide : WF-16 étape 4 demande de réviser la grille à partir des
coûts réels — donc de repasser une grille sur une consommation déjà
enregistrée —, et les lignes écrites avant qu'un tarif existe portent un
zéro qu'il ne faut pas sommer.

Un total partiel n'est jamais présenté comme un total : une seule ligne non
tarifée rend la somme `null`. C'est la règle déjà tenue en B-06 pendant un
incident de collecte.

#### Les dépassements individuels, enfin nommés

RG-16.2 demande une analyse à **chaque dépassement individuel**. L'écran
réduisait la série à « X % au plus haut » sans jamais nommer le dossier
concerné : une analyse ne commence pas sur un pourcentage anonyme. La
lecture triait déjà les dossiers par part décroissante — la donnée était
là, l'écran la jetait.

#### Les deux commandes retirées

« Exporter le détail des appels » part comme les trois autres exports :
aucun code d'export n'existe dans le dépôt.

« Modifier les plafonds » est d'une autre nature, et c'est ce qui la rend
intéressante. Les trois seuils affichés sont des constantes, et deux sont
des règles de gestion — les 15 % viennent de RG-16.1. Ce qui lui manque
n'est donc pas une route : c'est un arbitrage sur **lesquels de ces seuils
sont des réglages et lesquels restent des règles**. Un plafond réglable
depuis un écran est un plafond qu'on relève le jour où il gêne,
c'est-à-dire le jour où il sert. Les deux sont consignées dans
`COMMANDES_ATTENDUES`.

B-07 sort ainsi du registre des écrans muets — par retrait, non par
branchement. Il n'y restait plus que les deux boutons d'export de B-04
et B-06.

**Exécuté contre PostgreSQL**, 1 118 000 jetons sur 2 dossiers payés :

    sans tarif   Dépensé ce mois              —
                 Coût IA par dossier payant   —
                 Jetons consommés             1 118 000 jetons
                 Analyses exécutées           4 appels
                 Part du prix du pack         —
                 dépassements                 aucun

    avec tarif   Dépensé ce mois              2 574,00 XOF
    1800/9000    Coût IA par dossier payant   1 287,00 XOF sur 2 dossiers
    XOF          Part du prix du pack         25,7 % au plus haut
                 dépassements                 b202ac37 · 25,7 %

    en base      costMicros = 0, 0, 0, 0 — la colonne n'est plus lue,
                 et l'écran ne s'en porte pas plus mal

L'exécution a trouvé un défaut de plus, que onze mutations n'avaient pas
attrapé : « sur 1 dossiers ». Il n'y avait pas de test, il y en a un.

### S.7 — Les exports n'existaient pas, et le dépôt n'avait pas d'écrivain

Dernier point de la revue. Quatre boutons promettaient un fichier depuis le
début et **pas une ligne de CSV n'existait dans le dépôt** — B-07 en a rendu
un en S.6, les deux derniers sont ici, et le quatrième est parti avec lui.

Les deux promesses restantes étaient les plus précises de tout le
back-office, et c'est ce qui les rendait coûteuses :

> L'export d'une période vide reste possible : il produit un fichier
> attestant l'absence d'écriture. *(B-06, à l'écran)*

> Un chiffre partiel présenté comme un total est une erreur comptable, et
> elle se propage **dans l'export puis dans le rapport**. *(B-04, dans le
> domaine)*

La première décrivait le contenu d'un fichier que personne ne pouvait
produire. La seconde nommait l'export comme le lieu où la faute devient
durable — et l'export n'existait pas, si bien que la règle n'était tenue
qu'à l'écran, là où elle coûte le moins cher. Un total faux affiché
disparaît au rechargement ; le même dans un fichier part au comptable et
revient dans un rapport six semaines plus tard, sans l'encadré rouge qui
disait pourquoi il était faux.

#### L'écrivain de CSV, et les trois choses qu'un `join(";")` ne tient pas

**Une cellule ne devient jamais une formule.** Un tableur exécute le
contenu d'une cellule qui commence par `=`, `+`, `-`, `@`, une tabulation
ou un retour chariot. Les deux exports portent du texte libre : le motif
qu'un opérateur a saisi en suspendant un compte, le constat d'un écart, la
référence rendue par un opérateur de paiement. Un motif commençant par
`=HYPERLINK(…)` s'exécuterait à l'ouverture, sur le poste d'un contrôleur,
avec ses droits.

Le texte est donc préfixé d'une apostrophe — et **les nombres ne passent
pas par là** : un montant négatif commence légitimement par `-`, et le
neutraliser en ferait du texte qu'aucune somme ne reprendrait. D'où une
cellule typée plutôt que devinée au contenu.

**Le séparateur et la virgule décimale vont ensemble.** Point-virgule et
décimales à la virgule : c'est ce qu'attend un tableur en français, et
c'est un contrôleur français qui ouvre le fichier. Avec une virgule pour
séparateur, « 1 234,50 » couperait la ligne en deux.

**La marque d'octets, sans quoi les accents tombent.** Sans BOM, Excel lit
l'UTF-8 comme du Latin-1 : « Écritures » devient « Ã‰critures ». Le fichier
resterait juste et paraîtrait cassé.

#### Ce que chaque export refuse

| Export | Ce qu'il refuse de faire |
|---|---|
| B-06 | se taire sur une période vide — l'en-tête atteste l'absence, parce qu'un fichier vide se confond avec un export qui a échoué |
| B-06 | se plafonner à deux cents lignes comme la lecture d'écran : un export tronqué en silence est une attestation fausse |
| B-04 | porter un total pendant un incident de l'opérateur, tout en gardant ses lignes — elles sont exactes |
| B-04 | additionner des francs et des euros : une somme par monnaie, jamais une somme tout court |

Le plafond est devenu un paramètre **obligatoire** du lecteur, avec
`"aucun"` écrit en clair. Un paramètre facultatif se laisse oublier, et
l'oubli irait dans le sens du danger.

Les deux routes sont au régime `sensible` et non `lecture` — elles
rassemblent en un fichier tout ce qu'un périmètre contient, ce qu'un accès
volé chercherait à obtenir d'un seul appel — et **journalisées avant de
produire le fichier** : après coup, un export qui échoue à l'écriture ne
laisserait aucune trace, et c'est celui-là qu'on voudrait voir.

#### Le rapprochement manuel est parti

Le second bouton de B-04 proposait « Lancer le rapprochement » ou
« Rapprocher à la main » selon l'état de l'opérateur, et rien derrière. Le
second libellé était le plus trompeur : il offrait la seule chose qui
aurait servi pendant un incident. Rapprocher demande d'interroger
l'opérateur, et `interrogation` n'est pas branchée — il n'y a personne à
interroger. Nommé dans `COMMANDES_ATTENDUES_B04`.

#### Trois garde-fous qui ne mordaient pas

Le premier lisait le source brut pour vérifier le régime de limitation — et
l'en-tête de la route **explique justement** pourquoi il est « sensible » et
non « lecture ». Le garde-fou était satisfait par sa propre prose : passer
la route en `limite: "lecture"` ne le faisait pas broncher. Troisième fois
de cette revue, et troisième fois que la réponse est `sansCommentaires`.

Le deuxième vérifiait que `journaliser(` apparaît avant `new Response(`.
Envelopper l'appel dans une fonction jamais appelée le laissait au même
endroit du fichier. C'est l'**attente** qui fait la trace, pas la position.

Le troisième gardait « une seule requête d'identités pour deux cents
lignes » en lisant le corps de `journal()`. Ce lot a déplacé ce corps dans
un lecteur partagé, et le garde-fou est passé au vert en trouvant une
fonction devenue vide. Il porte maintenant sur le lecteur, et vérifie que
les deux entrées y passent sans requête à elles.

**Exécuté contre PostgreSQL**, avec un motif hostile écrit en base :

    journal, 2 écritures  → en-tête : période, catégories, « Écritures;2 »
                            motif =HYPERLINK(…) rendu "'=HYPERLINK(""…"")"
                            — préfixé, entre guillemets, inerte

    période vide          → « Écritures;0 » + attestation d'absence
                            colonnes présentes : un contrôleur voit ce qui
                            aurait été rempli

    grand livre, ok       → Total encaissé (EUR);29,50
                            Total encaissé (XOF);15000
    grand livre, muet     → Total encaissé;« Total non calculé : … »
                            les deux lignes de paiement, inchangées

L'exécution a trouvé un défaut qu'aucune des dix-sept mutations
n'attrapait : l'en-tête gardait une ligne vide à la place de l'attestation
quand il n'y avait rien à attester, ce qui ajoutait une rangée vide au
tableur et donnait aux deux fichiers des en-têtes de hauteurs différentes.
Visible en ouvrant les deux côte à côte, jamais dans une assertion sur le
contenu.

#### Le registre des commandes inertes est vide

Les sept écrans du back-office portaient onze commandes qui ne partaient
nulle part. Six lots les ont branchées ou retirées. Le registre reste,
vide : le supprimer retirerait le garde-fou avec la liste, et c'est lui qui
refusera le prochain bouton qui ne mène à rien.

### S.8 — WF-08 : l'éditeur n'éditait pas, et la relecture rendait un avis sans avoir lu

La revue des écrans est close ; ce lot traite ce qu'elle avait laissé
ouvert. R-03 et R-04 sont des écrans de **lecture sur des données que rien
n'écrivait**, et tous deux présentaient cette absence comme un état normal.

#### Ce que R-03 montrait

Un onglet « Éditeur », un onglet « Versions », et rien derrière : aucune
route ne créait de `DocumentVersion`, si bien que `versionCourante` rendait
toujours `undefined`. L'onglet ne savait d'ailleurs pas éditer — il rendait
des paragraphes en lecture seule, **sans champ de saisie**. « Restaurer »
n'était relié à rien.

Trois situations s'y confondaient dans un même écran vide, et elles
n'appellent pas le même geste :

| Situation | Ce que l'écran disait | Ce qu'il dit |
|---|---|---|
| entretien trop court | rien | combien de réponses manquent |
| réponses prêtes, service branché | rien | « Proposer un premier texte » |
| réponses prêtes, service absent | rien | ce qui manque, et qu'aucune réponse n'est perdue |

La troisième est celle que le registre des dépendances décrivait **depuis
S.3** : « aucun texte n'est produit, et aucun n'est inventé : l'écran dit ce
qui manque plutôt que d'afficher une version vide ». Il ne le disait pas.

#### Ce que R-04 affirmait

> Rien à reprendre sur cette version.

Sur une liste vide. Or aucune analyse n'avait jamais tourné : rien ne créait
de `CritiqueFinding`, et le service qui les produit n'est pas branché. La
page rendait donc **un avis favorable sans avoir lu** — et son bandeau de
source le datait, « relecture automatique ImmiPro, vérifiée le 11
septembre », sur une relecture qui n'avait pas eu lieu.

C'est le zéro de B-07 sur une autre surface : un vide qui se lit comme un
constat. Un tiret ne dit rien ; « rien à reprendre » affirme. Les deux vides
sont désormais distincts — `null` veut dire « pas relu », `[]` veut dire
« relu, rien à reprendre » —, et le bandeau ne date que ce qui a été lu.

#### Ce que le candidat peut faire sans la clé

La distinction qui structure le lot : **son texte n'a pas besoin du
modèle.** La mise en forme part des réponses et demande un appel ; la
réécriture et la restauration sont son texte dans son dossier.

- `mise-en-forme` — appelle le modèle, débite le quota (RG-08.4, INV-6) ;
- `reecriture` — enregistre son texte, aucun appel, aucun débit ;
- `restauration` — recopie une version antérieure **en tête**, sans tronquer
  l'historique : revenir en arrière est un geste de plus, pas l'effacement
  des suivants.

Une seule route, `z.discriminatedUnion` sur le geste, comme en B-02. Aucune
des trois ne modifie une version existante : un état passé n'a pas à être
réécrit, et c'est le retour en arrière qui décide quelqu'un à accepter une
suggestion.

**Rien n'est débité pour une absence connue d'avance.** Débiter puis rendre
s'annule, mais ouvre une fenêtre : entre les deux, une interruption coûte
une analyse au candidat pour un service dont on savait qu'il ne répondrait
pas. La garde passe avant le débit ; le débit-puis-rendu reste pour le cas
imprévisible, un service branché dont l'appel n'aboutit pas.

**Sans destination, pas de mise en forme.** Les attendus d'une pièce
diffèrent fortement d'un pays à l'autre (WF-08 étape 1), et écrire sans les
connaître produirait le modèle pré-rempli générique que l'étape 3 écarte
explicitement. Le pays vient de la règle **figée** du dossier (INV-3).

#### La lettre s'affichait deux fois

Les paragraphes étaient rendus en lecture seule sous le champ de saisie : la
seule raison de cette répétition était d'ancrer la suggestion au bon
paragraphe. La suggestion nomme désormais la section qu'elle visait, ce qui
la rattache au bon passage dans un texte que le candidat vient peut-être de
réorganiser.

#### Le garde-fou des commandes inertes ignorait la moitié du produit

`fichiers("src/app/(admin)")` : sept écrans surveillés, et **pas une seule
des surfaces que les candidats touchent**. R-03 y portait un « Restaurer »
inerte et R-04 un « Corriger le passage » qui ne corrigeait rien, sans que
rien ne s'en aperçoive. Le registre passait au vert en balayant précisément
la partie de l'application qu'on venait de nettoyer.

Il balaie maintenant tout `src/app`. C'est la quatrième fois de cette revue
qu'un garde-fou ne connaît que ce pour quoi il a été écrit, et la première
fois que ce qu'il ignorait était la moitié du produit.

L'élargissement a trouvé **trois** écrans, dont un à tort : le
« Continuer » grisé du choix de pack est un `disabled` inconditionnel avec
sa raison, et l'action vit dans l'autre branche du ternaire. Le critère
l'exempte désormais — mais pas un `disabled={expr}`, qui peut redevenir
cliquable et doit alors avoir quelque chose à faire. Les deux vraies sont au
registre : « Me prévenir dès qu'il y en a un » (A-annuaire, la messagerie
n'est pas branchée) et « Téléverser sans analyse » (C-pièce, aucune route).

**Exécuté contre PostgreSQL :**

    aucune réponse       R-03 : ENTRETIEN_INSUFFISANT · « Réponds encore à
                                quelques questions »
                         R-04 : SANS_TEXTE

    trois réponses       R-03 : MISE_EN_FORME_INDISPONIBLE · action : aucune
    service absent       mise en forme → null, aucune version, aucun débit

    réécriture           R-03 : REDIGEE
    par le candidat      R-04 : « Cette version n'a pas été analysée … nous
                                ne te disons pas que ton texte est bon sans
                                l'avoir lu »

    restauration de v1   v3 « Retour au texte de la version 1 »
                         v2 · v1 conservées — 3 versions
                         courante = v3, texte identique à v1
                         quota : 5 sur 5 — la réécriture n'appelle personne

#### Ce qui reste de WF-08

Deux choses, et je ne les ai pas faites :

- **les recoupements déterministes de RG-08.3.** Une date qui diffère entre
  la lettre et le relevé de notes est une comparaison de chaînes, et la
  règle du projet dit que tout ce qui est vérifiable sans IA l'est sans IA.
  Mais il faut des champs extraits à comparer, et `extraction` n'est pas
  branchée : le lot dépend d'elle, pas de la rédaction.
  *Cette conclusion était trop large — S.12 la corrige. Seule la
  comparaison avec une **pièce jointe** attend `extraction` ; la
  comparaison avec ce que le dossier sait déjà de lui-même n'attendait
  rien.*
- **l'export PDF et DOCX**, étape 6. L.3 a déjà tranché pour l'archive — le
  PDF est celui du navigateur —, et la même décision vaut probablement ici ;
  elle demande d'être posée.

### S.9 — Le serveur disait la vérité, l'écran ne l'écoutait pas

Deux commandes inertes restaient au registre après S.8. L'une des deux
n'attendait rien du tout — et ma note à son sujet était fausse.

#### Ma note était fausse, et il faut le dire

J'avais écrit que « Téléverser sans analyse » manquait d'une route **et
d'une décision sur ce que devient la complétude**. Les deux étaient
inexacts.

RG-06.5 a tranché depuis le début : *le quota n'interdit pas le dépôt, il
n'interdit que l'analyse.* Et toute la chaîne l'appliquait déjà — la route
de dépôt ne refuse rien sur le solde, le balayage relit le solde **après**
la promotion (entre le dépôt et le balayage, une autre pièce a pu consommer
la dernière analyse), et sans analyse il remet la pièce en attente et
recalcule la complétude.

Je l'avais notée en lisant l'absence de `onClick`, sans ouvrir la route.
C'est exactement l'erreur de S.2, où j'avais écrit que B-03 et B-04
ouvraient un dossier sans le consigner alors qu'aucun écran n'ouvrait de
dossier du tout. Un registre qui se remplit sans vérifier devient une liste
de suppositions.

#### Le vrai défaut : un champ calculé deux fois et lu zéro fois

Les deux appels du dépôt répondent `analyseraLaPiece` — la préparation
estime, la confirmation décide. **Aucun consommateur dans tout le dépôt.**

Pendant ce temps l'écran affirmait, sans condition :

> Tu peux continuer à remplir ton dossier pendant l'envoi. L'analyse démarre
> automatiquement à la fin.

Avec un quota épuisé, l'analyse ne démarre jamais. La phrase était fausse
**au moment précis où la personne dépense ses données mobiles** pour monter
dix mégaoctets — et elle est affichée pendant l'envoi, donc lue.

Le serveur avait raison, calculait la bonne réponse, et la disait à un écran
qui ne l'écoutait pas.

#### Et l'état où le bouton mène devait se lire

Brancher le bouton rendait atteignable, exprès, un état qui ne se lisait
pas : une pièce déposée que le quota a empêché d'analyser revient à
`ATTENDUE`. La pastille affichait donc **« Attendue »** sur une pièce dont
le fichier est sur le serveur, à côté d'une action « Remplacer ». Le
candidat lit qu'on attend toujours sa pièce et la renvoie — en dépensant ses
données une seconde fois.

L'état se dérive sans champ nouveau, et la dérivation est exacte :
`ATTENDUE` **et** remède `REMPLACER`. Le remède ne passe à `REMPLACER`
qu'après un dépôt ; l'état ne revient à `ATTENDUE` qu'après un balayage sain
sans analyse. Un dépôt analysé finit `CONFORME`, `A_CORRIGER`, `ILLISIBLE`
ou `HORS_SUJET` ; une pièce jamais déposée garde `TELEVERSER`.

La pastille dit désormais **« Conservée, non vérifiée »** — le fichier
d'abord, parce que c'est ce qu'on veut savoir quand on vient de payer son
forfait. La couleur reste celle de l'état : c'est lui qui décide de la place
de la pièce dans la checklist, et une pièce non vérifiée n'est pas conforme.

**Exécuté contre PostgreSQL :**

    quota 0, avant dépôt   ATTENDUE · TELEVERSER · 0 version
                           écran : « Ta pièce sera conservée sans être
                                     analysée »

    après confirmation     EN_ANALYSE · REMPLACER · 1 version
                           (balayage en cours, la pastille suit l'état)

    après balayage sain    ATTENDUE · REMPLACER · 1 version
    sans analyse           pastille : « Conservée, non vérifiée »

    avec 3 analyses        écran : « L'analyse démarre automatiquement
                                     à la fin »

#### Un garde-fou de plus qui ne mordait pas

Le premier jeu de tests vérifiait que la pastille **reçoit** le libellé, en
lisant le source des deux checklists. Le retirer du composant qui le rend ne
faisait rien échouer : la propriété passait, et n'était pas affichée. Un test
qui rend le composant, lui, mord. Cinquième occurrence de cette leçon.

#### Ce qui reste, et pourquoi je ne l'ai pas fait

« Me prévenir dès qu'il y en a un », dans l'annuaire des consultants, reste
au registre. Elle demande deux choses qu'aucune ligne de code ne décide :
une messagerie, **bloquante avant ouverture**, et un endroit où consigner
l'intérêt du candidat — aucune table ne le porte. Promettre « je te
préviens » sans pouvoir envoyer serait précisément la promesse que cette
revue a passé huit lots à retirer.

### S.10 — Un avis qui attendait un événement qui ne peut pas se produire

Dernière entrée du registre des commandes inertes. Elle m'a fait trouver
autre chose que ce que j'y avais écrit.

#### Ma note était fausse, pour la deuxième fois

J'avais inscrit que « Me prévenir dès qu'il y en a un », dans l'annuaire
des consultants, attendait la messagerie — bloquante avant ouverture.
C'était vrai et **hors sujet** : même branchée, la messagerie n'aurait rien
eu à envoyer.

`Accreditation` — la table qui atteste le titre d'exercice d'un consultant
dans une juridiction, exigée par RG-12.1 — **n'a aucun écrivain dans le
produit**. La lecture de l'annuaire filtre précisément sur elle. Rien ne
peut donc rendre un consultant habilité, et l'avis n'avait pas d'événement
à attendre. Le blocage n'était pas le canal, c'était le fait.

Deux fois sur deux — ici et pour « Téléverser sans analyse » en S.9 — j'ai
noté un manque en lisant l'absence d'un `onClick`, sans suivre la chaîne
jusqu'au bout. Une fois le registre s'est trouvé trop pessimiste, une fois
trop optimiste. Un registre qui se remplit sans vérifier est une liste de
suppositions.

#### Le balayage, et ce qu'il a trouvé

Quelles tables aucune ligne de `src/` ne remplit ? Cinq, et elles se
rangent en deux familles :

| Table | Ce que son absence produit |
|---|---|
| `Accreditation` | l'annuaire des consultants est vide pour **toutes** les destinations, et le reste |
| `PartnerActivation` | aucune offre de partenaire n'est proposée, dans aucun pays |
| `Consultant`, `Partner`, `SourceCheck` | remplies par le seul jeu de démonstration |

Les deux premières sont des **enregistrements de vérification** : un titre
d'exercice contrôlé, la licéité d'une commission dans un pays, chacun avec
son `verifiedAt` et son `verifiedBy`. Les lectures les interrogent pour
décider ce qu'un candidat voit. Aucune surface ne les crée.

Pour les consultants, la cause est nommable : **WF-12 liste ADM parmi ses
acteurs** et RG-12.1 fait de l'habilitation un acte d'administration — et
DOC-12 ne donne aucun écran à cet acteur. B-01 à B-07 couvrent la veille,
les règles, les comptes, les paiements, la revue, le journal et les coûts.
L'annuaire n'a pas de back-office.

Un quatrième registre naît de là, à côté de `DEPENDANCES` (ce qu'une clé
branche) et `PREALABLES` (ce qu'une personne qualifiée tranche) :
`HABILITATIONS_SANS_ECRIVAIN`, pour ce qu'aucun écran ne sait créer. Le
balayage qui l'a trouvé est devenu son garde-fou, dans les deux sens —
une table de vérification sans écrivain doit y être nommée, et une table
nommée doit rester sans écrivain. Le jour où l'écran existe, le test échoue
et force à retirer l'entrée.

#### Le contraste, contre PostgreSQL

    base migrée, sans démonstration
      Consultant 0 · Accreditation 0 · Partner 0 · PartnerActivation 0
      NL → 0 consultant habilité · 0 offre autorisée
      CA → 0 · 0        FR → 0 · 0

    après `seed:demo`
      Consultant 1 · Accreditation 1 · Partner 1 · PartnerActivation 1
      NL → 1 consultant habilité · 1 offre autorisée
      CA → 0 · 0        FR → 0 · 0

La démonstration montre un annuaire garni ; la production en montrera un
vide, à jamais. C'est le piège de S.6 sur une autre table — là, le jeu de
démonstration inventait un coût que le produit ne savait pas calculer.

#### Ce que l'écran dit maintenant

Le bouton est parti. L'état vide nomme déjà les destinations couvertes
quand il y en a, et il ajoute pourquoi il n'y en a pas ici : l'habilitation
se prononce destination par destination, aucune n'est enregistrée, et
**nous ne t'annonçons pas un rendez-vous que nous ne pouvons pas
proposer.** Reste l'action qui marche : continuer sans consultant.

La surface des partenaires, elle, disait déjà la même chose depuis le
début — « Cette page reste vide tant que l'autorisation n'est pas rétablie »,
« c'est l'état normal, pas une panne ». Le même vide, dit.

#### Trois garde-fous de plus qui ne mordaient pas

Le balayage lui-même s'est trompé deux fois avant d'être juste :

1. il ne connaissait que `db.table.create(` et accusait `Deadline`, écrite
   en imbriqué à l'ouverture de chaque dossier ;
2. corrigé pour l'imbriqué, il dérivait la clé de relation du nom du
   modèle — ce qui marche pour `accreditations` ← `Accreditation` et tombe
   pour `activations` ← `PartnerActivation`. **Mon test affirmait donc que
   la démonstration n'écrivait pas `PartnerActivation`, et la base l'a
   démenti** : elle en contient une. Les clés se lisent maintenant dans le
   schéma.

Et une mutation a révélé un troisième trou, ailleurs : remplacer le bouton
retiré par un `LienBouton href="#"` passait au vert. Le garde-fou des liens
morts ne regardait que les adresses commençant par `/`. Un `href="#"` est
pourtant une commande morte de plus — l'apparence d'un lien, le curseur
d'un lien, et rien. Le dépôt n'en contient aucun, et un test l'y maintient.

Le balayage des commandes inertes couvre par la même occasion `<button>`
en balise nue, et pas seulement le composant : il n'a rien trouvé de
nouveau, ce qui est le résultat qu'on espère d'un élargissement.

#### Le registre des commandes inertes est vide, sans réserve

Onze dans le back-office, deux de plus dans l'espace candidat trouvées en
élargissant le balayage, et celle-ci. Le registre reste, vide : c'est lui
qui refusera la prochaine.

### S.11 — WF-08 étape 6 : les deux sorties

Dernière étape de WF-08 restée non faite : « Export PDF et DOCX ». Les deux
moitiés n'appellent pas la même réponse, et c'est tout le lot.

#### Le PDF est celui du navigateur, et L.3 l'avait déjà dit

> Une bibliothèque de génération pèserait plus que le reste de
> l'application et rendrait un document moins fidèle que la page
> elle-même. *(L.3, pour l'archive d'un dossier)*

Le raisonnement vaut ici sans changement. Une page d'impression rend le
texte, « Imprimer » puis « Enregistrer au format PDF » suffit.

Une page **à part** de l'éditeur, et c'est le point à ne pas rater :
l'éditeur porte un champ de saisie depuis S.8, et un `textarea` imprimé
rend une boîte grise coupée à sa hauteur d'écran. Le texte s'imprime comme
un texte, avec `whitespace-pre-line` — les retours à la ligne du candidat
sont les siens.

Ce qui disparaît porte `pas-a-imprimer` : le lien de retour et la consigne.
La règle ne devine pas par nom de balise — c'est la correction de L.3, où
masquer `header` emportait l'en-tête de l'archive elle-même.

#### Le DOCX ne peut pas suivre cette voie

Personne n'imprime un fichier Word, et une université qui demande un
document **modifiable** ne se contente pas d'un PDF. L.3 ne couvre donc pas
cette moitié.

Un DOCX est une archive ZIP de trois fichiers XML. Les produire ne demande
aucune dépendance : le XML s'écrit en fonction pure du texte, et l'archive
se scelle avec le `zlib` de la plateforme. C'est la discipline de L.2, qui
refusait une bibliothèque d'archivage pour empaqueter des pièces —
**refuser la dépendance, pas la fonction.**

Le partage suit la règle d'architecture : le XML est pur et vit dans
`domain/redaction/docx.ts` ; le scellement emploie `zlib` et vit dans
`server/redaction/zip.ts`. Un ZIP dans sa forme la plus simple — en-tête
local, octets compressés, répertoire central, enregistrement de fin. Ni
Zip64, ni chiffrement, ni répertoires : trois petits fichiers, et c'est
tout ce que ce module verra jamais.

**L'archive est datée de la version, pas de la demande.** Deux exports du
même texte rendent les mêmes octets, et un fichier retrouvé six mois plus
tard dit quand la lettre a été écrite.

#### RG-08.1 voyage dans le fichier

C'est l'invariant du lot, et il vaut pour les deux sorties. La mention
d'aide à la rédaction est **dans** le document, en pied :

> Ce texte est une aide à la rédaction. Il part de tes réponses, tu le
> relis et tu le modifies : la pièce que tu déposes est la tienne, et elle
> relève de ta responsabilité.

En tête, elle serait lue avant la lettre et la présenterait comme un
brouillon. En pied, elle dit ce que le lecteur a sous les yeux après
l'avoir lu. Et elle sert précisément là : le document sort de la
plateforme, il sera lu par quelqu'un qui n'a pas vu l'écran.

#### Ne pas nommer ce qui n'est pas là, jusque dans un format de fichier

La première version référençait des styles `w:pStyle` — `Titre`,
`Intertitre` — qu'aucun `styles.xml` ne définissait. Un traitement de texte
les ignore silencieusement : le document pointait vers ce qui n'existait
pas. Embarquer une feuille de styles pour trois niveaux demanderait une
pièce et une relation de plus, pour un résultat que le gras et l'italique
rendent déjà. La mise en forme est donc directe.

C'est la discipline des dix lots précédents, appliquée à un format binaire.

#### Vérifié en ouvrant l'archive, pas en lisant une chaîne

    unzip -t            les trois pièces OK, aucun défaut de compression
    [Content_Types].xml wordprocessingml.document.main+xml
    _rels/.rels         → word/document.xml
    word/document.xml   XML bien formé

    le document tel qu'un traitement de texte le lira
      [titre     ] Lettre de motivation
      [intertitre] MOTIVATION
      [corps     ] Je souhaite étudier à Groningue, en <sciences> & …
      [intertitre] FINANCEMENT
      [corps     ] Ma famille finance mes études.
      [mention   ] Ce texte est une aide à la rédaction. …

    chevrons du candidat échappés     oui
    aucune balise ouverte par le texte oui
    date de l'archive                 2026-09-21 09:30 — celle de la version
    déterminisme                      deux appels, octets identiques

**Ce que je n'ai pas pu vérifier** : ouvrir le fichier dans Word ou
LibreOffice. L'archive est un ZIP valide, ses pièces se décompressent, leur
CRC est juste et leur XML est conforme à WordprocessingML — mais aucun
traitement de texte n'a lu ce fichier. C'est la première chose à faire
avant de compter cette étape comme close.

#### Deux garde-fous qui lisaient la mauvaise copie

Le CRC et les tailles sont écrits **deux fois** dans un ZIP — en-tête local
et fiche centrale — et c'est la copie **locale** qu'un lecteur vérifie. Ma
première lecture de test ne contrôlait que la fiche centrale : corrompre le
CRC local passait au vert, alors qu'`unzip` rejette l'archive. Un garde-fou
qui lit l'autre copie que le lecteur réel — la même leçon que sur les
écrans, cette fois sur un format binaire.

Et deux autres, de la famille déjà connue : le refus d'exporter une pièce
vide était vérifié par la présence d'une chaîne, que neutraliser la
condition laissait en place ; la mention de RG-08.1 était vérifiée par la
présence de son nom, que la ligne d'import contient. Les deux portent
maintenant sur la position de la garde et sur l'emploi de la constante.

### S.12 — RG-08.3 : j'avais déclaré bloqué ce qui ne l'était pas

Le dernier point de WF-08. Je l'avais rangé, en S.8, parmi ce qui attend
`extraction` : *« il faut des champs extraits à comparer »*. C'était faux,
et c'est la troisième fois de la session que je conclus à un blocage en
raisonnant sur une absence au lieu de suivre la chaîne — après le dépôt
sans analyse en S.9 et l'avis de consultant en S.10.

#### Ce que la règle demande, et ce que j'avais lu

RG-08.3 donne un exemple : *« si la lettre mentionne un financement
familial et que le relevé est au nom du candidat, l'incohérence est
signalée »*. J'ai lu l'exemple et j'ai conclu sur la règle. Or WF-08
étape 4 énonce la règle : *« cohérence avec **le reste du dossier** »*. Et
le dossier sait, sans qu'aucune pièce jointe soit lue :

- la **destination** sur laquelle il a été ouvert, par sa règle figée ;
- ce que cette règle figée **demande** — `niveau_langue_min`, entre autres.

La règle d'architecture 2 s'applique alors sans discussion : *tout ce qui
est vérifiable sans IA l'est sans IA*. Deux recoupements le sont — une
comparaison de chaînes, aucun jeton débité, aucun service à brancher.

#### Deux recoupements, et deux écartés pour la même raison

Ce qui est écrit :

    la destination      la lettre nomme un autre pays du catalogue
                        et ne nomme jamais celui du dossier
    le niveau de langue tous les niveaux CECRL cités sont sous le
                        minimum de la règle figée

Ce qui ne l'est pas, et pourquoi :

    l'année de rentrée  « à la rentrée 2019 » est aussi bien une lettre
                        réutilisée qu'un parcours raconté ; rien dans le
                        texte ne les sépare sans le comprendre
    les montants        un chiffre dans une lettre désigne aussi bien des
                        frais de scolarité qu'un budget annuel

La règle qui a décidé les quatre cas est la même : **un écart inventé coûte
plus cher qu'un écart manqué.** Le candidat qui lit « ta lettre cite la
France » sur une phrase où il raconte ses études passées en France cessera
de lire les remarques suivantes, y compris la vraie. Les deux recoupements
retenus sont donc écrits pour ne se déclencher que sur un faisceau qui ne
laisse pas d'autre lecture :

- une lettre qui cite la France **et** les Pays-Bas sur un dossier
  néerlandais raconte un parcours — elle nomme sa destination, rien n'est
  signalé ;
- une lettre qui annonce « B1 en allemand et C1 en anglais » satisfait le
  minimum par l'un des deux, et nous ne savons pas lequel porte la langue
  du cursus — rien n'est signalé.

Le pays d'origine n'est pas dans le lexique : une lettre écrite depuis
Cotonou parle du Bénin, et ce n'est pas une incohérence.

#### Ce qui n'est pas recoupé est écrit à l'écran

C'est la moitié qui manquait aux dix lots précédents et que celui-ci ne
pouvait pas se permettre d'oublier : sans elle, « rien ne diverge » se lit
comme « tout a été vérifié », et le candidat croit sa lettre confrontée à
ses pièces jointes alors qu'aucune n'a été ouverte. R-04 affiche donc deux
listes, et la seconde toujours :

    Ce que nous avons recoupé
      La destination citée dans ta lettre, comparée à la Suisse — la
      destination de ce dossier.
      Le niveau de langue annoncé dans ta lettre, comparé au B2 que
      demande la procédure figée.

    Ce que nous n'avons pas recoupé
      Les montants, les noms et les dates portés par tes pièces jointes :
      leur lecture automatique n'est pas branchée, nous ne comparons donc
      rien à ce qu'elles contiennent.
      Les montants cités dans ta lettre : un même chiffre y désigne aussi
      bien des frais de scolarité qu'un budget annuel, et nous ne
      signalons pas un écart que nous ne savons pas lire.

La moitié de RG-08.3 que son exemple canonique décrit — la lettre contre le
relevé — **reste bloquée sur `extraction`**, et c'est maintenant l'écran qui
le dit, pas seulement une note dans ce document.

#### Un troisième vide, après les deux de S.8

S.8 avait séparé « relu, rien à reprendre » de « jamais relu ». Les
recoupements en ouvrent un troisième : le fond n'a pas été lu, mais la
lettre a bien été comparée à ce que le dossier sait. `ANALYSE_INDISPONIBLE`
aurait effacé des écarts réellement trouvés ; `RELUE_SANS_REMARQUE` aurait
donné pour lu un fond que personne n'a jugé.

    SANS_TEXTE          pas encore de version
    ANALYSE_INDISPONIBLE ni analysé, ni rien de comparable
    RECOUPEE_SEULEMENT  recoupé, fond non analysé
    RELUE_SANS_REMARQUE analysé, rien à reprendre
    RELUE               analysé, des remarques

Et le résumé de `RECOUPEE_SEULEMENT` ne passe pas par celui de la
relecture : ce dernier parle de « pièces », et le recoupement n'en ouvre
aucune. Même raison pour le genre `INCOHERENCE_DOSSIER`, qui n'existe pas
dans l'énumération Prisma : « Incohérence entre pièces » annoncerait une
comparaison qui n'a pas eu lieu.

#### Calculé à la lecture, jamais stocké

Un `CritiqueFinding` écrit en base survivrait à la correction du texte : le
candidat corrigerait sa lettre et lirait encore l'ancien écart. Les
recoupements ne coûtent rien — ils se recalculent à chaque affichage. Un
test le tient : le genre non stocké n'apparaît dans aucun `kind:` du dépôt.

#### Vérifié en mutant, puis en exécutant

Treize mutations, treize rouges — dont celles qui comptent :

    la lettre nomme sa destination → on signale quand même   2 rouges
    on ne signale jamais                                     6 rouges
    « tous en dessous » devient « au moins un »              1 rouge
    « Canadair » redevient le Canada                         1 rouge
    « recoupé seulement » retombe sur « jamais analysé »     3 rouges
    zéro écart redevient « rien à reprendre »                2 rouges
    la ligne des pièces jointes disparaît                    2 rouges

Une garde a failli ne pas mordre pour une raison déjà vue trois fois cette
session : ma première lecture des niveaux CECRL bornait le motif par des
groupes, qui **consomment** le séparateur. « B1 et C1 » ne rendait que le
premier — c'est-à-dire que le second niveau, celui qui désamorce la
remarque, disparaissait, et la lettre honnête recevait un faux écart. Les
bornes sont maintenant des assertions.

Puis l'exécution, sur le dossier suisse de la base, règle figée à B2 :

    lettre citant le Canada et un B1
      « 2 écarts relevés en recoupant ta lettre avec les informations de
        ton dossier. Le fond de ta lettre, lui, n'a pas été analysé … »
      Écart avec ton dossier · Ta lettre nomme le Canada, jamais la Suisse
      Écart avec ton dossier · Ta lettre annonce B1, la procédure demande B2
      aucun bandeau de source : rien n'a été relu

    lettre citant la Suisse et un C1
      « Nous avons recoupé ta lettre avec ce que ton dossier sait déjà :
        rien ne diverge. Le fond, lui, n'a pas été analysé … »
      aucune remarque, les deux listes affichées

### S.13 — WF-09 : l'échéancier comptait les retards sans jamais conclure

C-10 affichait « 3 échéances sont en retard. » Trois lignes rouges, et rien
qui dise la seule chose qui compte : qu'avec les délais de sa procédure, la
date de départ visée n'est plus atteignable. **Un décompte n'est pas un
diagnostic** — c'est le zéro de B-07 et le « rien à reprendre » de R-04 sur
une troisième surface, le chiffre tenant lieu de constat.

WF-09 étape 4 demandait les deux moitiés : *« Alerte d'incompatibilité si le
calendrier ne tient plus, avec proposition de replanification. »* Ni l'une
ni l'autre n'existait.

#### Ce qui n'est pas connu n'est pas zéro

Toutes les pièces n'ont pas de `delai_obtention_jours` dans la règle figée.
Sur le dossier de démonstration, trois sur quatre n'en ont pas. Un calcul
qui compte l'absence comme zéro conclut « ça tient » sur un dossier dont on
ignore l'essentiel — l'affirmation rassurante, encore elle. D'où quatre
états, et non deux :

    SANS_DATE            pas de date visée
    INTENABLE            une pièce obligatoire ne peut plus arriver,
                         ou la date de dépôt est derrière nous
    INDETERMINE          rien n'est en retard, mais un délai manque
    TENABLE              tous les délais sont connus, et tous tiennent

`INDETERMINE` n'est ni un feu vert ni une alerte. Il nomme les pièces dont
le délai n'est pas annoncé et s'arrête là : *« Ce que nous savons tient ; ce
que nous ignorons n'est pas compté comme nul. »*

Le cas qu'un simple décompte de retards manquait est `depotPasse` : la ligne
« Dépôt » n'est pas une pièce à obtenir, et le calendrier peut être mort
sans qu'aucune pièce soit en retard.

#### Deux comparaisons refusées, pour la même raison qu'en S.12

Un écart inventé coûte plus cher qu'un écart manqué. Deux règles suivent de
là :

- **le verdict porte sur les pièces obligatoires.** RG-07.2 a déjà tranché
  la frontière pour la complétude ; le calendrier suit la même. Une pièce
  complémentaire en retard reste visible dans l'échéancier, elle ne
  condamne pas la date.
- **les pièces à rédiger sont hors du calcul.** Une lettre de motivation ne
  met pas quarante-cinq jours à venir : l'absence de délai n'y est pas une
  inconnue, c'est un délai qui n'existe pas. Les compter mettrait tous les
  dossiers en `INDETERMINE`, c'est-à-dire nulle part.

#### La proposition, et ce qu'elle ne prétend pas être

`aujourd'hui + le plus long des délais connus + le délai d'instruction`.
Une soustraction rendue dans l'autre sens, rien de plus. Elle ne dit pas que
la demande aboutira (INV-1), et elle dit ce qui lui manque :

> En partant d'aujourd'hui, la première date de départ compatible avec les
> délais connus est le 19 janvier 2027. C'est un plancher, pas une
> prévision : 3 pièces obligatoires n'ont pas de délai annoncé, ce qui peut
> la repousser.

Elle n'apparaît que sur un calendrier intenable. Proposer de repousser une
date qui tient reviendrait à conseiller d'attendre, et nous ne conseillons
pas.

#### Deux commandes, et une affirmation, qui ne tenaient à rien

En écrivant l'alerte, l'écran a livré trois choses fausses.

**« Changer la date de dépôt »** menait à la checklist, où rien ne la
change : `targetDate` n'avait qu'un écrivain, l'ouverture du dossier. Une
alerte d'incompatibilité sans moyen d'y répondre aurait été une commande
inerte de plus (règle de Q.A). Le champ est maintenant sur l'écran, et
`PUT /api/dossiers/[id]/echeancier` recalcule tout l'échéancier **depuis la
règle figée** (INV-3) en reportant les `doneAt`.

**« Rappels par email activés — les modifier »** affirmait deux choses,
fausses toutes les deux : rien n'envoie de rappel — la messagerie
transactionnelle n'est pas branchée, et aucun travail de fond ne lit
l'échéancier —, et le profil ne porte aucun réglage de notification à
modifier. Un candidat qui croit ses rappels actifs cesse de venir regarder,
et rate la date. L'écran dit maintenant qu'aucun rappel n'est envoyé, et ce
qu'il faut faire en attendant. WF-09 étape 3 reste ouverte, et se voit.

**« Dépôt visé le 1er septembre 2027 »**, au-dessus d'une ligne « Dépôt de
la demande — 3 juin 2027 ». Le même mot pour deux dates à trois mois
d'écart. La base tranche : `targetDate` vaut 2027-09-01 et l'échéance
`depot` 2027-06-03, soit la cible moins le délai d'instruction — exactement
ce que DOC-11 WF-09 étape 1 décrit, *« à rebours depuis la date cible
(rentrée, prise de poste) »*. C'est donc l'étiquette qui mentait. C-10, la
checklist et l'archive disent maintenant « départ visé », et le compte à
rebours suit le **dépôt**, puisque c'est lui qui commande les pièces.

#### Ce que je n'ai pas fait, et qu'il faut décider

Le champ s'appelle toujours `depotVise` dans la vue, et c'est de ce nom que
venait la divergence. Le renommer touche trois choses qui demandent chacune
leur propre décision, et je ne les ai pas prises :

- **`libelleAlertePeremption(piece, depotVise)`** calcule la péremption
  d'une pièce par rapport à la **cible**, alors qu'une pièce doit être
  valable le jour du **dépôt**. Une pièce qui expire entre les deux dates
  est signalée à tort — ou pas signalée, selon le sens de l'écart. C'est un
  changement de comportement, pas d'étiquette.
- **l'export de portabilité** publie la clé `depotVise`. La renommer change
  un format que le candidat a pu télécharger.
- **C-05** demande « ta date de dépôt visée » en proposant des rentrées.
  La question elle-même est à réécrire, pas seulement son intitulé.

#### Vérifié en mutant, puis en exécutant

Quatorze mutations, quatorze rouges — dont les quatre qui portent le lot :

    délai inconnu compté comme zéro                      3 rouges
    l'indétermination devient un feu vert                3 rouges
    le dépôt passé ne compte plus                        1 rouge
    une pièce complémentaire condamne la date            1 rouge
    les pièces à rédiger rentrent dans le calcul         1 rouge
    la mention des rappels revient                       1 rouge

Puis l'exécution, sur le dossier de démonstration et par le vrai point
d'entrée HTTP, session en base :

    PUT dateCible=2020-01-01     422, champ dateCible :
                                 « Choisis une date à venir : calculé à
                                   rebours d'une date passée, l'échéancier
                                   place toutes ses étapes derrière nous. »
    PUT dateCible=aujourd'hui+40 200, échéances recalculées depuis la règle
                                 figée — dépôt au 2 août 2026, donc passé
    C-10 après ce changement     « La date de dépôt est passée » …
                                 « Diplôme le plus élevé (30 jours
                                   d'obtention, 80 de trop) »
    remise à 2027-09-01          diplome 2027-05-04 · depot 2027-06-03,
                                 identiques aux valeurs d'origine

C'est cette lecture qui a trouvé deux formulations qu'aucun test ne voyait :
« Dépôt le 2 août 2026 — **date de dépôt** dépassée de 50 jours », où le
compte à rebours répétait ce que la phrase venait de nommer, et une
proposition à deux niveaux de deux-points imbriqués. Les deux portent
maintenant leur garde.

### S.14 — Un nom de champ, deux calculs faux et quatre écrans faux

S.13 avait trouvé l'étiquette de travers — « Dépôt visé le 1er septembre
2027 » au-dessus d'une ligne « Dépôt de la demande — 3 juin 2027 » — et
l'avait corrigée sur le seul écran qu'il touchait, en consignant le reste.
Le reste est ici, et il ne s'agissait pas que d'étiquettes.

`Application.targetDate` est la **date cible** — rentrée ou prise de poste
(DOC-11 WF-09 étape 1) —, et le dépôt s'en déduit en retirant le délai
d'instruction. La vue candidat l'appelait `depotVise`. Sur la procédure
néerlandaise, la fenêtre entre les deux fait **quatre-vingt-dix jours**, et
c'est dans cette fenêtre que tout se lit.

#### La question posée au tout début demandait la mauvaise date

C-05 demandait « Quand veux-tu déposer ta demande ? » et proposait le
15 janvier, décrit comme la « rentrée de septembre suivante ». La réponse
partait dans `targetDate`, d'où `echeancesDepuis` retire ensuite le délai
d'instruction. Un candidat qui répondait « je dépose le 15 janvier » se
voyait donc fixer un dépôt au **17 octobre** : tout son échéancier avançait
de trois mois.

Ce n'était pas une étiquette de travers, c'était la mauvaise donnée à la
source. La question porte maintenant sur ce que le champ contient — « Quand
veux-tu être sur place ? » —, les options sont les rentrées, et l'écran dit
que le dépôt s'en déduit.

#### Deux calculs se décidaient sur la date de départ

Les deux se décident au jour du **dépôt**, et recevaient la rentrée.

**La péremption d'une pièce.** `alertePeremption` était juste ; on lui
donnait la mauvaise date. Une pièce expirant le 15 juillet est valable le
jour du dépôt, le 3 juin — et la checklist annonçait « Expire le 15 juillet
2027, avant le dépôt visé ». Une fausse alarme qui fait refaire une pièce
pour rien, c'est-à-dire exactement le défaut que cette fonction avait été
écrite pour corriger, revenu par l'autre bout.

**La version de règle applicable.** `libelleImpact` comparait la rentrée à
la date d'entrée en vigueur d'une nouvelle règle. Avec une entrée en vigueur
au 1er juillet, un dépôt au 3 juin et une rentrée au 1er septembre, l'écran
annonçait la nouvelle version — et donc un montant supplémentaire à réunir
— sur un dossier qui déposera avant. Un candidat à qui on annonce 696 €
de plus qu'il ne doit pas réunir.

#### Quatre écrans nommaient la rentrée « dépôt »

    C-01 tableau de bord   « · dépôt le 01/09/2027 »  →  03/06/2027
    C-06 checklist         « Dépôt visé : … »         →  « Départ visé : … »
    C-10 échéancier        corrigé en S.13
    archive et export      clé `depotVise`            →  `departVise`

La vue porte maintenant les deux dates séparément — `departVise` et
`depot` —, et chaque appelant choisit la sienne. Le dépôt est calculé une
fois, par `dateDeDepot`, la même fonction que la faisabilité de S.13.

#### La garde que j'avais écrite ne voyait pas la rechute

Ma première garde relisait les **appels** : aucun `libelleAlertePeremption(…
departVise …)` dans le dépôt. La mutation « la checklist repasse la date
cible » est restée au vert — parce que la rechute ne passe pas par un
appel. L'écran transmet la date par une **propriété** `depot`, et c'est le
composant qui appelle, avec son paramètre.

C'est la huitième fois de cette session qu'une garde ne connaît que la
forme pour laquelle elle a été écrite. Elle suit maintenant la donnée là où
elle circule — rien de ce qui s'appelle `depot` ne reçoit ce qui s'appelle
« départ », « cible » ou `targetDate` — et une seconde mutation a montré
que « departVise » ne suffisait pas non plus : la page des alertes
transmettait une variable locale `depart`. La garde porte sur la racine du
mot.

Le vrai garde-fou reste le test de comportement : la checklist est rendue
sur un dossier dont la cible et le dépôt diffèrent, avec une pièce qui
expire entre les deux, et l'écran ne doit pas crier.

#### Vérifié en mutant, puis en exécutant

Huit mutations, huit rouges après correction des gardes :

    le dépôt redevient la cible                          1 rouge
    un délai absent devient trente jours                 1 rouge
    le délai est lu sans vérifier son type               1 rouge
    la péremption bascule dans l'autre sens              7 rouges
    la version applicable bascule dans l'autre sens      3 rouges
    la checklist repasse la date cible                   1 rouge
    l'écran d'alerte repasse la date cible               1 rouge
    C-05 redemande une date de dépôt                     1 rouge

Puis l'exécution, sur le dossier de démonstration servi par le vrai
serveur :

    règle figée                delai_traitement_jours.max = 90
    GET échéancier             departVise 2027-09-01, dépôt 2027-06-03
    C-06 checklist             « Départ visé : 1er septembre 2027 »
    C-01 tableau de bord       « · dépôt le 03/06/2027 »  (était 01/09)
    C-05 ouverture             « Quand veux-tu être sur place ? »
                               1er février 2027 · 1er septembre 2027

La lecture de C-05 a montré une dernière chose : les dates s'affichaient
« 1 février 2027 ». `jourEnFrancais` porte la règle de l'ordinal depuis
longtemps, en disant en commentaire qu'elle vaut « pour toutes les dates
affichées, d'où sa place ici plutôt que dans chaque écran » — et cet
écran-là formatait les siennes lui-même. Le défaut ne se voyait pas tant
que les options tombaient le 15 et le 2 du mois.

### S.15 — RG-07.4 était écrite, et ne pouvait pas se produire

« Une pièce passant en `EXPIREE` fait régresser le score et repasse le
dossier de `PRET` à `ACTIF`. » La seconde moitié existait depuis longtemps :
`recalculerCompletude` efface `readyAt` et redescend le statut dès que la
complétude retombe. La première n'existait pas.

`DocumentStatus.EXPIREE` n'était écrit **nulle part**. Il n'était que lu —
par la pastille d'état et par le barème. Toutes les occurrences d'`EXPIREE`
dans le dépôt appartenaient à `TransactionStatus`, l'énumération des
paiements, qui porte la même valeur.

Un passeport ou un relevé bancaire pouvait donc expirer sans que rien ne
bouge : la pièce restait « Conforme », le dossier restait « Prêt à
déposer », et le tableau de bord annonçait que rien ne bloquait le dépôt.
C'est l'affirmation la plus coûteuse de la plateforme, sur l'écran qu'on
ouvre en premier — et personne ne pouvait la voir venir, puisque
l'échéance était bien en base, écrite au dépôt par `dateDePeremption`.

#### Deux questions, et il ne fallait pas les confondre

`alertePeremption`, corrigée en S.14, répond à : *cette pièce sera-t-elle
encore valable **le jour du dépôt** ?* Elle prévient sans rien déclasser.

Ce lot répond à l'autre : *cette pièce est-elle encore valable
**aujourd'hui** ?* Une pièce échue n'est plus une pièce.

    perimeLe    aujourd'hui    dépôt
       │             │           │        échue : non
       │             ●───────────┼──▶     prévenue : oui, avant le dépôt
       ●─────────────┼───────────┼──▶     échue : oui

Strictement avant : une pièce valable « jusqu'au 21 septembre » l'est
encore le 21 septembre. La déclasser ce jour-là ferait refaire un document
que l'autorité accepte, ce que le reste du produit passe son temps à
corriger.

Et seule une pièce **conforme** régresse. Une pièce déjà à corriger n'a
rien à perdre, et l'étiquette « expirée » remplacerait son message
actionnable — « ton passeport expire 4 mois après la date de retour, il en
faut 6 » — par quelque chose de plus vague.

#### Le partage lecture / travail de fond, repris de la veille

`depublierLesFichesEchues` avait déjà posé la règle, en toutes lettres :
*« sans le filtre, un job en retard laisse passer une donnée périmée ;
sans le job, le back-office croit publié ce qui ne s'affiche plus. »*

Même partage ici, et pour les mêmes raisons :

- **la vue** déclasse la pièce à l'affichage, requête par requête. Ce n'est
  pas une seconde vérité : `expiresAt` est déjà en base, la vue l'évalue
  maintenant plutôt qu'à trois heures du matin. Le remède passe à
  `REMPLACER` — « Ajouter » sur une ligne où un fichier existe déjà fait
  chercher ce qu'on a envoyé.
- **le job** écrit l'état stocké, refait le barème, redescend le dossier et
  prévient le candidat. `NotificationKind.ECHEANCE` avait lui aussi son
  premier écrivain à trouver.

Le compilateur a attrapé une faute au passage : `documents.map(versPiece)`
donnait l'**index du tableau** comme second argument, c'est-à-dire comme
date du jour. La deuxième pièce de chaque dossier aurait été jugée au
1er janvier 1970.

#### La garde était satisfaite par une autre table

Ma première garde cherchait `status: "EXPIREE"` n'importe où dans le dépôt.
Elle est restée **au vert** sur la mutation qui retirait l'écriture du job
— parce que la réconciliation des paiements écrit `status: "EXPIREE"` sur
une `Transaction`. Une garde sur un état de **document** qui se contente
d'un état de transaction ne garde rien.

Neuvième fois de cette session qu'une garde ne connaît que sa forme. Elle
cherche maintenant l'écriture dans un `db.document.update`, et sa portée
est dite plutôt que supposée : `CONFORME` et `A_CORRIGER` sont écrits par
l'analyse à travers une table de correspondance, pas en littéral, et les
exiger ici ferait échouer la garde sur du code correct.

#### Vérifié en mutant, puis en exécutant

Sept mutations, sept rouges — dont celles qui portent le lot :

    la limite du jour déclasse la pièce                  1 rouge
    toutes les pièces régressent, pas les conformes      1 rouge
    la vue ne déclasse plus rien                         2 rouges
    la vue garde le remède d'origine                     1 rouge
    la mention reparle au futur d'un fait passé          1 rouge
    le job n'écrit plus EXPIREE                          1 rouge

Puis l'exécution, sur le dossier de démonstration monté en `PRET` avec une
pièce dont la validité s'arrêtait au 1er août :

    avant la passe
      base   statut=PRET  readyAt=posé  barème=75
      écran  INCOMPLET · ADM=EXPIREE
             ← la base disait « prêt », l'écran disait « incomplet »

    bilan  {"pieces":1,"dossiers":1,"redescendus":1}

    après la passe
      base   statut=ACTIF  readyAt=nul  barème=65
      pièce  admission=EXPIREE
      alerte « Lettre d'admission inconditionnelle : la validité est
             dépassée … ton dossier repasse en préparation. Téléverse une
             version à jour pour la remplacer. »

Le dossier de démonstration a ensuite été remis à l'identique, et l'état
revérifié en SQL indépendamment du script : cinq pièces dans leurs statuts
d'origine, aucune échéance résiduelle, une seule notification, celle qui
préexistait.

#### Ce que l'exécution a montré et que je n'ai pas corrigé

`prochaineAction` compose « Remplacer **ton** lettre d'admission
inconditionnelle » et « Ajouter **ton** assurance maladie ». Le possessif
est écrit en dur, et le genre du libellé n'existe nulle part : il n'est ni
dans `pieces_requises` du référentiel, ni sur `Document`.

Ce n'est pas une ligne à changer. Les trois issues ont chacune un coût :
porter le genre dans le référentiel demande de reprendre toutes les fiches
seedées ; revenir à « Remplacer : lettre d'admission » retombe sur la forme
que le commentaire de cette fonction rejette explicitement — *« se lit
comme un intitulé de champ »* — ; et deviner le genre sur le libellé est
faux une fois sur trois. La décision appartient au référentiel, pas à
l'écran.

### S.16 — B-09 : l'écran qui manquait à l'annuaire

`Accreditation` était au registre des habilitations sans écrivain depuis
S.10. `annuaire()` filtre sur les habilitations non révoquées, rien dans le
produit n'en créait, et l'annuaire des consultants était vide pour toutes
les destinations — définitivement. Le registre disait aussi ce qui
manquait : *« il manque un écran, et personne ne l'avait remarqué parce
qu'un registre vide se lit comme un registre en ordre. »*

WF-15 nomme pourtant le domaine — « Consultants : validation
d'habilitation, suspension » — et RG-12.1 l'exige. Tout le reste de WF-12
était écrit et attendait une ligne en base : filtrage par destination,
créneaux, consentement de partage, rendez-vous, annulation.

#### Ce que l'écran décide, et ce qu'il ne décide pas

S.10 notait que RG-12.1 ne dit pas **ce qui constitue** une preuve de titre
d'exercice, et en avait fait un blocage. C'est exact et ce n'est pas un
blocage : un RCIC se vérifie au registre canadien, un avocat à son barreau,
et la pièce probante diffère d'une juridiction à l'autre. L'écran fait ce
que le produit sait faire — la même chose que WF-14 fait d'une fiche : il
**enregistre la vérification**. Quel titre, quelle juridiction, quand, par
qui. Le jugement reste humain ; la trace est le travail du produit.

D'où le rappel au-dessus du formulaire, qui nomme la responsabilité sans
prétendre définir la preuve, et d'où `verifiedBy` pris **dans la session** :
un nom saisi dans un champ peut être celui de n'importe qui, et c'est
justement cette ligne qu'on relira si une habilitation est contestée.

#### La couverture, et non le décompte

L'écran met en tête ce qui appelle une action : *« 1 destination ouverte
n'a aucun consultant habilité : CA. »* Trois consultants tous habilités au
Canada laissent les dossiers néerlandais sans personne, et un décompte de
consultants ne dit rien de cela. Un consultant suspendu ne couvre rien, et
une habilitation retirée non plus.

Trois états, parce que « actif / inactif » en laissait un sans nom : une
fiche complète dont toutes les habilitations ont été retirées est active,
renseignée, et invisible.

    VISIBLE             au moins une habilitation en cours
    SANS_HABILITATION   actif, mais rien en cours — RG-12.1 ne le référence pas
    SUSPENDU            invisible quelles que soient ses habilitations

#### Trois gardes du dépôt ont mordu, et elles avaient raison

- **`ActionAuditee`.** Mes appels composaient le nom de l'action —
  `` `consultant.${geste}` `` —, et le test qui vérifie que toute action
  déclarée a un appelant est resté rouge : une action composée n'en a
  jamais. C'est exactement ainsi que les déclarations mortes s'accumulent.
  Les quatre noms sont maintenant écrits en toutes lettres.
- **Le registre des habilitations.** Il tient les deux sens, et le second a
  servi : « une table nommée doit rester sans écrivain ». La première
  écriture l'a fait échouer et forcé le retrait de l'entrée, avec
  `Consultant` qui sortait au passage de la liste des tables remplies par
  la seule démonstration. Un registre qu'on oublie de vider est un registre
  qui ment.
- **`next build`**, et lui seul. `/consultants` appartient déjà à
  l'annuaire candidat : le groupe de routes `(admin)` partage l'espace
  d'adresses de l'application, et Next refuse deux pages parallèles sur la
  même adresse. Lint, typecheck et 1 570 tests étaient verts. L'écran est
  sur `/habilitations` — le chemin, l'intitulé et le titre disent la même
  chose — et un test compare désormais les adresses des deux groupes.

#### Deux défauts trouvés en lisant l'exécution

**« Vérifié par 3911f2ee-… »**. L'arbitrage du 21/09/2026 avait déjà retiré
cela du journal d'audit : *« un identifiant n'est pas un nom, et une
colonne qui s'appelle Acteur promet une personne »*. La colonne « vérifié
par » promet exactement la même chose. La lecture résout maintenant par le
même chemin, avec le même troisième repli — le jeu de démonstration porte
`gislain`, qui n'est pas un identifiant de compte, et l'écran affiche
« Acteur non résolu » plutôt que de le présenter comme quelqu'un.

**Un retrait refusé s'inscrivait au journal.** Retirer une habilitation
déjà retirée — l'écran était périmé — renvoyait 409 **et** laissait une
ligne `consultant.retirer`. Deux retraits s'y lisaient là où un seul avait
eu lieu, dans le registre qu'on relit précisément quand une habilitation
est contestée. Les refus se prononcent maintenant avant l'écriture au
journal, sans renoncer à l'ordre « journal d'abord » pour l'acte qui va
avoir lieu.

#### Vérifié en mutant, puis en exécutant

Douze mutations, douze rouges — dont celle qui a demandé un cas exprès :
« la couverture compte les habilitations retirées » restait verte tant
qu'aucun consultant n'était **visible par ailleurs** tout en ayant une
habilitation retirée sur une autre destination.

Puis l'exécution, par le vrai point d'entrée HTTP, session d'administrateur
en base :

    POST création              200 · {"visible": false}
                               créé sans habilitation, donc hors annuaire
    PUT titre « R »            422 · champ `titre`
    PUT habiliter CH           200 · countryCode normalisé depuis « ch »
    annuaire("CH")             Maître A. Diallo        ← était vide
    annuaire("NL")             Marieke Visser
    annuaire("CA")             aucun consultant habilité
    PUT retirer CH             200
    annuaire("CH")             aucun consultant habilité
    PUT retirer CH (bis)       409 · aucune ligne au journal
    journal                    creation, habiliter, retirer — trois gestes,
                               trois lignes, chacune avec son motif

La base a ensuite été remise à l'identique : un consultant, une
accréditation, celles de la démonstration.

#### Ce que l'exécution a montré et que je n'ai pas corrigé

La liste des juridictions affiche **« CA »** entre « Suisse » et
« Pays-Bas ». Deux règles publiées — `CA/ETUDES` et `NL/ETUDES` — n'ont
pas d'entrée éditoriale ; la seconde retombe sur « Pays-Bas » parce qu'une
autre procédure néerlandaise en a une, la première n'a rien. Le repli
affiche donc le code, ce qui est exact, et l'écran d'administration est le
lieu où un code se lit — mais une règle publiée sans nom de pays est un
manque de contenu, pas une décision d'écran. Il relève de la veille.


### S.17 — Le service `worker` n'avait rien à lancer

Le fichier de déploiement donnait au service la commande
`node dist/worker.js`. Aucune étape ne produisait ce fichier :
`npm run build` lançait `next build`, TypeScript était configuré en
`noEmit`, et l'image finale ne contenait que la sortie `standalone` de
Next. Le conteneur s'arrêtait donc sur `Cannot find module`, et
`restart: unless-stopped` le relançait indéfiniment.

Ce qui tombait avec lui : la purge de rétention (INV-5), la
réconciliation des paiements (INV-7, RG-05.4), la veille (RG-14.1),
l'enchaînement balayage → analyse (I.D) et le déclassement des pièces
périmées (RG-07.4). Cinq acteurs SYS de DOC-11, aucun signal.

**Le paquet.** `scripts/build-worker.mjs` compile
`src/server/jobs/worker.ts` en un fichier unique avec esbuild, appelé par
`npm run build` après `next build`. Un `tsc` avec un `tsconfig` dédié
aurait été plus simple mais ne réécrit pas l'alias `@/` : les imports
auraient survécu à la compilation et échoué à l'exécution. Restent hors
du paquet `@prisma/client` et le client généré, qui chargent leurs
moteurs par chemin — la sortie `standalone` les embarque déjà, et les
deux services partagent la même image. Le `Dockerfile` copie `dist/`, un
`.dockerignore` empêche qu'un `dist/` du poste se glisse dans le
contexte, et la commande du service gagne `--enable-source-maps`.

#### Ce que la réparation a découvert dessous

Le paquet une fois exécutable, le worker s'arrêtait sur autre chose :

    error: Queue paiement.reconciliation not found
      constraint: 'schedule_name_fkey'

pg-boss 10 ne crée plus une file au premier usage — la table des jobs est
partitionnée par nom de file, avec une clé étrangère vers `queue`.
Personne n'appelait `createQueue`. La panne d'empaquetage cachait la
seconde : tant que rien ne démarrait, rien ne pouvait échouer plus loin.

Et le versant producteur est pire que le versant worker. Mesuré, sur une
base jetable :

    send("file.inconnue", {})   →  null        (aucune erreur levée)
    send("file.connue", {})     →  d571bda1-…

Un `send` sur une file inconnue **ne lève pas** : il rend `null` et le job
disparaît. Le dépôt d'une pièce (WF-06) ignorait ce retour et répondait
`EN_ANALYSE` avec la mention de quarantaine — une pièce annoncée en cours
de balayage que personne n'aurait balayée. Même chose pour
`divergenceMiseEnFile` à la publication d'une règle (WF-11).

Deux corrections, dans `src/lib/queue.ts` : les files sont déclarées au
démarrage de **chaque** processus, web compris — le dépôt n'a pas à
attendre qu'un worker soit passé avant lui — et `poster()` remplace
`send()` aux trois points d'envoi, en levant plutôt qu'en perdant. Le
balayage n'est alors pas marqué réussi, et le job est rejoué.

#### Vérifié en exécutant

`npm run smoke:worker` efface `dist/`, reconstruit, puis exécute la
commande **lue dans `docker-compose.prod.yml`** dans une arborescence
réduite aux seules dépendances que l'image copie. Sans base, le worker
doit échouer sur la connexion avec un code non nul : un artefact absent,
amputé d'un module ou réduit à une fonction morte ne passe pas. `--base`
ajoute un démarrage réel sur une base vierge, jetable, créée et supprimée
par le script.

Six mutations, six rouges :

| Mutation | Ce qui vire au rouge |
|---|---|
| le build ne produit plus rien | `dist/worker.js` absent après le build |
| la sortie du paquet change de nom | l'artefact nommé par la commande manque |
| le worker sort proprement sans rien tenter | sortie 0, aucune connexion tentée |
| `declarerLesFiles` vidée | `Queue … not found`, zéro file, zéro cadence |
| une seule file déclarée | idem, dès la planification |
| les `schedule` retirés | zéro cadence enregistrée |

Une septième, essayée, **n'a pas mordu** et ne doit pas être comptée :
empaqueter `@prisma/client` au lieu de le laisser dehors passe au vert.
C'est exact — le paquet grossit, il fonctionne quand même. Les deux
exclusions ne sont donc pas garanties par le test : elles restent un
choix, motivé par les moteurs chargés par chemin et par la sortie
`standalone` qui les embarque déjà.

La première n'a pas mordu au premier essai : le test trouvait un
`dist/worker.js` resté d'une exécution précédente. Il vérifiait qu'un
fichier existe, pas qu'un build le produit — exactement ce que la panne
d'origine aurait traversé. L'artefact est maintenant effacé avant, et son
absence vérifiée.

Sur base réelle, après correction : huit files créées, quatre cadences
(`*/15 * * * *`, `0 3 * * *`, `15 3 * * *`, `30 3 * * *`), un redémarrage
qui ne change ni les unes ni les autres, et chacune des huit files accepte
réellement un job.

#### Ce qui n'a pas pu être vérifié ici

Aucun démon Docker dans cet environnement : le mode `--image`, seul à
prouver le `COPY` du `Dockerfile`, n'a jamais été exécuté. Ce qui a été
vérifié à sa place est une reproduction fidèle de la disposition de
l'image — la sortie `standalone`, `.next/static`, `public`, `dist` — dans
un répertoire temporaire.

### S.18 — La porte de qualité s'ouvrait à côté du déploiement

`ci.yml` et `deploy.yml` étaient deux workflows **indépendants**, déclenchés
tous les deux par un `push` sur `main`. Rien ne reliait le second au
premier : l'image partait sur GHCR pendant que les tests tournaient, et le
VPS la tirait. Une proposition rouge fusionnée le samedi soir était en
production avant que la CI ait fini de le dire.

Et la CI elle-même ne regardait ni la construction, ni les migrations, ni
les commandes des conteneurs.

**Un seul fichier pour les deux.** `validation.yml` est appelé par la CI sur
chaque proposition et par le déploiement avant la construction. Ce qui
bloque l'une bloque l'autre, et le déploiement ne peut plus être plus
indulgent que la revue. `build` porte `needs: valider` ; aucune étape ne
porte `continue-on-error`.

#### Deux vérifications qui ne pouvaient pas être rouges

**Les garde-fous SQL.** `scripts/verifier-garde-fous.sql` tourne avec
`ON_ERROR_STOP off` — il le faut, chaque bloc provoque exprès une violation
— et rend donc `0` quoi qu'il arrive. Une contrainte disparue s'annonçait
par une ligne « ACCEPTÉ » au milieu de soixante autres, dans une sortie que
personne ne relit. Le fichier est maintenant lancé par
`scripts/garde-fous.mjs`, qui compte les refus et échoue s'il en manque un,
ou si aucune écriture n'a été refusée du tout — le cas d'un fichier appliqué
à une base qui n'a pas les tables.

**Les migrations.** Personne ne les appliquait jamais sur une base vide. La
base de développement a été façonnée par des mois de `migrate dev` : elle
porte ce qu'aucune migration ne crée plus, et masque ce qu'une migration
oubliée ne crée pas encore. `scripts/migrations.mjs` reconstruit tout sur
une base jetable, vérifie qu'aucune migration ne reste en attente, compare
`schema.prisma` à ce que les migrations produisent, puis passe les
garde-fous sur cette base-là — ce qui prouve qu'ils viennent des migrations
et non d'un `ALTER TABLE` tapé un jour à la main.

#### Ce que la porte a trouvé en s'ouvrant

Deux dérives entre `schema.prisma` et les migrations, présentes depuis leur
écriture :

    [*] Changed the `Transaction` table
      [*] Renamed index `Transaction_refundRequestedAt_idx`
                      to `Transaction_refundRequestedAt_refundedAt_idx`
    [*] Changed the `User` table
      [-] Removed index on columns (deletionRequestedAt, deletedAt)

La seconde est la grave. L'index sur `(deletionRequestedAt, deletedAt)` est
créé par la migration qui a ajouté les colonnes, et il sert : la reprise des
suppressions restées à mi-chemin (RG-10.4) balaie exactement ces deux
colonnes, une fois par nuit, sur toute la table des comptes. Il n'était pas
déclaré dans `schema.prisma` — un prochain `migrate dev` l'aurait supprimé
sans que rien ne s'en aperçoive avant que la table grossisse. Il y est
maintenant.

La première est un nom : l'index posé par le rail de remboursement porte
deux colonnes et n'en nomme qu'une. Renommé par une migration — opération de
catalogue, pas de réécriture de table — pour que le nom dise ce que l'index
couvre, et pour que la base et le schéma s'accordent.

#### L'image, vérifiée avant d'être poussée

Le mode `--image=<tag>` de `scripts/fumee-worker.mjs` prend une image déjà
construite au lieu d'en construire une : le déploiement construit **une
fois**, charge l'image, exécute dedans les commandes que
`docker-compose.prod.yml` déclare, puis pousse cette empreinte-là. Une
seconde construction « pour pousser » rendrait la vérification décorative —
ce serait une autre image que celle qu'on a regardée.

Deux commandes, pas une. Celle du worker, qui doit échouer sur la connexion
et non sur un module manquant. Et celle du service `app`, qui n'est écrite
nulle part dans le fichier de déploiement puisque c'est celle de l'image :
le conteneur est lancé, on attend, on regarde s'il est encore debout.
C'était le trou par lequel le worker était tombé.

Le cache Docker reste en place. Il ne peut pas masquer une étape de
construction absente : le `COPY --from=builder /app/dist` échoue s'il n'y a
plus rien à copier, et les commandes sont ensuite exécutées depuis l'image,
pas depuis l'arbre de travail.

#### Vérifié en exécutant

Trois mutations sur la porte des migrations, trois rouges : un champ ajouté
à `schema.prisma` sans migration (`[+] Added column`), un garde-fou retiré
d'une migration (« ACCEPTÉ · RG-10.4 · un compte anonymisé sans demande de
suppression — la contrainte manque »), une migration invalide (trois
vérifications tombent d'un coup).

#### Ce qui n'a pas pu être vérifié ici

Toujours aucun démon Docker : les étapes qui éprouvent l'image — la commande
du worker et celle du service `app` — n'ont jamais été exécutées ailleurs
qu'en intégration continue. Le reste de la porte a tourné localement, sur un
PostgreSQL 16 réel, dans l'ordre exact du workflow.

Si le dépôt exige un contrôle nommé `verifier` pour fusionner, le nom change
avec ce lot : la CI appelle désormais un workflow réutilisable, et le
contrôle s'appelle `valider / valider`.

### S.19 — « Configurée » n'a jamais voulu dire « sait faire »

`/api/health` lisait `process.env`. Une variable renseignée valait
dépendance présente, et l'adresse répondait `ok`. Or cinq des six points de
branchement rendent `null` quoi qu'on mette dans le `.env` : le transport
de courrier journalise sans expédier, et le balayeur, l'extracteur, le
rédacteur et le rembourseur ne sont pas écrits.

Mesuré, sur le même environnement — toutes les variables renseignées avec
des valeurs plausibles :

    ancienne règle  →  PRETE   ·  status "ok"           ·  HTTP 200
    nouvelle règle  →  INAPTE  ·  status "indisponible" ·  HTTP 503

Le 200 était la réponse à une installation dont aucun code de vérification
ne part, dont aucune pièce n'est balayée et qui ne sait rembourser
personne. C'est la faute que le produit refuse partout ailleurs — aucun
service absent n'est simulé —, portée cette fois sur l'adresse dont le rôle
est précisément de ne pas mentir.

#### Six capacités, et trois conditions pour la dernière

| Capacité | Ce qu'elle dit |
|---|---|
| `IMPLEMENTATION_ABSENTE` | aucun adaptateur, quelles que soient les variables |
| `NON_CONFIGUREE` | adaptateur présent, configuration absente |
| `CONFIGUREE_NON_VERIFIEE` | configuré, aucune sonde concluante |
| `OPERATIONNELLE` | adaptateur, configuration, sonde — les trois |
| `DEGRADEE` | facultative indisponible, le repli fonctionne |
| `EN_PANNE` | attendue et injoignable |

L'ordre est la règle : la question de l'adaptateur précède celle de la
configuration, qui précède celle de la vérification. Une bloquante n'est
acquittée que par `OPERATIONNELLE` — « configurée mais non vérifiée » est
exactement l'état que produisait une variable factice, et exactement celui
qui passait pour prêt.

#### Comment on sait qu'un adaptateur existe

Pas par un registre tenu à la main : il survivrait au code qu'il décrit,
et c'est ce genre de déclaration qui a produit le défaut. Chaque point de
branchement expose un **résolveur** — `leBalayeur`, `lExtracteur`,
`leRembourseur`, `leTransport`, `leRedacteur` — qui rend la fonction que
l'appelant exécutera. Les appelants ont été rebranchés dessus, et l'état de
service interroge le même résolveur, en comparant ce qu'il rend à la
fonction non branchée du module.

La conséquence se teste : brancher un vrai transport par
`brancherTransport` fait passer la messagerie de `IMPLEMENTATION_ABSENTE` à
`CONFIGUREE_NON_VERIFIEE`, et le courrier suivant emprunte ce transport-là.
Le jour du branchement, une seule ligne change, et les deux en tiennent
compte au même instant.

#### Le seul adaptateur écrit, et sa sonde

Sur les six, `paiements` est le seul dont l'adaptateur existe : la
vérification de signature HMAC de `signature.ts`, appelée par les deux
routes de webhook. Sa sonde est entièrement locale — elle signe un corps
connu avec le secret configuré, passe l'en-tête à **la fonction que la
route appelle**, et vérifie qu'elle accepte la bonne signature et refuse
une signature altérée. Poser les deux questions est nécessaire : une
vérification qui accepte tout accepterait aussi la bonne.

Cela prouve que la vérification fonctionne avec ce secret-là. Cela ne
prouve pas que le fournisseur enverra ce format, et rien de local ne le
pourrait ; la capacité ne prétend rien de plus.

Le type y oblige : la forme « adaptateur écrit » d'un point de branchement
**exige** une sonde. On ne peut pas déclarer un adaptateur présent sans
fournir de quoi l'éprouver, et sans sonde concluante la capacité s'arrête à
`CONFIGUREE_NON_VERIFIEE`.

**Rien de coûteux ne part de l'adresse d'état** : aucun courrier, aucun
appel de fournisseur, aucun jeton d'IA, aucune écriture. Une sonde ne
tourne même pas devant un adaptateur absent ou non configuré — le jour où
l'une d'elles parlera à un service, elle ne le fera pas à vide.

#### La base et la file de revue étaient une seule mesure

Le `SELECT 1` et les deux comptages de la file vivaient dans le même
`try` : un comptage en échec faisait déclarer la base muette, et une base
déclarée muette ne disait rien de la file. Deux diagnostics opposés sous un
seul mot.

Séparés, et vérifiés sur une base jetable à qui l'on a retiré la table de
revue :

    db      : up
    revue   : { lisible: false, message: "La file de revue n'a pas pu être lue." }

#### Vérifié en exécutant

Cinq mutations, cinq rouges : la capacité qui ignore l'adaptateur (4 tests),
l'aptitude qui se contente d'une bloquante configurée (3), la sonde qui ne
refuse plus la signature altérée (1), l'état qui déclare la messagerie
branchée (2), la rédaction qui se contente d'une de ses deux fonctions (1).

Puis l'exécution, par le vrai point d'entrée HTTP, avec un environnement
entièrement renseigné : `503`, trois bloquantes nommées — messagerie,
antivirus, remboursement —, `paiements` seul en `OPERATIONNELLE` avec sa
sonde concluante, et la file de revue lisible et tenue.

### S.20 — Le fichier d'exemple et le code ne nommaient pas la même clé

`.env.example` portait `FEDAPAY_SECRET_KEY` et `STRIPE_SECRET_KEY`. Le
registre des dépendances et le rail de remboursement demandaient
`FEDAPAY_API_KEY` et `STRIPE_API_KEY`. **Aucune des quatre n'était lue par
quoi que ce soit** : les deux premières ne figuraient dans aucun fichier
de `src/`, les deux secondes n'étaient renseignables nulle part.

Un exploitant qui remplissait consciencieusement le fichier d'exemple
obtenait donc une installation que `/api/health` déclarait non configurée
sur le remboursement, sans rien pour lui dire laquelle des deux graphies
faisait autorité.

#### L'inventaire, par usage

| Usage | Module | Variables | Branché ? |
|---|---|---|---|
| Création de paiement | `acces/paiements.ts` | aucune | non — la transaction est locale, aucune page hébergée n'est créée |
| Webhooks | `paiement/signature.ts` | `*_WEBHOOK_SECRET` | **oui**, le seul |
| Consultation fournisseur | `jobs/reconciliation.ts` | aucune | non — `Interrogation` n'est pas branchée |
| Remboursement | `paiement/remboursement.ts` | `*_API_KEY` | non — `leRembourseur` rend `null` |
| Espace FedaPay | — | `FEDAPAY_ENVIRONMENT` | non — déclaré, lu par personne |

#### La nomenclature

`<FOURNISSEUR>_<USAGE>`, et l'usage dit le **sens** de l'appel :
`_API_KEY` sort, `_WEBHOOK_SECRET` entre, `_ENVIRONMENT` ne fait ni l'un
ni l'autre et n'est pas un secret.

`_SECRET_KEY` disait « secret » sans dire dans quel sens, alors que le
secret de webhook en est un aussi. Une clé sortante et un secret entrant
ne se révoquent pas au même endroit et ne fuient pas de la même façon ;
les confondre un soir d'incident coûte des minutes qu'on n'a pas. C'est ce
qui a tranché entre les deux graphies, plus que l'usage antérieur.

`src/server/paiement/secrets.ts` les nomme, et lui seul : `signature.ts`
et `remboursement.ts` y lisent leurs noms au lieu de les recopier.

#### La compatibilité, datée

`FEDAPAY_SECRET_KEY` et `STRIPE_SECRET_KEY` restent comprises jusqu'au
**2026-12-31**, repliées sur les nouveaux noms par `environnementNormalise`
— seul endroit du dépôt qui les connaisse, si bien que tout ce qui est en
aval ne peut pas diverger. Quand les deux graphies sont renseignées, la
nouvelle l'emporte : une migration à moitié faite ne doit pas dépendre de
l'ordre de lecture.

L'avertissement porte les deux noms et la date, jamais la valeur, ni un
fragment, ni sa longueur — un journal de serveur se recopie dans un ticket,
et un ticket se partage. Et la date n'est pas une intention : un test
échoue quand elle est passée, et son message dit quoi supprimer.

    Le 2026-09-01 est passé. Vider ANCIENS_NOMS dans
    src/server/paiement/secrets.ts, retirer le bloc « Déprécié » de
    .env.example, et supprimer ce test avec lui.

#### Ce que l'unification a fait apparaître

`remboursementConfigure()` était exporté et **appelé par personne** —
`antivirusConfigure` et `redactionConfiguree` ont leurs appelants, pas
celle-ci. Les clés du remboursement n'avaient donc aucun lecteur réel, ce
qui est exactement ce que la cinquième vérification demandée devait
attraper.

La brancher sur la route de remboursement aurait contredit une décision
close : la dégradation écrite au registre dit que l'initiation a lieu, que
les droits partent et que la dette reste ouverte. Elle est donc branchée là
où elle change réellement quelque chose — l'observation des capacités : un
point de branchement peut désormais fournir sa propre fonction de
configuration, et le module reste le seul à savoir ce qu'il lui faut. Même
raison que pour le résolveur.

#### Vérifié en exécutant

Six mutations, six rouges : `.env.example` revenu à l'ancienne graphie (3
tests), une variable documentée que personne ne lit (3), l'avertissement
qui révèle la valeur (1), la date de retrait passée (2), un secret
journalisé dans `signature.ts` (1), la normalisation qui ne replie plus
rien (3).

Puis l'exécution, par le vrai point d'entrée HTTP, avec **l'ancienne
graphie seule** — le cas d'un déploiement pas encore migré :

    remboursement → IMPLEMENTATION_ABSENTE | configuree: true
    [config] FEDAPAY_SECRET_KEY est dépréciée : renommer en FEDAPAY_API_KEY.
             L'ancien nom cesse d'être lu le 2026-12-31.
    [config] STRIPE_SECRET_KEY est dépréciée : renommer en STRIPE_API_KEY.
             L'ancien nom cesse d'être lu le 2026-12-31.

Et la valeur des deux clés, cherchée dans l'intégralité du journal du
serveur : zéro occurrence.

### S.21 — « Payer » n'ouvrait rien chez le fournisseur

La route de création ouvrait une transaction **locale** et rendait sa
référence. L'écran envoyait alors le candidat sur la page d'attente, qui
interrogeait une transaction que personne n'allait jamais faire avancer :
aucune session n'existait chez FedaPay ni chez Stripe, aucun paiement ne
pouvait être fait, et l'écran tournait cinq minutes avant de conclure à un
délai dépassé.

WF-05 est maintenant branché de bout en bout, sans toucher à l'invariant :
**seule la notification signée écrit `CONFIRMEE` et crédite le quota**
(RG-05.1, INV-7). Ni l'ouverture, ni l'adresse de retour, ni la relève.

#### L'ordre, qui porte deux garanties

**L'ouvreur est réclamé avant la moindre écriture.** Sans clé, le refus est
immédiat et aucune transaction locale n'est créée. C'est la contrainte
« pas de transaction orpheline », et elle se vérifie en comptant les lignes
après un refus : zéro.

**La transaction locale vient ensuite, et elle est reprise.** Sa référence
est la clé d'idempotence — dérivée, jamais tirée au sort, et distincte de
celle du remboursement, que la même référence porte aussi. Un second clic
retrouve la même transaction, donc la même clé, donc la même session.

L'identifiant du fournisseur est enregistré **dès qu'il existe**, y compris
quand l'URL manque encore : c'est ce que l'issue `creee_sans_url` sert à
rendre. Sans elle, une coupure entre les deux appels de FedaPay — création
puis page — perdrait l'identifiant, et la tentative suivante ouvrirait une
seconde transaction chez eux.

#### Trois refus avant d'envoyer quiconque payer

| Vérification | Ce qu'elle refuse |
|---|---|
| l'URL hébergée | absente, relative, en clair, ou sur un domaine étranger |
| la référence interne | une session qui ne renvoie pas notre référence |
| le montant et la devise | ce que le fournisseur a enregistré doit être ce qu'on a décidé |

La deuxième est celle qui compte le plus, et elle vient d'une incertitude
assumée : la forme exacte des champs de FedaPay n'a pas pu être vérifiée
sans clés. Plutôt que de supposer, l'adaptateur **compare** la référence
que le fournisseur renvoie à celle qu'on lui a donnée. Si elle ne revient
pas telle quelle, la notification signée arriverait sans savoir quel
paiement elle confirme — on refuse avant, plutôt que de laisser un paiement
réglé sans dossier crédité.

#### Ce que l'exécution a trouvé, et que je n'avais pas vu

Le simulateur rendait le même identifiant de session pour deux
transactions, et la contrainte d'unicité a parlé. Mon code l'avalait : un
commentaire disait que « la comparaison du montant reste le garde-fou qui
compte ». Elle ne comptait pas — les deux transactions portent la même
somme, et la comparaison passait.

Le candidat serait donc parti payer une session dont la notification signée
aurait crédité le dossier du voisin. L'ouverture est maintenant **refusée**,
et l'écart s'ouvre là où il se lit. La mutation qui rétablit l'ancien
comportement fait rougir le scénario.

Et le garde-fou `application_version_figee` s'est fait entendre en écrivant
le script : un dossier qui passe à l'actif doit porter la version qu'il a
figée (INV-3). Le jeu d'essai était incomplet, pas la règle.

#### Vérifié en exécutant

Six mutations, six rouges : la comparaison de montant retirée (2 échecs),
la reprise remplacée par une seconde création (2), l'ouvreur réclamé après
l'écriture (1), toute URL acceptée (4 tests), la référence non vérifiée au
retour (1), le montant envoyé sans conversion (3).

Sur PostgreSQL réel, avec un ouvreur simulé — vingt-cinq vérifications :
double soumission (une transaction, une création, une reprise), reprise
après réponse perdue, montant divergent, fournisseur absent, retour du
navigateur sans notification, notification avant le retour, transaction
d'un autre candidat.

Et le paquet client, relu après `next build` : aucun des quatre noms de
secret n'y figure, et aucune adresse d'API de fournisseur non plus.

#### Ce qui n'a pas pu être vérifié ici

**Aucune clé de bac à sable.** La forme exacte des requêtes envoyées à
FedaPay et à Stripe n'a été confrontée à aucun serveur réel. C'est dit
dans l'en-tête de `fedapay.ts`, qui est le plus incertain des deux, et
`npm run sandbox:paiement` existe pour l'éprouver le jour où des clés
existent — il s'abstient et le dit plutôt que de rendre vert ce qu'il n'a
pas fait.

Ce qui est certain : les adaptateurs refusent tout ce qu'ils ne
reconnaissent pas, et aucun de ces refus n'envoie qui que ce soit payer.

### S.22 — Le filet de RG-05.4 n'attrapait rien

La réconciliation marquait les retards, ouvrait un écart au-delà de
vingt-quatre heures et expirait ce qui n'aboutissait plus. Elle
n'interrogeait personne : `interroger` était une fonction qui rendait
`null`. Un webhook perdu sur un paiement réussi finissait donc en
`EXPIREE` avec le motif « délai dépassé », sur un paiement que le
candidat avait bel et bien réglé.

Le fournisseur est maintenant consulté, et l'état retrouvé est appliqué
par **le même service que les webhooks**. C'est le point de conception qui
tient le reste : une seule fonction écrit un état de paiement et crédite
un pack. La réconciliation n'a pas son propre chemin d'écriture, donc pas
sa propre façon de se tromper — elle hérite de l'idempotence par
`PaymentEvent.providerEventId` et de la protection contre les courses,
sans qu'il ait fallu les réécrire.

#### Ce que la consultation a le droit de conclure

| Issue | Ce que le job en fait |
|---|---|
| `connu` | applique l'état, avec la cause que le fournisseur a donnée |
| `sans_paiement` | rien : une session abandonnée n'est pas une carte rejetée |
| `introuvable` | un écart si une session avait été ouverte, rien sinon |
| `indisponible` | **rien du tout** |
| `incoherent` | un écart tout de suite, et rien d'appliqué |

La frontière qui compte est la quatrième. Confondre « le fournisseur n'a
pas répondu » et « le paiement a été refusé » écrirait un motif d'échec
sur le dossier de quelqu'un que personne n'a refusé — et ce motif part
jusque sur son écran. La mutation qui traduit `indisponible` en `ECHOUEE`
fait rougir deux vérifications.

Aucune issue n'expire quoi que ce soit : l'expiration suit `aExpirer` et
elle seule, comme avant. Une session que Stripe dit expirée ne prononce
pas notre expiration.

#### FedaPay reste non opérationnel, et le dit

Faute de documentation vérifiée, il n'y a pas de traduction honnête :
savoir quels états valent confirmation, attente ou refus décide si un
candidat est crédité et si un échec lui est imputé. `lireFedaPay` traduit
déjà des états reçus **en notification signée**, d'après des charges
utiles observées ; la consultation est un autre appel, sur un autre objet,
et réutiliser cette table reviendrait à supposer que les deux parlent le
même vocabulaire.

L'adaptateur existe donc, et rend `indisponible` avec sa raison. Le job ne
conclut rien, la transaction suit la règle d'expiration de la plateforme,
l'écart s'ouvre au délai prévu — c'est exactement ce qui se passait avant.
Rien n'est perdu, et rien n'est inventé. La mutation qui le fait deviner
un état fait rougir deux tests.

#### Ce que l'exécution a trouvé

Le premier jet du script de fumée donnait au consultant simulé une réponse
unique pour tout le monde. Or le job balaie **toutes** les transactions en
attente, pas seulement celle du scénario : l'identifiant de session du
cinquième scénario s'est écrit sur la transaction du troisième, et la
contrainte d'unicité l'a dit.

C'était le harnais, pas le produit — mais il valait la peine de le lire :
un vrai fournisseur répond par transaction, et un simulateur qui répond à
tous rendrait verts des scénarios qui se marchent dessus. Le consultant
simulé ne répond plus que pour sa référence.

#### Vérifié en exécutant

Six mutations, six rouges : l'absence de réponse traduite en refus (2
vérifications), la clé d'événement rendue aléatoire (1 + 1 test), une
session abandonnée traduite en refus (2 tests), une cause inventée quand
le code est inconnu (1 test), FedaPay qui se met à deviner (2 tests).

Vingt-neuf vérifications sur PostgreSQL réel : paiement confirmé retrouvé,
refus retrouvé avec sa cause, rien trouvé, échec temporaire, webhook
simultané — un seul crédit —, identifiant incohérent, et l'expiration qui
reste celle de la plateforme.

### S.23 — Une consultation se confirmait sans être payée

Le bouton de créneau appelait la réservation, la route créait le
rendez-vous **et** l'accès consultant, `transactionId` restait nul, et
l'écran annonçait « Rendez-vous confirmé » — deux paragraphes avant
d'annoncer que la consultation était due.

Un consultant lisait donc le dossier d'un candidat qui n'avait rien
réglé, et personne ne pouvait le savoir : rien ne distinguait un
rendez-vous payé d'un rendez-vous qui ne l'était pas.

#### L'état qui manquait

Entre « je veux ce créneau » et « c'est payé », il y a un état. Il
n'était pas modélisé — et pourtant l'écran le nommait déjà : une
constante `TENUE_MINUTES = 10` et une phrase, « Le créneau est tenu 10
minutes », affichées à chaque sélection. Le test qui les couvrait
s'appelait « tient le créneau, et le dit » et ne vérifiait que la
phrase.

`TENU` existe maintenant, avec son échéance, et la durée vit dans le
module qui la fait tenir. Le test porte sur le mécanisme.

#### Trois écritures, trois moments

| Moment | Ce qui s'écrit |
|---|---|
| la tenue | le créneau est gardé, l'accord de partage est daté |
| le paiement | le tunnel ordinaire, page hébergée comprise |
| la confirmation signée | `RESERVE`, et l'accès consultant |

L'accord se prépare avant le paiement — il n'y a aucune raison de le
redemander après — mais **une date d'accord n'est pas une autorisation
de lecture**. L'accès naît à la confirmation, et pas une seconde avant.

#### La base porte la règle, pas la bonne volonté des appelants

    appointment_reserve_exige_un_paiement
      CHECK (status <> 'RESERVE' OR "transactionId" IS NOT NULL)

Aucune route, aucun job, aucune reprise manuelle ne peut écrire un
rendez-vous confirmé qui ne cite pas le paiement qui l'a payé. Le
second garde-fou exige qu'une tenue porte son échéance : sans elle,
elle gèlerait le créneau pour toujours.

La migration a dû traiter les rendez-vous déjà écrits sans paiement. On
ne peut pas leur inventer un règlement : ils redeviennent des tenues
échues — donc des créneaux libres — et les accès consultant qu'ils
avaient ouverts sont révoqués. C'est dit dans la migration, en toutes
lettres.

#### Ce que l'exécution a trouvé

Deux mutations, deux rouges — mais la seconde ne l'était pas au premier
essai. Retirer la condition d'état de la confirmation ne faisait rougir
aucune vérification : la garde précoce (« déjà `RESERVE`, rien à
faire ») masquait la condition interne, que seul un cas concurrent
atteint. Le scénario manquait, il a été ajouté — deux notifications à la
même milliseconde, une seule qui confirme, un seul accès ouvert.

#### Vérifié en exécutant

Vingt-quatre vérifications sur PostgreSQL réel, dont la seule qui ne se
simule pas : **deux candidats sur le même créneau à la même
milliseconde**. Un seul le tient, l'autre l'apprend au lieu de croire
avoir réservé, une seule ligne en base, aucun accès ouvert.

Et le reste : rien n'est confirmé sans paiement (y compris quand on
force la base), la notification signée confirme et ouvre l'accès une
fois, un paiement échoué libère le créneau qu'un autre reprend, une
tenue abandonnée est balayée, la transaction et la tenue d'un candidat
ne servent pas à un autre, et une suppression de compte libère les
tenues sans ouvrir d'obligation de remboursement pour rien.

#### Ce qui reste à revoir

L'écran d'attente de paiement est celui des packs : il dit « ton dossier
s'ouvre aussitôt », ce qui ne décrit pas un rendez-vous. Le parcours est
juste, la phrase d'attente est à reprendre pour le cas de la
consultation.

### S.24 — L'achat s'affichait juste et partait faux

Le récapitulatif ($-02) recevait de sa page un triplet sans catégorie —
`{ code, libelle, prix }` — et la redevinait au moment d'envoyer :

```ts
achat: achat.code === "recharge" ? { type: "recharge" } : { type: "pack", code: achat.code }
```

Une catégorie sur trois était nommée. Les deux autres tombaient dans la
même branche. `achat=consultation` s'affichait donc correctement — le
bon libellé, le bon montant, tous deux pris sur la grille — et partait
sur le fil sous l'étiquette `{ type: "pack", code: "consultation" }`.

Rien ne s'en plaignait, et c'est le plus instructif. Le serveur
acceptait un pack nommé `consultation`, calculait son montant par une
autre lecture de la même grille — juste, elle aussi —, enregistrait
`packCode: "consultation"`, et ouvrait la page du prestataire. Au
crédit, `getPack("consultation")` ne rendait rien : la fonction sortait
sans écrire. Somme encaissée, contrepartie nulle, aucune trace d'erreur.

#### Ce n'était pas une inattention

`code: string` autorise toutes les catégories et n'en décrit aucune. Le
jour où la troisième est arrivée, rien n'a obligé à relire la
conversion : elle compilait, et son défaut ne se voyait ni à l'écran,
qui affichait le bon prix, ni en base, qui enregistrait le bon montant.
Un type qui ne peut pas être faux vaut mieux qu'une relecture attentive.

#### Une union discriminée, et des `switch` exhaustifs

`domain/payments/achat.ts` porte désormais l'union — `pack` avec son
code, `recharge`, `consultation` — et tout ce qui la traverse le fait
par un `switch` terminé par `const jamais: never`. Quatre traversées :

| Fonction | Ce qu'elle décide |
|---|---|
| `corpsDAchat` | ce qui part sur le fil |
| `tarifDe` | le libellé et le prix, pour l'écran comme pour le serveur |
| `codeEnregistre` | le code écrit dans `Transaction.packCode` |
| `ouvrableDepuisLeRecapitulatif` | si $-02 sait ouvrir cet achat |

Une quatrième catégorie ne compilera pas tant que les quatre questions
n'auront pas de réponse. C'est la troisième qui ne s'est pas posée.

Le schéma `zod` de la route vient du même module, et la conversion
forcée qui l'y rattachait — `as Parameters<typeof montantDe>[0]` — a
disparu : c'est elle qui empêchait le compilateur de comparer les deux
descriptions. Le crédit relit `packCode` par `achatDepuisLeCode` plutôt
que par des chaînes en ligne, et son `switch` est exhaustif lui aussi —
c'est l'endroit où une branche oubliée coûte le plus cher, puisque
l'argent y est déjà encaissé.

#### La coordination avec la réservation

Corriger la sérialisation seule aurait produit une consultation
correctement étiquetée, et toujours vide de sens : depuis S.23, une
consultation payée confirme un créneau **tenu**, retrouvé par
`Appointment.transactionId`. Ouverte depuis $-02, elle ne cite aucun
rendez-vous — il n'y a rien à confirmer.

Le chemin n'était pas théorique. $-05 construisait son bouton
« Réessayer le paiement » avec le code enregistré, quel qu'il soit :
l'échec d'une consultation renvoyait au récapitulatif, qui aurait ouvert
un second paiement sans créneau. Le premier échec avait pourtant
supprimé la tenue.

Deux conséquences, toutes deux portées par le domaine :

- $-02 refuse une consultation (`notFound`) : elle se paie là où
  l'horaire existe ;
- $-05 renvoie une consultation à l'annuaire, pas au récapitulatif, et
  dit ce qui est arrivé au créneau.

#### Deux phrases qui disaient le contraire du code

En branchant $-05, les phrases d'état de `domain/consultants/tenue.ts`
ont été lues pour la première fois — écrites au lot précédent, elles
n'avaient aucun appelant.

| Phrase écrite | Ce que le code fait |
|---|---|
| « Le créneau reste tenu quelques minutes » | `libererLaTenue` **supprime** le rendez-vous dès l'échec |
| « ton accord de partage est conservé : tu n'auras pas à le redonner » | la ligne supprimée emportait `consentAt`, et T-05 repart à l'étape de l'accord, case décochée |

Les deux sont corrigées, et elles s'affichent maintenant — une phrase
que personne ne lit n'est démentie par personne.

#### Vérifié en exécutant

Les trois achats sont cliqués pour de bon dans jsdom, et le corps de la
requête est ouvert : `{ type: "pack", code }`, `{ type: "recharge" }`,
`{ type: "consultation" }`. Les trois montants diffèrent, ce qui rend la
confusion visible — si une consultation avait été tarifée comme un pack,
rien ne l'aurait trahie.

Sur PostgreSQL réel (`npm run smoke:tunnel`), pour chacune des trois
catégories : le code et le montant **lus en base** après ouverture. Et
la démonstration du défaut restant : une consultation ouverte sans
créneau tenu s'applique, ne confirme aucun rendez-vous et n'ouvre aucun
quota — c'est exactement ce que $-02 refuse désormais de produire.

Huit mutations, huit rouges. La plus instructive est la dernière : en
figeant le code enregistré d'une consultation à `recharge`, la fumée
signale deux échecs, pas un — le code est faux, **et** un quota
s'ouvre. Une catégorie mal nommée ne se contente pas de mal se nommer.

### S.25 — Rembourser, sans qu'une réponse 200 solde une dette

Le rail sortant n'existait pas. `NON_BRANCHE` rendait `null`, et c'était
la réponse honnête : aucun adaptateur n'était écrit, et en inventer un
qui aurait rendu « accepté » aurait vidé la file des obligations toute
seule — le pire des états, parce qu'il a l'air sain.

Stripe est branché. FedaPay ne l'est pas, et ce n'est pas un oubli.

#### Ce que la mise en place mettait en danger

Trois faits, et un seul écrit le versement :

| Fait | Champ | Qui l'écrit |
|---|---|---|
| décidé | `refundDueAt` | K.C, ou un geste d'administrateur |
| demandé | `refundRequestedAt` | le fournisseur a accepté la demande |
| versé | `refundedAt`, `REMBOURSEE` | **sa notification signée, et elle seule** |

Tant que rien ne partait, la frontière ne risquait rien. Elle commence à
risquer quelque chose le jour où un appel API rend 200, parce qu'une
réponse 200 *ressemble* à de l'argent rendu. L'adaptateur ne sait donc
rendre qu'une chose — « il a pris la demande » — et n'a aucun moyen
d'écrire autre chose : `succeeded` chez Stripe arrive ici comme
`pending`. Ce n'est pas du zèle : Stripe annule des remboursements
`succeeded`, et la seule lecture qui reste vraie dans ce cas est la
nôtre.

#### Cinq issues, parce qu'elles n'appellent pas la même suite

| Issue | La dette | Un humain ? |
|---|---|---|
| `acceptee` | reste due, `refundRequestedAt` posé | non |
| `refusee_definitivement` | reste entière | **oui** — relancer ne changera rien |
| `temporaire` | reste entière | non — la reprise portera la même clé |
| `reponse_illisible` | reste entière | **oui** — rien n'est conclu |
| `non_configure` | reste entière | non — il y a une variable à renseigner |

Les confondre coûte dans les deux sens : un refus définitif traité comme
une panne se relance indéfiniment ; une panne traitée comme un refus
classe une dette que personne n'a payée. Et la table est exhaustive
(`switch` terminé par `never`) : une sixième issue ne compilera pas tant
qu'on n'aura pas répondu aux deux questions de ce tableau.

Un état Stripe hors table rend `reponse_illisible` et non « accepté » :
un état qu'on ne connaît pas est exactement le cas où deviner coûte
cher.

#### Deux reprises concurrentes

La clé d'idempotence protège le **fournisseur**. Elle ne protège ni le
grand livre, ni le compteur de tentatives, et elle suppose qu'il
l'honore. Deux reprises simultanées — un opérateur qui clique deux fois,
une suppression de compte pendant qu'un job relance — appelaient donc
toutes les deux.

La tentative est maintenant **réservée** avant tout appel, par une mise
à jour conditionnée à la valeur qu'on vient de lire : deux appelants
lisent le même `refundAttemptedAt`, un seul voit sa condition tenir.
C'est l'arbitrage de la base, la même mécanique que pour la tenue d'un
créneau.

Et le retrait de droits, qui ne doit avoir lieu qu'une fois, ne dépend
plus d'une lecture préalable : un **index unique partiel** le porte
(65 garde-fous). La lecture reste, mais pour ne pas provoquer une
violation à chaque relance ordinaire — une erreur de base journalisée à
chaque relance normale finirait par ne plus être lue.

#### L'identifiant, vérifié avant l'appel

Les deux rails écrivent la même colonne, préfixée. Un `providerTxId`
absent veut dire qu'aucune session n'a jamais été ouverte : il n'y a
rien à rembourser. Un `providerTxId` portant l'autre préfixe viserait un
paiement étranger. Les deux ouvrent un écart et n'envoient rien — et ne
comptent aucune tentative, parce qu'une tentative comptée ferait croire
à une relance en cours.

Côté Stripe s'ajoute une vérification qui n'est pas de confort : notre
`providerTxId` est celui d'une **session**, que Stripe ne rembourse pas.
Il faut aller chercher l'intention de paiement — et, ce faisant, on
relit `metadata[reference]`. Rembourser la session d'un autre candidat
parce qu'un identifiant a été mal recopié ne se répare pas avec un
correctif.

#### FedaPay : l'adaptateur existe et ne rembourse rien

Aucune documentation vérifiée du remboursement FedaPay n'était
disponible. Deviner un chemin, un nom d'en-tête d'idempotence et une
liste d'états produit deux issues, également graves :

- la requête inventée part et **envoie de l'argent** d'une manière qu'on
  n'a pas éprouvée — deux fois, par exemple, si la clé d'idempotence ne
  s'appelle pas ainsi chez eux ;
- la réponse inventée est mal lue, la demande est comptée « acceptée »,
  et une dette sort de la file sans que personne n'ait rien rendu.

La seconde est la pire parce qu'elle est silencieuse. L'adaptateur rend
donc `non_configure` avec sa raison, la dette reste due et visible, et
la capacité d'exploitation se lit **non branchée** : il faut les deux
rails, comme la rédaction demande ses deux fonctions. Un candidat qui a
payé en francs CFA ne se rembourse pas parce que l'euro, lui, est
branché.

`operationnel` est une déclaration, et une déclaration se dément : un
test l'éprouve contre le comportement des deux adaptateurs — le non
opérationnel doit refuser **sans toucher au réseau**, l'opérationnel
doit appeler et ne jamais rendre `non_configure`.

#### Vérifié en exécutant

Sur PostgreSQL réel (`npm run smoke:remboursement`, entré dans la porte
de qualité) : deux reprises lancées ensemble — une seule demande part,
une seule tentative comptée, un seul retrait de droits, le solde du
dossier à zéro et non à moins trente. La dette qui survit à une réponse
acceptée, puis la notification signée qui la solde. La reprise après
panne, qui repart avec la même clé. Le refus définitif et la réponse
illisible qui ouvrent un écart, la panne qui n'en ouvre pas. Le pack
entamé qui n'envoie rien et ne retire rien. L'index qui refuse un second
retrait et laisse passer un octroi sur la même transaction.

Contre un `fetch` simulé : les réponses de Stripe, une par une —
acceptée, `succeeded` qui reste une demande, `failed` définitif,
`invalid_request_error` définitif, 500 et 429 passagers, type inconnu
tenu pour passager, coupure réseau, état hors table, session d'autrui,
session jamais payée, et la clé secrète absente de tout ce qui est
rendu.

Neuf mutations, neuf rouges. Les deux plus instructives : en retirant la
condition de réservation, deux demandes partent et deux tentatives sont
comptées — mais **le retrait de droits reste unique**, parce que l'index
tient là où l'appelant ne tenait plus ; et en déclarant FedaPay
`operationnel: true`, quatre vérifications rougissent d'un coup, dont
celle de l'état de service — la déclaration ne peut plus mentir seule.

### S.26 — Le code de vérification était dans les journaux

Le transport de courrier n'était pas branché : `expedier` mettait en
forme, écrivait une ligne au journal, et rendait la main. C'était la
dégradation honnête, et elle l'est restée tant qu'aucun adaptateur
n'existait. Ce lot en écrit un — et, en le branchant, en trouve deux
autres.

#### Ce que la ligne de journal contenait

```
[courrier] → awa@exemple.test · 481920 — ton code de vérification ImmiPro
```

L'objet paraissait anodin. Pour la moitié des courriers du produit,
**l'objet est le secret** : le code de vérification et le code de
réinitialisation sont dans le sujet, pour qu'on les lise dans la liste
des messages sans ouvrir. Le transport de repli les recopiait donc au
journal du serveur — c'est-à-dire, en production, dans un agrégateur
conservé des semaines, consultable par qui a accès aux journaux, et
qu'aucune règle de rétention ne balaie (INV-5 ne couvre que les pièces).
Un code lu là ouvre un compte.

L'adresse complète y était aussi, qui est une donnée nominative à elle
seule.

Ce qui reste : le **genre** du courrier, le **domaine** du destinataire,
l'**issue**. De quoi exploiter un incident — « tous les envois vers ce
domaine échouent » — sans nommer personne ni rien divulguer. Le genre est
donné par l'appelant et non déduit de l'objet : déduire du texte
reviendrait à en journaliser un morceau, et un jour ce morceau porterait
un code.

#### « Un nouveau code est parti » — il n'en partait aucun

`expedier` ne rendait rien. La route de renvoi répondait donc
`{ envoye: true }` quoi qu'il arrive, et l'écran affichait « Un nouveau
code est parti. Le précédent ne fonctionne plus. » devant un transport
muet. Le candidat attendait un message qui n'existait pas, et la
deuxième phrase était vraie — l'ancien code venait bien d'être annulé.

`expedier` rend maintenant une issue parmi cinq, et la route la lit.

| Issue | Parti ? | Renvoyable ? |
|---|---|---|
| `envoye` | oui | — |
| `injoignable` | on ne sait pas | **oui** — la coupure se reprend |
| `refuse` | non | non — le serveur a dit non |
| `non_configure` | non | non — il y a une variable à renseigner |
| `journalise` | non | non — rien ne partira sans configuration |

**Deux routes taisent délibérément l'issue**, et c'est l'inverse d'un
oubli : la demande de réinitialisation et la création de compte
répondent la même chose avec ou sans compte existant. Seule une adresse
connue produit un courrier — en faire remonter l'échec dirait « cette
adresse est cliente » à qui essaie des adresses au hasard. La trace part
au journal, où un opérateur la voit sans que l'essayeur la voie. Un test
tient les deux règles, parce qu'une seule des deux s'oublie facilement.

#### La bibliothèque, et sa version

`nodemailer`. Parler SMTP à la main demande EHLO, STARTTLS, AUTH,
l'encodage MIME et l'échappement des en-têtes — le dernier n'est pas une
commodité : une injection CRLF dans un en-tête ajoute un destinataire à
un message qu'on croit adresser à une seule personne, et nos objets sont
composés à l'exécution.

Elle **était déjà dans l'arbre** : `next-auth` la déclare en pair
facultatif. L'ajouter ne fait donc pas entrer une nouvelle famille de
code dans le dépôt.

Mais son pair réclame la version 7, qui porte **dix avis de sécurité
ouverts**, dont deux de gravité haute — parmi eux une complexité
quadratique de l'analyseur d'adresses, atteignable puisque nos
destinataires sont des adresses saisies à l'inscription. La 10 les
corrige. Le conflit est résolu par un `overrides` dans `package.json`,
et non par `--legacy-peer-deps` : `npm ci` doit reproduire l'arbre de
`npm install`, et la porte de qualité installe avec `npm ci`.

Au passage : **`next-auth` n'est importé nulle part dans `src/`.** Sa
présence ne contraignait donc rien de réel — mais elle a failli imposer
une version vulnérable. À retirer, ou à utiliser ; c'est une décision,
pas un correctif, et elle sort du cadre de ce lot.

#### La sonde, et ce qu'elle refuse de conclure

`/api/health` ne parle à aucun serveur SMTP, et la décision est
ancienne : cette adresse est interrogée par un répartiteur de charge, et
« rien de coûteux n'en part » (arbitrage du 21/09). Ouvrir une connexion
à chaque appel la contredirait.

La sonde lit donc le **dernier fait** — le dernier envoi réel, ou la
dernière vérification de connexion réelle. `verify()` ouvre la
connexion, dit bonjour, s'authentifie, et raccroche sans remettre aucun
message : le worker l'appelle une fois au démarrage, ce qui suffit à
établir le fait sans attendre le premier candidat.

**Une `SMTP_URL` qui s'analyse ne conclut rien.** C'est la leçon du
21/09 appliquée au module qui vient de se brancher : la messagerie reste
« configurée, non vérifiée » — donc l'instance inapte, donc l'ouverture
publique bloquée — tant que personne n'a réellement parlé à un serveur.
Une URL renseignée mais illisible, en revanche, est un fait : elle rend
la sonde `ECHOUEE` tout de suite, sans attendre un candidat.

Ce que cette lecture **ne** dit **pas** : que le transport fonctionne en
ce moment. Elle dit ce qui s'est passé la dernière fois qu'on a essayé.
Le savoir en continu demanderait une sonde périodique, qui n'est pas
dans ce lot.

#### Vérifié en exécutant

Contre un **vrai serveur SMTP** (`smtp-server` sur un port éphémère de
la boucle locale, aucun message ne quitte la machine) : le message part
et arrive tel qu'écrit ; la vérification de connexion n'envoie rien ;
des identifiants rejetés donnent `refuse` sans que le mot de passe
paraisse ; les bons passent ; un destinataire refusé n'est pas un envoi,
seul **et** en refus partiel — ce second cas ne se voyait pas, parce
qu'un refus unique fait lever, et la branche qui lit `info.rejected`
n'était donc pas éprouvée ; un serveur injoignable donne `injoignable`
et non `refuse` ; un serveur qui n'accueille jamais laisse le délai
trancher.

Sur PostgreSQL réel (`npm run smoke:courrier`, entré dans la porte) : le
rejeu d'une notification signée ne produit pas un second reçu, quatre
passages compris — l'idempotence est en amont, dans
`PaymentEvent.providerEventId`, et c'est cette chaîne-là qu'on éprouve
plutôt qu'un garde-fou dans le module de courrier, qui protégerait le
symptôme en laissant passer le double crédit. Et le journal, relu
pendant l'envoi, ne porte ni le code, ni l'objet, ni l'adresse — tandis
que le destinataire, lui, reçoit bien son code.

Dix mutations, dix rouges — mais deux ne l'étaient pas au premier essai,
et les deux disaient la même chose. Supprimer la lecture de
`info.rejected` ne faisait rougir personne : le test du « destinataire
refusé » passait par la levée d'exception, pas par cette branche. Et
faire répondre de nouveau `{ envoye: true }` sans vérifier ne faisait
rougir personne non plus — la correction la plus visible du lot n'avait
aucun garde-fou. Un test a été ajouté pour chacune.

### S.27 — « Ton pack s'ouvre », dit à qui achetait un rendez-vous

L'écart était ouvert depuis trois lots, signalé à chaque livraison et
jamais tranché : l'écran d'attente de paiement était celui des packs. Le
voici traité.

#### Ce que les deux derniers écrans du tunnel disaient

Trois achats traversent `/paiement/attente` — un pack, une recharge
d'analyses, une consultation. Les deux écrans du bout n'en connaissaient
qu'un :

| Écran | Ce qui s'affichait | Pour une consultation |
|---|---|---|
| $-03, dernière étape du fil | « Nous recevons la confirmation, ton pack s'ouvre » | aucun pack ne s'ouvre : un créneau se réserve |
| $-03, métadonnée | « Confirme le paiement pour ouvrir ton pack » | idem |
| $-04, première phrase | « Ton dossier est ouvert. » | le dossier était déjà ouvert ; le rendez-vous, non |
| $-04, trois étapes | téléverser un passeport, fixer une date de dépôt, rédiger une lettre | rien de cela n'est la suite d'un entretien payé |
| $-04, bouton | « Ouvrir ma checklist » | la checklist n'a pas changé du fait de prendre rendez-vous |

Ces deux phrases sont les seules de tout le parcours qui nomment la
**contrepartie** — ce que la somme achète. Les lire fausses à la seconde
où l'on vient de payer, c'est douter d'avoir acheté la bonne chose. Et
pour une consultation, le doute était fondé.

#### Ce qui manquait, et qui manquait plus encore

Le créneau n'était nommé nulle part. Le candidat attendait cinq minutes
devant un décompte, sans voir l'heure qu'il venait de retenir, ni le nom
du consultant, ni jusqu'à quand le créneau lui était gardé. C'était
l'information la plus utile de l'écran, et c'est celle qui n'y était pas.

**Et les deux décomptes se confondaient.** L'attente dure cinq minutes,
la tenue du créneau vingt (S.23). Voir le premier s'épuiser laissait
croire le créneau perdu — alors qu'il restait un quart d'heure pour
reprendre le paiement. L'écran montre maintenant les deux séparément, et
dit lequel porte sur quoi.

#### Un module pour la contrepartie

`domain/paiement/contrepartie.ts` répond trois fois à la même question,
par catégorie et par `switch` exhaustif : ce qui s'ouvre (au futur, pour
le fil de $-03), la phrase de confirmation (au passé, pour $-04), et la
suite proposée.

Il est à part parce que la question se pose **deux fois**, sur deux
écrans — et qu'écrite dans chacun, elle avait déjà divergé : $-03 disait
« pack » là où $-04 disait « dossier », pour le même achat. Une
quatrième catégorie ne compilera pas tant que les trois réponses ne sont
pas écrites.

#### La lecture du rendez-vous, séparée du reçu

`consultationDuPaiement` joint `Appointment` par `transactionId` et rend
l'horaire, la durée, le consultant, l'échéance de tenue et l'état.

**Lecture distincte, et non un champ de plus sur `Recu`.** Le reçu est
une pièce comptable : il nomme le moyen de paiement et jamais le
portefeuille, par minimisation. Y faire entrer le nom d'un consultant et
un horaire aurait contredit la règle que ce module tient ailleurs — et
les deux écrans du tunnel qui en ont besoin peuvent le demander
eux-mêmes.

Trois absences rendent `null` plutôt que de supposer : un paiement qui
n'est pas une consultation, une référence inconnue, et une consultation
sans rendez-vous. Le dernier cas ne devrait plus se produire depuis que
$-02 refuse d'ouvrir une consultation (S.24), mais le supposer ferait
planter l'écran d'un paiement déjà encaissé.

#### Abandonner, aussi, se dit autrement

« Annuler le paiement » ramenait au tableau de bord. Pour une
consultation, le créneau redevient libre — et le tableau de bord n'en
montre aucun, donc ne permet pas d'en reprendre un. Le lien dit
maintenant ce qui arrive au créneau et mène à l'annuaire.

#### Deux phrases enfin lues

`corpsDeLEtat("EN_ATTENTE")` et `TITRE_ETAT.EN_ATTENTE` ont été écrits au
lot de la tenue et n'avaient aucun appelant — comme les deux phrases que
S.24 avait trouvées fausses pour cette raison même. Celles-ci étaient
justes, et disaient exactement ce que cet écran devait dire : le créneau
reste tenu, et le retour de la page de paiement ne confirme rien. Elles
s'affichent.

#### Vérifié en exécutant

L'écran est rendu pour les trois achats : la consultation annonce son
créneau réservé et nomme l'horaire, le consultant et l'échéance de
tenue ; la recharge annonce ses analyses ; le pack ne bouge pas d'un mot,
lien d'annulation compris. Et une consultation dont le rendez-vous ne se
lit pas reste un écran lisible.

L'interdit de vocabulaire de rail (S.21) tourne désormais sur **six**
combinaisons au lieu de deux — trois achats × deux rails —, parce que
c'est exactement là qu'une phrase nouvelle échappe à une liste ancienne.

Sur PostgreSQL réel (`npm run smoke:consultation`) : la jointure rend le
consultant, l'heure écrite en base et l'échéance de tenue ; après la
notification signée, plus rien n'est tenu et tout est réservé ; un
paiement de pack, une référence inconnue et la transaction d'un autre
candidat rendent l'absence.

Neuf mutations, neuf rouges. La plus utile est la dernière : en retirant
le filtre sur le propriétaire de la lecture, la fumée rougit — un autre
candidat lisait l'horaire et le nom du consultant d'un rendez-vous qui
n'était pas le sien.
