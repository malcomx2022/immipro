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

**Tranché le 03/10/2026 par l'avis juridique (protection des données) :
la pondération n'a pas à être exposée.** Le calcul n'est pas une décision
automatisée au sens de l'article 22 (aucun effet juridique : la décision
appartient aux autorités) ; les articles 13 à 15 sont satisfaits par
l'explication des facteurs restituée à l'export ; la pondération relève du
savoir-faire de Rêveur Digital. Trois garde-fous conditionnent l'avis, et
sont tenus (S.113) : la complétude est présentée comme indicative, jamais
comme prédictive ; l'export et la politique de données disent que la
pondération n'est pas exposée ; une relecture humaine de l'évaluation peut
être demandée depuis C-09, et le responsable de la revue y répond. Toute
évolution du rôle du score — un prérequis affiché comme déterminant, par
exemple — appelle un nouvel avis.

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

**Avis comptable reçu le 04/10/2026 (S.114).** La facture est obligatoire
pour chaque vente, en plus du reçu ; chaque remboursement s'adosse à un
avoir. Numérotation continue par exercice (`RD-2026-00001`,
`AV-2026-00001`), mentions obligatoires, conservation dix ans. Le produit
émet désormais factures et avoirs, et une série d'essai en bac à sable. La
réserve qui demeure n'est plus une question posée au comptable mais deux
faits à établir avant l'encaissement réel : l'immatriculation de Rêveur
Digital au système de facture normalisée, avec ses accès, et son régime de
TVA, que l'avis laisse « à confirmer ». Tant qu'ils manquent, le paiement
réel est refusé.

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

### S.28 — Une dépendance qu'on n'utilise pas vote quand même

`next-auth` était déclaré dans `package.json` et importé **nulle part**.
Il est retiré.

#### Ce qu'il coûtait

Rien à l'exécution : aucun octet de son code n'entrait dans un paquet,
puisque rien ne l'importait. Il coûtait ailleurs, et trois fois.

**Il contraignait une version.** Son pair facultatif réclamait
`nodemailer@^7`, qui porte dix avis de sécurité ouverts, dont deux de
gravité haute — parmi eux une complexité quadratique de l'analyseur
d'adresses, atteignable puisque nos destinataires sont des adresses
saisies à l'inscription. Le lot du transport SMTP (S.26) a dû passer par
un `overrides` pour prendre la version corrigée. L'`overrides` part avec
lui : plus rien ne fige `nodemailer`, et une contrainte sans motif est
exactement ce qui empêchera une mise à jour de sécurité dans six mois.

**Il traînait quatre variables** dans `.env.example` — `NEXTAUTH_URL`,
`NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — dont deux
portent le mot « secret ». Aucune n'avait de lecteur. Qui déploie les
remplit consciencieusement, produit un secret, le conserve quelque part,
et rien ne le lit jamais.

**Il contredisait un arbitrage déjà pris.** I.2 avait tranché : les
sessions sont écrites en base par le dépôt, parce que NextAuth v4 force
le jeton signé dès qu'on accepte un mot de passe, et qu'un jeton ne se
révoque pas — une suspension (WF-15) n'aurait pris effet qu'à son
expiration. La dépendance était un reste d'avant cette décision.

#### Le garde-fou qui manquait

`tests/secrets-paiement.test.ts` vérifiait déjà qu'une variable **exigée
par une dépendance** figure dans `.env.example`. La réciproque n'était
vérifiée que pour les bloquantes : une variable déclarée que personne
n'exige lui échappait, et c'est exactement le cas des quatre ci-dessus.

`tests/variables-denvironnement.test.ts` ferme cela : toute variable
déclarée a un lecteur — le code, les scripts, ou un fichier
`docker-compose`, qui en est un pour de bon. Le reste passe par une liste
d'exceptions **nommées et datées**, sur le modèle de
`copy-exceptions.json`, plafonnée à cinq : au-delà, ce n'est plus une
exception, c'est que le fichier d'exemple a cessé de décrire le produit.

#### Ce que le garde-fou a trouvé d'autre

Quatre variables de plus sans lecteur, laissées en exception avec leur
motif parce qu'elles appellent une décision de produit, pas un correctif :

| Variable | Pourquoi elle n'est pas lue |
|---|---|
| `AI_TOKENS_PACK_ESSENTIEL` | le quota d'un pack vit dans `pricing.ts` (`tokensIA`), qui est la source lue |
| `AI_TOKENS_PACK_DOSSIER` | idem |
| `AI_TOKENS_PACK_PRO` | idem |
| `SMS_PROVIDER_KEY` | aucun envoi de SMS n'est modélisé, et aucune dépendance ne le déclare |

> **Suite, le 22/09/2026.** Les trois `AI_TOKENS_PACK_*` sont retirées :
> voir **S.36**. `SMS_PROVIDER_KEY` reste, et sa raison a changé — voir
> aussi S.36.

Les trois premières sont une seconde source pour un nombre qui en a déjà
une — le genre de duplication qui diverge sans que rien ne le signale, et
qui a déjà coûté une fois (S.14). Elles restent visibles dans la liste
plutôt que retirées en silence.

#### Ce qui reste ouvert

**DOC-11 §147 spécifie « OAuth Google (NextAuth, sessions en base) ».**
Les sessions en base existent ; l'OAuth Google n'est pas implémenté, et
ne l'était pas davantage avec la dépendance présente. Le retrait ne
supprime donc aucune capacité — mais l'écart entre la spécification et le
produit, lui, reste entier, et il est maintenant le seul.

#### Vérifié en exécutant

`npm ci` reproduit un arbre sans `next-auth` et avec `nodemailer@10.0.10`
sans `overrides`. L'audit de production ne cite plus ni `next-auth` ni
`nodemailer`. Toute la porte passe, construction du worker comprise.

Trois mutations, trois rouges : la dépendance qui revient, une variable
sans lecteur qui reparaît dans le fichier d'exemple, et l'`overrides` qui
se réinstalle sans motif.

---

### S.29 — Le rail des francs CFA ne pouvait ouvrir aucun paiement

L'adaptateur FedaPay attendait une enveloppe `{"v1/transaction": …}`
autour de chaque réponse. La documentation publique du fournisseur, lue
le 22/09/2026, décrit des réponses **plates**. Si elle dit vrai — et
c'est la seule source disponible —, chaque réponse réelle tombait en
`reponse_inattendue`, donc en `ouverture_refusee` : **aucun paiement en
francs CFA ne pouvait s'ouvrir**, sur le rail de la clientèle visée.

#### D'où venait la forme

De nulle part. Elle avait été écrite sans clé de bac à sable et sans
source, puis **éprouvée contre elle-même** : les tests construisaient
leurs fixtures dans la forme supposée, et passaient. C'est la raison
pour laquelle le défaut a survécu à une porte de qualité complète —
mille sept cents tests verts n'attrapent pas une supposition que les
tests partagent.

L'avertissement en tête du fichier annonçait le risque en toutes
lettres : « non éprouvé, à confronter au bac à sable ». Il n'a servi à
rien, et c'est instructif. Un commentaire qui dit « ceci est peut-être
faux » ne met personne en garde contre *quoi* ; il autorise à déployer
en conscience. Ce qui a trouvé le défaut, c'est d'aller lire la
documentation du fournisseur.

#### Quatre corrections, et ce qu'elles reposent sur

| # | Ce qui était écrit | Ce que la documentation dit |
|---|---|---|
| 1 | réponse enveloppée, exigée | réponse **plate** sur les trois points d'appel utilisés |
| 2 | `currency: { iso }` partout | la **lecture** rend `currency_id`, un entier, sans code ISO |
| 3 | « `Idempotency-Key` protège d'un second débit » | l'en-tête **n'est pas documenté** chez ce fournisseur |
| 4 | consultation « non opérationnelle, états inconnus » | la liste des états **est** documentée, et coïncide avec la nôtre |

Les deux formes coexistent maintenant dans le schéma : la plate, que la
documentation décrit, et l'enveloppée, au cas où elle existerait sur un
point d'appel non documenté. Refuser celle qu'on connaissait déjà
n'aurait rien gagné.

#### La reprise, qui refusait tout le monde

Le point n° 2 a une conséquence que la seule lecture du schéma ne montre
pas. `currency_id` est rendu par **la lecture**, c'est-à-dire par l'appel
que fait toute reprise. `retrouver` n'avait pas la devise sous la main et
passait une chaîne vide ; `ouvertureConcorde` ne pouvait pas concorder ;
`ouvrirLeTunnel` écrivait une divergence et refusait le candidat.

Autrement dit : un paiement en francs CFA dont la première réponse s'était
perdue devenait **définitivement** irrécupérable, et l'exploitation lisait
un écart de montant là où rien ne divergeait. Le contrat `Ouvreur` reçoit
donc la devise sur `retrouver`, en repli. Ce n'est pas une vérification
contournée : dès que le fournisseur dit la devise, c'est la sienne qui est
comparée, et le montant l'est toujours — c'est par lui qu'une divergence
réelle se manifeste.

#### Ce qui n'a pas de solution, et pourquoi

**FedaPay n'expose aucune API de remboursement.** Ce n'était pas la
lecture qu'on en faisait : on croyait qu'il manquait « le chemin, l'en-tête
d'idempotence, la forme de la réponse et la liste des états, à vérifier
contre leur bac à sable ». Ces choses n'existent pas. Le remboursement est
un geste manuel dans leur tableau de bord — un formulaire, six étapes, un
courriel au client — et il n'est possible **que par MTN Mobile Money**.

`PUT /transactions/{id}` accepte bien un champ `status`, et `refunded`
figure parmi les états. Rien ne documente qu'écrire cet état *déclenche*
un remboursement ; cela pourrait n'étiqueter que la ligne. Le tenter
serait deviner un mouvement d'argent.

L'adaptateur reste donc non opérationnel, mais pour une raison qui a
changé de nature : elle n'attend plus une documentation, elle constate une
absence. **Ce qui manque est un parcours d'exploitation** — une dette
`refundDueAt` qui reste visible, et un opérateur qui la solde au tableau
de bord du fournisseur avant qu'une notification signée la clôture. C'est
une décision de produit, pas un correctif, et elle n'est pas prise.

#### Documenté n'est pas vérifié

Aucune clé de bac à sable n'est disponible. Rien de ce qui précède n'a
rencontré un serveur : c'est conforme à une **documentation**, ce qui vaut
mieux qu'une supposition et moins qu'une exécution. `npm run sandbox:paiement`
existe et le dit lui-même quand il tourne sans clés — il ne se déclare pas
vert. Le jour où des clés existent, c'est cette exécution qui fera foi, pas
le commentaire en tête du fichier.

#### Vérifié en mutant

Huit mutations, huit rouges :

| Mutation | Ce qui vire au rouge |
|---|---|
| l'enveloppe redevient exigée | cinq cas de la forme plate |
| la devise de repli redevient une chaîne vide, à la création | l'entité qui ne porte que `currency_id` |
| la même, sur la reprise | la reprise sans code ISO |
| la comparaison de référence disparaît, à la création | deux cas, plate et enveloppée |
| la même, à la consultation | la référence étrangère |
| un état hors table se traduit « au plus proche » | l'état inconnu |
| le code de retour cesse d'être lu, chez FedaPay | les 500, 502 et 429 |
| le même, chez Stripe | les 503 et 429 |

Les deux dernières ont demandé de **réparer d'abord le test**. Il envoyait
un corps vide avec son code d'erreur : la lecture au schéma échouait, et le
garde-fou paraissait tenu sans jamais avoir été exercé. Le corps envoyé est
maintenant celui d'un paiement **approuvé** — seul le code de retour dit la
panne. Sans cela, un 500 dont le corps aurait porté une transaction
approuvée se serait lu « confirmé ».

Un neuvième garde-fou a été **retiré** plutôt que réparé : un test lisait
le source de l'adaptateur pour y vérifier la présence d'un commentaire.
C'est une prose qui garde une prose. L'assertion de comportement — l'en-tête
part, et il porte la clé de la tentative — reste seule.

---

### S.30 — Un fichier serait entré dans le stockage de confiance sans être balayé

Le balayage antivirus est branché : `ANTIVIRUS_URL` désigne un moteur
réel, les octets lui sont soumis, et un fichier ne quitte la quarantaine
que sur un verdict « saine ». En l'écrivant, un défaut est apparu dans le
code qui existait déjà, et il vaut d'être raconté avant le reste.

#### Le `null` devenu objet

Le balayeur rendait `null` quand il ne savait pas. Le job le testait
ainsi :

```ts
const verdict = await balayer(cle);
if (!verdict) throw new BalayageIndisponible(cle);
```

Correct tant qu'il n'y avait qu'une façon de ne pas savoir. Le moteur
branché en a six — pas de configuration, injoignable, délai dépassé,
réponse hors contrat, fichier trop volumineux, objet absent — et
l'exploitant doit les distinguer pour savoir s'il faut attendre ou
intervenir. L'indisponibilité est donc devenue un objet portant sa cause.

**Un objet est toujours vrai.** `if (!verdict)` a cessé d'attraper quoi
que ce soit, et le code tombait dans la branche suivante, qui est
`promouvoir`. Une pièce que personne n'avait balayée serait entrée dans
le stockage de confiance parce qu'un moteur n'avait pas répondu — et
comme la promotion ne fait pas de bruit, rien ne l'aurait signalé.

Le défaut n'a jamais été déployé : il est né et mort dans le même lot.
Ce qui mérite d'être noté est qu'il n'est pas né d'une inattention, mais
d'un **enrichissement de type** — la forme la plus ordinaire du travail.
Le remède n'est donc pas la vigilance :

```ts
switch (verdict.etat) {
  case "SAINE":        return admettre(version, tache);
  case "INFECTEE":     return ecarter(version, tache, verdict.menace);
  case "INDISPONIBLE": return sansVerdict(version, verdict.cause);
  default: {
    const jamais: never = verdict;
    throw new Error(`Verdict de balayage non arbitré : ${JSON.stringify(jamais)}`);
  }
}
```

Un quatrième état ne compilera pas tant que personne n'aura dit ce qu'il
promeut, et la réponse par défaut est « rien ».

#### Le contrat, et pourquoi c'est nous qui l'écrivons

La règle du lot FedaPay était : *si la documentation du fournisseur n'est
pas disponible, ne rien inventer*. Elle ne s'applique pas ici, et la
différence est entière. `ANTIVIRUS_URL` ne désigne pas un tiers dont il
faudrait deviner l'interface : elle désigne **le moteur que l'exploitant
met en face**. Inventer la forme d'une API tierce est une supposition ;
publier la nôtre est la seule façon d'être branchable.

Le contrat est donc délibérément minimal — un POST, des octets, deux
réponses possibles — parce qu'il doit se satisfaire avec une trentaine de
lignes de colle devant n'importe quel moteur : ClamAV et les autres
n'exposent pas d'HTTP. Un contrat riche déplacerait le travail chez
l'exploitant et se négocierait moteur par moteur.

**Aucune URL ne part.** Ni présignée, ni permanente : le moteur n'a pas à
pouvoir relire le fichier, ni demain, ni depuis ailleurs. C'est la raison
d'être des deux seaux, et une adresse confiée à un tiers rouvrirait
exactement ce que la quarantaine ferme, pour une durée qu'on ne
contrôlerait plus.

#### Rejouer et signaler ne sont pas la même question

Une panne réseau se reprend. Un fichier trop volumineux se rejouerait à
l'identique jusqu'à la fin des temps, et rejouer sans fin une tâche qui
ne peut pas aboutir remplit la file et noie l'incident qu'il fallait
voir. `seReprendSeule` tranche par `switch` exhaustif ; lever est la
façon de demander une reprise à pg-boss, et on ne la demande que si elle
peut aboutir.

Le signalement suit une autre règle : tout de suite pour ce qui ne se
reprend pas, au bout de trois tentatives pour le reste. La file porte
six reprises avec délai croissant — le seuil est donc franchi **avant**
que les reprises soient épuisées, ce qui est l'intérêt d'un seuil : être
prévenu pendant qu'on peut encore agir.

**Aucune combinaison n'accepte le fichier.** C'est la propriété que ce
lot existe pour tenir : quelle que soit la cause, quel que soit le
nombre de tentatives, la pièce reste en quarantaine. Signaler est une
visibilité, pas une porte de sortie.

Sans politique de reprise, pg-boss n'essayait **qu'une fois** : un moteur
redémarré pendant un dépôt laissait la pièce en quarantaine pour de bon,
et personne ne revenait la chercher. La politique est posée par
`updateQueue` autant que par `createQueue`, cette dernière étant
idempotente — sans quoi le correctif n'aurait valu que pour les
installations neuves, ce qui est la façon la plus discrète d'avoir l'air
déployé sans l'être.

#### La sonde, et la panne qui ne se remarquerait pas

Une `ANTIVIRUS_URL` bien formée devant un service qui répond poliment
`{"status":"clean"}` à tout passerait pour opérationnelle **en laissant
entrer chaque fichier**. C'est la seule panne de cette chaîne qui ne se
verrait jamais : tout continuerait de fonctionner, et rien ne serait
balayé.

La sonde présente donc **EICAR** au moteur — une chaîne normalisée de 68
octets, sans charge, que les moteurs se sont accordés à signaler
précisément pour qu'on puisse les vérifier. `INFECTEE` vaut preuve ;
`SAINE` sur EICAR est une panne, et il vaut mieux la lire au démarrage du
worker que sur le premier fichier réellement infecté.

Elle est dans le worker et non dans `/api/health`, pour la raison déjà
retenue pour le courrier le 21/09 : cette adresse est interrogée par un
répartiteur de charge et ne déclenche rien. Ce qu'elle gagne en échange :
`/api/health` compte les pièces bloquées au contrôle et l'ancienneté de
la plus vieille — un écran de back-office ne surveille que ceux qui
l'ouvrent, une adresse d'état se surveille depuis l'extérieur.

#### Ce que la base refuse désormais

Cinq garde-fous de plus, soixante-dix en tout. Le plus utile est celui
qui interdit **un incident ouvert sur une version décidée** : il oblige à
solder l'attente au moment où un verdict tombe, donc il garantit que le
compte d'exploitation ne compte que des pièces réellement bloquées. Une
mutation l'a confirmé — retirer le soldage fait échouer l'écriture de
promotion, et non un test.

#### Vérifié en exécutant, et en mutant

`scripts/fumee-balayage.mts` fait tourner la chaîne entière sur une base
réelle, devant **deux serveurs d'essai** : le moteur, et un stockage
objet de deux seaux devant lequel le vrai client MinIO parle pour de bon.
C'est ce qui permet de vérifier que la promotion déplace réellement
l'objet d'un seau à l'autre, plutôt qu'elle appelle les fonctions qu'on
croit — et cela a appris au passage que le client rejoue de lui-même un
5xx, ce qu'un faux objet aurait caché.

Onze mutations, onze rouges :

| Mutation | Ce qui vire au rouge |
|---|---|
| l'indisponibilité promeut, comme le faisait `if (!verdict)` | huit vérifications de la chaîne |
| l'attente n'est pas soldée à la promotion | la contrainte SQL refuse l'écriture |
| l'incident rajeunit à chaque reprise | l'ancienneté cesse de dire depuis quand |
| tout lève, même ce qui ne se rejoue pas | la tâche bloquée n'a plus de fin |
| `status` ouvert à toute chaîne | l'état hors contrat, et la liste des refus |
| une réponse illisible lue comme saine | trois cas, dont le corps non-JSON |
| le code de retour n'est plus lu | le 500 dont le corps dit « clean » |
| le délai de balayage retiré | le moteur muet immobilise l'ouvrier |
| le plafond de taille annoncée retiré | un flux est ouvert là où rien ne devait l'être |
| la lecture sous plafond retirée | des métadonnées qui mentent remplissent la mémoire |
| la sonde conclut sans avoir rien essayé | trois cas, dont EICAR déclaré sain |

Les deux plafonds de taille ont demandé **deux tests distincts** : ils se
recouvrent, et retirer le premier passait inaperçu parce que le second
rattrapait le verdict — après avoir tout chargé en mémoire. Le test
compte maintenant les flux ouverts, ce qui les sépare.

Trois tests qui lisaient le **source** du job ont été remplacés : ils
existaient parce qu'il n'y avait pas de moteur à éprouver, et cette
raison a disparu. Un quatrième, sur l'ordre de la promotion, est resté
tel quel : il porte sur un ordre d'instructions qu'aucune exécution ne
révèle.

---

### S.31 — L'état de service ne pouvait pas être vert

`/api/health` répondait **503 en permanence**, quelle que soit la
configuration, et rien dans un déploiement n'aurait pu l'en faire sortir.
Constaté en exécutant le calcul d'aptitude sur un environnement
entièrement renseigné, pendant le lot du balayage.

#### Pourquoi

Une dépendance bloquante n'est acquittée que par `OPERATIONNELLE` — la
bonne règle, et celle qui avait été posée exprès : « configurée » était
l'état que produisait une variable factice, et c'est l'état qui faisait
passer une installation vide pour prête.

Mais `ouverture_paiement` est bloquante et **ne peut pas** être sondée
sans effet de bord : ouvrir une session chez le fournisseur est un appel
facturé au temps, et l'arbitrage du 21/09 l'a acté en lui donnant
`sansSondeSure`. Elle plafonnait donc à `CONFIGUREE_NON_VERIFIEE` par
construction, comptait parmi les bloquantes, et rendait l'instance
`INAPTE` pour toujours.

Le défaut n'était pas dans la prudence du calcul. Il était dans le fait
de confondre deux choses que rien ne distinguait dans le vocabulaire :

| | Ce que c'est | Ce qu'on en fait |
|---|---|---|
| « la sonde n'a pas encore tourné » | un état passager | on répare, ou on attend |
| « aucune sonde sûre ne peut exister » | une propriété du point, connue à l'écriture | on arbitre, une fois |

#### Ce qu'une mesure qui ne peut pas être verte produit

Deux issues, et les deux sont mauvaises. Ou bien le répartiteur de charge
prend l'adresse au mot, et l'instance n'entre jamais en service. Ou bien
quelqu'un remarque qu'elle ment, et cesse de la lire — et c'est alors la
panne suivante, la vraie, qu'on ne verra pas.

C'est le même défaut de forme que ceux des lots précédents, pris par un
autre bout : une alarme qui sonne toujours ne dit rien, comme un
commentaire qui prévient « ceci est peut-être faux » ne prévient de rien.

#### La distinction

Une capacité de plus, `NON_VERIFIABLE`, dérivée du point de branchement
et jamais déclarée dans une observation. Et, dans l'état d'ensemble, les
bloquantes se séparent en deux listes :

- **bloquantes** — un défaut d'installation, qui se répare, et qui inapte
  l'instance ;
- **réserves** — configurées, sans sonde sûre possible : dites, comptées
  à part, sans effet sur la mise en service.

Une réserve n'acquitte rien pour autant : tant qu'il en reste une,
l'aptitude plafonne à `PILOTE`, et l'adresse la nomme. La prudence
d'origine est intacte là où elle sert — une bloquante réparable inapte
toujours, réserve ou pas, et un test le tient.

**Ce n'est pas une échappatoire**, et c'est le risque qu'il fallait
fermer : il suffirait d'écrire `sansSondeSure` pour qu'une dépendance
cesse d'inapter. Trois garde-fous, sur le modèle de
`copy-exceptions.json` : la raison est exigée et doit tenir en une phrase
qui dit ce que la sonde coûterait ; les exceptions sont **plafonnées à
deux** ; elles ne concernent que des bloquantes. Le plafond est bas
exprès — une sonde sûre est presque toujours écrivable, et le lot du
balayage vient de le montrer : on la croyait impossible, EICAR la rend
triviale.

#### Le second défaut, trouvé en mesurant le premier

`observer()` reçoit un environnement, le normalise, et le passe à
`configuree` et à la sonde. Il ne le passait **pas au résolveur** :
`brancheEcrit` appelait `point.resolveur()` sans argument, donc le
résolveur lisait `process.env`. Les trois mesures d'une même observation
ne portaient pas sur la même chose.

Tant qu'aucun résolveur ne lisait l'environnement, cela ne se voyait pas
— tous rendaient leur fonction non branchée. Le balayeur branché la
veille l'a rendu visible : avec `ANTIVIRUS_URL` renseignée et valide, la
capacité se lisait `IMPLEMENTATION_ABSENTE`, c'est-à-dire « aucun
adaptateur : le point de branchement ne rend rien ». Le lot précédent a
donc créé une mesure fausse sans s'en apercevoir.

Le même défaut porte une conséquence qui ne se voit pas encore, faute
d'un résolveur qui lise une clé normalisée : un déploiement resté sur une
graphie dépréciée (`FEDAPAY_SECRET_KEY`) se lirait **configuré** — la
normalisation fait son travail — et **sans adaptateur** — le résolveur
lisant le nom brut. L'exploitant serait envoyé chercher du code absent là
où il fallait renommer une variable. Un message d'échec doit être
actionnable ; celui-là aurait été faux.

#### Ce que cela ne corrige pas

L'instance reste `INAPTE` aujourd'hui, et c'est la vérité : la messagerie
n'a parlé à aucun serveur, personne n'a présenté EICAR à un moteur, et le
remboursement n'a pas ses deux rails — FedaPay n'expose aucune API
(S.29). Ce lot ne rend pas l'adresse verte ; il la rend **informative**.
Elle ne dit plus « inapte pour une raison que rien ne réparera », elle
dit « inapte pour trois raisons nommées, plus une réserve ».

#### Vérifié en exécutant, et en mutant

Le constat de départ a été établi en exécutant `constaterLesDependances`
puis `etatDesCapacites` sur un environnement complet et plausible, avant
d'écrire une ligne : `INAPTE`, avec `ouverture_paiement` parmi les
bloquantes, et `antivirus` en `IMPLEMENTATION_ABSENTE` malgré une URL
valide.

Cinq mutations, cinq rouges :

| Mutation | Ce qui vire au rouge |
|---|---|
| une réserve recompte comme une bloquante | trois cas, dont le 503 permanent |
| une réserve laisse déclarer l'instance prête | trois cas, dont le pilote |
| le résolveur relit `process.env` | trois cas, dont l'adresse du moteur |
| « aucune sonde sûre » se confond avec « aucune sonde » | la lecture d'ensemble |
| une exception de plus, non justifiée | cinq cas, dont le plafond |

---

### S.32 — La sonde ne traversait pas la frontière des processus

S.31 a rendu le 503 de `/api/health` extinguible. Il ne s'éteignait
toujours pas, pour une seconde raison, cachée derrière la première.

Deux sondes concluent sur un **fait** plutôt que sur la forme d'une
variable : la messagerie a-t-elle parlé à un serveur, le moteur de
balayage a-t-il reconnu le fichier d'essai. C'est la bonne règle, posée
exprès le 21/09. Le fait était rangé dans une variable de module — et
il est **établi par le worker**, qui est un service séparé
(`docker-compose.prod.yml`), tandis que `/api/health` vit dans le
processus web.

Établi en exécutant les deux sondes dans un processus qui n'a rien
sondé, c'est-à-dire dans la situation du serveur web :

```
messagerie : ABSENTE | fait : null
antivirus  : ABSENTE | fait : null
```

Les deux dépendances sont bloquantes. L'instance restait donc inapte,
indéfiniment, et aucun déploiement n'y aurait rien changé.

#### Trois défauts, une seule cause

**Le constat ne franchissait pas la frontière.** Il passe par la base
(`ServiceProbe`), qui est le seul état que les deux processus partagent.
Écrit par qui sonde, lu en une requête par `/api/health`, qui le passe
aux sondes — celles-ci restent pures, aucune ne va chercher quoi que ce
soit.

**Il n'avait pas de date de péremption.** `DernierFait` portait sa date
et personne ne la lisait : un envoi réussi il y a trois semaines aurait
déclaré la messagerie opérationnelle devant un serveur éteint depuis.
Trois heures de validité, soit le triple de la cadence de resonde — un
retard de passe ne fait pas clignoter l'état, une panne installée se
voit. Au-delà, le constat redevient « aucune nouvelle » : **ni succès,
ni échec**, parce que le service n'a pas été pris en défaut.

**Personne ne resondait.** Le worker sondait au démarrage et plus
jamais : sans repasse, le constat se serait périmé après une matinée de
fonctionnement normal. Une file horaire s'en charge, et une passe part
aussi tout de suite — attendre l'heure ronde laisserait l'instance sans
constat jusqu'à soixante minutes après un déploiement, c'est-à-dire
exactement quand on la regarde.

#### La sonde ne commandait rien

C'est le point le plus important, et il n'était pas dans le périmètre
annoncé.

Le lot du balayage (S.30) a ajouté une sonde EICAR pour détecter « la
seule panne de cette chaîne qui ne se remarquerait pas » — un moteur qui
répond `clean` à tout. Elle la détectait, et le disait à l'état de
service. **Rien n'en tirait de conséquence** : le dépôt d'une pièce ne
consultait qu'`antivirusConfigure`, si bien que les fichiers
continuaient d'être acceptés et promus par un moteur qui ne lit rien.

Une sonde dont rien ne dépend est un affichage. Le dépôt lit maintenant
le constat et refuse devant un moteur pris en défaut. L'ignorance, elle,
ne ferme rien : une pièce déposée sans constat reste en quarantaine et
n'est promue que sur un verdict « saine ». Fermer sur l'ignorance
bloquerait chaque démarrage à froid sans rien protéger de plus. Un échec
périmé ne ferme plus non plus — le moteur a pu être remplacé, et laisser
un vieux constat fermer indéfiniment ferait d'une panne réparée une
panne permanente.

#### Le commentaire qui l'annonçait déjà

Le lot du balayage avait écrit, dans le worker :

> Son échec n'empêche pas le worker de démarrer. Il n'ouvre rien non
> plus : `antivirusConfigure` commande le dépôt, et une sonde muette
> laisse la capacité non vérifiée, donc l'instance inapte au
> téléversement.

Deux faits vrais, juxtaposés de façon à suggérer un mécanisme qui
n'existait pas : l'inaptitude de l'instance ne ferme aucun dépôt, et la
route ne consulte pas la capacité. C'est le troisième commentaire de
cette série à décrire un garde-fou que le code ne tient pas — après
l'avertissement de l'adaptateur FedaPay (S.29) et le test qui lisait un
commentaire pour vérifier un commentaire.

#### Ce que la mise à l'épreuve a trouvé

Deux choses qu'aucune relecture n'aurait données, parce qu'elles
n'apparaissent qu'en exécutant :

- **`expedier` ne persistait pas son constat.** Le commentaire du module
  disait « écrit par le worker et par le processus web à chaque courrier
  réellement expédié » ; seule la première moitié existait. La fumée du
  courrier l'a montrée : un envoi réel, puis aucune ligne en base.
- **La fumée n'empruntait pas le chemin du worker.** Elle appelait
  `verifierLeMoteur` directement, c'est-à-dire un enchaînement que la
  production n'exécute pas — et ne voyait donc aucun constat écrit. Les
  sondes ont été sorties dans `server/exploitation/sondes.ts`, appelé
  par le worker **et** par la fumée.

#### Vérifié en exécutant, et en mutant

Six mutations, six rouges :

| Mutation | Ce qui vire au rouge |
|---|---|
| la fraîcheur n'est plus lue | cinq cas, dont la capacité périmée |
| un constat périmé bascule en échec | cinq cas |
| l'absence de constat ferme le dépôt | le démarrage à froid |
| un échec périmé ferme encore | la panne réparée qui resterait permanente |
| le dépôt ne consulte plus le constat | le branchement de la route |
| `expedier` ne persiste plus son constat | deux cas de la fumée du courrier |

Deux garde-fous SQL de plus : un service que le code ne connaît pas est
refusé, et un constat daté du futur aussi — une horloge déréglée rendrait
un constat éternellement frais.

#### Un bruit écarté, plutôt que toléré

Persister depuis `expedier` a fait cracher à Prisma une erreur de
configuration à chaque courrier journalisé en test, où aucune base
n'existe. `noterLeConstat` sort maintenant sans rien tenter quand
`DATABASE_URL` est absente : il n'y a pas de constat à écrire, et rien à
signaler. Le bruit d'un journal finit par cacher les vraies erreurs —
c'est la même leçon que la violation d'unicité du lot des remboursements.

---

### S.33 — Une pièce d'identité survivait à sa propre purge

INV-5 : « Les pièces d'identité sont purgées automatiquement selon la
politique de rétention. » Quand le stockage refusait une suppression, la
version était tout de même marquée purgée, **sa clé effacée**, et le
dossier déclaré purgé. Le fichier restait donc dans le stockage, la base
affirmait qu'il était parti, et plus rien ne permettait de le retrouver.

Établi en exécutant la purge sur une base réelle, devant un stockage
d'essai qui répond 500 :

```
bilan : {"dossiers":1,"versions":1,"objetsSupprimes":0,"objetsManquants":1}
dossier purgedAt : DATÉ — le dossier se déclare purgé
version  purgedAt : DATÉ | objectKey : EFFACÉE
restant pour acheverLaSuppression : 0
```

#### Deux erreurs dans une phrase de six mots

Le `catch` portait : « Objet déjà absent : c'est l'état visé, pas un
incident. »

**Un objet absent ne lève pas.** `DELETE` sur une clé inconnue rend 204,
chez S3 comme chez MinIO — vérifié contre le vrai client. Le cas que ce
`catch` prétendait couvrir n'y passait jamais, et le compteur
`objetsManquants` n'a jamais compté un objet manquant.

**Ce qui y passait était l'inverse.** Une panne réelle — un 500, une
coupure, un refus d'authentification — était rangée sous « déjà absent »,
c'est-à-dire sous « tout va bien ». La purge continuait, effaçait la clé,
et l'incident devenait invisible : rien dans le bilan, rien dans le
journal, rien à l'écran.

C'est la forme la plus coûteuse du motif que cette série accumule : non
pas une promesse fausse, mais **une erreur rangée dans la case des
succès**.

#### Le garde-fou qui existait, et qui était mort

`acheverLaSuppression` (RG-10.4) prévoyait exactement ce cas :

> Une pièce n'a pas pu partir. On n'anonymise pas : le compte reste
> « suppression demandée », visible en B-03, et la reprise réessaiera.
> Anonymiser ici rendrait le fichier orphelin et introuvable.

Le test était `restant > 0`, sur le nombre de dossiers non purgés. Comme
la purge marquait le dossier purgé quoi qu'il arrive, ce compte valait
**toujours zéro**. Le chemin n'était pas seulement inatteignable : il
décrivait précisément le mal qu'il laissait faire — le compte anonymisé
par-dessus un fichier survivant, devenu orphelin et introuvable.

Un garde-fou dont la condition ne peut pas être vraie est le troisième
de cette série, après le 503 qui ne pouvait pas s'éteindre (S.31) et la
sonde dont rien ne dépendait (S.32). Les trois se ressemblent : le
raisonnement était juste, et rien ne le reliait à l'exécution.

#### Ce qui change

Une version dont l'objet résiste n'est plus purgée : sa clé reste, son
contenu aussi, et les copies dérivées avec — une purge à moitié faite ne
doit pas se lire comme une purge entière. Le document n'est purgé que si
plus rien de lui ne reste ; le dossier, que si tout est parti. Sinon il
demeure échu, et la passe du lendemain réessaie : la purge est
idempotente par construction, c'est ce que `purgeDueAt` permet.

Le bilan dit maintenant ce qu'il compte : `objetsEnEchec` au lieu
d'`objetsManquants`, et `dossiersIncomplets` à côté de `dossiers`.

**Et le retard se voit.** Ne plus purger sur échec est la bonne conduite,
mais elle a un revers : un stockage durablement fâché laisserait des
pièces d'identité en place pendant que la purge repart en silence chaque
nuit. `/api/health` compte les dossiers au-delà de leur échéance et
l'ancienneté du plus ancien — la même mesure que pour les pièces bloquées
au contrôle, et pour la même raison : un écran de back-office ne
surveille que ceux qui l'ouvrent.

#### Vérifié en exécutant, et en mutant

`scripts/fumee-purge.mts` fait tourner la purge sur une base réelle
devant un stockage objet de deux seaux auquel le vrai client MinIO parle,
et qu'on fait refuser à volonté. Il couvre la purge ordinaire et ses
copies, l'objet déjà absent, le refus, la reprise, le dossier à
plusieurs pièces qui ne se purge pas à moitié, le dossier vivant qu'on ne
touche pas, la contrainte SQL, et le bout de la chaîne : une suppression
de compte qui **n'anonymise pas** par-dessus un fichier survivant, puis
s'achève quand le stockage revient.

Trois mutations, trois rouges :

| Mutation | Ce qui vire au rouge |
|---|---|
| les versions en échec sont purgées quand même | cinq vérifications, dont la clé effacée |
| le dossier se déclare purgé malgré un échec | six, dont la suppression de compte |
| un document à moitié purgé se déclare purgé | l'état des documents |

C'est aussi le premier lot de la série où la mise à l'épreuve n'a rien
appris de plus que ce que le diagnostic annonçait : le défaut avait été
établi par exécution **avant** d'écrire une ligne de correction, et les
fixtures ont seulement demandé quatre allers-retours pour trouver les
champs obligatoires d'un entretien.

---

### S.34 — La liste d'alerte de B-07 ne pouvait pas être non vide

`tokensIA` porte, depuis le premier jour, ce commentaire : « donnée
d'exploitation, **lue par le back-office (B-07) pour l'alerte de
marge** ». Elle ne l'était pas. Un dossier consommant dix fois le quota
de son pack n'apparaissait nulle part.

Établi en exécutant B-07 sur une base réelle, sans tarif de jeton
configuré — l'état actuel du dépôt :

```
quota du pack essentiel : 120 000 jetons
consommé               : 1 200 000 jetons
soit                   : 1000 % du quota

ce que B-07 rend : {"coutMicros":null,"partDuPrix":null,"pack":"essentiel"}
```

#### Une liste qui s'écartait elle-même

`candidatsAuDepassement` filtrait ainsi :

```ts
l.partDuPrix === null || l.pack === null ? [] : [...]
```

`partDuPrix` est le rapport d'un **coût** à un prix, et le coût demande
un tarif de jeton. Les trois variables de tarif ne sont pas renseignées
— elles ne peuvent pas l'être avant le premier relevé du fournisseur
d'inférence, ce que l'écran explique lui-même très bien. Donc
`partDuPrix` vaut `null` sur chaque ligne, donc la liste était **vide
par construction**, et l'écran affichait « les dépassements ne peuvent
pas être relevés sans tarif ».

Cette phrase est vraie de la marge. Elle était fausse de l'alerte : le
quota du pack est un plafond **en jetons**, et les jetons se comptent
sans connaître le prix de rien.

Le module le disait déjà, à propos de l'histogramme : « en jetons, pas
en argent — c'est la seule grandeur qui reste juste que le tarif soit
configuré ou non ». Le raisonnement était écrit, appliqué à
l'histogramme, et pas à l'alerte.

#### Ce qui change

`partDuQuotaIA` compare les jetons consommés au quota du pack acheté, et
alimente la liste au même titre que la marge. Un dépassement porte
désormais sa **nature** — `marge` ou `quota` —, parce que les deux ne se
lisent pas pareil et ne se réparent pas pareil : une marge dépassée
interroge la grille tarifaire, un quota dépassé interroge le dossier.

Un dossier peut figurer pour les deux raisons. Les fondre en une seule
ligne ferait disparaître celle qui tient sans tarif, qui est précisément
celle qui manquait.

Le seuil du quota est **cent pour cent**, et pas davantage : le quota est
ce que le pack a vendu. Le dépasser n'est pas une erreur de la
plateforme — rien n'arrête un appel là-dessus, et l'arbitrage en vigueur
est que le candidat compte en analyses, pas en jetons (INV-6) — mais
c'est exactement ce que l'exploitation doit voir : un dossier qui coûte
plus qu'il n'a rapporté, avant même de savoir combien.

Le tri des lignes suit maintenant **le plus alarmant des deux ratios**.
Il suivait la marge seule, donc `null` partout sans tarif : le dossier à
dix fois son quota pouvait finir en bas de liste.

#### Un filtre placé deux fois, exprès

Sans tarif, `candidatsAuDepassement` ne peut produire aucune ligne de
marge — `partDuPrix` est `null`. L'écran filtre quand même sur la nature
avant d'afficher. Ce n'est pas une redondance oisive : l'écran ne doit
pas tenir sur une garantie que seule la lecture fournit, sous peine
d'afficher un rapport entre un coût absent et un prix le jour où un
appelant changera d'avis. La mutation « l'écran redevient muet sans
tarif » le vérifie dans l'autre sens.

#### Vérifié en exécutant, et en mutant

Le même scénario, après correction :

```
partDuPrix  : null
partDuQuota : 10
alertes     : 1
  · 537d6d84… — 1 000 % du quota de jetons du pack essentiel, sur 1 appel
```

Quatre mutations, quatre rouges :

| Mutation | Ce qui vire au rouge |
|---|---|
| le quota n'alimente plus la liste | trois cas, dont le dossier sans tarif |
| un quota nul divise quand même | l'infini que la grille produirait |
| l'écran redevient muet sans tarif | le dossier hors quota, invisible |
| le quota se juge au seuil de marge | un dossier à 15 % de son quota remonterait |

#### Ce que ce lot ne fait pas

Il n'arrête aucun appel. INV-6 est tenu côté candidat par le grand livre
`AnalysisCredit`, avec son débit conditionnel en SQL — un mécanisme
soigné, et qui compte des **analyses**, l'unité que le candidat achète.
Les jetons sont la contrepartie interne ; l'arbitrage de la grille dit
qu'ils ne se facturent pas au candidat. Ce lot les rend visibles à
l'exploitation, il ne change pas ce qui est vendu.

---

### S.35 — « Dans quelques instants », pendant trois jours

Le message d'une pièce en quarantaine était unique, et il promettait une
durée :

> Ton fichier est en cours de contrôle. Il sera consultable dans
> quelques instants, tu n'as rien à faire.

Vrai pendant les quelques secondes d'un balayage ordinaire. Le lot du
balayage (S.30) a rendu possibles des attentes qui n'en sont pas, et ce
message n'a pas bougé.

Établi en exécutant la fonction d'affichage sur trois situations :

```
déposée il y a 10 secondes                          → « … dans quelques instants, tu n'as rien à faire. »
déposée il y a 3 heures                             → « … dans quelques instants, tu n'as rien à faire. »
bloquée depuis 3 jours (trop volumineuse)           → « … dans quelques instants, tu n'as rien à faire. »
```

Sur la troisième, l'exploitation lit « le fichier dépasse la taille que
le balayage accepte de transmettre, il n'y passera jamais ». Le candidat
lit qu'il n'a rien à faire, alors qu'un redépôt d'une version plus légère
aurait réglé la question en une minute.

#### C'est le lot précédent qui a créé l'attente

Avant S.30, une indisponibilité levait et la file rejouait : l'attente
était toujours courte ou la pièce finissait par passer. Depuis, une cause
qui ne se reprend pas seule laisse la pièce en quarantaine
**définitivement**, avec un incident ouvert que l'exploitation voit.

Le lot a donc rendu l'exploitation lucide et laissé le candidat dans le
noir. Ce n'est pas un oubli isolé : c'est la moitié qu'on ne voit pas
quand on regarde un mécanisme depuis le serveur.

#### Trois cas, et la durée n'est promise que dans le premier

| Situation | Ce qui est dit |
|---|---|
| attente ordinaire | le message d'origine — « quelques instants » |
| attente prolongée sans cause connue | plus de promesse de durée, et rien à faire |
| incident dont la cause est connue | ce qui se passe, et un geste s'il y en a un |

Le seuil d'attente ordinaire couvre le cas où **rien** n'a été tenté —
un worker arrêté, une file qui n'a pas démarré : aucune tentative, donc
aucun incident, donc aucun signal. Sans lui, une pièce déposée un
vendredi soir devant un worker éteint lirait « dans quelques instants »
jusqu'au lundi.

#### Deux questions qui ne se recouvrent pas

`seReprendSeule` répond à la file : faut-il rejouer ? `quiPeutAgir`
répond au candidat : ai-je quelque chose à faire ? Les réponses ne se
déduisent pas l'une de l'autre.

| Cause | Se rejoue | Qui peut agir |
|---|---|---|
| `delai_depasse` | oui | la plateforme |
| `trop_volumineux` | non | le candidat |
| `reponse_illisible` | non | la plateforme |
| `objet_absent` | non | le candidat |

Demander un geste sur une panne qui n'est pas la sienne fait tourner
quelqu'un en rond ; n'en demander aucun quand un geste suffirait le fait
attendre pour rien.

#### Une fonction qui ne servait à rien, jusqu'à ce qu'elle serve

`quiPeutAgir` a d'abord été écrite pour expliquer la distinction, et
**rien n'en dépendait** — la table des messages était rédigée à la main
à côté. Une mutation l'a montré : déplacer `objet_absent` d'une case à
l'autre ne faisait rien échouer.

C'est exactement le défaut que les quatre lots précédents ont traqué
ailleurs, écrit ici de ma main. Elle a donc reçu son emploi : un test
vérifie que tout message d'une cause « candidat » demande un geste, et
qu'aucun message d'une cause « plateforme » n'en demande. La mutation
mord depuis.

#### Vérifié en exécutant, et en mutant

`scripts/fumee-balayage.mts` couvre maintenant ce que le candidat lit à
chaque étape, sur une base réelle : à l'arrivée, après un incident dont
la cause est de notre côté, et sur un fichier trop lourd.

Quatre mutations, quatre rouges :

| Mutation | Ce qui vire au rouge |
|---|---|
| la cause n'est plus lue | trois cas, dont le fichier trop lourd |
| l'ancienneté n'est plus lue | l'attente prolongée |
| le fichier trop lourd redevient une attente | deux cas, dont la longueur du message |
| un fichier absent devient notre affaire | la cohérence de la table |

#### Ce qui reste vrai

Aucun message ne nomme la panne, le moteur, ni un code. RG-06.3 vaut ici
comme pour un refus : ce qui n'est pas actionnable n'est pas dit, et ce
qui l'est se dit en premier. Le message d'un fichier écarté au contrôle
(`refusAuControle`) n'a pas bougé — il était déjà juste.

---

### S.36 — Deux sources pour un nombre, et une seule est lue

S.28 avait relevé quatre variables déclarées dans `.env.example` que
personne ne lit, et les avait laissées en exception datée « parce
qu'elles appellent une décision de produit, pas un correctif ». Trois
d'entre elles sont tranchées ; la quatrième ne l'est pas, et la raison
de la garder a changé.

#### Les trois quotas de pack sortent

Leur motif disait : « le quota d'un pack vit dans `pricing.ts`
(`tokensIA`), qui est la source lue. Deux sources pour le même nombre :
à trancher, en retirant l'une des deux. »

L'arbitrage est rendu **par l'usage**. `tokensIA` était déjà lue par la
règle de cohérence de la grille (`pireTauxParPack`) ; depuis S.34, elle
l'est aussi par l'alerte de quota de B-07, qui est la seule alerte
disponible tant qu'aucun tarif de jeton n'est configuré. Les trois
variables, elles, ne sont lues nulle part — ni par le code, ni par les
scripts, ni par un `docker-compose`.

Ce n'est pas seulement une redondance. Deux sources pour le même nombre
divergent au premier changement de grille, et c'est **celle qui n'est pas
lue qu'on aurait modifiée** : un exploitant qui veut relever le quota du
pack Pro ouvre le fichier d'environnement, pas un module de domaine. Il
aurait changé la valeur, redéployé, et rien ne se serait passé.

#### `SMS_PROVIDER_KEY` reste, pour une autre raison

Son motif disait « aucun envoi de SMS n'est modélisé, et aucune
dépendance ne le déclare. À retirer, ou à brancher. » C'était incomplet :
**DOC-11 §346 prévoit les SMS** — « rappels par email et, pour les
échéances critiques, par SMS » (WF-09 étape 3) —, et le prototype les
affiche dans deux écrans.

La variable ne décore donc pas : elle marque la place d'une capacité
spécifiée et non implémentée. La retirer effacerait la trace de l'écart,
ce qui est l'inverse du travail. Son motif dit maintenant cela.

L'écran de l'échéancier, lui, est déjà honnête : « Aucun rappel n'est
envoyé pour l'instant, ni par email ni par SMS : reviens sur cet écran
pour suivre tes échéances. » La promesse fausse a été retirée avant ce
lot ; ce qui reste est un manque, pas un mensonge.

#### Vérifié en mutant

Deux mutations, deux rouges :

| Mutation | Ce qui vire au rouge |
|---|---|
| une variable dupliquée revient dans `.env.example` | la variable sans lecteur |
| l'exception `SMS_PROVIDER_KEY` disparaît sans que la variable parte | la même |

Le garde-fou de S.28 fonctionne dans les deux sens : il refuse une
variable sans lecteur **et** une exception qui a cessé d'en être une. Le
plafond de cinq entrées passe de quatre à une.

---

### S.37 — Un passeport valable jusqu'en 2029, prié d'être renouvelé

Le lot demandait de brancher l'extraction documentaire. La méthode du
dépôt veut qu'on établisse le défaut par l'exécution avant d'écrire la
correction : la chaîne a donc été exécutée d'abord, avec un extracteur
rendant ce qu'un modèle rend quand on ne lui dit que « passeport » — un
numéro, un nom, une date d'expiration.

Le dossier en est ressorti :

```
verdict  : A_CORRIGER
message  : aucune valeur lisible constaté, 6 mois exigé.
           Ton passeport doit rester valable 6 mois après le départ.
           Fais-le renouveler puis redépose-le.
champs   : {"nom":"SEGLA","numero":"AB1234567","date_expiration":"2029-03-01"}
```

Le passeport est valable trois ans de plus que nécessaire. Le message
envoie son titulaire chez l'autorité de délivrance, dans un pays où cela
prend des semaines et coûte un mois de budget.

#### Deux causes, aucune dans l'adaptateur

**L'extracteur n'apprenait jamais ce qu'on cherchait.** Sa signature
était `(objectKey, codePiece)`, et il devait rendre des champs nommés
d'après les **conditions** du référentiel — c'est ainsi que
`evaluerConditions` les retrouve. Or le code de la pièce ne nomme pas ses
conditions. Aucun adaptateur, écrit par qui que ce soit, ne pouvait
produire la clé `passeport_validite_min`. Le contrat était infaisable, et
son défaut se lisait « aucune valeur lisible » — la formule exacte qu'on
emploie pour une pièce illisible.

**Personne ne transformait la date lue en la durée comparée.** « Six mois
de validité » ne s'imprime sur aucun passeport ; ce qui y figure est une
date. `moisEntre` existait dans le domaine depuis le premier jour, avec
le commentaire « c'est la mesure de RG-06.3 », et **aucun appelant** :
la chaîne qui en avait besoin n'existait pas. Elle en a un maintenant.

#### Le repère manquant, qui est le cas ordinaire

En branchant la mesure, une troisième question s'est posée : six mois
après quoi ? Le référentiel dit « après la date de début du programme »,
et le dossier la porte — `targetDate`, la rentrée ou la prise de poste.

Un dossier neuf ne l'a pas. Le candidat dépose son passeport avant
d'avoir arrêté son départ : c'est l'ordre naturel, donc le cas fréquent.
Les deux réponses faciles sont fausses toutes les deux.

| Réponse | Ce qu'elle produit |
|---|---|
| « conforme » | un contrôle annoncé qui n'a pas eu lieu |
| mesurer depuis aujourd'hui | un passeport expirant dans sept mois déclaré conforme pour un départ à huit |

La condition passe donc **en réserve** : nommée, non jugée, avec le geste
qui la lève — « Renseigne ta date de départ visée dans l'échéancier ».
`Verdict` porte désormais `reserves` à côté de `echecs`, et la
distinction commande deux choses à l'écran : la pièce n'est pas déclarée
conforme, **et le bouton ne propose pas de la remplacer**. Le fichier n'a
rien ; c'est le dossier qui attend un renseignement.

La date lue est conservée telle qu'elle figure sur la pièce — ce sont les
faits bruts qui sont persistés, pas la durée calculée. Le jour où la date
de départ est renseignée, la mesure se refait sans redemander le fichier
ni redébiter une analyse.

#### Ce que le branchement a corrigé en plus

| Ce qui était écrit | Ce qui se passait |
|---|---|
| `engineLog: "extracteur non branché"`, en dur | Vrai tant que rien n'appelait ; faux au premier appel, pour un délai, un refus ou un PDF protégé |
| aucun `AiUsage` quand l'extraction rend `null` | Une réponse tronquée a consommé des jetons. Ne pas les écrire en fait un appel gratuit dans B-07 — un dépassement silencieux, qu'INV-6 interdit |
| une lecture manquée verse aussitôt en revue humaine | DOC-11 WF-06 demande trois reprises avec attente croissante. La première saturation d'un tiers partait en file de revue avec un message accusant le fichier |
| le type détecté se déduisait de « tous les champs sont nuls » | « Ce n'est pas le bon document » se constate sans aide ; savoir **où** le reclasser est ce qui fait avancer. Le modèle choisit dans la checklist du dossier |

#### Le modèle par défaut

`AI_MODEL` valait `claude-sonnet-5`. Le défaut est maintenant le modèle
le plus capable, et la variable reste pour qu'une installation en décide
autrement. La raison est asymétrique : une pièce mal lue envoie quelqu'un
refaire un document qui n'a rien, ou laisse passer un document qui
manque. Les deux se paient au guichet, pas sur la facture.

Le paquet `@anthropic-ai/sdk` était figé en `^0.30.0` — une version qui
ne connaît ni les sorties structurées, ni les blocs `document`, ni les
modèles courants. Le client y était construit **au chargement du
module**, et n'était appelé par personne. Il est maintenant construit à
l'usage, comme celui du stockage, et pour la même raison.

#### Vérifié en mutant

| Mutation | Ce qui vire au rouge |
|---|---|
| sans repère, mesurer depuis aujourd'hui | la réserve, et le faux « conforme » qu'elle empêche |
| la date lue n'est pas convertie en durée | la conformité d'un passeport valable, et le message d'un passeport trop court |
| une réserve laisse passer `CONFORME` | l'assertion qu'une pièce non vérifiée n'est pas déclarée conforme |
| un obstacle inconnu du schéma est accepté | la relecture qui ne fait pas confiance à la réponse |
| pas d'`AiUsage` quand la lecture échoue | deux assertions de jetons (INV-6) |
| une saturation part directement en revue | six assertions de la reprise |
| le compteur de tentatives n'est pas soldé | le solde du compteur |
| la consigne précède la pièce dans le corps | l'ordre des blocs, lu sur ce qui est réellement sérialisé |
| le remède bascule sur « remplacer » sous simple réserve | le bouton qui n'envoie pas refaire un fichier correct |
| la taille n'est plus demandée avant le flux | quatre assertions, dont le refus sans transfert |
| tous les `APIError` se rangent sous « injoignable » | trois assertions, dont la clé refusée qui ne se rejoue pas |
| le hors-sujet annoncé par le modèle est ignoré | la ligne de reclassement nommée |

---

### S.38 — Une garde de cohérence transformée en panne

Trouvé en exécutant la fumée d'extraction, sur une fixture qui n'était
pas encore `ACTIF`.

`recalculerCompletude` posait `readyAt` **dès que le calcul rendait
« prêt »**, sans regarder si la transition avait lieu :

```ts
readyAt: resultat.ready ? (dossier.readyAt ?? new Date()) : null,
...(passeEnPret ? { status: "PRET" } : {}),
```

Or `passeEnPret` exige `status === "ACTIF"` — c'est la règle de DOC-11,
et elle est juste. Sur un dossier qui n'est pas `ACTIF`, la ligne
recevait donc une date de « prêt » en gardant son état. La base refuse
cette ligne : la garde `application_pret_date_coherente` dit
`("status" = 'PRET') = ("readyAt" IS NOT NULL)`.

Ce n'est pas la garde qui est en cause — elle fait exactement son
travail. C'est qu'elle rejette **toute la mise à jour**, donc
`recalculerCompletude`, donc `analyserUnePiece` qui l'appelle en dernier.
Le verdict était écrit, le quota débité, la notification envoyée, et le
job mourait ensuite. La file le rejouait alors sur une pièce déjà
analysée — un second débit, une seconde notification, à chaque reprise.

Le cas se produit pour de bon. `SUSPENDU` — ce qu'une divergence
réglementaire produit (WF-11) — n'est pas dans les états figés, et un
dossier suspendu continue de recevoir des pièces. `BROUILLON` non plus.

`readyAt` suit maintenant l'état résultant, et non le score : la garde
est structurellement satisfaite au lieu d'être éprouvée à chaque
écriture. La fumée pose une pièce conforme sur un dossier suspendu et
vérifie que l'analyse aboutit, que le dossier garde son état, et qu'il ne
reçoit pas une date que son état contredirait.

| Mutation | Ce qui vire au rouge |
|---|---|
| `readyAt` suit de nouveau le score | la fumée entière, sur l'erreur d'origine |

---

### S.39 — « Rien à reprendre » sur une lettre que personne n'avait lue

Le lot précédent a branché la lecture des pièces, et posé
`ANTHROPIC_API_KEY` dans toute installation qui la veut. Ce lot-ci devait
brancher la seconde moitié de WF-08 — la mise en forme et l'analyse
critique. La chaîne a d'abord été exécutée, clé posée, sur une version
enregistrée par le candidat :

```
redactionConfiguree()        : true
remarques rendues à l'écran  : []
état                         : RELUE_SANS_REMARQUE
ce que le candidat lit       : Rien à reprendre sur cette version.

CritiqueFinding en base      : 0
laCritique() est branchée ?  : non
```

Un avis favorable sur un texte que rien n'avait lu, rendu sur la foi
d'une variable d'environnement.

#### La condition ne tenait pas le raisonnement écrit au-dessus d'elle

Le commentaire de la page disait la règle juste :

> Tant que le service d'analyse n'est pas branché, aucune remarque n'a pu
> être produite : **la liste vide de la base ne veut pas dire « rien à
> reprendre »**.

Et la ligne suivante écrivait :

```ts
const remarques =
  derniere && redactionConfiguree() ? await remarquesDeLaVersion(derniere.id) : null;
```

`redactionConfiguree()` ne teste que la présence de la clé. C'est
exactement le raccourci qu'I.C interdit et que `capacites.ts` énonce en
titre : **une variable renseignée ne vaut pas un service**. Il dormait
tant que personne ne posait la clé ; le branchement de la lecture des
pièces l'a réveillé le matin même.

Une liste vide **est** un résultat légitime — « relu, rien à reprendre ».
Ce qui manquait est la trace de la relecture, seule capable de la
distinguer d'une absence. Elle se porte sur la version (`critiquedAt`),
parce que c'est la version qui est relue : une version suivante n'hérite
de rien.

#### `laCritique` n'avait aucun appelant

Elle existait, l'état de service la comparait à sa variante non branchée,
et **aucune route ne l'appelait**. Le jour où elle aurait été branchée,
rien n'aurait produit la moindre remarque : la capacité serait passée à
« branchée » sans qu'un seul texte soit relu.

C'est la troisième occurrence de la même forme en trois lots — la sonde
de balayage qui ne commandait rien (S.32), `moisEntre` sans appelant
(S.37), et celle-ci. Une fonction juste, dont le branchement ne change
rien, parce que le chemin qui y mène n'existe pas.

R-04 porte donc un geste, et c'est le seul de l'écran : `A_ANALYSER`,
« Lancer l'analyse ». Il annonce ce qu'il coûte avant le clic — RG-08.4
fait payer chaque itération, et un geste qui débite se propose, il ne se
découvre pas au compteur.

#### Ce que le branchement a corrigé en plus

| Ce qui était écrit | Ce qui se passait |
|---|---|
| `costMicros: 0` en dur dans la route de mise en forme | L'analyse d'une pièce, elle, calculait. Le jour du premier tarif, cette ligne-là n'aurait pas suivi |
| aucun `AiUsage` quand la mise en forme échoue | Une réponse coupée au plafond a coûté ses jetons. INV-6 ne connaît pas d'appel gratuit |
| un recrédit écrit à la main (`analysisCredit.create`) | Le grand livre a une API depuis S.37 ; deux façons d'écrire la même ligne divergent |
| six causes d'échec d'appel, prêtes à être recopiées | Elles vivent maintenant dans `domain/ia/appel.ts`, lues par la lecture des pièces **et** par la rédaction. Deux listes pour une règle divergent, et c'est celle qu'on n'a pas sous les yeux qu'on oublie |

#### Ce que le modèle reçoit, et ce qu'il ne reçoit pas

Les réponses de l'entretien et le texte de la version. **Aucune pièce
jointe** : le recoupement inter-pièces reste en TypeScript
(`domain/redaction/coherence.ts`), sur ce que le dossier sait déjà de
lui-même. La règle d'architecture 2 tient, et elle évite en plus
d'envoyer le contenu d'un passeport pour relire une lettre.

Une question sans réponse n'est pas transmise vide : présenter
« FINANCEMENT : » suivi de rien invite à combler le vide, ce que l'étape 3
de WF-08 écarte — « à partir de ses réponses, jamais d'un modèle
pré-rempli générique ».

#### Vérifié en mutant

| Mutation | Ce qui vire au rouge |
|---|---|
| la décision redevient « la clé est posée » | quatre assertions de la fumée, dont le message d'origine mot pour mot |
| l'état `A_ANALYSER` disparaît | le test d'état, et trois assertions de la fumée |
| une réponse illisible retombe sur une liste vide | la relecture qui ne fait pas confiance, et deux assertions de la fumée |
| une incohérence sans ses deux valeurs passe | RG-08.3 sur la relecture |
| un texte tronqué devient une version | deux assertions de la fumée |
| une réponse d'entretien vide est transmise | la question passée qui doit le rester |
| toutes les causes d'appel se rejouent | deux tests, et quatre assertions de la fumée d'extraction |
| le domaine importe le serveur | la garde de pureté ci-dessous |

---

### S.40 — La première règle d'architecture n'était tenue par personne

`CLAUDE.md` ouvre ses règles d'architecture par celle-ci :

> `src/domain/` ne connaît ni Prisma, ni Next, ni le réseau. Logique pure,
> testée sans infrastructure.

Rien ne la vérifiait. Elle s'est respectée jusqu'ici parce qu'on la
relisait — c'est-à-dire de la façon que ce dépôt remplace lot après lot.

Elle a failli céder **dans ce lot même**. `domain/redaction/commande.ts` a
d'abord importé ses types depuis `server/redaction/redacteur.ts` : des
formes de données, sans rien de serveur, et pourtant l'inversion exacte
que la règle interdit. Le domaine aurait dépendu de la couche qui
l'appelle, et l'aurait entraînée dans ses tests. Les types ont été
déplacés dans le domaine, et le module serveur les réexporte.

Ce que la règle protège n'est pas une élégance. Un domaine qui n'importe
ni Prisma ni Next se teste sans base, sans serveur et sans réseau — c'est
ce qui rend les mille neuf cents tests de ce dépôt assez rapides pour
qu'on les lance à chaque édition. Un seul `@prisma/client` dans un module
de domaine y fait entrer le client généré, donc une variable
d'environnement et une connexion, dans des fichiers que le simulateur
public charge.

`tests/domaine-pur.test.ts` lit les imports de tout `src/domain/` et
refuse quatre choses : Prisma, Next et React, une remontée vers
`@/server`, `@/app`, `@/lib` ou `@/components`, et tout appel réseau. Il
vérifie d'abord qu'il a bien lu des fichiers — une garde qui n'en lirait
aucun passerait toujours.

| Mutation | Ce qui vire au rouge |
|---|---|
| un module du domaine importe `@/server/http/echecs` | la remontée vers le serveur, en nommant le fichier fautif |

---

### S.41 — Une fumée qui passait le matin et échouait l'après-midi

Trouvée en faisant tourner les neuf fumées avant de livrer le lot de
rédaction. `smoke:remboursement` avait passé à 08:20 UTC ; à 10:56 elle
s'arrêtait sur une garde de base, **sans qu'une ligne du produit ait
changé** entre les deux — vérifié en la rejouant sur le commit précédent.

Le rembourseur simulé rendait un accusé daté en dur :

```ts
const ACCEPTEE: Remboursement = {
  issue: "acceptee",
  accepteLe: new Date("2026-09-22T10:00:00.000Z"),
  …
};
```

Or `refundDueAt` — la date à laquelle la dette est ouverte — est posée à
l'heure du run, et la base exige `refundRequestedAt >= refundDueAt` : une
demande antérieure à la décision qui l'ouvre décrit une histoire
impossible. La garde est juste et faisait exactement son travail. Passé
dix heures UTC, la date figée du fournisseur passait avant l'ouverture, et
toute la fumée s'arrêtait là.

Une date de fixture figée devant une donnée qui suit l'horloge : la fumée
n'éprouvait pas la même chose selon l'heure à laquelle on la lançait. Le
fournisseur accuse une demande **au moment où il répond** ; l'accusé est
donc construit à ce moment-là, par une fonction et non par une constante
— évaluée au chargement du module, même `new Date()` précéderait de
quelques millisecondes l'ouverture de la dette, et le défaut serait
revenu sous une forme plus difficile à lire.

Le correctif ne touche que le script. Aucun code de production n'était en
cause : c'est la fumée qui décrivait une chronologie que le produit
refuse à raison.

---

### S.42 — Une procédure entière qu'aucun dépôt ne pouvait terminer

Cherchant ce que le branchement des deux chaînes IA avait rendu faux
ailleurs, la question posée au référentiel réel était : quelles conditions
se rattachent à quelles pièces ? La réponse, pour une procédure sur
quatre :

```
NL emploi_kennismigrant | passeport        | (aucune)
NL emploi_kennismigrant | contrat_travail  | (aucune)
NL emploi_kennismigrant | diplome          | (aucune)
```

Cinq conditions — dont trois bloquantes — et pas une seule rattachée.
Exécuté :

```
Ce que l'extraction demandera, pièce par pièce :
  passeport        champs demandés : []
  contrat_travail  champs demandés : []
  diplome          champs demandés : []
                   verdict sur une lecture vide : CONFORME
                   « Les informations lues correspondent à ce qui est exigé. »

Et le dossier, toutes pièces conformes :
  conditions tenues : toutes false
  palier : INCOMPLET | prêt : false
  ce qui manque : salaire_min_moins_30_ans, salaire_min_30_ans_et_plus,
                  employeur_reconnu
```

Deux conséquences, opposées et toutes deux fausses. **Chaque pièce était
déclarée conforme sans qu'une seule comparaison ait eu lieu** — un contrat
à deux mille euros passait. Et **le dossier ne pouvait jamais devenir
prêt** : les trois conditions bloquantes restaient insatisfaites quoi que
le candidat dépose, et l'écran lui demandait de fournir
`salaire_min_moins_30_ans`, qui n'est pas une pièce.

#### Le préfixe n'est pas une relation

Le rattachement se faisait par comparaison de préfixes de codes, **à deux
endroits et selon deux règles différentes** :

```ts
// jobs/analyse.ts
c.code.startsWith(codePiece) || codePiece.startsWith(c.code.split("_")[0])
// acces/dossiers.ts
code.startsWith(d.code) || d.code.startsWith(code)
```

Deux réponses possibles à une même question, et aucune des deux juste. La
devinette tenait tant que le référentiel nommait ses conditions d'après
leurs pièces — `passeport_validite_min` sur `passeport`, `preuve_fonds_annuelle`
sur `preuve_fonds`. Elle s'écroulait dès qu'un rédacteur nommait une
condition d'après ce qu'elle exige plutôt que d'après ce qui l'établit :
`salaire_min_moins_30_ans` ne partage aucun préfixe avec
`contrat_travail`, et rien ne le signalait.

La pièce se **déclare** désormais (`condition.piece`), en un seul endroit
lu par les deux appelants.

#### Trois gardes, et où chacune se place

| Garde | Où | Pourquoi là |
|---|---|---|
| une condition rattachée nomme une pièce **qui existe** | schéma, donc à chaque lecture | intégrité de forme ; vide de sens pour une règle ancienne, qui n'a pas de rattachement du tout |
| une condition **bloquante** nomme une pièce | **publication** et insertion de la graine | le schéma est repassé à chaque lecture, et INV-3 fige des payloads écrits avant cette règle : les refuser à la lecture rendrait illisible ce que des dossiers en cours ont gelé |
| le référentiel livré est terminable | test, sur les données de la graine | la forme d'une règle et sa terminabilité sont deux questions, et seule la première était posée |

La deuxième est la correction structurelle : une règle qu'aucun dépôt ne
pourrait terminer ne se publie plus. Sur une règle déjà figée, une
bloquante sans pièce reste comptée non satisfaite — c'est la réponse
prudente, et l'écarter reviendrait à déclarer prêt un dossier sur une
exigence que personne n'a vérifiée.

#### « Conforme » sans comparaison

La phrase « Les informations lues correspondent à ce qui est exigé »
couvrait le défaut : elle affirme une comparaison, et trois pièces la
recevaient sans qu'aucune ait eu lieu. Une pièce sur laquelle le
référentiel ne pose rien est maintenant **reçue**, et le message le dit :
« Le référentiel ne pose aucune condition chiffrée sur cette pièce : elle
est reçue telle quelle. Son contenu n'a donc pas été comparé à un seuil. »

Le cas reste légitime — une lettre d'admission s'exige sans seuil chiffré.
Ce qui ne l'était pas, c'est de le présenter comme un contrôle réussi.

#### Un seuil dont l'applicabilité dépend du candidat

Rattacher les quatre seuils de salaire à `contrat_travail` les rend enfin
comparables — et découvre le problème que leur silence masquait. Ils sont
**alternatifs** : 4 357 € avant trente ans, 5 942 € à partir de trente
ans, plus deux variantes de procédure. Évalués séparément, ils disent à
quelqu'un de vingt-cinq ans payé 4 400 € qu'il lui manque mille cinq cents
euros.

Le référentiel les groupe donc (`condition.alternative`), et le groupe se
juge en bloc :

| Ce qui est lu | Verdict | Pourquoi |
|---|---|---|
| au-dessus de tous les seuils | conforme, sans mention | rien à supposer |
| au-dessus de certains | conforme, **avec la mention** de ceux qui ne le sont pas | c'est vrai si le seuil atteint est bien celui qui s'applique, et le candidat est le seul à le savoir |
| en dessous de tous | à corriger, cité **au seuil le moins exigeant** | le constat est vrai quel que soit celui qui s'applique |

#### Ce qui reste ouvert

**Le dossier ne porte pas la date de naissance du candidat**, et c'est
elle qui déciderait lequel des deux seuils kennismigrant s'applique. En
son absence, la plateforme suppose et le dit. Deux suites possibles, et
elles ne demandent pas le même travail :

1. **poser la question au dossier** — un discriminant renseigné par le
   candidat, que le référentiel nommerait sur le groupe. Une date de
   naissance est une donnée personnelle de plus, avec ce qu'INV-5 impose
   de rétention ; une tranche d'âge suffirait peut-être ;
2. **laisser la mention** — la plateforme ne vérifie pas ce qu'elle ne
   peut pas savoir, et le dit au candidat, qui vérifie.

La seconde est ce qui est livré, parce qu'elle n'invente aucune donnée.
La première est une décision de produit, à prendre avant qu'une procédure
en ajoute d'autres du même genre.

#### Vérifié en mutant

| Mutation | Ce qui vire au rouge |
|---|---|
| le rattachement redevient une devinette de préfixe | la relation, sur la procédure kennismigrant |
| une bloquante sans pièce se publie de nouveau | la garde de publication |
| le groupe n'existe plus : chaque seuil se juge seul | deux tests, dont le faux « il te manque 1 500 € » |
| le groupe échoué cite le seuil le plus exigeant | le seuil le moins exigeant, seul vrai quel que soit l'âge |
| une pièce sans condition retrouve « correspondent à ce qui est exigé » | la phrase qui affirmait une comparaison |
| une condition du référentiel livré perd son rattachement | le garde-fou sur la graine, en nommant la procédure |

---

### S.43 — Une file qui attendait une messagerie déjà branchée

`JOBS.RAPPEL_ECHEANCIER` était déclarée avec ce motif :

> Déclarée sans écrivain : la file existe, personne n'y poste encore,
> **l'envoi attend la messagerie**. Une file vide ne promet rien ; c'est
> l'écran qui doit rester honnête.

Le transport SMTP a été branché le 22/09 au matin. La phrase est devenue
fausse sans que rien ne bouge, et l'échéancier a continué de ne rien
envoyer. Exécuté :

```
échéances en base       : 3
  dont dépassée         : test_langue, il y a 3 jours
  dont à moins de 7 j   : rdv_consulaire, dans 4 jours

transport de courrier   : SMTP (branché)
file déclarée           : echeancier.rappel
un ouvrier la traite ?  : non
quelqu'un y poste ?     : personne

notifications d'échéance: 0
```

Un candidat dont une échéance est dépassée depuis trois jours ne reçoit
rien, et l'écran lui dit de revenir regarder — ce qui est honnête, et ce
qu'un échéancier existe précisément pour lui épargner.

#### La cadence est une règle, pas un réglage

RG-09.2 : « les rappels sont regroupés — un email hebdomadaire, sauf
urgence à moins de 7 jours ». Deux règles distinctes, et donc deux
marques : la cadence porte sur le **dossier** (`lastReminderAt`),
l'exception sur l'**échéance** (`Deadline.remindedAt`).

La seconde décide de tout. Sans elle, une urgence repartirait chaque jour
jusqu'à la date — la façon la plus sûre de se faire filtrer, et le filtre
emporte avec elle le rappel qui comptait. Le groupement n'est donc pas
une économie d'envois : c'est ce qui garde le canal lisible.

| Situation | Ce qui part |
|---|---|
| une échéance à moins de sept jours, jamais rappelée | tout de suite, avec les autres échéances proches |
| la même, le lendemain | rien |
| des échéances dans le mois, dernier envoi il y a une semaine | la passe hebdomadaire, urgences comprises |
| la même, six jours après | rien |
| une échéance faite, ou dépassée de plus de trente jours | rien — un rappel qui insiste sur une date passée depuis longtemps n'est plus un rappel, c'est un reproche |
| un dossier déposé, suspendu, clôturé ou abandonné | rien, et **aucune marque** : il n'est pas « déjà rappelé », il est hors du périmètre |

Le courrier ne dit rien de l'issue de la démarche (INV-1) ni de ce qu'une
date manquée coûterait — c'est pourtant ce qu'un rappel est tenté de faire
pour obtenir une réaction. Chaque ligne porte **le délai et la date** :
« dans 4 jours » seul oblige à compter, « le 26 septembre » seul oblige à
ouvrir un calendrier.

#### Ce que l'écran disait, et ce qu'il dit

La ligne avait déjà été corrigée une fois — elle affirmait « Rappels par
email activés » devant un réglage qui n'existait pas. Elle disait ensuite
qu'aucun rappel ne partait, ce qui était vrai. Elle dit maintenant ce qui
part, à quelle cadence, **et ce qui ne part pas** : le SMS de DOC-11 §346
n'a toujours aucun fournisseur branché, et un candidat qui croirait en
recevoir un ne regarderait pas ses emails.

---

### S.44 — Un 451 n'est pas un refus

Trouvé par la fumée du lot précédent, dont le serveur d'essai répond
`451` : le rappel était marqué comme traité et n'arrivait jamais.

`issueDeLErreur` traduit l'échec de nodemailer en issue d'envoi. Trois
codes rendaient `refuse` **quel que soit le code de réponse** :

```ts
case "EAUTH":     return { issue: "refuse", … };
case "EENVELOPE": return { issue: "refuse", … };
case "EMESSAGE":  return { issue: "refuse", … };
```

Or `refuse` veut dire, dans le domaine qui l'arbitre, « réessayer à
l'identique ne servirait à rien ». Le protocole SMTP distingue les deux
depuis toujours : **5xx dit « non », 4xx dit « pas maintenant »**. Un
`451` — serveur momentanément indisponible, la réponse la plus banale
d'un relais sous charge — se lisait donc comme un refus définitif.

La conséquence dépasse les rappels. `suiteDeLEnvoi` en déduit
`renvoyable: false`, et c'est cette valeur qui décide si un candidat peut
redemander son code de vérification. Un relais saturé pendant trente
secondes lui refusait le renvoi.

Le cas par défaut, lui, appliquait déjà la bonne règle — `reponse >= 500`
pour un code inconnu. Elle vaut maintenant pour tous : le code nodemailer
ne décide plus de l'issue, il donne le mot juste pour la dire. Sans code
de réponse, le comportement d'avant est conservé : le serveur n'a rien
dit, et ces trois-là restent des refus.

#### Vérifié en mutant

| Mutation | Ce qui vire au rouge |
|---|---|
| l'urgence n'échappe plus à la cadence | trois tests, et deux assertions de la fumée |
| une urgence repart chaque jour | deux tests, et trois assertions de la fumée |
| une échéance faite se rappelle quand même | deux tests |
| une coupure marque quand même | quatre assertions de la fumée, dont le rappel perdu |
| un 451 redevient un refus définitif | le test du protocole, et cinq assertions de la fumée |

---

### S.45 — Le dépôt était impossible, et la règle n'existait qu'en SQL

Cherchant ce que le branchement des chaînes IA avait rendu faux ailleurs,
la question posée à la base était : **qui écrit `Application.status`, et
pose-t-il la date qui va avec ?**

Une garde de `20260918000100_garde_fous` tient depuis le premier jour :

```sql
CHECK (("status" = 'PRET') = ("readyAt" IS NOT NULL))
```

Elle est juste. « Prêt à déposer » est un état **calculé**, et la date où
il a été atteint en fait partie : un dossier prêt sans date ne dit plus
depuis quand, une date sans l'état prétend une mise en état qui n'a pas eu
lieu.

Sept écritures changeaient `status`. **Une seule** posait la date avec — et
depuis le 22/09 au matin seulement, quand la même garde avait transformé
l'analyse d'une pièce en panne (S.38). Le correctif était resté là où on
l'avait trouvé.

Exécuté, sur six dossiers réellement prêts :

```
Et la déclaration de dépôt — WF-10 étape 1, sur un dossier PRET :
  dossier 6 : statut PRET, readyAt posée
  ✗ le dépôt est refusé par la base : application_pret_date_coherente
  dossier 6 : statut PRET, déposé non
```

`PRET` est le **seul** état que la route de dépôt accepte. La déclaration
de dépôt — le dernier geste du parcours candidat, WF-10 étape 1 — était
donc refusée à tous les coups, pour tout le monde, depuis le premier jour.
Quelqu'un qui avait réuni toutes ses pièces recevait une erreur de service
sur le seul geste qui clôt son travail.

Cinq autres écritures tombaient de la même façon.

| Écriture | État visé | Ce que le refus faisait |
|---|---|---|
| clôture avec issue déclarée (WF-10) | `ISSUE_DECLAREE` | renoncer avant de déposer échouait |
| mise en pause d'une divergence (WF-11) | `SUSPENDU` | la passe mourait au premier dossier prêt |
| arbitrage d'une divergence (T-02) | `ACTIF` | « je migre » ne faisait rien |
| activation d'un pack payé | `ACTIF` | un second pack encaissé et non crédité |
| archivage de fin de purge (RG-10.4) | `ARCHIVE` | les octets partis, la base les croyant présents |

Le dernier est le plus grave après le dépôt. `removeObject` passe **avant**
la transaction : les fichiers quittaient le stockage, l'écriture qui devait
l'enregistrer était refusée, `purgedAt` restait nulle, et la passe du
lendemain rejouait le même échec sans fin. INV-5 promet une purge ; elle
avait lieu, et la base disait le contraire.

#### La propagation s'arrêtait au premier dossier prêt

Sur trois dossiers `PRET` rattachés à une version qui perd une condition
bloquante :

```
Publication de la version 2 — propagation :
  ✗ la propagation a levé : divergence.ts:145 db.application.update()
Second passage (la file rejoue le job) :
  ✗ la propagation a levé de nouveau
Ce que les trois dossiers ont réellement reçu :
  dossier 1 : statut PRET, 2 notification(s), 1 arbitrage(s)
  dossier 2 : statut PRET, 0 notification(s), 0 arbitrage(s)
  dossier 3 : statut PRET, 0 notification(s), 0 arbitrage(s)
```

Le dossier le plus exposé — celui qui allait déposer — faisait tomber tous
les suivants. Personne n'était prévenu qu'une condition d'éligibilité avait
disparu. Et le premier restait à moitié traité : une notification lui
disant « ton dossier est mis en pause » devant un dossier toujours prêt,
puis une seconde à chaque reprise de la file.

#### « Je conserve ma version » ne levait jamais la pause

```
Et « je garde ma version », sur un dossier mis en pause :
  dossier 5 : statut PRET, readyAt posée
  dossier 5 : après « je conserve », statut SUSPENDU
```

Le courrier et la notification disent : « Ton dossier est mis en pause **le
temps que tu regardes**. » La branche `CONSERVER` n'écrivait que
l'arbitrage. Le dossier restait `SUSPENDU` — un état dont ni les rappels
d'échéance (`ETATS_RAPPELABLES`) ni le passage en `PRET` ne sortent. Choisir
de garder sa version gelait son dossier pour de bon.

#### Ce que le correctif déplace

**La règle descend dans le domaine.** `domain/dossiers/etat.ts` rend le
couple, et les sept écritures y passent. La date est posée en entrant dans
`PRET`, **conservée** si le dossier y était déjà — elle dit depuis quand —,
retirée partout ailleurs.

**Deux décisions descendent des routes.** Le dépôt, la clôture et
l'arbitrage vivaient derrière `next/headers` : hors d'un serveur Next, rien
ne pouvait les appeler, et c'est pourquoi aucune fumée ne pouvait voir que
le dépôt ne passait pas. C'est la leçon de `vueDeLaRelecture` (S.39),
reprise telle quelle.

**La propagation devient reprenable plutôt que fragile.** Chaque dossier
est traité pour lui-même ; ce qui échoue est compté et nommé ;
`RuleMigration.alertedAt` marque le candidat **prévenu**, et une reprise le
saute. L'email critique de RG-11.3 ne part plus dans un `catch` qui
journalise : il suit la règle des rappels — envoyé avant la marque, et une
coupure ne marque rien.

#### L'angle mort, et ce qui le ferme

Une règle pure ne peut pas éprouver une contrainte de base. C'est
exactement ce qui a permis à six écritures d'être fausses pendant quatre
jours : rien, dans la chaîne de vérification, n'écrivait réellement dans
une base sur ces chemins-là. `scripts/fumee-transitions.mts` le fait,
depuis un dossier réellement `PRET`, et la porte de qualité l'appelle.

#### Vérifié en mutant

| Mutation | Ce qui vire au rouge |
|---|---|
| le dépôt écrit l'état sans sa date | la fumée entière, au premier bloc |
| la clôture, l'activation d'un pack, l'archivage de purge, idem | leur bloc respectif |
| la mise en pause écrit l'état sans sa date | 21 assertions — la passe meurt de nouveau |
| « je migre » écrit l'état sans sa date | le bloc majeur, sur un dossier prêt |
| « je conserve » ne lève plus la pause | 2 assertions |
| la marque d'alerte n'est plus posée | 4 assertions, dont la seconde notification |
| un dossier fait de nouveau tomber les autres | le compte des alertés |
| une coupure marque quand même | 6 assertions, dont l'alerte perdue |
| l'email critique repasse dans un `catch` muet | 6 assertions |

#### Relevé en passant, et laissé ouvert

`prisma/README.md` dit que le barème de WF-07 « reste calculé et stocké —
le back-office en a besoin ». Aucun écran ne le lit : `internalScore` est
écrit par `recalculerCompletude` et par personne d'autre. Et les deux
composantes confiées à l'IA lui sont passées à zéro, si bien qu'un dossier
objectivement complet plafonne à 75 sur 100. Les deux points tiennent
ensemble et demandent un arbitrage produit — donner au barème le lecteur
que le document lui prête, ou constater qu'il n'en a pas — plutôt qu'un
correctif.

---

### S.46 — Un seuil qui change de valeur ne prévenait personne, et une seule paire d'yeux suffisait

Le lot précédent avait rendu la propagation d'une divergence fiable :
elle prévient tous les dossiers, ou rejoue. Restait à savoir **ce qu'elle
tient pour une divergence**.

La question posée au référentiel réel : que conclut `comparer` quand un
seuil bloquant change de valeur ?

```
Le seuil bloquant « salaire_min_moins_30_ans » passe de 4357 € à 1000 €.

Et ce que WF-11 conclut de ce changement de seuil :
  impact : MINEUR
  diff   : []
  → la propagation sort sans rien faire : AUCUN dossier n'est prévenu
```

La comparaison diffait les **codes** des conditions bloquantes —
apparition, disparition — et deux champs du payload, `preuve_fonds` et
`niveau_langue_min`. Jamais la valeur d'une condition. Or un seuil qui
change garde son code.

C'est le changement réglementaire le plus régulier du produit qui passait
ainsi. DOC-11 le nomme dans le tableau de WF-11 — « Majeur | **Seuil** ou
pièce obligatoire modifié | Notification + proposition de migration » — et
RG-14.3 dit quand il revient : « les montants IND changent au 1er janvier ».

#### Durcir n'est pas assouplir

Rattacher la valeur rend la comparaison possible — et découvre que les
deux sens du même changement ne se traitent pas de la même façon. Un seuil
**relevé** retire l'éligibilité à qui l'atteignait tout juste : c'est le
cas critique, mise en pause et email nominatif. Un seuil **abaissé** ne
retire rien à personne.

Quand les deux versions ne s'ordonnent pas — l'opérateur change, l'unité
change, la condition devient bloquante, elle quitte son groupe
d'alternatives —, la réponse prudente est celle qui prévient. Se tromper
dans ce sens fait lire un message de trop ; se tromper dans l'autre laisse
quelqu'un déposer sous une exigence qu'il ne remplit plus.

Et `message_echec` reste hors de la comparaison : le réécrire ne change
aucune exigence, et faire partir une alerte à tous les dossiers ouverts
parce qu'une phrase a été clarifiée apprend à ignorer les suivantes.

#### WF-14 §4 n'avait aucun mécanisme

« Relecture par un second opérateur pour toute modification de condition
bloquante. » Le commentaire de la route disait que la séparation
veilleur / administrateur en tenait lieu. Elle n'en tenait pas lieu :
`ROLES_ADMIS` laisse un administrateur passer les deux portes, et rien ne
comparait qui avait écrit à qui publiait.

Les garde-fous que la publication applique, sur une version qui divise un
seuil par quatre, écrite et publiée par la même personne :

```
  source publiable (RG-14.2)        : oui
  schéma Zod (WF-14 étape 3)        : oui
  vocabulaire (INV-1, INV-2)        : oui
  règle terminable (S.42)           : oui
  un second opérateur l'a relue     : jamais demandé

Ce que la base sait, et que personne ne compare :
  v1 PUBLISHED  écrite par veilleur@immipro.test
  v2 DRAFT      écrite par veilleur@immipro.test
  le publicateur serait veilleur@immipro.test — le même.
```

`VisaRule.verifiedBy` porte l'email de qui a écrit la version. Il n'y
avait rien à ajouter en base, seulement à comparer.

Le contrôle porte sur **toute** modification et non sur les seules
durcissantes : abaisser un seuil n'enlève l'éligibilité à personne, et
ouvre la procédure à des dossiers qu'elle n'aurait pas dû accueillir. Une
version qui ne touche aucune bloquante se publie seule — sans quoi la
relecture deviendrait une formalité qu'on apprend à contourner.

#### Une seule définition, deux appelants

La comparaison descend dans `domain/rules/comparaison.ts`. Le contrôle de
relecture et la propagation l'appellent tous les deux : un contrôle qui
s'appuierait sur une seconde définition de « une condition bloquante a
bougé » finirait par diverger d'elle. C'est la leçon de S.42, où la même
relation écrite à deux endroits donnait deux réponses et aucune juste.

La décision de publication descend de sa route vers
`server/regles/publication.ts`, pour la raison établie la veille : ce
qu'aucun script ne peut appeler, rien n'éprouve.

#### Vérifié en mutant

| Mutation | Ce qui vire au rouge |
|---|---|
| la valeur d'une condition redevient invisible | les essais purs, et neuf assertions de la fumée |
| tout changement de seuil devient majeur | les essais, et la mise en pause du dossier |
| l'inordonnable est tenu pour un assouplissement | les essais seuls — la fumée ne change ni opérateur ni unité |
| la relecture n'est plus exigée | les essais, et six assertions de la fumée |
| le publicateur n'est plus comparé au rédacteur | la fumée seule — c'est une décision serveur |
| réécrire un message redevient une modification | les essais, et la clarification qui ne passe plus |
| le journal perd qui a rédigé | la fumée seule |

Le partage est celui qu'on attend : ce qui se décide sans base est rouge
dans les essais, ce qui demande une base et deux comptes l'est dans la
fumée. Une mutation rouge des deux côtés dit que la règle est éprouvée
deux fois ; une mutation rouge d'un seul côté dit où elle vit.

---

### S.47 — « Révocable » ne l'était que pour l'avenir

RG-02.1 annonce le consentement au traitement des pièces d'identité
**séparé et révocable**. La séparation était tenue. La révocation, non.

Le candidat autorise, dépose une pièce, puis se ravise pendant que le job
d'analyse attend dans la file :

```
  autorisation accordée ?       false
  un nouveau dépôt est refusé ? oui

Et la pièce déjà déposée, dont l'analyse est en file :
  appels au modèle           : 1
  jetons débités             : 4500
  analyses consommées        : 1
  état de la pièce           : A_CORRIGER
```

Le retrait écrivait une ligne et refusait les dépôts suivants. Le fichier
déjà déposé partait au service de lecture, une analyse était débitée, un
verdict s'écrivait sur la pièce — après le retrait de l'accord.

L'autorisation se relit désormais à deux endroits : à la promotion, parce
que le candidat a pu se raviser entre le dépôt et le balayage, et à
l'analyse, parce qu'il peut se raviser pendant que le job attend — c'est
même l'intervalle le plus probable. La lecture précède le débit et la
lecture du fichier : ni jeton dépensé, ni octet transmis.

#### Deux lectures d'un même registre de preuve

`exigerConsentementPieces` refaisait la requête que `autorisationAccordee`
faisait déjà, avec sa propre version de « la dernière ligne l'emporte ».
C'est le défaut de S.42 — une relation écrite deux fois — sur un objet
autrement plus sensible : deux lectures d'un registre de consentement qui
finiraient par répondre différemment. Une seule reste.

#### Ce que la pièce ne disait pas

`MENTION_CONSERVEE_NON_VERIFIEE` était exportée, éprouvée par un test, et
**affichée par aucun écran** : la pastille disait « Conservée, non
vérifiée » et rien n'expliquait pourquoi.

Avec un second motif, une mention unique en démentirait un — envoyer
recharger des analyses quelqu'un qui vient de retirer son accord lui ferait
payer pour un geste qu'il a lui-même fait. Le motif est donc porté par la
pièce, et il atteint l'écran par le chemin ordinaire du message de pièce.

#### L'écran des autorisations disait l'inverse de la règle

« Sans cette autorisation, tu téléverses tes pièces sans analyse
automatique. » RG-02.2 dit le contraire — « aucune pièce ne peut être
téléversée avant ce consentement » — et c'est la règle que le code applique.
Le candidat lisait l'inverse de ce qui allait se passer, au moment précis où
il décidait.

La phrase dit maintenant les deux moitiés : ce que le refus empêche, et ce
que le retrait arrête.

#### La fumée a dit ce qu'une fixture taisait

La fumée du balayage ne posait aucune autorisation sur ses candidats. Le
jour où la promotion a commencé à la lire, elle a viré au rouge — et elle
avait raison deux fois : la lecture nouvelle mordait, et la fixture
décrivait un dépôt impossible, puisqu'en production RG-02.2 refuse de
déposer sans accord. Elle pose l'autorisation désormais, comme le ferait un
vrai dépôt, et son remède aussi : sans lui, une pièce conservée sans analyse
se relisait « Attendue · Ajouter » et le candidat renvoyait ce qu'il venait
d'envoyer.

#### Vérifié en mutant

| Mutation | Ce qui vire au rouge |
|---|---|
| l'analyse ne relit plus l'autorisation | sept assertions de la fumée d'extraction |
| la promotion ne la lit plus | deux assertions de la fumée de balayage |
| le retrait est lu comme un accord | les deux fumées |
| un accord ancien suffit de nouveau (`asc` au lieu de `desc`) | dix-sept assertions |
| les deux motifs redonnent le même message | les essais purs, et les deux fumées |
| la pièce non analysée ne dit plus pourquoi | la fumée de balayage |

Cinq des six ne virent au rouge que dans les fumées : ce sont des décisions
de serveur, qui demandent une base et un registre de consentement. La
sixième est une décision d'écriture, et elle est rouge des deux côtés.

#### Relevé en passant, et laissé ouvert

**Quelle autorisation couvre quelle pièce ?** Aucune ne le déclare.
`exigerConsentementPieces` applique l'autorisation *sensible* à toutes les
pièces, si bien qu'un candidat qui refuse l'analyse de ses pièces
d'identité ne peut pas non plus déposer son relevé bancaire — et que
l'autorisation « pièces financières », présentée séparément, ne commande
rien du tout. Déclarer la relation dans le référentiel serait la réponse
(c'est ce que S.42 a fait pour les conditions), mais elle butte sur une
question qui n'est pas d'ingénierie : l'examen médical et l'assurance
santé sont des **données de santé**, et aucune autorisation ne les couvre
aujourd'hui. Inventer ce consentement serait décider à la place du produit
et de son conseil juridique.

**Le quota de jetons n'est pas un plafond.** INV-6 dit « débité d'un quota
de tokens rattaché au pack ». Exécuté, un dossier atteint 225 % du quota de
son pack sans que rien ne s'y oppose : ce qui est débité, ce sont des
analyses, et les jetons sont seulement comptés. Ce n'est pas un défaut mais
un arbitrage déjà pris, et `domain/backoffice/couts.ts` l'écrit : « le
candidat compte en analyses, pas en jetons ». Il reste que `verifierQuota`,
dans `lib/ai.ts`, calcule un refus que personne ne demande — une fonction
sans appelant qui donne à l'invariant l'air d'être tenu.

---

### S.48 — Deux passes justes, et un défaut à leur rencontre

Le lot précédent avait appris à la publication à voir la valeur d'un seuil.
Restait à vérifier qu'elle trouve toujours la version qu'elle remplace.

RG-14.1 repasse en `DRAFT` une fiche dont la relecture est dépassée : « une
donnée non relue ne peut pas continuer à se présenter comme fiable ». La
passe est juste, et elle est modeste — le filtre de lecture candidat écarte
déjà ces fiches, requête par requête ; la passe ne fait que rendre l'état de
la base conforme à ce qui s'affiche.

La publication, elle, cherchait son prédécesseur par `status = 'PUBLISHED'`.
Exécuté, sur un dossier prêt figé sur la version en vigueur :

```
La passe de veille de 3 h du matin (RG-14.1) :
  1 fiche(s) dépubliée(s) — la v1 passe à DRAFT

Puis le veilleur finit sa relecture, et un administrateur publie la v2 :
  version archivée   : AUCUNE
  divergence en file : false

Ce qu'il reste :
  v1 : DRAFT, effectiveTo nulle
  versions en vigueur : v2
  le dossier suit toujours v1
  le candidat est-il prévenu que son seuil passe de 4357 € à 5857 € ? NON
```

Aucune des deux passes n'a tort séparément. Ensemble, elles perdent la
succession : la v1 reste `DRAFT` pour toujours sans date de fin, la v2 se
croit première, et le candidat dont le seuil vient de monter de mille cinq
cents euros n'apprend rien.

Et la fenêtre n'est pas étroite. RG-14.3 fixe la relecture par défaut à
quatre-vingt-dix jours : tout retard du veilleur l'ouvre — précisément au
moment où il vient de relire et où la version suivante va paraître.

#### `status` n'est pas « en vigueur »

Les deux étaient confondus dans une seule colonne. Une fiche dépubliée pour
retard cesse d'être **montrée** ; elle reste la version que des dossiers ont
figée (INV-3), donc en vigueur pour eux.

`VisaRule.publishedAt` porte la mise en vigueur, posée une fois et jamais
effacée. La succession se lit dessus — « mise en vigueur, jamais
remplacée » —, et la dépublication ne la touche pas. Une republication après
échéance garde la date d'origine : la déplacer à chaque remise en ligne
ferait passer une vieille version devant une plus récente.

Deux gardes en base : on n'archive pas ce qui n'a jamais été mis en vigueur,
et on ne termine pas ce qui n'a pas commencé — la seconde tenant aussi
l'ordre des deux dates. Elles réparent au passage un silence de RG-14.4 : la
version remplacée porte enfin sa date de fin, même lorsqu'elle était en
brouillon au moment d'être remplacée.

#### Ce que les fixtures disaient sans le vouloir

Une fixture qui crée une règle `PUBLISHED` sans date de mise en vigueur
décrit une version publiée que personne n'a jamais mise en vigueur. La sonde
l'a montré d'abord sur elle-même : le correctif écrit, elle rendait toujours
« aucun prédécesseur » — et elle avait raison, puisque sa v1 n'avait jamais
été mise en vigueur. C'est le même constat que la veille au soir sur les
autorisations de la fumée de balayage, et il vaut d'être noté comme tel :
une fixture décrit un état, et un état qu'aucun chemin du produit ne peut
produire n'éprouve rien.

#### Vérifié en mutant

| Mutation | Ce qui vire au rouge |
|---|---|
| le prédécesseur se cherche de nouveau par statut | trois assertions : rien n'est archivé, rien n'est mis en file |
| la mise en vigueur n'est plus posée à la publication | la chaîne s'arrête à la deuxième version |
| une republication réécrit la date d'origine | l'ordre de la succession |

Les trois ne mordent que dans la fumée : ce sont des décisions de base, et
une règle pure ne peut pas éprouver la rencontre de deux passes nocturnes.

---

### S.49 — Trois phrases sur le même écran, fausses toutes les trois

Le lot précédent avait rendu la mise en pause fiable : WF-11 suspend le
dossier d'un candidat dont une condition d'éligibilité vient de changer, lui
écrit, et lui laisse l'arbitrage. Restait à savoir ce que ce candidat lit en
ouvrant son dossier.

```
── Dossier complet, avant la divergence ──
  en base            : PRET
  bandeau du dossier : « Prêt à déposer »
  prochaine action   : « Rien ne bloque un dépôt. »

── Le même dossier, mis en pause par une divergence critique ──
  en base            : SUSPENDU
  bandeau du dossier : « Actif »
  palier             : COMPLET
  prochaine action   : « Rien ne bloque un dépôt. »
  « Je dépose »      : refusé — « Ton dossier n'est pas encore complet :
                       il reste des pièces obligatoires à réunir.
                       La checklist dit lesquelles. »
```

`SUSPENDU` n'avait pas de mot dans le vocabulaire candidat : `versStatut` le
rendait `ACTIF`, et le bandeau disait « en cours » sur un dossier en pause.

Toutes les pièces étant conformes — c'est le cas ordinaire, puisque la
divergence frappe les dossiers avancés —, la prochaine action annonçait
« Rien ne bloque un dépôt » sur le seul dossier dont le dépôt était bloqué.

Et le refus du dépôt donnait la seule raison qu'il connaissait : des pièces
obligatoires manquantes. Il n'en manquait aucune. Le candidat relisait une
checklist entière en cherchant ce qui n'y était pas — c'est exactement ce
que la doctrine d'erreur du projet interdit, un message qui ne se corrige
pas.

La notification, elle, disait juste : « Ton dossier est mis en pause le
temps que tu regardes. » Mais elle vit sur l'écran des alertes ; celui qui
ouvre son dossier ne la voit pas.

#### Le mot existait déjà dans le produit

`EN_PAUSE` entre dans `StatutDossier`. Il n'est pas inventé : le courrier de
RG-11.3 et le corps de la notification emploient « mis en pause » depuis que
WF-11 existe. Il manquait à un seul endroit — l'écran du dossier — et c'est
là que le candidat regarde.

`MENTION_EN_PAUSE` dit le constat, ce qui est conservé, et **où la décision
se prend**. Une pause qu'on ne sait pas lever n'est pas actionnable, et elle
ne se lève pas sur l'écran du dossier : l'arbitrage vit dans les alertes.

La même phrase sert aux trois endroits — bandeau, prochaine action, refus du
dépôt — parce que c'est la même chose qui est vraie aux trois.

Et une quatrième conséquence s'en déduit : dans la liste des dossiers, celui
qui est en pause passe devant. C'est le seul qu'aucune pièce ne fera
avancer.

#### Vérifié en mutant

| Mutation | Ce qui vire au rouge |
|---|---|
| un dossier en pause se relit « Actif » | les essais purs, et deux assertions de la fumée |
| la prochaine action ignore la pause | les essais, et la fumée |
| la vue ne passe plus l'état à la prochaine action | la fumée seule — c'est un câblage |
| le refus du dépôt redevient unique | la fumée seule |
| la pause ne passe plus devant dans la liste | les essais seuls |
| la mention ne dit plus où décider | les essais seuls |

Le partage est net : ce que le domaine décide est rouge dans les essais, ce
que la vue câble l'est dans la fumée. Deux mutations rouges des deux côtés :
ce sont celles qui portent la règle elle-même.

---

### S.50 — Le seul texte candidat que la liste ne voyait pas

CLAUDE.md énonce la règle du vocabulaire interdit et son périmètre : « Une
seule liste, quatre points d'application : un administrateur qui saisit une
promesse dans un guide pays bute sur la même règle qu'un développeur. »
B-02 y figure, pour les textes d'une règle.

La question posée au référentiel réel : **cette liste passe-t-elle sur le
référentiel livré ?**

```
Le vocabulaire interdit, passé sur le référentiel livré :

  NL etudes_mvv_vvr              1 faute(s)
      conditions.2.message_echec · « 50 % »
      → arbitrage C-09 — aucune part affichée sur le dossier
  NL emploi_kennismigrant        0 faute(s)
  CH etudes_permis_b             0 faute(s)
  AE etudes_residence_etudiante  0 faute(s)
```

Le texte : « L'établissement signale à l'IND tout étudiant validant moins de
**50 %** de ses crédits annuels, ce qui peut entraîner le retrait du titre de
séjour. » C'est un `message_echec`, donc la phrase que le candidat lit sur sa
pièce quand la condition échoue.

Une règle entre en base par **deux** chemins : la publication de B-02, et la
graine. B-02 refuse ce texte. La graine l'a chargé — elle ne contrôlait que
la forme (Zod) et la terminabilité (S.42). C'était le seul chemin d'écriture
d'un texte candidat qui n'appliquait pas la liste.

Le contrôle du dépôt ne le voyait pas non plus, et à juste titre :
`check:copy` applique `INTERDITS_PARTOUT` — les promesses de résultat — à
tout le dépôt, mais la seconde portée, celle de la note de dossier, ne vaut
que pour ce que le candidat lit. Le fichier de données n'est pas un écran ;
son contenu, lui, en est un.

#### Une fonction, deux appelants

`refusDuReferentiel` réunit les deux refus de contenu — terminabilité et
vocabulaire — et les deux chemins l'appellent. C'est la leçon de S.42, une
fois de plus : deux listes de mots refusés finiraient par diverger, et c'est
celle de la graine qui gagnerait, puisque c'est elle qui charge la
production.

#### Réécrit plutôt qu'excepté

`copy-exceptions.json` était l'autre issue, et CLAUDE.md la prévoit
explicitement : « chaîne exacte, chemin, motif, date ». Elle n'a pas été
prise.

Le budget est de cinq dérogations — « au-delà, ce n'est plus une exception,
c'est une dérive » —, et « moins de la moitié de ses crédits annuels » dit
exactement « moins de 50 % » en toutes lettres, sans perdre un mot de
l'information réglementaire. Une dérogation se dépense pour ce qui n'a pas
d'équivalent.

Le seuil lui-même n'a pas bougé : `valeur: 50` reste dans la condition, où
il sert à comparer et n'est jamais affiché. C'est précisément la distinction
que l'arbitrage C-09 pose — le barème vit, il ne s'affiche pas.

#### Vérifié en mutant

| Mutation | Ce qui vire au rouge |
|---|---|
| le pourcentage revient dans le référentiel | les essais purs |
| le refus partagé oublie le vocabulaire | les essais |
| le refus partagé oublie la terminabilité | les essais — la fumée reste verte, ses règles sont terminables |
| le motif « pourcentage » quitte la liste | les essais, dont celui qui éprouve le motif lui-même |
| la publication ne refuse plus rien | la fumée |

Et deux vérifications que seul un chargement réel donne : la graine charge
les quatre procédures sur une base neuve, et refuse le texte fautif sans
rien insérer, avec le message que l'opérateur lit — l'extrait et le chemin
du champ à reprendre.

---

### S.51 — Le délai que personne ne comparait, et le calendrier que migrer ne refaisait pas

RG-09.3 est une phrase courte et elle demande deux choses : « un délai
réglementaire modifié déclenche un recalcul intégral de l'échéancier **et**
une notification explicite ».

La question posée au code : **que se passe-t-il quand une autorité allonge
son délai d'instruction ?** C'est le changement réglementaire le plus banal
qui soit, et l'échéancier du produit se construit à rebours depuis la date
cible en retirant ce délai — c'est lui qui décide de la date de dépôt, donc
de toutes les autres.

Exécuté avant correction, sur un dossier visant la rentrée du 1er septembre
2027, avec `delai_traitement_jours.max` passant de 90 à 150 :

```
=== 1. La comparaison de versions ===
  impact = MINEUR
  diff   = []

=== 3. La propagation de la publication ===
  bilan = {"dossiers":0,"alertes":0,"critiques":0,…}
  notifications reçues par le candidat : 0
  lignes d'arbitrage créées            : 0

=== 4. L'échéancier après publication ===
  2027-06-03  depot   Dépôt de la demande
  dépôt inchangé ? true
  ce qu'il devrait être sur 150 jours : 2027-04-04
```

Ni l'un ni l'autre, donc. `comparerLesVersions` ne regardait pas le délai, et
la propagation sort immédiatement dès que le diff est vide — le dossier n'est
même pas compté.

Et le second temps, celui qui étonne le plus :

```
=== 5. Et si le candidat migrait quand même ? ===
  arbitrage : {"decision":"MIGRER",…}
  version figée = v2
  2027-06-03  depot   Dépôt de la demande
  dépôt toujours inchangé ? true
```

Le candidat a fait le geste. Sa version figée pointe la nouvelle règle, sa
checklist a reçu les pièces ajoutées, et son calendrier reste celui de
l'ancienne. Deux mois de retard, invisibles, sur l'acte même par lequel il
acceptait la mise à jour.

**Ce qui n'est pas un défaut, et qu'il fallait ne pas casser.** Entre la
publication et l'arbitrage, l'échéancier ne doit **pas** bouger : INV-3 fige
la version d'un dossier, et un calendrier qui se décalerait sous les yeux du
candidat avant qu'il ait tranché serait la migration d'office qu'INV-3
interdit. La fumée le vérifie dans les deux sens — rien ne bouge avant, tout
bouge après ; et le dossier qui conserve garde son calendrier.

**L'arbitrage retenu sur l'impact.** Un délai allongé n'a jamais rendu
personne inéligible : il reste `MAJEUR`. Le passer `CRITIQUE` mettrait le
dossier en pause, c'est-à-dire retirerait au candidat la seule chose que ce
changement lui a déjà prise — le temps. Il n'entre pas non plus dans
`bloquantesTouchees` : WF-14 §4 vise « toute modification de condition
bloquante », et exiger deux paires d'yeux pour une fourchette de jours
banaliserait le contrôle qui compte.

**Ce que « notification explicite » veut dire.** Le nouveau délai *et* ce
qu'il fait à la date de dépôt. « Le délai passe à 150 jours » n'apprend rien
à qui ne sait pas que son échéancier se calcule à rebours. Ce qui part
désormais :

> Le délai d'instruction annoncé passe de 60–90 jours à 60–150 jours. Si tu
> appliques cette version, ta date de dépôt avance de 60 jours : il faut
> déposer plus tôt pour la même date cible. Ta checklist actuelle ne change
> pas. Tu peux comparer les deux versions et décider de migrer ou de
> conserver la tienne.

« Si tu appliques » et non « ta date avance » : rien n'a bougé tant qu'il n'a
pas tranché, et une phrase au passé lui ferait chercher des dates qu'il ne
verra pas.

| Mutation | Ce qui vire au rouge |
|---|---|
| la comparaison ne regarde plus le délai | les essais purs |
| migrer ne recalcule plus l'échéancier | la fumée |
| `doneAt` ne traverse plus le recalcul | la fumée |
| l'alerte ne dit plus le délai | la fumée |
| conserver recalcule quand même (INV-3) | la fumée |
| le remplacement n'efface plus les anciennes lignes | la fumée, aux deux appelants |

Et une découverte de méthode : la replanification de WF-09, second appelant
du remplacement extrait, **n'était éprouvée par rien**. Extraire une décision
sans éprouver ses deux appelants aurait déplacé le défaut d'un cran au lieu
de le corriger ; la fumée conduit désormais le même couple que la route PUT,
sans la couche HTTP, et vérifie qu'un dossier se replanifie sur sa version
figée — 90 jours — et non sur la publiée du jour.

**Ce qui reste ouvert.** L'écran T-02 pose toujours les deux versions côte à
côte sur le seul montant : `DivergenceReglementaire` ne montre pas le délai,
et son bouton « Appliquer mon choix » ferme la feuille sans appeler
l'arbitrage. C'est un écart d'écran, pas de règle — la décision, elle, est
branchée et éprouvée.

---

### S.52 — L'arbitrage qu'on recueillait et qu'on jetait

S.51 s'est arrêté sur un écart consigné : l'écran T-02 ne montrait que le
montant, et son bouton « Appliquer mon choix » fermait la feuille. C'était
l'écart le plus proche, et il valait d'être posé au même endroit que la règle
qu'il dessert.

La question posée à l'écran : **que se passe-t-il quand le candidat applique
son choix ?** Exécuté avant correction, après un clic sur « Migrer » puis sur
le bouton :

```
  le candidat a choisi « Migrer » puis cliqué le bouton.
  appels réseau partis    : 0
  la feuille s'est fermée : true
  ce que l'écran lui dit  : « Ta checklist Pays-Bas sera mise à jour. »
  et plus haut            : « Nous ne modifions rien sans ton accord. »
```

Rien ne part. La feuille se ferme. Et l'écran annonce au futur — « **sera**
mise à jour » — une mise à jour qui n'aura pas lieu.

La phrase du haut d'écran, « Nous ne modifions rien sans ton accord », n'était
tenue que parce que rien n'était jamais modifié. Le candidat donnait son
accord ; rien n'était modifié quand même.

`arbitrerLaDivergence` existait pourtant, éprouvée par une fumée depuis S.48,
et n'avait **aucun appelant**. Les props de l'écran ne portaient ni le
dossier ni la divergence : il n'aurait pas pu appeler la route même s'il
l'avait voulu.

**Le second défaut, que S.51 venait de rendre atteignable.** Depuis que la
comparaison voit le délai d'instruction, une version peut n'en changer que
lui. L'écran supposait que le montant sépare toujours les deux versions :

```
  une version qui ne change que le délai d'instruction :
  ce que ça change pour ton dossier :
    « … c'est la version 2 qui s'appliquera, et il te faut 0 € de plus. »
  option : « Ta checklist et tes montants passent à 11 500 €. »
  option : « Ta checklist reste à 11 500 €. »
  le mot « délai » apparaît-il ? false
```

Deux cartes portant la même somme, un chiffre donné pour ne rien dire, et
deux options présentées comme la même. On demandait de trancher entre elles.

**Ce qui est retenu.** L'écran écrit son arbitrage par `appeler`, comme la
clôture C-11 : `envoi`, `echec`, `BlocEchec`, et la feuille ne se ferme
qu'une fois écrit — sur une décision qui déplace un échéancier entier,
l'échec doit se lire là où le geste a été fait. Le domaine ne parle plus que
de ce qui a bougé : `ceQuiSepare` décide, le montant se tait quand il n'a pas
changé, le délai est nommé quand il change, et chaque carte de version porte
le sien.

| Mutation | Ce qui vire au rouge |
|---|---|
| le bouton se contente de fermer, comme avant | les essais d'écran |
| la feuille se ferme avant la réponse | l'essai du refus serveur |
| « il te faut 0 € de plus » revient | les essais purs et d'écran |
| les options citent le montant quoi qu'il arrive | les essais purs et d'écran |
| la carte de version ne montre plus le délai | l'essai d'écran — **après renforcement** |
| le délai ne remonte plus du référentiel | la fumée — **après couverture** |

Deux mutations n'ont d'abord pas mordu, et c'est la partie instructive.

La cinquième : les mêmes chaînes « 60–90 jours » apparaissant dans le détail
des options, retirer le délai des **cartes** laissait tout au vert. L'essai a
été resserré sur le libellé propre à la carte — c'est la comparaison côte à
côte qui donne à voir ce qui sépare les deux versions, pas le détail d'une
option.

La sixième : `delai` est facultatif sur `VersionRegle`. Cesser de le faire
remonter du référentiel passait le typage, et les deux cartes auraient
affiché « non renseigné » pour toujours sans qu'un seul essai ne bronche. La
fumée de publication lit désormais `divergenceAArbitrer` sur des règles
réelles et vérifie que les deux délais arrivent.

**Ce qui reste ouvert.** L'écran ne montre toujours pas les **pièces**
ajoutées ou retirées par la nouvelle version — `arbitrerLaDivergence` les
rend pourtant dans `piecesAjoutees`, et personne ne les lit. Un candidat qui
migre découvre les nouvelles lignes sur sa checklist après coup.

---

### S.53 — L'horloge que la plateforme remettait à zéro

RG-04.2 : « un dossier `BROUILLON` inactif depuis 90 jours déclenche une
relance, puis passe en `ABANDONNE` à 12 mois. »

La question posée au code : **qu'arrive-t-il à un brouillon qu'on laisse de
côté ?** Exécuté avant correction :

```
=== 1. Ce que le code affirme d'ABANDONNE ===
  l'enum Prisma le porte      : oui
  l'écran a un cas pour lui   : versStatut("ABANDONNE") = CLOTURE
  une file de jobs le produit : NON

=== 2. Un brouillon laissé de côté ===
  inactif depuis              : 630 jours (21 mois)
  statut                      : BROUILLON
  relance envoyée             : 0

=== 4. Y a-t-il seulement un écrivain d'ABANDONNE ? ===
  dossiers ABANDONNE en base  : 0
```

Vingt et un mois, aucune relance, aucun changement. C'est la troisième fois
que ce projet rencontre cette forme exacte — un état que l'enum porte, que
l'écran sait afficher, et qu'aucune écriture ne produit : `readyAt` en S.47,
`EXPIREE` avant la péremption, `ABANDONNE` ici.

**Le vrai piège n'était pas là.** Il était dans l'horloge, et la sonde l'a
posé avant qu'une ligne soit écrite :

```
=== 3. `updatedAt` peut-il servir d'horloge d'inactivité ? ===
  updatedAt avant                     : 2025-01-01
  updatedAt après un rappel système   : 2026-09-22
  l'horloge a-t-elle été remise à zéro par le système ? true
```

`Application.updatedAt` est `@updatedAt` : **toute** écriture le déplace, y
compris celles de la plateforme. Le job de rappels d'échéance réveille aussi
les brouillons et pose `lastReminderAt`. L'horloge aurait été remise à zéro
chaque semaine par la plateforme elle-même, et les douze mois ne seraient
jamais arrivés — un dossier mort resté vivant parce qu'on lui écrivait.

L'horloge retenue est ce que **le candidat** a produit : l'ouverture du
dossier, et le dernier dépôt de pièce. Aucune passe de nuit n'écrit de
`DocumentVersion`.

**Ce qu'elle ne compte pas**, et c'est assumé : un candidat qui ne ferait que
déplacer sa date cible, sans jamais rien déposer, pendant douze mois. La
relance du quatre-vingt-dixième jour part neuf mois avant l'abandon et dit ce
qui arrivera — c'est le filet, et il est large.

**Trois décisions qui tiennent ensemble.** La relance n'écrit rien sur le
dossier, sans quoi elle réactiverait l'horloge qu'elle observe. Le marquage
suit le courrier : marqué d'abord, un candidat injoignable ne serait plus
jamais relancé et serait clos sans avoir rien reçu. Et l'abandon programme la
purge — `ABANDONNE` est terminal, et clore sans `purgeDueAt` aurait laissé des
pièces d'identité en stockage pour toujours, un trou d'INV-5 ouvert à
l'endroit même où l'on ferme un dossier.

| Mutation | Ce qui vire au rouge |
|---|---|
| l'horloge redevient `updatedAt` | la fumée — le dossier de 13 mois est relancé, pas clos |
| l'abandon ne programme plus la purge | la fumée (INV-5) |
| la relance repart chaque nuit | les essais purs et la fumée |
| la notification porte l'horloge du serveur | la fumée |
| l'abandon avertit au lieu de clore | les essais purs et la fumée |
| la marque précède le courrier | la fumée — **après renforcement** |
| le dépôt du candidat ne compte plus | la fumée |

Sept mutations, sept rouges. La sixième n'a d'abord pas mordu : le relais SMTP
de la fumée acceptait tout, et la garde « courrier avant marque » n'était donc
éprouvée par rien. Le harnais savait déjà différer une adresse — il servait à
la propagation des divergences — et la fumée relance désormais un candidat
dont la boîte refuse, vérifie qu'il n'est **pas** marqué, puis que la passe
suivante le relance pour de bon.

**Et une chose que seule une base a montrée.** La passe décide sur une horloge
injectée et marquait sur celle du serveur : deux dates qui coïncident en
production et divergent dès qu'une passe est rejouée en retard. La fumée l'a
vu — la passe du lendemain renvoyait la même relance — et la notification
porte désormais `createdAt: maintenant`.

**Ce qui reste ouvert.** Un brouillon sans version figée ne peut pas passer
`ABANDONNE` : `application_version_figee` l'interdit, et elle a raison. Le cas
n'existe pas — `ouvrirDossier` est le seul créateur d'`Application` et pose
toujours la version —, mais si une ligne d'un autre âge en portait une, elle
ressortirait en incident à chaque passe. Aucune branche défensive n'a été
écrite pour un état que l'application ne produit pas : l'incident est
précisément l'endroit où une telle ligne doit se voir.

---

### S.54 — La checklist qu'on nommait sans en nommer une ligne

L'écart laissé ouvert par S.52. L'écran T-02 montrait les deux versions par
leur montant, puis par leur délai — jamais par leurs **pièces**.

```
  une nouvelle version qui exige une pièce de plus :
  le mot « pièce » apparaît-il ?      false
  une checklist est-elle nommée ?    false
  option : « Ta checklist passe à la version 5, avec 11 904 € à prouver. »
```

« Ta checklist passe à la version 5 » nomme la checklist sans nommer une
seule de ses lignes. Le candidat tranchait sans savoir ce qu'il devrait
fournir, et le découvrait sur sa checklist après coup — ce qui est
exactement ce qu'un écran d'arbitrage doit éviter.

La donnée existait pourtant. `comparerLesVersions` calculait déjà le delta
des pièces obligatoires, mais sous forme de `piece.<code>` dans le diff : un
code de référentiel, que rien ne peut montrer à un candidat. Le delta ressort
désormais nommé, et le diff en dérive — une implémentation, pas deux.

**Une pièce sort de deux façons, et le mot n'est pas le même.** Devenue
complémentaire, elle reste joignable ; disparue, elle ne se demande plus.
`encoreDemandee` porte la distinction, et les confondre ferait jeter un
document qu'on pouvait encore envoyer.

| Mutation | Ce qui vire au rouge |
|---|---|
| l'écran ne liste plus les pièces | l'essai d'écran |
| une pièce devenue complémentaire est dite disparue | les essais purs et d'écran |
| conserver cite les mêmes pièces que migrer | les essais purs |
| les pièces ne remontent plus du référentiel | la fumée |
| le libellé est remplacé par le code | la fumée |
| l'énumération rebégaie | les essais purs |

Six mutations, six rouges. La cinquième ne mord **que** dans la fumée : les
essais purs travaillent sur une fixture nommée à la main, et seul un
chargement réel du référentiel montre qu'un libellé remonte bien jusqu'à
l'écran.

Une note de rédaction, trouvée en exécutant : trois changements à la fois
donnaient « avec 11 904 € à prouver **et** 1 pièce de plus à fournir **et** 2
pièces de moins à réunir ». L'énumération se fait désormais par virgules avec
un « et » final, et le second membre ne répète pas « pièces ».

**Ce qui reste ouvert.** `arbitrerLaDivergence` rend toujours `piecesAjoutees`
et aucun écran ne le lit — mais ce n'est plus le même manque : le candidat
voit désormais les pièces **avant** de trancher, et sa checklist les porte
après. Le champ sert la fumée, qui vérifie que la migration ajoute bien les
lignes annoncées.

---

### S.55 — Le dossier fermé pour avoir suivi le plan qu'on lui avait fait

Le lot précédent a donné une horloge à RG-04.2. Elle ignorait le plan que la
plateforme construit elle-même.

L'échéancier se calcule **à rebours depuis la date cible** : un candidat qui
vise la rentrée 2029 a un premier geste au 4 mai 2029, et rien avant. C'est le
produit qui le lui dit. Exécuté sur un dossier ouvert quatre cents jours plus
tôt :

```
=== Le dossier ===
  statut            : BROUILLON, aucun dépôt
  date cible        : 2029-09-01
  échéance          : 2029-05-04  À demander : Diplôme le plus élevé
  échéance          : 2029-06-03  Dépôt de la demande

=== Les deux passes de la même nuit ===
  inactivité  : {"examines":1,"relances":0,"abandons":1,…}

=== Ce que le candidat reçoit ===
  [INACTIVITE] Ton dossier Pays-Bas a été clos
```

Clos le 1er avril 2027, **deux ans avant sa première tâche**. La plateforme
lui avait fait un plan disant « rien à faire avant mai 2029 », puis l'a fermé
pour n'avoir rien fait. Ses pièces partaient à la purge trente jours plus
tard.

C'est une contradiction interne, pas une règle mal appliquée : les deux moitiés
sont justes séparément, et fausses ensemble. Le projet l'avait déjà rencontrée
— deux passes de nuit chacune correcte perdant la succession de version entre
elles (S.44).

**La règle retenue.** L'horloge part du **plus tard** entre ce que le candidat
a produit et sa **première échéance non faite**. Une échéance à venir la
suspend ; elle repart le jour où cette échéance arrive, et c'est bien là que
l'absence de geste devient un signe.

Trois cas, et ils tiennent ensemble :

| Le dossier | Ce qui se passe |
|---|---|
| Sans date cible, 400 jours | Clos — c'est le cas courant que RG-04.2 vise |
| Première échéance en 2029 | Rien, pas même une relance : il n'a rien à faire |
| Échéance passée depuis 400 jours | Clos, compté depuis l'échéance |

| Mutation | Ce qui vire au rouge |
|---|---|
| l'horloge ignore de nouveau le plan | la fumée |
| une échéance à venir ne suspend plus rien | les essais purs et la fumée |
| une échéance déjà faite compte quand même | la fumée — **après couverture** |

Trois mutations, trois rouges. La troisième n'a pas mordu d'abord : aucun
dossier de la fumée n'avait d'échéance **cochée**, et `doneAt: null` n'était
donc éprouvé par rien. La fumée porte désormais un candidat qui a tout coché
puis disparu — son plan ne lui demande plus rien, c'est son dernier geste qui
compte, et il date de plus d'un an. Sans le filtre, son dossier ne se
fermerait jamais.

**Ce qui reste ouvert.** Rien n'écrit encore `Deadline.doneAt` : aucun écran ne
permet de cocher une échéance. Le filtre est donc correct et pour l'instant
inerte en production — la fumée l'éprouve en posant la date directement, ce
que fera l'écran le jour où il existera.

---

### S.56 — On invitait à revenir quelqu'un qui venait de demander à partir

RG-10.4 : « une demande de suppression de compte purge immédiatement les
pièces et anonymise les métadonnées, sans attendre l'échéance. »

Le code la tient en **deux temps**, et il le dit : la demande ferme l'accès
tout de suite, l'anonymisation vient après la purge des pièces. Entre les
deux, le compte est « suppression demandée » — l'état qu'ouvre une panne du
stockage objet, et qui dure jusqu'à la reprise du lendemain. `deletedAt` y est
nul.

La question posée aux passes de nuit : **qu'envoient-elles à un compte dans cet
état ?**

```
=== Le compte ===
  suppression demandée  : il y a 2 jours
  anonymisé (deletedAt) : non — le stockage a résisté
  dossier purgé         : non

=== Ce qu'il reçoit, après avoir demandé l'oubli ===
  [ECHEANCE]   NL — etudes_mvv_vvr — une échéance est dépassée
  [INACTIVITE] Ton dossier Pays-Bas est en attente
               « … il sera clos le 12 mai 2027. Déposer une pièce suffit
                 à le garder ouvert. »
```

Les deux. Un candidat qui a demandé l'oubli deux jours plus tôt reçoit une
invitation à revenir déposer une pièce, et un rappel d'échéance dépassée.

La passe des rappels filtrait `deletedAt: null` — juste, et insuffisant :
c'est l'**achèvement** de la suppression, pas sa demande. La passe
d'inactivité, arrivée deux lots plus tôt, ne filtrait ni l'un ni l'autre.

**Le filtre porte donc sur la demande**, et il couvre les deux états : rien
n'efface `deletionRequestedAt`, un compte anonymisé le porte encore. Il vit à
un seul endroit — `COMPTE_JOIGNABLE`, dans le module qui sait ce que
« suppression en cours » veut dire.

| Mutation | Ce qui vire au rouge |
|---|---|
| la passe d'inactivité oublie le filtre | la fumée des transitions |
| les rappels reviennent à `deletedAt` seul | la fumée des rappels |

Deux mutations, deux rouges — et la seconde est la plus instructive : elle
montre que le filtre d'origine, qui semblait juste, laissait passer
exactement le cas qu'il devait couvrir.

**Ce que ce lot ne change pas.** L'état « suppression demandée » reste un
état d'incident : il n'apparaît que si le stockage objet était indisponible,
et `acheverLesSuppressionsEnAttente` le reprend chaque nuit. Le filtre ne le
raccourcit pas — il empêche seulement d'écrire à quelqu'un pendant qu'il dure.

---

### S.57 — On refusait d'ouvrir un dossier sur cette règle, et on acceptait d'y migrer

RG-14.1 : « une fiche dont `nextReviewAt` est dépassée **repasse
automatiquement en `DRAFT`** et disparaît de l'affichage utilisateur. Une
donnée non relue ne peut pas continuer à se présenter comme fiable. »

La veille dépubliait. L'arbitrage proposait quand même. Exécuté avant
correction :

```
=== 1. La veille passe ===
  fiches dépubliées : 1
  v2 : relecture au 2027-01-01, statut DRAFT

=== 2. Ce que l'écran d'arbitrage montre encore ===
  version proposée  : 2

=== 3. Et si le candidat accepte ? ===
  arbitrage : {"decision":"MIGRER",…}
  son dossier est désormais figé sur la v2, statut DRAFT
```

Le candidat accepte, et son dossier se fige sur une règle que la plateforme
a elle-même jugée non fiable. Sa checklist, son échéancier et ses conditions
en découlent.

**Le point qui tranche la question.** `ouvrirDossier` **refuse** d'ouvrir un
dossier sur cette règle : elle passe par `reglePubliee`, qui porte le filtre
candidat. La plateforme refusait donc d'y commencer et acceptait d'y aller.
Il n'y a pas d'arbitrage à rendre ici — c'est une incohérence entre deux
chemins vers le même état.

Le même filtre garde désormais les deux. Il couvre plus que la relecture
dépassée : une version archivée depuis qu'une v3 est parue en sort aussi, et
migrer vers elle aurait figé le dossier sur une règle que la suivante a déjà
remplacée.

**Ce qui n'est pas contradictoire avec le bloc RG-14.1 existant.** Une fiche
dépubliée pour retard **reste la version en vigueur** au sens de la
succession : sa mise en vigueur tient, sa fin n'est pas posée, et la version
suivante la trouvera comme prédécesseur. Ce que RG-14.1 lui retire, c'est de
se **proposer** au candidat. Les deux tiennent ensemble, et c'est la même
phrase qui le dit : « disparaît de l'affichage utilisateur ».

**« Conserver » reste ouvert, toujours.** C'est le choix sûr, et il met fin à
la pause d'une divergence critique. Fermer les deux laisserait le dossier
suspendu pour une relecture que le candidat ne peut pas faire avancer — il
serait puni du retard de nos veilleurs.

**L'écran le dit avant le clic.** L'option reste affichée et devient
indisponible, avec sa raison : la retirer ferait chercher ce qu'on a mal
fait, là où il n'y a rien à corriger de son côté. Proposer un bouton que le
serveur refusera est la même faute qu'un bouton qui ne fait rien (S.52).

| Mutation | Ce qui vire au rouge |
|---|---|
| le serveur accepte de nouveau | la fumée |
| l'écran la propose de nouveau | la fumée |
| « conserver » devient indisponible aussi | les essais purs et d'écran |

Trois mutations, trois rouges.

---

### S.58 — Le dossier qu'une publication manquée laissait en arrière pour toujours

S.57 refuse de migrer vers une version que la veille a retirée. Ce lot-là est
juste, et il a rendu visible une conséquence qui ne l'était pas.

La question : **que devient un candidat qui n'arbitre pas tout de suite ?**

```
=== 1. v2 paraît — le dossier est sur v1 ===
  propagation v1→v2 : {"dossiers":1,"alertes":1,…}

=== 2. Le candidat n'arbitre pas. v3 paraît. ===
  propagation v2→v3 : {"dossiers":0,"alertes":0,…}

=== 3. Ce que le candidat a devant lui ===
  divergence vers v2 (ARCHIVED) — migrable : false
  sa version figée  : v1
  la version en vigueur aujourd'hui : v3
  une divergence v1→v3 existe-t-elle ? false
```

Il est **sans issue**. Sa seule divergence pointe une v2 que v3 a archivée —
donc non migrable depuis S.57 — et aucune divergence v1→v3 n'existe : la
propagation ne visait que les dossiers de la version immédiatement
précédente, `visaRuleId: ancienne.id`.

Le défaut précède S.57. Avant, il pouvait migrer vers v2 : il atterrissait
sur une règle archivée — ce qui est faux aussi — et n'entendait toujours
jamais parler de v3. S.57 a transformé une mauvaise issue silencieuse en
impasse visible, ce qui est un progrès, mais une impasse reste une impasse.

**Deux corrections, et la seconde est la plus importante.**

La propagation vise désormais **toutes** les versions antérieures du même
pays et type de visa. Et la comparaison se fait depuis la version **du
dossier**, pas depuis celle que la publication remplace : un dossier resté
sur v1 doit lire ce qui sépare v1 de v3. Lui montrer le diff v2→v3 lui
cacherait la moitié de ce qui a changé pour lui — la fumée le vérifie sur le
montant de preuve de fonds, 10 000 → 15 000 et non 12 000 → 15 000.

`ancienneId` disparaît donc du travail de la file : la passe n'a besoin que
de la version publiée. Les jobs déjà en file le portent encore, et il est
simplement ignoré.

**Et une omission de S.56, réparée ici.** Ce lot-là filtrait les comptes en
cours de suppression dans les deux passes de nuit. La propagation d'une
divergence envoie elle aussi un courrier, et ne filtrait rien. Je l'avais
manquée.

| Mutation | Ce qui vire au rouge |
|---|---|
| la propagation revient à la seule version précédente | la fumée |
| le diff se calcule depuis la version remplacée | la fumée |
| la propagation écrit aux comptes en suppression | la fumée — **après couverture** |

Trois mutations, trois rouges.

**Ce que la fumée a appris au passage.** Ses blocs partageaient tous
`NL/etudes_mvv_vvr` : avec le nouveau ciblage, ils se comptaient les uns les
autres. Ce n'est pas le ciblage qui a tort — un dossier resté sur v1 **est**
concerné par la publication de v3 — c'est la fixture qui était accidentelle.
Chaque scénario a désormais sa propre procédure, le code pays servant
d'espace de noms.

---

### S.59 — Le motif qui nommait la mauvaise cause, et l'écran qui ouvrait la mauvaise divergence

Deux conséquences des deux lots précédents, et toutes deux visibles dès
qu'un dossier porte plus d'une divergence en attente.

**Le motif mentait sur la cause.** `reglePubliee` rend `null` pour deux
raisons, et S.57 n'en nommait qu'une :

```
=== L'état ===
  v2 : statut ARCHIVED, relecture au 2029-01-01 — parfaitement à jour
  la cause réelle : une version plus récente (v3) l'a remplacée

=== Ce que le candidat lit sur la divergence v1→v2 ===
  écran : « nos veilleurs la revérifient. Elle te sera proposée de
            nouveau une fois vérifiée. »
```

Elle ne le sera jamais : une version remplacée ne revient pas en vigueur. Le
message envoyait attendre une vérification qui n'a pas lieu, alors qu'une
divergence arbitrable l'attendait déjà. Une phrase actionnable qui désigne la
mauvaise cause est pire qu'une phrase vague — elle fait attendre.

Le blocage porte donc sa raison : `REMPLACEE` ou `EN_RELECTURE`, décidé par
la présence d'une version plus récente **en vigueur**. Les deux messages
disent des choses opposées, et c'est le point : l'une reviendra, l'autre non.

**L'écran ouvrait la mauvaise divergence.** Depuis S.58, un dossier resté sur
v1 en porte deux : v1→v2 (morte) et v1→v3 (vivante). La page prenait « la
plus ancienne non arbitrée » — ce qui était juste tant qu'un dossier n'en
portait qu'une. Le candidat devait écarter une comparaison sans objet avant
de voir celle qui compte. Elle ouvre désormais celle qui vise la version la
plus récente.

| Mutation | Ce qui vire au rouge |
|---|---|
| le blocage retombe toujours sur la relecture | la fumée |
| le serveur promet une vérification quoi qu'il arrive | la fumée |
| l'écran rouvre la plus ancienne | la fumée |

Trois mutations, trois rouges.

**Ce que ce lot a découvert et ne corrige pas.** En renommant `migrable` en
`blocage`, j'ai cassé deux assertions de `fumee-publication.mts` — et
`npm run typecheck` est resté vert. La raison : `tsconfig.json` inclut
`**/*.ts`, qui ne couvre pas `.mts`. **Les fumées ne sont pas typées**, alors
qu'elles sont la couche de vérification la plus précieuse du dépôt : un champ
renommé dans un module serveur les casse en silence, et seul un passage
complet le dit.

Étendre la portée fait apparaître deux défauts réels et antérieurs :

```
scripts/fumee-balayage.mts(349,5): TS1117 — An object literal cannot have
  multiple properties with the same name.
scripts/fumee-publication.mts(362,7): TS2554 — Expected 2 arguments, but got 1.
```

Une clé `user` écrite deux fois, et un `editorialDe("AE")` à un argument
masqué par un `as never`. C'est le lot suivant, et il tient debout seul.

---

### S.60 — La couche de vérification que le garde-fou ne regardait pas

Le lot précédent s'est terminé sur un constat : en renommant `migrable` en
`blocage`, j'ai cassé deux assertions de `fumee-publication.mts`, et
`npm run typecheck` est resté vert.

`tsconfig.json` incluait `**/*.ts`. Les fumées sont des `.mts`. **Elles
n'étaient pas typées** — alors qu'elles sont, dans ce dépôt, la couche qui
attrape ce qu'aucun essai pur n'attrape : un champ renommé dans un module
serveur les cassait en silence, et seul un passage complet le disait.

La portée étendue fait apparaître quatre défauts, tous antérieurs :

```
scripts/fumee-balayage.mts(349,5)    TS1117  clé « user » écrite deux fois
scripts/fumee-publication.mts(362,7) TS2554  editorialDe("AE") — un argument sur deux
scripts/fumee-transitions.mts(641)   TS2339  `loin.id` sur une chaîne
scripts/sandbox-paiement.mts(73,32)  TS2554  retrouver() — deux arguments sur trois
```

Plus `@types/pg`, absent, que tous les scripts touchent.

**Le troisième est le plus instructif, et il est de moi.** Il vient du lot
S.55 : `loin` est déjà un identifiant, et `${loin.id}` valait `undefined`.
L'`UPDATE` ne touchait aucune ligne, le dossier n'était donc **pas** antidaté,
et l'assertion « ni celui dont la première échéance est en 2029 » passait
parce qu'un dossier ouvert le jour même n'est inactif pour personne — pas
parce que l'échéance à venir suspendait l'horloge.

Elle passait pour la mauvaise raison. La mutation le confirme : avant
réparation, débrancher la suspension donnait `relances: 2` — le dossier était
relancé, pas clos ; après réparation, elle le ferme, et l'assertion mord pour
ce qu'elle prétend éprouver.

`editorialDe("AE")` mérite une ligne aussi : l'argument manquant était masqué
par un `as never`. Une assertion de type qui fait taire le compilateur fait
taire ce qu'il avait à dire.

**Ce que ce lot ne fait pas.** Il ne change aucun comportement du produit :
quatre scripts de vérification et un fichier de configuration. C'est le
garde-fou qu'il déplace, pas la règle.

---

## S.61 — La durée de validité dépendait de l'orthographe du code

RG-06.6 veut que les pièces à durée de validité limitée portent une date de
péremption et basculent en `EXPIREE`. Le mécanisme existe : `jobs/peremption.ts`
écrit l'état, le dépôt inscrit `expiresAt`, et le calendrier ajoute une échéance
« à demander au plus tôt ». Ce qui manquait, c'était la provenance de la durée.

`checklistDepuis` la déduisait d'un motif sur l'identifiant :

```ts
const PERISSABLES: readonly [RegExp, number][] = [
  [/releve|bancaire|ressources|fonds/iu, 3],
  [/casier|judiciaire/iu, 3],
  [/medical|sante/iu, 6],
];
```

Une durée de validité est une donnée réglementaire. Celle-ci dépendait de la
façon dont un code était épelé.

**Établi par exécution.** Renommer `preuve_fonds` en `moyens_financiers` — ce
que son propre libellé appelle déjà, « Justificatif de moyens financiers », et
qu'un éditeur peut faire depuis B-02, qui reçoit le payload entier :

```
CH, référentiel tel quel      : preuve_fonds → 3 mois
la même exigence, renommée    : aucune pièce périssable
```

Le candidat perdait l'échéance qui lui disait de ne pas demander son
justificatif trop tôt, et sa pièce ne périmait plus jamais. Sans un mot.

**Ce que la sonde a appris en chemin.** Le schéma a refusé le premier essai :
une condition nommait une pièce disparue, et `visaRulesSchema` ne laisse pas
passer un renvoi cassé. Le référentiel tient donc ses propres références. La
durée de validité était la seule propriété de l'exigence qui vivait **hors**
du référentiel — et la seule qui se perdait en silence. C'est le même défaut
que `nature`, corrigé de la même façon : une propriété de l'exigence appartient
à l'exigence.

`pieces_requises` porte désormais `validite_mois`, facultatif. Absent, la pièce
ne périme pas : la plateforme n'annonce pas une date de péremption qu'aucune
source ne porte (INV-8).

**Le transfert est neutre, et c'est vérifié.** Les trois durées que le motif
produisait sur le référentiel de référence sont portées telles quelles, sur les
mêmes pièces :

| règle | pièce | durée |
|---|---|---|
| `NL/etudes_mvv_vvr` | `preuve_fonds` | 3 mois |
| `NL/emploi_kennismigrant` | — | — |
| `CH/etudes_permis_b` | `preuve_fonds` | 3 mois |
| `AE/etudes_residence_etudiante` | `visite_medicale` | 6 mois |

Un test relit cette table entière : il passait avant le lot comme après, c'est
son rôle. Les quatre autres tombent si l'on remet le motif.

### Ce qui reste à arbitrer

**Trois durées identiques d'un pays à l'autre.** Les valeurs ci-dessus sont
celles que le motif produisait ; elles ne viennent d'aucune source nommée. Elles
sont désormais **lisibles et modifiables fiche par fiche** — un veilleur qui
reprend la fiche IND voit `validite_mois: 3` et peut la corriger, là où elle
était auparavant enfouie dans une expression régulière d'un module serveur.
Leur vérification appartient à la veille, pas au code.

**`assurance_maladie` n'en porte aucune.** Elle est obligatoire dans trois des
quatre règles, et une attestation d'assurance a un terme. Le motif ne
l'attrapait pas non plus — `/medical|sante/` ne reconnaît pas `maladie`. Je ne
lui en invente pas : ce serait affirmer une durée réglementaire sans source,
ce qu'INV-8 interdit. C'est une lacune de **contenu**, à combler par la veille.

**Une durée qui change d'une version à l'autre n'apparaît pas dans
l'arbitrage.** `comparaison.ts` compare les pièces par code et libellé. Une
version qui ferait passer le relevé de trois à six mois déplacerait l'échéance
du candidat sans le dire sur l'écran de divergence. C'est un lot à part.

---

## S.62 — L'écran promettait une ligne que la migration ne posait pas

`arbitrerLaDivergence` n'ajoutait que les pièces dont le **code** était inconnu
du dossier. Une pièce qui survit à la migration gardait donc toutes les
propriétés de l'ancienne version.

L'écran de divergence, lui, annonce « ajoutée » toute pièce devenue
**obligatoire** — c'est ce qui compte pour le candidat, et c'est ce que
`evolutionDesPieces` calcule. Les deux ne parlaient pas de la même chose.

**Établi par exécution.** Un dossier ouvert sur une v1 où le diplôme est
complémentaire, une v2 qui le rend obligatoire, périssable à six mois, et à
obtenir par démarche :

```
l'écran annonce  : ajoutées = [« Diplôme le plus élevé, légalisé »]
le candidat migre
l'arbitrage rend : piècesAjoutées = []
en base          : obligatoire=false  famille=COMPLEMENTAIRE
                    remède=TELEVERSER  validité=null
                    libellé=« Diplôme »
```

Quatre conséquences, et toutes vont dans le sens rassurant :

1. la pièce que la nouvelle règle exige ne compte pas parmi les requises,
   donc le dossier peut être déclaré **prêt sans elle** ;
2. le bouton dit « Ajouter » pour un examen à passer ;
3. la pièce ne périme jamais, et n'a pas d'échéance « à demander au plus tôt » ;
4. le libellé décrit une exigence qui n'est plus celle du dossier.

C'est le pendant exact de `remplacementDeLEcheancier` (S.53), qui a corrigé le
même oubli sur les échéances et n'a pas regardé la checklist. Migrer accepte la
nouvelle version **en entier**, pas seulement les pièces qu'elle invente.

**Ce qui suit la règle, et ce qui appartient au candidat.** Seules se
réalignent les cinq propriétés que `checklistDepuis` dérive du référentiel :
libellé, famille, caractère obligatoire, remède, durée de validité. `status`,
le fichier déposé, l'extraction, le retour d'analyse et `expiresAt` traversent
intacts — RG-11.1, « on ajoute, on ne retire pas ». Une migration qui renverrait
le candidat redéposer ce qu'il a fourni punirait l'acceptation de la règle.

Deux mutations le confirment : débrancher les réécritures fait tomber les
quatre assertions sur l'exigence et laisse vertes les deux qui veillent sur son
travail ; ne rendre que les pièces créées fait tomber celle qui compare l'écran
au résultat.

### Ce qui reste à arbitrer

**`expiresAt` n'est pas recalculé.** Une pièce déposée sous une validité de
trois mois porte une péremption calculée sur trois mois ; si la nouvelle version
en annonce six, la date ne bouge pas. La recalculer demanderait la date de dépôt
— déductible de `expiresAt` moins l'ancienne durée, ou lisible sur
`DocumentVersion` — et surtout de décider ce qu'on annonce au candidat : une
date de péremption qu'il a déjà vue et qui recule est une information, pas une
correction silencieuse. Lot à part.

**Une durée de validité qui change n'apparaît pas dans l'arbitrage.**
`comparaison.ts` compare les pièces par code et par caractère obligatoire. Le
candidat voit désormais la bonne durée **après** avoir migré, pas avant de
choisir. Même famille que le point ci-dessus, même lot à ouvrir.

---

## S.63 — La pièce que plus personne ne réclame bloquait toujours

Le symétrique de S.62, trouvé en cherchant ce que le réalignement ne couvrait
pas. Une pièce **absente** de `pieces_requises` n'était ni créée ni réalignée :
elle restait `OBLIGATOIRE` et `required`, donc comptée parmi les requises par
`computeCompleteness`.

**Établi par exécution.** Un dossier dont tout est fourni sauf le diplôme, et
une v2 qui cesse de l'exiger :

```
l'écran annonce  : retirées = [{ diplome, encoreDemandee: false }]
le candidat migre
en base          : obligatoire=true  famille=OBLIGATOIRE
son dossier      : ACTIF — prêt=false
```

Le candidat lit « ta checklist perd : Diplôme », fait le geste, et son dossier
reste bloqué sur une exigence que plus personne ne réclame. Après correction, le
même scénario le rend `PRET`.

**Ce que RG-11.1 protège, et ce qu'elle ne protège pas.** « On ajoute, on ne
retire pas » protège le **travail du candidat** : la ligne reste, le fichier
déposé avec elle, et le statut ne bouge pas. Elle ne protège pas une exigence
qui a disparu du référentiel. La pièce passe donc en `COMPLEMENTAIRE`,
`required: false`, et cesse de compter.

Une pièce devenue simplement **complémentaire** figure encore dans la nouvelle
checklist : elle se réaligne comme les autres, et ce chemin était déjà correct.
Seule la disparition complète manquait.

L'arbitrage rend désormais `piecesLiberees` à côté de `piecesAjoutees` : ce que
la migration a cessé d'exiger est nommé, comme ce qu'elle exige en plus.

### Ce qui reste à arbitrer

**L'écran ne lit toujours pas la réponse de l'arbitrage.** `piecesAjoutees` et
`piecesLiberees` traversent la route et sont jetées par `DivergenceReglementaire`,
qui se contente de `router.refresh()`. Le candidat retrouve l'information sur sa
checklist, mais pas au moment du geste, là où elle confirmerait ce qu'il vient
de décider. Lot à part, et petit.

---

## S.64 — La durée de validité qui changeait sans que rien ne bouge

Consigné deux fois comme « lot à part » en S.61 puis en S.62. En l'ouvrant, il
s'est révélé plus large que ce que j'avais écrit : ce n'était pas seulement un
écran muet.

**Établi par exécution.** Deux versions NL identiques, sauf que `preuve_fonds`
passe de trois à six mois :

```json
{ "impact": "MINEUR", "diff": [], "piecesTouchees": { "ajoutees": [], "retirees": [] } }
```

`propagerLaPublication` fait `continue` sur `MINEUR` avec un diff vide. Donc
**aucune divergence, aucune notification**, et le dossier garde l'ancienne durée
pour toujours — l'arbitrage étant le seul chemin qui réaligne sa checklist. Le
lot S.62 rendait le réalignement correct ; encore fallait-il qu'il ait lieu.

**Le sens n'est pas symétrique, et c'est ce qui fait mal.** Une durée
**allongée** laisse demander la pièce plus tôt : rien n'est perdu. Une durée
**raccourcie** rend périmée, le jour du dépôt, une pièce demandée à la date que
l'échéancier annonçait — obtenue dans les temps, et refusée. C'est exactement ce
que le calendrier candidat promet d'éviter : « Cette pièce vaut 3 mois, et doit
être valable le jour du dépôt. »

`EvolutionDesPieces` porte donc une troisième liste, `validites`, et l'écart
entre au diff. L'impact devient `MAJEUR`, jamais `CRITIQUE` : comme le délai
d'instruction, une durée qui bouge gêne, elle ne rend pas inéligible.

**La ligne d'écran nomme le sens**, parce que c'est le sens qui décide s'il faut
refaire une démarche :

```
valable 3 mois au lieu de 6 mois : à demander plus tard qu'annoncé
valable 6 mois au lieu de 3 mois : tu peux la demander plus tôt
valable 3 mois, à demander moins de 3 mois avant le dépôt
ne périme plus
```

« Sa durée de validité change » aurait été vrai et inutile.

**La comparaison ne filtre pas sur l'obligation**, contrairement aux pièces
ajoutées et retirées. Une pièce complémentaire périssable porte elle aussi une
échéance « à demander au plus tôt », et l'obtenir trop tôt la rend inutilisable
de la même façon.

### Ce qui reste à arbitrer

**`expiresAt` n'est toujours pas recalculé** — le point ouvert en S.62 tient. Le
candidat qui a déjà déposé sa pièce sous six mois garde une péremption calculée
sur six, alors que sa checklist en annonce trois. C'est désormais visible : la
divergence le prévient avant qu'il tranche, et la date, elle, ne suit pas.

---

## S.65 — La pièce périmée que la plateforme déclarait conforme

Le point ouvert en S.62 puis en S.64. Je l'avais écrit comme demandant un
arbitrage produit : « une date de péremption qu'il a déjà vue et qui recule est
une information, pas une correction silencieuse ». En l'ouvrant, l'arbitrage
s'est dissous — parce que la plateforme sait déjà dire cette information, et
parce que ne rien faire n'était pas la position neutre.

`expiresAt` est calculée **au dépôt**, à partir de la durée d'alors. Migrer vers
une version qui raccourcit cette durée la laissait telle quelle.

**Établi par exécution.** Une pièce déposée le 22 avril sous une validité de
douze mois, une v2 qui la ramène à trois :

```
après migration : validité annoncée 3 mois
                  péremption        2027-04-22   statut CONFORME
                  ce qu'elle vaut   2026-07-22

la passe de péremption du jour : {"pieces":0,"dossiers":0,"redescendus":0}
```

La pièce était périmée depuis deux mois. La checklist annonçait trois mois, la
pièce en portait douze, et les deux se contredisaient sur le même écran. La
passe de péremption ne trouvait rien à déclasser, et le dossier pouvait être
déclaré prêt sur une pièce que l'autorité refuserait.

**Pourquoi il n'y avait pas d'arbitrage à rendre.** Ne pas recalculer, ce
n'était pas s'abstenir : c'était affirmer une validité que la règle du dossier
dément. Et la suite ne demande rien d'inventé —
`declasserLesPiecesEchues` reprend la pièce à sa passe suivante, la passe en
`EXPIREE`, pose `remedy: REMPLACER` et écrit le message actionnable qu'elle sait
déjà écrire. Vérifié de bout en bout :

```
la péremption se recalcule depuis le dépôt      : 2026-07-22
la passe du jour la déclasse et dit quoi faire  : EXPIREE/REMPLACER
```

**La date se lit, elle ne se déduit pas.** Le recalcul part de `uploadedAt` de
la dernière version — la date de dépôt réelle —, et non de `expiresAt` moins
l'ancienne durée. Les deux donneraient le même résultat aujourd'hui ; la
soustraction cesserait d'être vraie le jour où une péremption serait écrite par
un autre chemin.

Une pièce **sans version déposée** n'est pas touchée : sans dépôt, il n'y a pas
de date de départ, et une péremption sans dépôt ne veut rien dire.

**Une assertion qui passait pour la mauvaise raison.** Celle de S.62, « la
péremption calculée au dépôt n'est pas déplacée », passait encore après ce
correctif — mais parce que sa fixture n'avait aucune `DocumentVersion`, pas
parce que la règle tenait. Elle porte désormais une version déposée et vérifie
la date recalculée. La frontière de S.62 s'affine : `status`, le fichier,
l'extraction et le retour d'analyse appartiennent au candidat ; la **péremption**
se déduit de son dépôt et de la règle, et suit donc la règle.

---

## S.66 — La réponse du serveur que l'écran jetait

Le dernier point ouvert de la famille des migrations, consigné en S.63.

Avant le clic, l'écran promettait au futur : « Ta checklist Pays-Bas **sera**
mise à jour. » Après le clic, la feuille se fermait et la page se
rafraîchissait. Le serveur, lui, rendait la liste des pièces ajoutées et des
pièces libérées :

```
appeler(…) → { ok: true, donnees: { piecesAjoutees: [« Diplôme… »],
                                     piecesLiberees: [« Casier… »] } }
l'écran     : onFermer(); router.refresh();
le candidat : rien
```

La promesse au futur n'était jamais rendue au passé. Le candidat retrouvait
l'information sur sa checklist s'il pensait à la relire, mais pas au moment du
geste, là où il venait de décider — et sur une décision que le serveur refuse
de rejouer.

**Trois lots ont enrichi cette réponse sans que rien ne la regarde.** S.62 y a
mis les pièces durcies, S.63 les pièces libérées. Une donnée que personne ne
lit est une donnée dont on ne sait pas si elle est juste : c'est le même angle
mort que S.52, où `piecesAjoutees` existait déjà sans lecteur.

**L'ordre des lignes porte l'information.** Ce qui demande un geste vient en
premier : une pièce à fournir en plus change le travail du candidat
aujourd'hui. Ce qui est libéré vient ensuite, avec la précision qui compte —
la ligne reste, le document déposé aussi —, parce que « n'est plus demandée »
se lit facilement comme « jette-la ».

**La phrase de clôture vient du serveur.** `confirmationDArbitrage` reçoit la
`mention` que l'arbitrage a rendue au lieu de la réécrire : deux copies de la
même phrase finiraient par diverger, et c'est celle qui accompagne l'écriture
qui fait foi. C'est la leçon de S.42 appliquée à un texte plutôt qu'à une
fonction.

**Une fois l'arbitrage écrit, la feuille ne montre plus les options.** Elles
décrivent un choix qui n'est plus à faire, et le bouton ne mènerait qu'à un
refus : `arbitrerLaDivergence` rejette un second arbitrage. C'est le candidat
qui ferme, une fois la confirmation lue.

**Un test a changé de sens, et c'est voulu.** « Ne se ferme qu'une fois écrit »
vérifiait que la feuille disparaissait après succès. Elle reste désormais
ouverte pour porter la confirmation ; l'assertion sur le rafraîchissement, elle,
tient toujours et garde son nom propre.

---

## S.67 — Le pack annonçait trois destinations et n'en servait qu'une

Trouvé en balayant les règles de DOC-11 qui n'apparaissent nulle part dans le
code. Deux fausses pistes d'abord, et elles méritent d'être notées :

- **RG-12.5** (suppression de compte, libération des créneaux) est tenue, et
  soigneusement — elle est implémentée sous le nom de son arbitrage, `K.C`, pas
  sous son numéro. Un balayage par numéro de règle ne la voyait pas.
- **RG-03.1** (« la comparaison au-delà de 3 destinations est réservée au pack
  supérieur ») n'est **pas** violée : WF-03 étape 3 pose « vue comparative
  jusqu'à 3 destinations » comme le socle, et trois destinations exactement sont
  publiées. Je l'avais d'abord lue comme une brèche ouverte ; elle ne le devient
  que le jour où une quatrième fiche paraît.

Le vrai défaut était à côté. `Pack.destinations` — Essentiel 1, Dossier 1,
Pro 3 — est déclaré sur les trois packs et **lu par aucun code** : ni le
serveur, ni un écran, ni un test.

**Établi par exécution**, après l'achat d'un Pro à 45 000 XOF dont le badge
annonce « Trois destinations comparées en parallèle » :

```
dossier 1 : 90 analyses
dossier 2 : 0
dossier 3 : 0
destinations réellement couvertes : 1 sur 3
```

`crediterLAchat` ouvrait `pack.analyses` sur le seul `applicationId` porté par
la transaction. Le candidat payait pour trois destinations et n'en recevait
qu'une de servie.

### Ce que la grille dit, et ce qu'elle ne dit pas

**90 = 3 × 30** : une destination de Pro ouvre exactement ce qu'ouvre un pack
Dossier. C'est cette arithmétique qui fixe la part, et elle tombe juste sur les
trois packs.

Le **prix**, en revanche, n'est pas une multiplication. 45 000 XOF font bien
trois fois 15 000, mais **59 € ne font pas trois fois 29 €** — Pro est un lot
remisé en euros. Je l'avais écrit comme une preuve de linéarité ; le test
`tarification` l'a démenti avant que ça n'atteigne une PR, et la formulation a
été corrigée partout. Le prix conforte la lecture « trois destinations », il ne
la démontre pas.

### La couverture se déduit, elle ne se stocke pas

`AnalysisCredit` porte déjà `transactionId`. Les destinations qu'un achat a
couvertes, ce sont les dossiers distincts qu'il a crédités — rien à mémoriser,
rien à tenir à jour, rien qui puisse diverger. C'est le choix qu'avait fait le
solde, et pour la même raison.

Elle s'applique à deux moments, et deux seulement : la confirmation du paiement,
qui sert le dossier visé puis rattrape les dossiers déjà ouverts que rien ne
sert, et chaque ouverture de dossier. Sans le rattrapage, un candidat ayant deux
dossiers ouverts avant d'acheter aurait retrouvé le même défaut en plus étroit.

### Ce que la mutation a révélé

Débrancher la couverture à la confirmation, en gardant celle de l'ouverture,
donne **150 analyses pour un pack de 90** : 90 sur le dossier visé, puis 30 + 30
sur les deux suivants. Les deux moments doivent s'accorder, et c'est l'assertion
sur le total ouvert qui le garantit — pas celle sur le nombre de destinations,
qui reste verte dans cette mutation.

### Conséquence assumée

Un acheteur de Pro qui n'ouvre **qu'un** dossier y reçoit désormais trente
analyses et non quatre-vingt-dix. Les deux destinations restantes ne sont pas
perdues : elles s'ouvrent quand il ouvre les dossiers, sans limite de temps.
Mais elles ne se reportent pas sur le premier.

C'est le sens de « trois destinations ». Cumuler quatre-vingt-dix analyses sur
un seul dossier, c'est acheter trois fois Dossier — ce que le produit permet
déjà, et que le code commente explicitement. **Si cette lecture n'est pas la
bonne, c'est ici qu'il faut revenir** : le reste du lot en découle.

---

## S.68 — Deux calculs de la même chose, et un seul voyait les conditions

`completudeDesPieces` appelait `computeCompleteness` avec `conditions: []`, en
dur. `recalculerCompletude`, côté serveur, les évaluait pour de bon et décidait
le passage à `PRET`. Les deux prétendaient répondre à « le dossier est-il
prêt ? », et l'un ignorait la moitié de la question.

**Établi par exécution**, sur un dossier dont **toutes** les pièces sont
conformes et dont la règle figée porte une condition bloquante qu'aucune pièce
n'établit :

```
la vue candidat : palier COMPLET, ready true, missing []
                  « Rien ne bloque un dépôt. »
la base         : ACTIF — le serveur a refusé de le déclarer prêt
```

Le candidat lisait que rien ne bloquait son dépôt sur le seul dossier que la
plateforme ne le laisserait pas déposer : `declarerLeDepot` n'accepte que
`PRET`.

Le commentaire de `completudeDesPieces` promettait pourtant que « le tableau de
bord, la checklist et l'écran de complétude comptent la même chose ». Ils
comptaient bien la même chose — **entre eux**. Aucun des trois ne comptait comme
la base.

### Une seule évaluation, dans le domaine

`conditionTenue` vivait dans le module d'accès du serveur. Elle est pure, et
elle est désormais dans `domain/completeness/conditions.ts` avec
`conditionsDeLaRegle` — une lecture **défensive** de la règle figée, sur le
modèle de `delaiInstructionJours` : une règle gelée par un dossier ouvert avant
une évolution du référentiel doit rester lisible (INV-3), et une vue candidat n'a
pas à échouer parce qu'un champ a changé de forme.

Quatre appelants la partagent : la vue du dossier, l'écran de complétude,
l'export de portabilité, et `recalculerCompletude`.

### La faute que j'ai failli commettre, et qui aurait tout cassé en silence

J'ai d'abord construit l'ensemble des pièces conformes depuis les `Piece` de
l'écran. `versPiece` fait pourtant :

```ts
code: codeCourt(document.code)   // `passeport` → `PAS`
```

`Piece.code` est une **pastille de trois lettres**, pas le code du référentiel.
Rapprocher `PAS` de `passeport` ne rapproche rien : **toutes** les conditions se
lisaient non satisfaites, sur tous les dossiers. La sonde l'a montré du premier
coup — trois conditions en échec là où une seule devait l'être — mais ni le
typage ni aucun test existant ne l'aurait dit.

L'ensemble se construit donc depuis les **documents**, et l'appelant le fournit :
`completudeDesPieces` ne peut pas le déduire de ce qu'elle reçoit. C'est la même
leçon que le rattachement des conditions aux pièces — **la relation se déclare,
elle ne se devine pas** — et je l'ai réapprise en une heure.

### Le garde-fou d'architecture a mordu

Ma première version lisait la règle figée depuis la route de complétude, avec un
`db.visaRule.findUnique`. `tests/api-invariants.test.ts` l'a refusée : INV-4 veut
que le référentiel ne soit interrogé que depuis le module d'accès, et le test lit
le **source des routes** pour le vérifier.

La règle vient donc avec le dossier, dans `dossierAvecPieces` — et sans le filtre
candidat, parce qu'INV-3 la garde au dossier même archivée ou retirée de la
vitrine.

### Ce que l'écran dit maintenant

`prochaineAction` nommait « Rien ne bloque un dépôt » dès que la checklist était
servie. Elle nomme désormais la première exigence bloquante non tenue, avec son
`message_echec` du référentiel — écrit pour être lu par le candidat (RG-07.1).

### Ce qui reste à arbitrer

**La portée du défaut est étroite aujourd'hui, et c'est important de le dire.**
Une condition bloquante sans pièce est refusée à la publication : elle ne
subsiste que sur une règle **figée avant cette garde**. Sur une règle publiée
aujourd'hui, les deux calculs coïncidaient déjà. Ce lot corrige la structure —
deux calculs devenus un — plus qu'un incident de production observable sur le
référentiel actuel.

**`compteurs.obligatoiresManquantes` additionne les pièces et les conditions.**
C'est l'usage existant de `computeCompleteness` (`requisManquants.length +
conditionsEchouees.length`), que ce lot ne change pas — mais le nom dit
« obligatoires manquantes » et compte désormais, sur le chemin de l'écran, des
choses qui ne sont pas des pièces. À renommer ou à scinder, dans un lot à part.

---

## S.69 — Une exigence n'est pas une pièce

Le point que S.68 avait laissé ouvert, et qu'il avait lui-même rendu visible.

`compteurs.obligatoiresManquantes` additionnait les pièces obligatoires non
conformes **et** les conditions bloquantes non tenues :

```ts
obligatoiresManquantes: requisManquants.length + conditionsEchouees.length,
```

Tant que le chemin des écrans passait `conditions: []`, la somme ne portait que
des pièces et personne ne pouvait le voir. S.68 a réuni les deux calculs — et a
donc mis des conditions dans un compteur nommé « pièces obligatoires ».

**Établi par exécution**, sur un dossier dont toutes les pièces sont conformes et
dont une seule condition bloque :

```
compteurs    : {"obligatoiresManquantes":1,"conformes":2}
dénombrement : « 1 pièce obligatoire manque »
```

Le candidat lisait « 1 pièce obligatoire manque », descendait d'un écran, et
trouvait une checklist entièrement verte. La contradiction était visible à
l'œil nu, et elle envoyait chercher quelque chose qui n'existe pas.

**Quatre textes lisaient ce compteur**, tous en disant « pièce » :
l'en-tête de complétude (C-01 et C-09), l'explication du palier, le message de
progression d'une alerte, et le résumé du tableau de bord.

### L'explication disait aussi le contraire d'elle-même

`CE_QUI_NE_PESE_PAS` rangeait les conditions parmi ce qui ne pèse pas. C'était
vrai avant S.68. Depuis, elles pèsent — l'explication du palier contredisait
donc le palier qu'elle explique. Elles passent dans `CE_QUI_DECIDE`, à la place
que leur poids leur donne : après les pièces obligatoires, avant les
complémentaires.

### Le compteur se scinde, les phrases suivent

`exigencesNonTenues` rejoint `obligatoiresManquantes`, qui ne compte plus que
des pièces. Chaque texte nomme ce qu'il compte :

```
« 1 exigence n'est pas remplie »
« 1 pièce obligatoire manque, 2 exigences ne sont pas remplies »
« 1 dossier ouvert, 1 exigence à lever. »
```

Et l'explication dit **où ne pas chercher** : « aucune pièce ne la lève ».

**Le résumé du tableau de bord aurait fait reparaître la contradiction par la
porte d'à côté.** Il somme `obligatoiresManquantes` sur les dossiers et conclut
« rien ne bloque un dépôt » à zéro. Le compteur ne portant plus que des pièces,
un dossier bloqué par une seule exigence serait redevenu « rien ne bloque » —
exactement ce que S.68 venait de supprimer. Il somme donc les deux.

### Une faute d'accord, attrapée en la relisant

La première version de la phrase des exigences composait l'accord morceau par
morceau et produisait « n'est pas remplies ». Deux gabarits complets
remplacent le nid de ternaires : l'accord porte sur le verbe, le participe et
le pronom à la fois, et une phrase assemblée bout à bout finit par en accorder
un et pas l'autre. Un test fige les deux formes.

### Ce que la mutation dit

Remettre la somme fait tomber **huit** des douze assertions, sur les quatre
textes à la fois. Les quatre qui restent vertes sont les témoins : ce que le
lot ne devait pas changer.

**Suite, dans le même lot.** `libelleBlocage` — la barre d'action sous la
checklist de C-09 — ne comptait elle aussi que des pièces. Les deux phrases
s'affichaient donc ensemble, à quelques lignes d'écart :

```
en-tête : « 1 exigence n'est pas remplie »
blocage : « Rien ne bloque le dépôt »
palier  : INCOMPLET — prêt : false
```

Elle reçoit le nombre d'exigences plutôt que de le déduire : elle ne voit que
des pièces, et une pièce ne dit rien d'une exigence qu'aucune pièce n'établit.
Le verbe s'accorde sur l'ensemble et non sur le dernier membre — « 1 pièce et
1 exigence **bloquent** le dépôt ».

C'est la troisième phrase de la même famille corrigée en deux lots
(`prochaineAction`, le dénombrement, le blocage), et elles se sont révélées une
par une. Plutôt que d'attendre la quatrième, j'ai balayé les fonctions
exportées qui concluent à partir des seules pièces.

### La quatrième, trouvée en balayant plutôt qu'en attendant

`libelleAPreparer` prépare un **rendez-vous payant** de quarante-cinq minutes
avec un consultant. Sur un dossier dont toutes les pièces sont conformes et
qu'une exigence tient à « incomplet », elle disait :

> « Toutes les pièces demandées sont conformes : l'appel peut porter sur le
> fond du dossier. »

Le candidat entrait dans l'appel en croyant n'avoir rien à y régler, et le seul
sujet qui restait n'était pas nommé — alors que c'est **exactement** ce qu'un
consultant sait débloquer et pas la plateforme : une exigence de l'autorité
qu'aucun téléversement ne lève.

L'exigence passe donc devant les pièces dans la phrase, parce qu'elle ne se
règle pas en téléversant.

**La leçon.** Quatre phrases, quatre fois la même cause : une fonction qui
conclut à partir des seules pièces, dans un produit dont le calcul en voit
davantage depuis S.68. Les trois premières se sont révélées une par une, en
production de la suivante ; la quatrième a été trouvée par un balayage des
signatures `(pieces: readonly Piece[])`. C'est le balayage qu'il fallait faire
au moment de S.68, et pas trois lots plus tard.

---

## S.71 — La section qui promettait les blocages n'en listait qu'une sorte

Le balayage de S.70 s'était arrêté aux fonctions du domaine. Il restait l'écran.

C-09 porte une section intitulée **« Ce qui bloque le dépôt »**, remplie depuis
`grouperPourCompletude(pieces).bloquantes`. Sur un dossier dont toutes les
pièces sont conformes et qu'une exigence tient à « incomplet », elle affichait
son état vide :

> « Aucune pièce obligatoire ne manque. »

Vrai sur les pièces. Muet sur le seul blocage — sous un titre qui promet de les
énumérer.

**Et la barre d'action du même écran appelait `libelleBlocage(pieces)` sans le
compteur.** S.70 avait corrigé la fonction et son appel dans la route, pas
celui-ci : le correctif n'atteignait donc pas l'écran qu'il visait. C'est la
cinquième occurrence de la même cause, et la première que j'ai introduite en
croyant la refermer.

### Distinguer une pièce d'une exigence dans la liste des manques

`MissingPoint` ne portait que `code`, `message`, `bloquant` : les deux sortes
s'y lisaient pareil, et l'écran ne pouvait pas les séparer. Les rapprocher par
le code était exclu — `Piece.code` est une pastille de trois lettres, et
rapprocher `PAS` de `passeport` ne rapproche rien (la faute de S.68, qui n'est
pas à refaire).

`origine: "piece" | "exigence"` se déclare donc là où c'est connu, dans
`computeCompleteness`. C'est aussi le premier lecteur d'écran que `missing` ait
jamais eu : la liste existait depuis le début et seul l'export la lisait.

### Ce que la section montre, et ce qu'elle ne montre pas

Le message du référentiel, tel quel. **Aucun lien** : ces exigences ne se lèvent
pas par un dépôt, et un bouton mènerait à un écran qui ne peut rien pour elles.
Et une phrase qui dit où ne pas chercher — « aucune pièce de ta checklist ne
lève cette exigence ».

### Ce qui reste ouvert

**Le balayage n'est toujours pas prouvé complet.** Cinq occurrences, trouvées
par trois méthodes différentes : l'exécution, la lecture des signatures, puis
la lecture des écrans. Rien ne garantit qu'un sixième endroit ne conclut pas
depuis les seules pièces — un écran de démonstration, un courriel, un export.
Ce qui manque est un garde-fou, pas un correctif de plus : un test qui refuse
qu'une conclusion sur le dépôt se calcule sans le compteur d'exigences. Je ne
sais pas encore l'écrire sans qu'il soit un test de source, ce que S.1 a
enseigné à se méfier.

## S.72 — Le garde-fou, et la sixième occurrence qu'il a trouvée

S.71 s'est arrêté sur une phrase : « ce qui manque est un garde-fou, pas un
correctif de plus ». Ce lot l'écrit. Il a trouvé la sixième occurrence en
moins d'une minute, et ce n'est pas une coïncidence : c'est ce qui distingue
un garde-fou d'un correctif.

### Ce que la valeur par défaut rendait légal

S.70 a donné un second paramètre à `libelleBlocage` et `libelleAPreparer`,
avec une valeur par défaut : `exigences = 0`. La valeur par défaut est
exactement le trou. Elle rend l'omission légale, silencieuse et rassurante —
un appelant qui ne connaît pas le paramètre obtient la phrase d'avant, sans
rien voir.

C-06 l'appelait ainsi. Sur un dossier dont toutes les pièces sont conformes
et qu'une exigence tient à « incomplet », l'écran affichait, de haut en bas :

    Dossier incomplet
    1 exigence n'est pas remplie
    8 pièces déjà conformes
    […]
    Rien ne bloque le dépôt

Soixante-dix lignes d'écart, le même écran, la contradiction complète. Le
compilateur l'a nommée dès que la valeur par défaut a disparu ; six lots de
lecture ne l'avaient pas vue.

### Le garde-fou : le type, pas le test

`libelleBlocage` ne reçoit plus de pièces du tout. Les deux nombres qui
décident vivent ensemble dans `compteurs`, et le type `CompteursDeBlocage`
les extrait de là plutôt que de les redéfinir. `prochaineAction` perd de même
ses deux paramètres facultatifs.

Il n'y a donc plus d'appel qui conclue à partir des seules pièces, parce que
le type n'en accepte plus. Écrire `{ obligatoiresManquantes: 0,
exigencesNonTenues: 0 }` reste possible — c'est alors une affirmation qui
apparaît dans la diff et se justifie, comme une entrée de
`copy-exceptions.json`, et non un oubli.

Au passage, une seconde implémentation disparaît : `libelleBlocage`
recomptait ses bloquantes avec `grouperPourCompletude`. Les deux comptages
ont été comparés sur les 256 combinaisons de deux pièces avant le
déplacement — ils ne diffèrent jamais. C'est ce qu'il fallait établir pour
que le déplacement ne change rien d'autre.

### Le dossier témoin

Un fixture, une fois : toutes les pièces conformes, une exigence de la règle
figée qu'aucune pièce ne lève. Cinq phrases de conclusion passent dessus dans
un `it.each`, et aucune n'a le droit de rassurer. Le contrôle négatif vérifie
que les mêmes phrases rassurent bien quand plus rien ne bloque — sans lui, le
tableau passerait aussi sur un code qui ne saurait plus rien dire.

Les deux sens ont été vérifiés par mutation : `libelleBlocage` qui ignore les
exigences fait tomber quatre tests, `libelleAPreparer` qui tait la mention en
fait tomber trois, et une phrase qui alarme sans raison fait tomber le
contrôle négatif.

### Ce que ce garde-fou ne fait pas

Il ne découvre pas une septième phrase. Aucun test ici ne lit les sources :
S.1 a enseigné qu'un test qui grep le dépôt vérifie l'écriture et non le
comportement. Le tableau **nomme** l'invariant et offre l'endroit où une
septième ligne s'ajoute ; ce qui rend l'omission impossible est le type.

Une fonction entièrement nouvelle qui conclurait depuis `readonly Piece[]`
reste écrivable. Ce qui ne l'est plus, c'est de la brancher sur les phrases
existantes sans que le compilateur le demande.

## S.73 — Les deux tiers du pack qui n'étaient nommés nulle part

S.67 a fait couvrir au pack Pro les trois destinations qu'il annonce. La
répartition était juste et **muette**. Sondé sur PostgreSQL à l'instant où
l'écran s'affiche, après un Pro à 45 000 XOF :

```
l'écran annonce : « Ton dossier est ouvert. »
destinations    : 3 payées, 1 servie
analyses        : 90 payées, 30 ouvertes
```

Les deux tiers de l'achat existent, lui sont réservés, et ne sont nommés
nulle part. C'est plus qu'une omission : la couverture ne s'applique qu'à
**l'ouverture d'un dossier**, et rien ne demandait au candidat d'en ouvrir
un. Un candidat qui n'ouvre jamais de second dossier ne reçoit jamais ce
qu'il a payé — et ce qu'il a payé est précisément la comparaison de
plusieurs destinations, c'est-à-dire ce pour quoi il a choisi ce pack.

Le correctif de S.67 avait donc créé ce silence : avant lui, les 90
analyses partaient sur le seul dossier visé, et il n'y avait rien à
annoncer.

### La phrase

Elle nomme le reste, dit le geste qui le débloque, et s'arrête là. « Sans
repayer » est la moitié de l'information qui compte : sans elle, la phrase
se lit comme une proposition d'achat sur l'écran où l'on vient de payer.
Elle est nulle quand il n'y a rien à dire — un pack à une destination, une
couverture déjà prise — parce qu'une phrase annonçant zéro destination
restante est un bruit.

### Une seule dérivation, pas deux

`destinationsServies` est extraite de `couverture.ts` et lue par l'écran.
Elle décide à la fois **ce qui s'ouvre** et **ce qu'on annonce** : deux
mesures de la même chose finissent par diverger, et le candidat verrait
cette contradiction-là avant nous. La lecture reste séparée du reçu, comme
celle de la consultation et pour la même raison — le reçu est une pièce
comptable, le nombre de destinations restantes n'y a rien à faire.

### Ce que ce lot n'a pas fait, et pourquoi

**$-01 n'explique pas le pack Pro.** `ChoixDuPack` écrit
`description: p.misEnAvant ? p.justification : undefined` : seul le pack
mis en avant montre ce qu'il couvre. L'écran affiche donc

```
Essentiel · 5 000 F
Dossier · 15 000 F     Couvre l'ensemble des pièces exigées…
Dossier Pro · 45 000 F
```

Pro coûte trois fois Dossier et ne dit rien. Le texte existe pourtant dans
la grille — `tests/tarification.test.ts` vérifie que **chaque** pack porte
une justification factuelle. La page publique `/tarifs`, elle, détaille les
trois.

Ce n'est pas corrigé ici parce que le correctif évident touche une règle
déclarée : `RadioOption.misEnAvant` porte « l'information est aussi portée
par la description, jamais par la seule couleur ». Donner une description à
tous retire au pack conseillé son seul marqueur textuel, et le remplacer
demande de trancher comment la mise en avant se dit — une décision d'écran
partagée avec `/tarifs`, pas un rider de ce lot.

**Et un point à arbitrer, déjà ouvert.** La page publique vend au pack Pro
un « comparateur des trois dossiers en parallèle ». C'est RG-03.2 / WF-03,
consigné plus haut comme sans modèle `Recommendation` ni écran. Tant qu'il
n'existe pas, cette ligne annonce une fonctionnalité absente ; elle relève
d'une décision produit, pas d'un correctif.

## S.74 — Deux packs sur trois n'expliquaient rien, et la mise en avant était une couleur

Le point que S.73 avait consigné sans le corriger. Il n'attendait pas un
arbitrage produit : il attendait qu'on regarde pourquoi la place était
prise.

### Ce que l'écran disait

Rendu avant correction, $-01 affichait :

```
Essentiel · 5 000 F
Dossier · 15 000 F     Couvre l'ensemble des pièces exigées pour cette destination
Dossier Pro · 45 000 F
```

Pro coûte trois fois Dossier et ne disait rien de ce qu'il apporte. La
grille écrit pourtant sa phrase — « Trois destinations comparées en
parallèle » — et `tests/tarification.test.ts` vérifie depuis le début que
**chaque** pack en porte une, factuelle et non commerciale. Trois phrases
écrites, une seule affichée. Pour savoir ce qu'il achetait, le candidat
devait quitter le tunnel de paiement et aller sur la page publique des
tarifs, qui les détaille toutes les trois.

### Pourquoi la place était prise

`ChoixDuPack` écrivait `description: p.misEnAvant ? p.justification :
undefined`. La description servait donc à deux choses à la fois : décrire
le pack, et signaler par sa **seule présence** lequel est conseillé.

Et le commentaire de `RadioOption.misEnAvant` énonçait déjà la règle que
cela violait : « l'information est aussi portée par la description, jamais
par la seule couleur ». Elle ne l'était pas. La description du pack
conseillé disait ce qu'il couvre, jamais qu'il est conseillé. Ce qui
distinguait l'option était le cadre coloré, plus le fait d'être la seule
décrite — une couleur et une absence. Le commentaire de `ChoixDuPack`
l'admettait à sa façon, deux fichiers plus loin : « la mise en avant reste
visuelle ».

Deux commentaires en contradiction directe, et l'écran suivait le plus
faible. C'est la même famille que tout ce que cette session a corrigé : du
code qui affirme ce qu'il ne fait pas.

### Le correctif

La mise en avant s'écrit — `MENTION_MISE_EN_AVANT`, un seul mot, dans le
nom accessible de l'option. Un lecteur d'écran l'annonce ; un cadre coloré
ne s'entend pas. La description redevient libre de décrire, et les trois
packs portent la leur.

Le mot est factuel : il annonce une suggestion de la plateforme, pas une
popularité. La grille interdit déjà « le plus choisi » et « populaire »
dans ses justifications, et le test le vérifie sur l'écran rendu.

### Ce que ce lot ne touche pas

La page publique `/tarifs` détaille déjà les trois packs par leurs
`AVANTAGES`, et son badge de mise en avant affiche la `justification`.
Elle n'a donc pas le défaut corrigé ici. Les deux écrans expriment
maintenant la mise en avant différemment — un mot sur $-01, un badge de
couverture sur `/tarifs`. Ce n'est pas une divergence de fond, les
composants n'étant pas les mêmes, mais si `/tarifs` devait s'aligner,
`MENTION_MISE_EN_AVANT` est l'endroit où le mot est écrit une fois.

## S.75 — L'écran qui annonce un changement de règle citait la source sans sa date

INV-8 : « toute information réglementaire affichée porte sa source **et** sa
date de vérification ». Balayage des écrans qui affichent du réglementaire :
tous portent `SourceNote`, sauf un — T-01, les alertes. Rendu avant
correction :

```
Le compte bloqué allemand passe à 11 904 €
Applicable aux demandes déposées à partir du 1er janvier 2027. […]
Il y a 1 heure · source : make-it-in-germany.com
```

La source, sans la date. Sur l'écran qui annonce précisément qu'une règle a
changé, c'est-à-dire celui où savoir quand l'information a été contrôlée
compte le plus.

### Ce qui l'avait laissée passer

Trois choses, et aucune n'est un oubli isolé.

**Une seconde implémentation.** `mentionDe(regle)` est l'endroit unique qui
construit une mention INV-8 — source, date de vérification, date de
relecture — et son commentaire dit pourquoi : « une fiche sans source ne
doit pas pouvoir exister ». La lecture des alertes ne l'appelait pas : elle
refabriquait la source avec un `hote()` local. C'est en la refabriquant
qu'elle a perdu la date.

**Un champ qui pouvait être à moitié là.** `Alerte.source?: string` portait
un nom d'hôte seul. Rien, dans le type, ne demandait la date.

**Un test trop large.** `tests/p1.test.ts` vérifiait déjà cette ligne — en
`toContain("source : make-it-in-germany.com")`. L'assertion passait avant
le correctif comme après : elle vérifiait qu'une source est nommée, pas ce
que la ligne dit. Les 2 112 tests sont restés verts après la correction du
défaut, ce qui est la mesure exacte de ce qu'ils en couvraient.

### D'où vient la date — elle se déclare, elle ne se devine pas

Trois candidats, dont deux faux :

- `application.visaRule.verifiedAt` — la règle **figée** du dossier (INV-3),
  c'est-à-dire la version qu'on quitte. Sa date dirait quand l'ancienne a
  été contrôlée, sous une alerte qui annonce la nouvelle.
- `migrationId → toRule.verifiedAt` — juste, mais **impossible** :
  `Notification.migrationId` est une colonne nue, sans clé étrangère. Il n'y
  a pas de relation à traverser.
- La règle qui a changé, au moment où l'alerte est écrite. C'est déjà d'elle
  que vient `sourceUrl` : `sourceUrl: nouvelle.sourceUrl`.

La date est donc écrite avec la source, depuis le même objet, dans la même
expression. Elles ne peuvent pas désigner deux versions différentes.

### Ce qui rend le défaut inécrivable

`Alerte.mention?: { source; verifieeLe }` — un objet, pas deux champs
facultatifs. Une alerte cite une source complète ou n'en cite pas. C'est le
même garde-fou que `CompteursDeBlocage` deux lots plus tôt, et pour la même
raison : ce qui doit voyager ensemble se déclare ensemble.

### Ce que la fumée tient et que rien d'autre ne peut tenir

Trois choses, sur PostgreSQL : que la propagation écrit les deux, qu'elles
désignent la version **publiée** et non la règle figée, et que la lecture les
rend ensemble jusqu'à la phrase affichée. Vérifié par trois mutations — pas
de date écrite, une date valide mais étrangère, une lecture qui laisse la
date en base — chacune ne faisant tomber que son assertion.

### Au passage

La CI n'ayant rien validé depuis le 22/09, les quinze fumées ont été jouées
localement sur `4fd6179` avant ce lot : toutes vertes. Le trou laissé par
l'indisponibilité des exécuteurs ne cachait rien.

## S.76 — Quatre sections de fiche se taisaient quand leur liste était vide

La liste de contrôle du dépôt demande que « les états vide, chargement et
erreur soient traités ». Balayage des écrans qui itèrent sur une collection
sans aucune garde : huit sur trente-huit. Cinq itèrent sur des constantes —
une navigation, trois étapes de démarrage — où le vide est impossible. Trois
lisent le référentiel, où il ne l'est pas.

### Ce que les écrans affichaient

Sondé sur une fiche dont les listes sont vides, C-04 rendait :

```
Conditions   → ""
Coûts        → ""
Réserves     → ""
```

Un panneau entièrement blanc sous l'onglet qu'on vient de choisir. P-04, la
page publique, était pire : ses listes vivent sous des titres — « Conditions
principales », « Réserves » — donc un titre avec rien dessous, ce qui se lit
comme une page qui a échoué à charger. C'est la forme exacte du défaut de
S.71, sur d'autres sections.

Et un quatrième, dans la même famille : `libellePieces(0)` rendait « 0 pièce
à réunir », suivi de « le détail, pièce par pièce, s'ouvre avec le dossier ».
Un détail promis sur une liste vide.

### Le cas n'est pas théorique

`reserves: z.array(z.string()).default([])` — une règle écrite sans réserve
en a zéro, et c'est la règle qu'on écrit par défaut. Ni `conditions` ni
`pieces_requises` n'ont de minimum : les trois listes peuvent être vides sur
une règle parfaitement valide et publiée.

### Ce que chaque phrase tient

Elle dit que **le référentiel n'en consigne pas**, jamais qu'il n'y en a pas.
La nuance porte tout le poids sur « Réserves » : « aucune réserve » se
lirait comme « aucun risque », c'est-à-dire comme une promesse sur une
décision qui ne nous appartient pas (INV-1). La phrase ajoute donc « son
absence dit qu'il n'y en a pas de relevée, pas qu'il n'y a rien à
surveiller », et un test tient cette nuance seule — une mutation qui retire
la seconde moitié le fait tomber sans toucher aux trois autres.

Les phrases vivent dans `domain/destinations/fiche.ts`, lues par les deux
écrans : une seule formulation pour une seule situation.

### Balayage INV-4, fait au passage et sans résultat

L'invariant demande que le filtrage des sources `SECONDAIRE` soit dans la
requête. Toutes les requêtes sur `VisaRule` ont été relues : `migration.ts`
et `alertes.ts` passent par `filtrePourCandidat` ; `jobs/divergence.ts` et
`regles/publication.ts` lisent sans filtre, et c'est correct — une
propagation doit voir la règle qu'elle publie. Le dépôt est discipliné.

Une seule exception, et c'est du code mort : `nomDeLaDestination`
(`lecture/consultants.ts`) interroge `visaRule` avec le seul `status:
"PUBLISHED"`, sans le filtre canonique. Personne ne l'appelle — l'écran de
l'annuaire utilise `nomDestination`, une table en mémoire. Rien ne fuit
aujourd'hui ; ce serait une fuite le jour où quelqu'un l'appellerait.

**Et le garde-fou existant ne l'aurait pas vue.** `api-invariants.test.ts`
dit « seul le module d'accès et le back-office interrogent le référentiel »,
mais ne balaie que `src/app/api/**`. Son nom promet plus que sa portée.
Ce n'est pas corrigé ici : élargir cette vérification demande de distinguer
les lecteurs légitimement non filtrés — jobs, publication, back-office — de
ceux qui servent un candidat, et c'est une liste à établir, pas un
correctif. Consigné.

## S.77 — Le domaine avait unifié la politique, la plomberie était restée en double

Deux balayages d'invariant avant celui-ci, et aucun n'a trouvé de défaut.
Ils comptent quand même, et sont consignés ici pour qu'on ne les refasse
pas sans raison.

**INV-4 — le filtrage des sources `SECONDAIRE` est dans la requête.** Tenu.
Les lectures candidat passent par `filtrePourCandidat` ; les deux qui ne
filtrent pas sont une propagation et une publication, où c'est correct. La
seule requête non filtrée est du code mort.

**INV-6 — tout appel IA est débité, jamais de dépassement silencieux.**
Tenu, et mieux que l'énoncé ne l'exige : le débit **précède** l'appel dans
les trois chemins (`jobs/analyse.ts`, les deux routes de rédaction), il est
atomique — `debiterUneAnalyse` insère sous condition de solde en une seule
requête et lève `quota_epuise` —, il est rendu sur reprise, et les jetons
sont écrits même quand l'appel n'a rien rendu. Les deux adaptateurs sont
symétriques sur leurs chemins d'échec : tout ce qui échoue **après** la
réponse rend les jetons réels ; seul un échec avant la réponse n'en compte
aucun, et c'est honnête — l'usage n'est pas connu.

Reste, hors de ce lot, que `Pack.tokensIA` n'est pas **appliqué** : il
alimente une alerte de marge en back-office, pas un plafond. C'est RG-15.2,
déjà consigné comme demandant un arbitrage.

### Ce que le troisième balayage a trouvé

Les fonctions définies dans plusieurs fichiers : cinquante-deux noms, dont
la plupart sont légitimes — `generateMetadata` est une convention Next, les
fumées sont des scripts autonomes, `iso` et `majuscule` sont des trivialités
locales. Trois ne le sont pas, et elles sont toutes dans la même couche.

`domain/ia/appel.ts` avait déjà unifié la **politique** des appels au
modèle : six causes, et lesquelles se rejouent. Son commentaire dit
exactement pourquoi il existe — « recopier ces six causes dans le second
module aurait produit deux sources pour une même règle ; elles divergent
toujours, et c'est celle qu'on n'a pas sous les yeux qu'on oublie de
corriger ».

La plomberie qui l'alimente était restée en double :

| Fonction | Copies | Ce qu'elle décide |
|---|---|---|
| `causeDeLErreur` | extracteur, adaptateur | laquelle des six causes ; donc si l'on rejoue, si le quota est rendu |
| `texteRendu` | extracteur, adaptateur | ce qu'on lit de la réponse |
| `noterLesJetons` | jobs/analyse, redaction/usage | la ligne `AiUsage` de B-07 |

Elles ne pouvaient pas rejoindre le domaine : il s'interdit le SDK et
Prisma, et c'est précisément ce que ces trois-là touchent. Elles vivent
maintenant dans `server/ia/appel.ts`, le pendant serveur du module de
domaine.

### L'équivalence a été établie avant la fusion, pas supposée

Les deux `causeDeLErreur` ont été comparées par exécution sur onze erreurs
— les sept classes du SDK, un `TimeoutError` et un `AbortError` nus, une
`Error` quelconque, `null` : **zéro écart**. La fusion ne change donc aucun
comportement, et le test qui l'a établi reste comme contrat. Deux mutations
le tiennent : intervertir l'ordre des branches — `APIConnectionTimeoutError`
étend `APIConnectionError`, qui étend `APIError`, et tester la générale
d'abord absorbe les deux autres — et faire pencher le repli du mauvais
côté, vers un abandon au lieu d'une reprise.

### Un test de source qui s'est fait prendre pour la troisième fois

`B-07 — un coût manquant ne vaut jamais zéro` lisait `jobs/analyse.ts` en
le nommant par son chemin. La fusion l'a fait tomber sans qu'aucun
comportement change. Son propre commentaire raconte qu'il avait déjà été
réécrit deux fois « après deux critères syntaxiques qui accusaient du code
correct » ; c'était la troisième.

Il ne nomme plus de chemin : il **cherche** les écrivains de `AiUsage` sous
`src/server` et exige qu'il n'y en ait qu'un. C'est plus fort que ce qu'il
tenait, et cela vise la cause d'origine — deux écrivains, dont l'un posait
`costMicros: 0` en dur pendant que l'autre tarifait. Une mutation qui
recrée un second écrivain le fait tomber.

## S.78 — INV-5 ne couvre qu'un statut sur cinq, et rien ne le disait

INV-5 : « les pièces d'identité sont purgées automatiquement selon la
politique de rétention ». La purge sélectionne sur `purgeDueAt`. La question
est donc : **qui pose cette date, et un chemin de fin de vie l'oublie-t-il ?**

Deux écrivains, chacun commenté INV-5 : la clôture déclarée
(`cloturerLeDossier`) et l'abandon pour inactivité (`inactivite.ts`). Un
troisième, la suppression de compte (RG-10.4), la pose à l'instant même.

### Établi par exécution

Cinq dossiers inactifs depuis vingt mois, chacun portant un passeport
déposé, un par statut. Après deux passes du job d'inactivité — la première
relance, la seconde abandonne :

```
BROUILLON   statut après : ABANDONNE    purge prévue : 2026-10-23
ACTIF       statut après : ACTIF        purge prévue : — JAMAIS —
PRET        statut après : PRET         purge prévue : — JAMAIS —
SOUMIS      statut après : SOUMIS       purge prévue : — JAMAIS —
SUSPENDU    statut après : SUSPENDU     purge prévue : — JAMAIS —
```

Le job s'appelle `traiterLesBrouillonsInactifs`, et son nom dit la vérité :
il ne sélectionne que `status: "BROUILLON"`. Or un brouillon est
précisément le dossier qui n'a **pas** de pièces analysées — le pack n'est
pas payé, et l'écran le dit. Le mécanisme couvre donc les dossiers les moins
susceptibles de porter une pièce d'identité, et ignore ceux qui en portent
certainement.

La première sonde a d'ailleurs rendu `examines: 0` sur les cinq : elle
déposait les pièces à la date du jour, donc aucun dossier n'était inactif.
Le défaut n'a été retenu qu'une fois le **cas témoin** — le brouillon —
effectivement abandonné.

### Ce que ce lot fait, et ce qu'il ne fait pas

Il ne fixe aucune durée. Combien de temps garder un dossier **soumis** dont
l'administration n'a pas encore répondu n'est pas un correctif : certaines
procédures instruisent plus de douze mois, et fermer le dossier de
quelqu'un qui attend — ou pire, qui attend **notre** arbitrage, dans le cas
`SUSPENDU` — serait un dommage, pas une conformité. Les quatre durées sont
une décision de rétention.

Ce qu'il fait : la sonde de santé compte désormais les dossiers longtemps
inactifs qui portent encore des pièces **et n'ont aucune échéance**. Elle
comptait les échéances **dépassées** — une purge qui n'aboutit pas — et
était aveugle aux échéances **absentes**, qui sont le manque le plus
durable : rien ne les rattrape à la passe du lendemain.

`updatedAt` y est une approximation assumée : le job mesure l'inactivité
sur la date du dernier dépôt, plus fine. Elle suffit pour lever la main.

### À arbitrer

| Statut | Question |
|---|---|
| `ACTIF`, `PRET` | Le candidat a payé et n'a pas déposé. Même règle que le brouillon — douze mois puis trente jours — ou plus long parce qu'il a payé ? |
| `SOUMIS` | L'administration n'a pas répondu. Aucune durée d'inactivité ne devrait suffire seule ; faut-il une relance, une date de décision attendue ? |
| `SUSPENDU` | Le dossier attend **notre** arbitrage de divergence. Le fermer serait nous faire oublier une dette. |

**Tranché le 24/09/2026**, mis en œuvre en S.84.

## S.79 — Le garde-fou d'INV-4 promettait plus que sa portée, et s'est accusé lui-même

Ce point était consigné comme « à arbitrer » au lot S.76 : je l'avais différé
parce qu'élargir la vérification demandait d'établir la liste des lecteurs
légitimement non filtrés. Le balayage de S.77 l'a établie. Il n'y avait donc
plus rien à arbitrer.

### Ce que le garde-fou disait, et ce qu'il regardait

Son nom : « seul le module d'accès et le back-office interrogent le
référentiel ». Sa portée : `src/app/api/**` seulement. Tout `src/server/**`
lui échappait — et c'est là que vivait la seule requête non filtrée du
dépôt, `nomDeLaDestination`, qui lisait `visaRule` avec le seul
`status: "PUBLISHED"`, sans `sourceTier`, sans date de relecture.

Elle n'a jamais rien laissé fuir : personne ne l'appelait, l'annuaire
utilisant `nomDestination`, une table en mémoire. Elle aurait fui le jour où
quelqu'un l'aurait appelée, et le garde-fou ne l'aurait pas dit. Elle est
supprimée.

### Une liste, et pas une interdiction

Interdire toute requête non filtrée casserait le référentiel lui-même : la
publication doit chercher le prédécesseur d'une version, la propagation doit
voir la règle qu'elle vient de publier, le back-office voit tout par
fonction. Six lecteurs sont donc nommés **avec leur raison** — c'est ce qui
rend la liste relisible, et ce qui oblige à justifier une entrée nouvelle
plutôt qu'à l'ajouter en silence.

Une seconde assertion refuse les noms morts : sans elle, la liste enfle
d'anciens chemins et cesse de dire quoi que ce soit.

### Le garde-fou s'est accusé lui-même, au premier passage

Son motif était `visaRule\.(find|count|aggregate|groupBy)`. Il a signalé
deux fichiers corrects — `jobs/inactivite.ts` et `lecture/partenaires.ts` —
parce que **`visaRule.count` correspond à l'intérieur de
`dossier.visaRule.countryCode`**.

C'est exactement la faute que raconte le commentaire du garde-fou B-07 :
« deux critères syntaxiques qui accusaient du code correct ». Refaite ici,
au premier essai, par quelqu'un qui venait de la lire. Le motif exige
maintenant la parenthèse d'appel.

Le fait est consigné parce qu'il dit quelque chose de ces tests : un
garde-fou qui lit des sources se trompe d'abord contre le code honnête, et
c'est le sens de l'accusation qui trompe — un test rouge fait chercher le
défaut dans le code accusé, jamais dans le test.

## S.80 — Le pack Pro vendait ce que tout le monde a déjà

J'avais consigné au registre que « le comparateur vendu dans le pack Pro
n'existe pas ». **C'était faux, et le vérifier valait mieux que le répéter.**
C-03 existe, il est bien construit, et son commentaire dit même pourquoi :
« un comparateur qui contredit la fiche qu'il compare est pire qu'un
comparateur absent ».

Le défaut est ailleurs, et il est réel.

### Ce que la page vendait, en regard de ce que le code donne

```
Essentiel     — analyses 10, destinations 1
    "Checklist complète et échéancier jusqu'au dépôt"
    "Analyse de 10 pièces, avec message de correction"
    "Complétude du dossier et prochaine action"
Dossier       — analyses 30, destinations 1
    "Tout l'Essentiel, sur une destination"
    "Analyse de 30 pièces"
    "Rédaction assistée de la lettre de motivation"
Dossier Pro   — analyses 90, destinations 3
    "Tout le pack Dossier, sur trois destinations"
    "Analyse de 90 pièces"
    "Comparateur des trois dossiers en parallèle"
```

Deux lignes sur douze sont fausses.

**« Comparateur des trois dossiers en parallèle »** — C-03 compare des
**destinations** publiées, pas des dossiers. Et sa page n'appelle que
`exigerCandidat` : aucune garde de pack, une entrée inconditionnelle dans la
navigation principale. Le pack le plus cher vendait donc ce que tout
candidat a déjà, sous un nom qui désigne autre chose.

**« Rédaction assistée de la lettre de motivation »** — les routes de
rédaction ne vérifient aucun pack ; elles débitent le quota d'analyses. Un
acheteur d'Essentiel en a dix, donc il l'a aussi. L'annoncer au seul Dossier
laissait entendre le contraire.

Le reste est exact, y compris pour le pack gratuit : un brouillon fige sa
version de règle à l'ouverture (`ouvrirDossier`), il reçoit donc bien les
alertes de changement.

### Le pack Dossier n'a plus que deux lignes

Ce qui le distingue d'Essentiel est son volume d'analyses, et rien d'autre :
même destination, mêmes écrans, même rédaction. Lui inventer une troisième
ligne pour égaliser les cartes aurait été la faute qu'on corrige — un
avantage écrit pour remplir une place, comme le « 0 pièce à réunir » de S.76
ou le zéro de B-07.

### Ce qui rend la dérive plus difficile

Les phrases quittent l'écran pour `domain/payments/avantages.ts`, et les
nombres y sont **interpolés depuis `PACKS`** au lieu d'être recopiés. Un
test les compare un à un, refuse qu'un pack revende le comparateur, vérifie
que la rédaction est annoncée au palier où elle s'ouvre, et qu'aucune ligne
n'est trop courte pour dire quelque chose.

Trois mutations le tiennent : le comparateur remis dans Pro, un nombre
recopié à la main, la rédaction remontée au seul Dossier — chacune ne fait
tomber que son assertion.

**Tranché le 24/09/2026**, mis en œuvre en S.86.

### Ce que ce lot ne tranche pas

Le positionnement. Si l'intention commerciale est que la rédaction distingue
Dossier, ce n'est pas la page qu'il faut corriger mais la route, qui ne
vérifie aucun pack. Et si un comparateur **de dossiers** est prévu — ce que
WF-03 laisse entendre —, la ligne pourra revenir quand il existera. Ce lot
fait dire à la page ce que le code fait aujourd'hui, rien de plus.

## S.81 — La route réservait n'importe quelle minute, et l'agenda ne séparait rien

Lot mené en même temps que le correctif des heures proposées (PR #148),
qui a posé la grille en heure locale. Il en reprend les fonctions
(`instantDeLHeureLocale`, `jourDuFuseau`) et traite ce que ce correctif
laissait ouvert.

### Toute minute future se réservait

La route acceptait n'importe quelle date à venir. L'unicité
`(consultant, créneau)` refuse deux réservations **au même instant**, pas
deux entretiens de quarante-cinq minutes décalés d'une minute : 9 h 01
passait à côté de 9 h 00, et le consultant était réservé deux fois.

La grille quitte la lecture serveur pour le domaine
(`creneauxProposes`, `estUnCreneauPropose`) : l'offre et l'acceptation
lisent la même fonction. Le jour même est admis à la réservation, parce
qu'une page ouverte à 23 h 58 et validée à 0 h 02 offrait pour « demain »
un créneau qui est devenu celui d'aujourd'hui. La condition « à venir »
suffit à écarter ceux qui sont passés.

### Le point-virgule de l'agenda, et le test qui partageait la faute

`echapper` écrivait `"\;"`. En JavaScript, c'est un échappement inutile
qui vaut `";"` : le point-virgule d'un intitulé sortait tel quel dans le
fichier `.ics`, où il sépare des valeurs. Le test écrivait
`"Pays-Bas \; études"`, avec la même faute, et comparait donc `;` à `;`.
Il vérifie maintenant, sur le texte déplié, qu'aucun point-virgule ne
reste sans sa barre.

### Vérifié par mutation

Les essais balaient deux années de dates, à six heures de la journée.
Validation qui accepte tout : un essai tombe. Jour même refusé : un essai.
Grille posée en UTC : deux essais. Jour pris en UTC : un essai. Échappement
remis à `"\;"` : un essai.

### Ce que ce lot ne touche pas

Les rendez-vous déjà pris aux anciennes heures restent valides : ce sont
des instants réservés et payés, et la route ne les rejuge pas.

## S.82 — Le reçu datait le paiement en UTC

Le lot I.E avait fait écrire les rendez-vous dans le fuseau d'affichage.
La constante vivait dans le module des rendez-vous, et aucun autre
formateur d'heure ne la lisait. Quatre modules et trois écrans écrivaient
encore l'heure d'un **instant** en UTC, sans le dire :

| Où | Ce qu'on lisait |
|---|---|
| Reçu, confirmation de paiement, mention de remboursement | Paiement fait à 10 h 43 à Cotonou : « 9 h 43 » |
| Alertes (T-01), versions de rédaction (R-03) | « hier à 21 h 04 » pour 22 h 04 |
| Journal, paiements, veille (back-office) | l'heure UTC, sans mention de fuseau |

Le jour aussi était celui d'UTC. Pour un paiement fait à 0 h 30 à
Cotonou, il est encore 23 h 30 la veille en UTC : **le reçu portait la
date d'un jour où le paiement n'avait pas eu lieu**. C'est la pièce qu'on
lit à voix haute en réclamation.

La note de `moment.ts` justifiait l'UTC par l'échéancier. Mais
l'échéancier porte des **dates calendaires**, stockées à minuit UTC, et un
horodatage n'en est pas une. Les deux se traitent différemment, et ce lot
les sépare :

- un instant (paiement, alerte, version, écriture de journal) se lit dans
  le fuseau d'affichage, heure et jour ;
- une date calendaire (échéance, délivrance, vérification, publication
  d'un article) reste en UTC, où elle a été posée.

### La période du journal suit l'heure affichée

Le journal d'audit rangeait ses écritures par période sur les dix
premiers caractères de l'ISO, c'est-à-dire sur le jour UTC. Tant que
l'heure s'affichait aussi en UTC, les deux se répondaient. Une fois
l'heure passée à Cotonou, une écriture affichée « 01/10 · 00 h 30 »
serait restée dans l'export de septembre. Le jour d'une écriture est
maintenant celui qu'on lit à côté de son heure.

### Une constante, un garde-fou

`FUSEAU_AFFICHAGE` passe dans `domain/format/fuseau.ts`, avec `jourCivil`.
Le module des rendez-vous la réexporte. Un essai lit les sources et
refuse tout `Intl.DateTimeFormat` qui écrit une heure en UTC. Un témoin
vérifie qu'il voit bien les formateurs qu'il garde, pour qu'un motif
devenu aveugle ne passe pas pour du code conforme.

### Vérifié par mutation

L'heure du formateur remise en UTC : six essais tombent. Le jour du reçu
repris des dix premiers caractères de l'ISO : un essai. La comparaison des
jours faite en UTC : un essai. Les trois écrans du back-office remis en
UTC : le garde-fou les nomme tous les trois.

### Ce que ce lot ne touche pas

Les exports CSV gardent leurs horodatages ISO, qui portent leur fuseau.

**Laissé ouvert, et nommé : le « jour courant » en UTC.** Une dizaine de
routes et de lectures posent « aujourd'hui » par
`new Date().toISOString().slice(0, 10)` : complétude, échéancier,
journée de rapprochement, rappels. Entre minuit et une heure du matin à
Cotonou, ce jour est encore la veille. L'effet dure une heure et reste
d'un jour ; il touche des calculs, pas un affichage d'heure, et chaque
site demande de vérifier ce que sa date compare. C'est un lot à part.
La référence opérateur du reçu (`MP260911.0943`) est celle du prestataire,
et il n'y a pas à la réécrire.

## S.83 — « Aujourd'hui » était la veille entre minuit et une heure, et S.82 avait ouvert un trou dans l'export du journal

### La régression d'abord

S.82 a fait ranger chaque écriture du journal au jour de Cotonou
(`filtrerAudit`). La requête qui alimente l'export, elle, lisait toujours
entre deux minuits **UTC**. Pour un export « du 1er au 30 septembre » :

- l'écriture de 0 h 30 le 1er septembre à Cotonou (23 h 30 UTC le 31
  août) n'était **jamais lue** ;
- celle de 0 h 30 le 1er octobre était lue, puis écartée au filtre.

L'export perdait donc la première heure de sa période, sans rien qui le
dise, alors que c'est un document qui atteste être complet. Le test de
S.82 exerçait le filtre sur des écritures déjà en mémoire, et ne voyait
pas la requête. C'est la même faute qu'en S.79, à l'envers : un
garde-fou juste sur ce qu'il regarde, et muet sur ce qu'il ne regarde
pas.

Les bornes de la requête sont désormais les minuits de Cotonou
(`bornesDesJoursCivils`). Un balayage sur deux années vérifie que les
bornes lisent exactement ce que `jourCivil` range, à la milliseconde
près des deux bords.

### Le jour courant, et les bornes de journée

Même défaut, pris par l'autre bout. Dix-huit sites posaient « aujourd'hui »
ou une journée en UTC :

| Où | Effet entre 0 h et 1 h à Cotonou |
|---|---|
| Journée des paiements (écran, route, export) | la journée affichée est la veille, et ses bornes aussi |
| Période du journal par défaut | le jour courant manque à la période |
| Histogramme des coûts IA | les appels de 0 h à 1 h comptés la veille |
| Complétude, échéancier, fiche, portabilité | une pièce jugée sur la date d'hier |
| Rappels | un rappel parti à 0 h 30 daté de la veille, et un second le même jour |
| Relecture de la veille, nom du fichier de données | la date d'hier |

Tous lisent maintenant `jourCivil`. Les **échéances** (`dueAt`) et les
autres dates calendaires restent lues telles qu'elles sont posées.

`instantDeLHeureLocale` et `jourDuFuseau` quittent le module des
rendez-vous pour `domain/format/fuseau.ts` : le back-office borne ses
journées avec la fonction même qui pose les créneaux.

### Garde-fous

- Aucune source n'écrit plus `new Date().toISOString().slice(0, 10)`.
- La journée des paiements et la période du journal sont bornées par
  `bornesDesJoursCivils`. Le test lit la source, comme celui qu'il
  remplace.

Vérifié par mutation : les bornes du journal remises en UTC font tomber
un essai, et un « aujourd'hui » en UTC réintroduit dans un écran fait
nommer ce fichier au garde-fou.

### Ce que ce lot ne touche pas

`joursDInactivite` compte encore les jours en UTC, et son commentaire le
revendique. Sur un seuil de douze mois, une heure de décalage ne change
rien qu'on puisse observer. La réaligner sans raison mesurable serait
changer un calcul de purge (INV-5) pour la symétrie seule.

## S.84 — S.78 tranché : chaque état a sa règle de conservation, et aucune purge n'efface un dossier

L'arbitrage de S.78, dans ses termes : la conservation des **octets** est
dissociée de celle du dossier. Une purge de pièces ne supprime ni le
dossier, ni son historique, ni ses verdicts, ni ses traces d'audit.

| État | Règle |
|---|---|
| `ACTIF`, `PRET` | RG-04.2 comme pour un brouillon : relance à 90 jours, `ABANDONNE` à 12 mois, pièces purgées sous 30 jours. Le paiement n'est pas un motif de conservation. |
| `SOUMIS` | Pièces conservées 12 mois après le dépôt déclaré. Invitation à confirmer 60 jours avant ; une confirmation prolonge de 6 mois, renouvelable. Sans réponse, un préavis de 30 jours précède la purge. Le dossier reste `SOUMIS`. |
| `SUSPENDU` | Aucune inactivité ne le clôt. Avertissement à 11 mois de pause, purge à 12. Le dossier, sa date de pause et son état antérieur restent ; les pièces encore nécessaires sont redemandées à la reprise. |

La politique vit dans `domain/dossiers/conservation.ts`, l'annonce dans
`jobs/conservation.ts` : il annonce et pose l'échéance. La purge reste
celle qui existait, avec sa conduite face à un stockage qui résiste.

### Ce que la purge faisait d'un dossier

Elle faisait passer en `ARCHIVE` tout dossier purgé en entier. C'était
juste tant que seuls une clôture et un abandon la programmaient. Avec
l'arbitrage, c'était effacer ce que la décision garde : un dossier soumis
attend toujours l'autorité, un dossier suspendu attend toujours la
plateforme. `etatApresPurge` archive la clôture, l'abandon et la
suppression de compte. Il laisse les deux autres dans leur état.

### Aucune purge sans annonce, même en retard

Une passe mise en service sur un stock ancien trouve des dossiers soumis
depuis deux ans. Leur échéance théorique est passée, et les purger le jour
même serait une purge non annoncée. L'échéance posée n'est donc jamais
plus proche que trente jours (`echeanceAnnoncee`).

L'annonce part avant l'échéance. Un courrier que le relais refuse ne
programme rien : la fumée le vérifie avec un vrai serveur qui répond 451.

### La confirmation ne s'empile pas

Ouverte en permanence, la confirmation aurait fait de six mois une unité
qu'on empile : dix clics le jour du dépôt vaudraient cinq ans. Elle
s'ouvre avec l'invitation. Avant, l'écran dit la date à laquelle elle
s'ouvrira.

### Le défaut que la fumée a trouvé, et qui était partout

Une garde SQL lie désormais `SUSPENDU` à sa date de pause, comme `PRET` à
sa `readyAt`. La date passait par `miseEnEtat`, en quatrième paramètre
facultatif. La fumée a montré qu'une purge qui garde un dossier suspendu
**remettait sa pause à zéro**. Le relevé a trouvé quatre écritures sur
cinq qui réécrivent `SUSPENDU` sans la date : la purge, le recalcul de
complétude, l'activation d'un pack, et l'arbitrage. La deuxième tourne à
chaque analyse de pièce. Un dossier suspendu dont le candidat déposait
une pièce par mois n'aurait jamais atteint ses onze mois.

Le paramètre est désormais le couple actuel `{ readyAt, suspendedAt }`, et
il est obligatoire. On ne peut plus l'oublier.

### Pièces redéposées pendant la pause

Une pause n'empêche pas de déposer. Un dossier purgé qui reçoit une pièce
ressort donc tant qu'il porte des pièces vivantes, et il est averti à
nouveau, avec son préavis. La levée de la pause annule une purge annoncée,
et le dossier ne se dit plus purgé : les pièces `PURGEE` comptent déjà
comme manquantes et sont redemandées.

### La dette se voit

`/api/health` compte les dossiers en pause, l'âge de la plus ancienne et
ceux dont la purge est annoncée. Le compte `sansEcheance` de S.78 reste :
chaque état ayant désormais sa règle, un chiffre non nul veut dire qu'une
passe n'a pas tourné.

### Vérifié

- Essais du domaine : calendrier des dossiers soumis, prolongation,
  fenêtre de confirmation, suspension, état après purge, textes soumis au
  vocabulaire interdit.
- Fumée `smoke:conservation` sur Postgres, ajoutée à la CI : les trois
  parcours, la garde SQL, le relais qui refuse.
- Mutations : inactivité ramenée aux brouillons, pause renouvelée,
  confirmation toujours ouverte, purge qui archive tout, préavis sans
  plancher. Chacune fait tomber son essai.

### Ce que ce lot ne fait pas

- Aucun écran ne déclare encore le dépôt : la route existe depuis WF-10,
  l'écran non. Le bloc de conservation s'affiche sur la checklist d'un
  dossier soumis.
- La portabilité (RG-10.4) n'exporte pas encore l'échéance de conservation
  ni la date de pause.
- `statusBeforeSuspension` des pauses antérieures à la migration est resté
  vide plutôt que deviné.

## S.85 — Aucun dossier ne pouvait devenir « Déposé » par l'interface

La déclaration de dépôt (WF-10, étape 1) avait sa décision
(`declarerLeDepot`), sa route (`POST /api/dossiers/:id/depot`) et sa fumée.
Aucun écran ne l'appelait. L'état `SOUMIS` était donc inatteignable depuis
le parcours, et avec lui tout ce qui s'y rattache :

- la conservation de douze mois que S.84 vient de poser ;
- le bloc « L'instruction continue » ;
- la phrase de la checklist qui renvoie à « Clôturer » une fois
  l'autorité revenue.

Un candidat au dossier complet lisait « Rien ne bloque un dépôt », et
n'avait aucun moyen de dire qu'il l'avait fait.

### L'écran C-11a

- **Entrée :** depuis la checklist d'un dossier prêt, et d'aucun autre.
- **Case non pré-cochée :** « J'ai déposé ma demande auprès de l'autorité
  ou de son prestataire ». La déclaration fige le dossier, et seul le
  candidat sait que la demande est partie. Le bouton désactivé dit
  pourquoi.
- **Ce que la déclaration fige et conserve :** les durées viennent des
  constantes de conservation (`domain/dossiers/depot.ts`), comme dans la
  réponse de la route.
- **Aucune transmission (INV-1) :** la même phrase que la route,
  « C'est ta déclaration qui est enregistrée ». Aucune phrase ne parle
  de la suite de l'instruction.
- **Un dossier qui n'est pas prêt** — en pause, déjà déposé, clôturé,
  incomplet — ne tombe pas sur un bouton désactivé : il lit sa raison, et
  un lien le ramène à la checklist.

### Vérifié

Essais d'écran : case non pré-cochée, raison du bouton, effets annoncés,
états non déclarables, lien réservé au dossier prêt. Essais du domaine :
un état par cas, vocabulaire interdit. Deux mutations — lien affiché
partout, déclaration ouverte à tous les états — font tomber leurs essais.

### Ce que ce lot ne tranche pas

La date déclarée est celle de la déclaration, pas celle du dépôt réel.
Un candidat qui déclare trois semaines après avoir déposé gagne trois
semaines de conservation. Demander la date réelle ajouterait un champ et
une validation (pas dans le futur, pas avant l'ouverture). C'est une
question de produit : la spécification dit « le candidat déclare avoir
déposé », sans date.

## S.86 — S.80 tranché : la rédaction assistée est un droit de Dossier et de Dossier Pro

La frontière porte sur l'intervention du service d'IA, pas sur le droit du
candidat à écrire son propre document.

| Tous les packs | Dossier et Dossier Pro ajoutent |
|---|---|
| Entretien guidé et conservation des réponses | Proposition de texte à partir des réponses |
| Écriture et réécriture manuelles | Reformulation assistée |
| Versions et restauration | Analyse critique assistée |
| Exports PDF et DOCX | Recoupements qui exigent la lecture automatique des pièces |
| Recoupements déterministes | |

### Le droit se lit sur le dossier, pas sur le compte

Il se déduit du grand livre des analyses : ce sont les octrois
`ACHAT_PACK` du dossier, et le pack de la transaction qui les porte.
`destinationsServies` fait déjà la même lecture pour la couverture. Il
n'y a donc rien à stocker, et rien qui puisse diverger. Trois cas
tiennent sur une vraie base (fumée de rédaction) :

- un compte qui achète un Dossier pour un second dossier ne l'ouvre pas
  sur le premier, couvert par Essentiel ;
- les trois destinations d'un Pro l'ouvrent, mais pas un quatrième
  dossier ;
- une recharge ne l'ouvre pas, et un remboursement engagé le retire.

### Ce qui est gardé

Les deux gestes qui appellent le service aujourd'hui : la mise en forme
(proposition de texte) et l'analyse critique. La garde passe avant le
débit et avant l'appel : un refus ne coûte rien, n'écrit rien, et ne
touche ni aux réponses, ni au texte, ni aux versions. La reformulation
et les recoupements par lecture des pièces n'existent pas encore ; ils
passeront par la même garde (`exigerRedactionAssistee`).

Un test lit les deux routes et exige la garde. Une mutation qui la retire
le fait tomber.

### Le défaut que l'arbitrage a mis au jour : on ne pouvait pas écrire sans le service

L'éditeur n'affichait son champ qu'une fois une première version
produite, c'est-à-dire après une mise en forme par le service. Aucune
pièce ne pouvait donc s'écrire à la main dans l'application. Ce n'était
pas visible, puisque tout le monde avait l'assistance. Avec l'arbitrage,
un acheteur d'Essentiel aurait perdu le droit d'écrire que la décision
lui garantit.

Le champ est désormais toujours là. La première version se crée par
l'enregistrement, et l'entretien a un accès direct à l'éditeur au lieu
de huit questions à passer une à une.

### Les écrans

- **Éditeur :** état `MISE_EN_FORME_RESERVEE`. Il ne demande aucun
  minimum de réponses : « il t'en faut trois pour la mise en forme »
  annoncerait un geste que ce dossier n'a pas.
- **Relecture :** état `RESERVEE_AU_PACK`. Il dit ce que les recoupements
  ont comparé, et que le fond n'est pas jugé. Il ne prétend pas que le
  service n'est « pas branché ». Une analyse déjà faite reste affichée.
- **Refus serveur :** code `redaction_non_couverte`, qui dit d'abord ce
  qui reste au candidat.

### La grille

Essentiel annonce ce qu'il garde. Dossier annonce la rédaction assistée.
Pro s'annonce pour ce qu'il donne : trois couvertures Dossier, trente
analyses par destination, la rédaction assistée sur chacune. Son badge
disait « Trois destinations comparées en parallèle » : il annonçait un
comparateur. Le comparateur de dossiers n'est pas en V1 et ne s'annonce
pas ; celui des destinations est ouvert à tous.

### Ce que ce lot ne tranche pas

**Le passage d'Essentiel à Dossier sur un même dossier.** Le serveur
accepte un second pack sur un dossier : `appliquerLaCouverture` honore
toujours le dossier désigné. La page des packs, elle, renvoie au dossier
tout candidat qui en a déjà payé un. En faire une montée en gamme
suppose de fixer un prix : le prix plein, ou la différence avec ce qui a
été payé. C'est une décision tarifaire.

En attendant, le lien « Voir les packs » mène à la page Tarifs, qui dit
ce que chaque pack ouvre, plutôt qu'à une page qui renverrait au dossier.

## S.87 — Les rappels d'échéance se règlent, partent à l'heure du candidat, et une seule fois

Les rappels partaient depuis le 22/09, mais sans réglage. Le candidat ne
pouvait pas les couper. Ils partaient à 7 h UTC, soit 2 h du matin à
Montréal. Un courrier en échec ne laissait aucune trace. Deux passes
simultanées envoyaient chacune le leur. L'échéancier avait perdu son lien
« modifier », faute de réglage vers lequel pointer.

### Les préférences minimales (RG-09.4)

| Réglage | Valeurs | Défaut |
|---|---|---|
| Activation | oui / non — coupe l'email **et** l'alerte | oui |
| Email | en plus de l'alerte dans l'application, toujours écrite | oui |
| Fuseau | onze villes (Cotonou, Lomé, Abidjan, Dakar, Ouagadougou, Douala, Kinshasa, Paris, Bruxelles, Amsterdam, Montréal) | Cotonou, Porto-Novo |
| Délai d'alerte | 3, 7 ou 14 jours | 7 (RG-09.2) |

Les préférences sont portées par le compte et valent pour tous les
dossiers. La base garde le délai par une contrainte `CHECK`. La route
n'accepte que les fuseaux de la liste. Les valeurs par défaut reprennent
exactement l'ancien comportement : aucun candidat ne voit son rappel
changer tant qu'il n'a rien réglé.

**Pas de SMS.** DOC-11 le prévoit ; aucun fournisseur n'est branché.
L'écran le dit, et ne le propose pas.

### Le canal email ne s'annonce que s'il est prouvé

`canalEmail()` lit le même constat que l'état de service : un envoi ou
une vérification réels, datant de moins de trois heures. La sonde horaire
le rafraîchit. Si le constat est absent, périmé ou en échec, l'échéancier
et l'écran de préférences disent « dans tes alertes » et non « par
email ». Le choix du candidat est gardé pour le moment où l'envoi
reprendra.

### Une passe horaire, huit heures chez le candidat

Le job `echeancier.rappel` passe de `0 7 * * *` à `5 * * * *`, cinq
minutes après la sonde. Il n'envoie à un candidat qu'à partir de 8 h
**dans son fuseau**. Une passe manquée est rattrapée l'heure suivante.
Une journée manquée n'efface pas une urgence : le domaine la voit le
lendemain.

Le jour du candidat sert partout : pour la clé, pour « aujourd'hui »
dans le courrier et pour la cadence. À 23 h 30 à Montréal, le serveur
est déjà au lendemain. Il lisait l'échéance du jour comme « dépassée
d'un jour ».

### Réserver d'abord, envoyer ensuite

L'ordre « envoyer, puis marquer » convenait à une passe quotidienne
unique. Il ne pouvait rien contre deux passes concurrentes : les deux
envoyaient, puis les deux marquaient. Le rappel est maintenant réservé
dans une seule transaction, qui regroupe trois écritures :

- la notification, avec `dedupKey = echeance:<dossier>:<jour local>`,
  unique en base ;
- la marque des échéances ;
- la marque du dossier.

Une seconde passe bute sur la clé, et sa transaction ne marque rien.

Le courrier suit, avec son état :

| État | Sens |
|---|---|
| `EN_ATTENTE` | pas encore accepté ; repris l'heure suivante, **le même jour** seulement, six fois au plus. Son texte dit « dans 4 jours » : parti le lendemain, il serait faux. |
| `ENVOYE` | accepté par le serveur. Une contrainte exige `emailSentAt`, et réciproquement. |
| `NON_ENVOYE` | refus, transport absent, reprises épuisées, ou le candidat a coupé l'email ou ses rappels entre-temps |
| nul | aucun courrier demandé |

La notification reste dans tous les cas. L'écran de préférences dit ce
qu'est devenu le courrier du dernier rappel, et ne dit « parti » que pour
`ENVOYE`.

**Le défaut trouvé par la fumée.** La prise d'une tentative était un
`updateMany` conditionné par `emailAttempts`. Une passe concurrente
voyait un courrier en cours d'envoi comme un courrier en attente, en
prenait la tentative suivante, et l'envoyait une seconde fois. Le cas
s'est produit à un lancement sur trois. Le bail `emailAttemptAt` (dix
minutes) le ferme : quatre lancements consécutifs sont verts. Si un
worker tombe pendant l'envoi, le courrier n'est bloqué que dix minutes.

### Ce qui ne reçoit rien

Le filtre se fait dans la requête, pas à l'envoi (même principe
qu'INV-4). Rien ne part pour :

- une échéance faite ;
- une pièce déjà déposée (`EN_ANALYSE`, `CONFORME`) : son échéance
  « À demander » est derrière le candidat, qu'il l'ait cochée ou non ;
- un dossier déposé, clos, abandonné ou suspendu ;
- un compte dont la suppression est demandée ;
- des rappels coupés.

Si l'email seul est coupé, l'alerte part sans courrier.

### Ce que le courrier dit de plus

- **La destination de la règle figée** (« Ton dossier Pays-Bas »), et non
  ses codes (« NL — etudes_mvv_vvr »).
- **Une dernière ligne sur l'origine du rappel et le moyen de le
  couper.** Un rappel qu'on ne sait pas couper se fait classer en
  indésirable, et le filtre emporte ensuite les courriers qui comptaient.

### Ce que ce lot ne tranche pas

**La langue du courrier.** Elle reste le français ; `User.locale` n'est
lu nulle part.

**Le fuseau d'affichage des écrans.** Il reste Cotonou. Seuls les
rappels suivent le fuseau choisi, et l'écran de préférences le dit
(« à l'heure de cette ville »). Faire suivre tout l'affichage
demanderait de reprendre chaque formateur d'heure.

## S.88 — Montée en gamme Essentiel → Dossier tranchée : la différence, vingt analyses, la rédaction assistée

Cette décision ferme le point que S.86 laissait ouvert.

Un dossier couvert par Essentiel ne pouvait pas passer à Dossier. La page des packs renvoyait au dossier tout candidat qui en avait déjà payé un. Le récapitulatif, lui, vendait Dossier **au prix plein** à qui en forgeait l'adresse : 15 000 F de plus sur un dossier déjà payé 5 000 F, et 40 analyses au lieu de 30.

### Le prix (RG-05.6)

    prix actuel de Dossier, dans la devise de l'achat Essentiel
  − montant effectivement payé pour cet achat Essentiel
  = montant dû, jamais négatif

| Devise | Dossier | Essentiel payé | Dû |
|---|---|---|---|
| XOF | 15 000 F | 5 000 F | 10 000 F |
| EUR | 29 € | 12 € | 17 € |

- **Les grilles restent natives.** Aucune conversion n'est faite, et la montée garde la devise de l'achat d'origine. La route ignore la devise envoyée par le navigateur et `montantDe` refuse toute autre devise.
- **Le montant retranché est celui que l'achat a réellement encaissé** (`Transaction.amount`), et non le tarif d'Essentiel aujourd'hui. Un Essentiel acheté avant une hausse paie ainsi la différence réelle.
- **Le navigateur n'envoie que la catégorie** `{ type: "montee" }`. L'achat d'origine et le prix se retrouvent en base.

### La couverture

La montée crédite un octroi `ACHAT_PACK` de **20** analyses rattaché à sa propre transaction. Le quota issu du pack passe ainsi de 10 à 30. La rédaction assistée s'ouvre par la même lecture que pour un pack (`CODES_REDACTION_ASSISTEE`).

La montée ne passe pas par `appliquerLaCouverture`. Elle ne couvre pas de nouvelle destination : elle change la couverture d'un dossier déjà servi.

Les recharges restent des achats séparés : elles ne changent ni le prix ni les vingt analyses.

### L'achat d'origine, et une seule montée

Conditions du `verdictDeLaMontee` (domaine, sans base) :

1. le dossier n'est pas déjà couvert par Dossier ou Pro (`DEJA_DOSSIER`) ;
2. un Essentiel **confirmé** couvre ce dossier (`SANS_ESSENTIEL`). « Couvrir » se lit dans le grand livre : un octroi de cet achat sur ce dossier ;
3. l'achat d'origine n'est ni remboursé, ni en cours de remboursement (`REMBOURSEMENT`) ;
4. aucune montée confirmée n'en est partie (`DEJA_MONTE`, `MONTEE_EN_REMBOURSEMENT`). Une montée en attente est reprise, pas doublée ;
5. la différence est positive (`SANS_SUPPLEMENT`).

Chaque refus dit ce qui l'arrête et ce qui reste possible. La route les rend sous le code `montee_indisponible`.

En base :

- `Transaction.sourceTransactionId` lie la montée à son achat. Une contrainte `CHECK` l'exige sur `montee-dossier` et l'interdit ailleurs.
- Un index unique partiel refuse une seconde montée initiée, en attente ou confirmée depuis le même achat et sur le même dossier. Une montée échouée, expirée ou remboursée ne compte plus.
- Deux clics simultanés sur « Payer » : le second bute sur l'index et reprend la transaction du premier.

**Le défaut trouvé en chemin.** `creerOuReprendre` reprenait *n'importe quelle* transaction en attente sur le dossier. Une recharge en suspens aurait été reprise à la place du passage à Dossier, et inversement. La reprise porte maintenant sur le même code d'achat, et, pour une montée, sur le même achat d'origine. La fumée le vérifie dans les deux sens, et une mutation qui retire le filtre la fait tomber.

### Le rejeu

C'est le mécanisme existant qui le couvre :

- la notification est idempotente par `providerEventId` ;
- la table d'états refuse de faire avancer une transaction déjà confirmée ;
- `acheverLeCredit` vérifie qu'aucun octroi de la transaction n'existe avant de créditer.

La fumée rejoue la même notification, en envoie une nouvelle, puis lance deux achèvements simultanés : il n'y a toujours qu'un octroi.

### Le remboursement du supplément

- La décision (`refundDueAt`) retire aussitôt le droit à de nouveaux appels de rédaction assistée.
- L'envoi retire les **20 analyses ajoutées** encore disponibles, et elles seules. L'achat Essentiel n'est pas touché, et les réponses, textes et versions ne le sont jamais.
- Les consommations ne portent pas de transaction : les analyses ajoutées sont tenues pour **consommées en dernier**, après celles d'Essentiel et des recharges.
  - Si le solde couvre encore les 20, le retrait est intégral et se fait sans humain. C'est le cas d'un candidat qui a épuisé ses dix analyses d'Essentiel.
  - En deçà, une partie a servi : la transaction passe en **revue manuelle** par l'écart, et aucune demande ne part.

Compter toutes les consommations du dossier, comme pour un pack, aurait envoyé en revue manuelle tout candidat qui avait simplement utilisé Essentiel.

### Les écrans

**`/paiement/pack`** — un dossier Essentiel n'est plus renvoyé à son dossier. L'écran lui propose deux gestes distincts, aucun présélectionné :

- **« Passer à Dossier »**, avec le calcul écrit en entier ;
- **« Ajouter des analyses »**, une recharge indépendante.

Un dossier déjà en Dossier ou en Pro est toujours renvoyé à son dossier.

**Récapitulatif d'une montée** :

- le prix de Dossier, le montant déjà payé et la différence ;
- ce que la montée ouvre ;
- la devise, figée à celle de l'achat d'origine.

**Récapitulatif d'un pack au prix plein** sur un dossier déjà couvert : il se dit **pack supplémentaire, au prix plein**, et précise que ce n'est pas un passage à Dossier. Il donne le prix du passage quand celui-ci est ouvert.

**Quota épuisé** — le bouton s'appelle **« Ajouter des analyses »** (il disait « Recharger 10 analyses »). « Passer à Dossier — 10 000 F » s'affiche à côté quand le passage est ouvert.

**Rédaction et relecture réservées** — le lien mène à la page des packs quand le passage est ouvert, sinon à la page Tarifs.

**Reçu, attente, confirmation, échec** — ils nomment le « Passage d'Essentiel à Dossier ». L'écran d'échec propose de reprendre le passage.

### Ce qui a été corrigé au passage

L'écran de dépôt nommait le pack d'après la **dernière transaction confirmée**. Une recharge en est une, et `getPack("recharge")` ne rend rien : un dossier qui venait de recharger lisait « sans pack ». Le pack se lit maintenant sur la couverture du dossier (`packDeLaCouverture`), et une montée y compte pour Dossier.

### Ce que ce lot ne tranche pas

- **Le passage d'Essentiel à Dossier Pro.** L'arbitrage ne porte que sur Dossier.
- **Le remboursement de l'Essentiel d'origine après une montée confirmée.** Il suit la règle d'un pack : toute consommation sur le dossier l'envoie en revue manuelle. La montée, elle, reste en place.
- **Le back-office.** La liste des candidats et la marge par dossier lisent toujours le premier pack confirmé. Elles affichent « Essentiel » et son prix pour un dossier monté.
- **Une différence inférieure au minimum de 3 000 F** (RG-05.5). Elle est impossible aux tarifs actuels, et le minimum s'appliquerait comme à tout achat.

## S.89 — La date réelle du dépôt est demandée, et elle commande la suite

Jusqu'ici, la déclaration posait `submittedAt` à l'instant du clic. Un dépôt fait le 1er septembre et déclaré le 20 comptait donc à partir du 20 : la conservation durait trois semaines de trop, et les relances J+30 et J+60 de DOC-11 n'existaient pas du tout.

### Deux faits, et aucun ne tient lieu de l'autre (RG-10.8)

| Fait | Colonne | Ce qu'il commande |
|---|---|---|
| Date réelle du dépôt | `Application.depositedOn` (`DATE`) | relances J+30 et J+60, échéance normale de conservation à douze mois, suivi, export |
| Déclaration dans ImmiPro | `Application.submittedAt` (instant) | audit, et lecture d'une déclaration tardive |

`updatedAt` ne tient lieu d'aucune des deux. Le repli sur la dernière écriture est retiré de `echeanceDuDossierSoumis`. Un dossier soumis sans aucune date est une anomalie : il lève une erreur, et la passe la compte comme incident au lieu de la combler.

La base exige les deux dates ensemble. Elle refuse une date réelle postérieure à la déclaration ou antérieure à l'ouverture du dossier, avec une marge de fuseau horaire.

**Reprise de l'existant.** Les dépôts déjà déclarés reçoivent comme date réelle le jour de leur déclaration, lu à Cotonou. C'est la seule date connue. Leur `retentionUntil` n'est pas touché.

### L'écran

- La question « Quand as-tu déposé ta demande ? » est suivie de l'aide « Indique la date où tu as remis ou envoyé la demande à l'autorité ou à son prestataire. »
- Le champ est obligatoire, prérempli avec **le jour du candidat** et modifiable. La case de confirmation reste décochée.
- Le jour se lit dans le fuseau du candidat, celui de ses rappels (S.87). À Montréal à 21 h, Cotonou est déjà au lendemain, et ce lendemain serait refusé comme futur.
- Un refus s'affiche sous le champ avant l'envoi. Le serveur applique la même règle (`refusDeLaDateDeDepot`).
- Deux refus seulement : une date future et une date antérieure à l'ouverture. Rien n'est comparé à `readyAt`, et aucun retard n'est refusé.

### Déclaration tardive

L'échéance normale est de douze mois après la date réelle ; elle peut donc être proche, voire passée. La passe de conservation envoie alors le préavis, et l'échéance effective vaut `max(douze mois, annonce + trente jours)`. La fumée le vérifie : un dépôt de février 2025 déclaré en septembre 2026 n'est purgé qu'après trente jours au moins.

### Relances J+30 et J+60 (WF-10 étape 2)

C'est le nouveau job `dossier.suivi-depot`. Il tourne toutes les heures et n'envoie qu'à partir de 8 h dans le fuseau du candidat.

- **Calcul :** les jalons se comptent depuis la date réelle, et la décision est dans le domaine (`relanceDuJour`).
- **Pas de rafale :**
  - un jalon déjà dépassé le jour de la déclaration ne part jamais ;
  - un rattrapage n'envoie que le jalon échu le plus récent ;
  - un jalon plus ancien qu'un jalon déjà envoyé ne part plus.
- **Idempotence :** chaque relance est réservée sous la clé `suivi-depot:<dossier>:<jalon>` avant tout envoi. Deux passes simultanées produisent un seul courrier.
- **Courrier :** il n'est dit `ENVOYE` que s'il a été accepté. Il est repris quelques fois sous bail, puis abandonné en `NON_ENVOYE`. L'envoi réservé est désormais partagé avec les rappels d'échéance (`server/jobs/courrier-reserve.ts`).
- **Exclusions :** aucune relance si le dossier n'est plus `SOUMIS` ou si la suppression du compte est demandée.
- **Texte :** il demande si l'autorité a répondu et dit où déclarer l'issue. Il précise que continuer d'attendre ne demande rien. Il ne suppose rien de la réponse (INV-1, INV-2).

L'écran du dossier affiche la date réelle du dépôt et la prochaine question prévue.

### Correction auditée

Une fois confirmée, la date ne se modifie pas depuis le dossier. La correction passe par la fiche du compte en back-office (`POST /api/admin/dossiers/[id]/depot`).

- **Contrôles :**
  - le motif est obligatoire (dix caractères au moins) ;
  - la nouvelle date suit les mêmes règles que la déclaration ;
  - elle ne peut pas être postérieure à la déclaration, ni identique à l'ancienne.
- **Journal :** l'action `dossier.depot.correction` est écrite **avant** la modification. Elle porte l'acteur, le motif, l'ancienne et la nouvelle valeur, et les échéances avant et après.
- **Recalcul** (`correctionDuDepot`) :
  - la conservation suit la nouvelle date, sans jamais raccourcir une prolongation obtenue ;
  - une purge annoncée garde son jour si la nouvelle échéance la précède ;
  - si la nouvelle échéance est plus tardive, l'annonce tombe et la passe en refera une avec ses trente jours ;
  - les relances se recalculent d'elles-mêmes, et celles déjà envoyées le restent.

### Export

La portabilité exporte `dateReelleDuDepot` et `depotDeclareDansImmiProLe`, qui remplacent le `deposeLe` ambigu.

### Ce que ce lot ne tranche pas

- **La demande de correction par le candidat.** Il la signale au support ; il n'y a pas encore de formulaire dédié.
- **La langue des relances.** Elles restent en français, comme les autres courriers.

## S.90 — Les trois points laissés ouverts par S.88 et S.89

### 1. Remboursement du supplément Dossier : la règle est confirmée et écrite

S.88 avait adopté une convention sans la faire figurer dans DOC-11. Comme les consommations ne portent pas d'achat, les 20 analyses ajoutées par la montée sont tenues pour **consommées en dernier** :

- tant que le solde du dossier couvre les 20, elles sont toutes encore disponibles et se retirent sans revue ;
- en deçà, la différence a servi, et le remboursement passe en revue manuelle.

La règle figure maintenant dans RG-05.6. Le code et la fumée `smoke:montee` la tenaient déjà.

### 2. Le candidat demande une correction de la date de dépôt

S.89 réservait la correction au back-office : le candidat devait écrire au support, sans trace dans l'application. Il la **demande** maintenant depuis son dossier, sous le bloc « Conservation de tes pièces », avec le lien « La date de ton dépôt est fausse ? ».

**Côté candidat**

- Il donne la bonne date et d'où vient l'erreur. Tant que ces deux champs ne sont pas renseignés, le bouton reste désactivé et dit ce qui manque.
- La date suit la règle de la correction (`refusDeLaCorrection`), commune au candidat et à l'opérateur : ni future, ni antérieure à l'ouverture, ni postérieure à la déclaration, ni identique à la date enregistrée.
- Une seule demande peut être en attente par dossier ; un index unique partiel l'impose.
- La date enregistrée ne change pas d'ici là, et l'écran le dit. Un refus du serveur garde la saisie.

**Côté opérateur** (fiche du compte)

- Il voit la demande et son explication.
- « Reprendre la date demandée » préremplit la correction auditée de S.89. Cette correction tranche la demande (`APPLIQUEE`, avec l'auteur) et prévient le candidat dans ses alertes.
- « Ne pas retenir la demande » exige une **réponse au candidat** d'au moins vingt caractères. La réponse passe par le vocabulaire interdit (point d'application B-05 de CLAUDE.md), part au journal comme motif et arrive dans les alertes du candidat.

**Export** : l'export des données rend ses demandes avec leur statut et la réponse reçue.

### 3. La CI était arrêtée par deux erreurs de syntaxe, pas seulement par la facturation

Chaque exécution échouait en une seconde, sans aucun job, sous le nom du fichier plutôt que « CI ». C'est la signature d'un workflow que GitHub ne parvient pas à lire. actionlint le confirme :

- **`validation.yml`** : un `run:` non entre guillemets contenait « suspendus : annonce » ; le « : » suivi d'une espace se lit comme une clé YAML. Cette ligne vient du lot S.78.
- **`deploy.yml`** : `outputs: { tag: ${{ … }} }` ; les accolades de l'expression cassent la table en ligne.

`ci.yml` appelle `validation.yml`, et `deploy.yml` échouait de lui-même : les trois workflows étaient donc refusés, quel que soit l'état de la facturation.

Les deux lignes sont corrigées, et actionlint passe sur les trois fichiers. Les fumées `smoke:montee` et `smoke:depot` entrent dans la porte de validation.

Si des exécutions restent bloquées après ce correctif, la cause restante sera la facturation GitHub Actions. Elle se règle dans les paramètres du compte, pas dans le dépôt.

## S.91 — Le rail de remboursement FedaPay : une procédure manuelle, tracée

### Le constat

La demande était d'écrire l'appel réel de remboursement FedaPay. La documentation de FedaPay, relue le 25/09/2026 dans sa version courante et dans la v1, ne décrit **aucune API de remboursement**. Le remboursement se fait au tableau de bord (bouton « Rembourser », courriel du client, motif), et **par MTN Mobile Money seulement**. La référence d'API couvre les transactions (création, lecture, mise à jour, suppression, jeton de paiement) et les dépôts (`/payouts`), et rien d'autre.

Deux chemins ressemblent à un remboursement. Ils sont écartés :

- `PUT /transactions/{id}` avec `status: "refunded"` : rien ne documente que cette écriture déplace de l'argent. Elle pourrait n'étiqueter que la ligne ;
- `POST /payouts` : c'est un nouveau versement vers un numéro, sans lien avec le paiement d'origine et sans idempotence documentée. Une reprise pourrait payer deux fois. C'est une autre décision métier.

### La décision

Le rail FedaPay devient une **procédure manuelle tracée en B-04**. La capacité `remboursement` reste « non branchée » : rien d'automatique ne rembourse sur ce rail.

1. **Initiation** : elle est inchangée (K.C). La tentative est réservée, puis les droits non consommés sont retirés une seule fois. Ensuite, l'adaptateur rend la nouvelle issue `procedure_manuelle`, sans aucun appel réseau et sans clé. L'issue exige un humain : un écart s'ouvre avec le geste à faire (`A_REMBOURSER_A_LA_MAIN`), et la passe de relance ne s'acharne pas.
2. **B-04** : la section « Remboursements FedaPay à faire au tableau de bord » liste toutes les dettes FedaPay ouvertes, **toutes dates confondues**. Le tableau du jour ne montrait pas une dette née la semaine précédente.
3. **Déclaration** : l'opérateur saisit la référence du remboursement que le tableau de bord affiche. Elle est stockée préfixée (`fedapay:…`) dans `Transaction.refundProviderRef` et pose `refundRequestedAt`. **Ni `status`, ni `refundedAt`** : la dette reste due et visible.
4. **Solde** : il ne vient que de la notification signée `refunded` de FedaPay (INV-7).

### Pas de double remboursement

- L'écriture est conditionnée à `refundRequestedAt IS NULL` : de deux clics simultanés, un seul passe.
- La même référence redite est un rejeu : rien ne change, et le journal n'est pas écrit deux fois.
- Une autre référence sur un paiement déjà déclaré est refusée, avec ce qu'il faut vérifier chez FedaPay.
- `refundProviderRef` est **unique** en base : un remboursement du fournisseur ne solde pas deux dettes.
- Une contrainte `CHECK` refuse une référence sans demande datée.
- Une dette non initiée ne se déclare pas : ses droits n'ont pas été retirés (K.C). Un pack entamé, en revue manuelle, se tranche d'abord dans la file des écarts.

La déclaration est journalisée (`paiement.remboursement.manuel`) avec la référence du fournisseur. Aucune clé n'y figure : ni la route ni l'adaptateur n'en manipulent.

### Vérifications

`tests/remboursement.test.ts` (adaptateur sans réseau ni secret, référence, conditions, INV-7), `tests/ui/remboursements-fedapay.test.tsx` (états vide, envoi, refus, déclarée, non initiée), `smoke:remboursement` bloc 11. Ce bloc passe par le vrai adaptateur, avec `fetch` piégé : zéro appel réseau. Rien n'y simule un succès du fournisseur.

## S.92 — Essentiel → Dossier : décision définitive

### Ce qui est tranché

- **Prix** : la différence avec l'Essentiel réellement payé (inchangé depuis S.88).
- **Analyses** : +20 (inchangé).
- **Consommation FIFO, traçable par octroi.** Chaque débit nomme l'octroi qu'il entame (`AnalysisCredit.grantId`), le plus ancien qui a encore des analyses. Une analyse rendue retourne à l'octroi qu'elle avait entamé, et un retrait de remboursement ne prend que sur l'achat remboursé. La convention de S.90, « les analyses ajoutées sont consommées en dernier », est remplacée : lue sur le solde, elle faisait passer pour intacte une montée entamée dès qu'une recharge avait été achetée après elle.
- **Remboursement automatique du supplément** seulement si les 20 analyses de la montée sont intactes **et** si aucune rédaction assistée n'a servi depuis la confirmation. La rédaction se reconnaît à deux traces : la note du débit, écrite avant l'appel (`NOTE_REDACTION_ASSISTEE`), et une ligne `AiUsage` `redaction:`/`relecture:`. Sinon, revue manuelle, avec un motif qui nomme la ou les causes.
- **Essentiel d'origine** : tant qu'une montée confirmée n'est pas remboursée, il ne se rembourse pas seul. `ouvrirUnRemboursement` refuse avec `REFUS_ESSENTIEL_APRES_MONTEE`.
- **Essentiel → Dossier Pro** : hors V1 (`MONTEES_OUVERTES = ["dossier"]`).

### Le back-office

- **B-03** lisait la première transaction confirmée du compte, et **B-07** le premier achat de catégorie « pack ». Après une montée, les deux désignaient l'Essentiel ; une recharge payée en premier affichait « aucun ».
- Les deux lisent maintenant le **pack effectif** (`packEffectif`), calculé sur les octrois `ACHAT_PACK` confirmés et non retirés. Une montée compte pour Dossier, au **prix réellement payé** : l'Essentiel plus la différence (12 + 17 = 29 €).
- La part du prix, donc la marge, et le quota de jetons se lisent sur ce pack.

### Concurrence et idempotence

- Un verrou consultatif de transaction par dossier (`sousVerrouDuGrandLivre`) sérialise les débits, ainsi que l'évaluation et l'écriture du retrait de remboursement. Sans lui, deux débits simultanés pouvaient entamer deux fois la dernière analyse d'un octroi, et un débit pouvait se glisser entre la lecture « intacte » et le retrait.
- Des droits déjà retirés ne se réévaluent pas : une reprise après une panne reprend l'envoi sans prendre son propre retrait pour une consommation. L'index unique partiel reste la garantie contre un second retrait.

### Données existantes

La migration `20260925230000_imputation_des_analyses` ajoute `grantId` (nullable, clé étrangère, index) et un `CHECK` : seuls les débits, rendus et retraits en portent un. **Aucune ligne n'est réécrite.** Les lignes antérieures sont imputées au rejeu par la même règle (`domain/payments/grand-livre.ts`).

### Vérifications

- `tests/montee-en-gamme.test.ts` : FIFO avec recharge avant et après, rendus, lignes anciennes, retrait ; suite du remboursement ; Essentiel ; Pro ; pack effectif.
- `tests/remboursement.test.ts` : rejeu et verrou.
- `smoke:montee` : l'Essentiel bloqué puis débloqué, B-03 et B-07, recharge avant et après, rédaction utilisée, 31 débits simultanés, un débit et un remboursement simultanés, un remboursement rejoué.

## S.93 — Périmètre V1 définitif : documentation et surfaces de lancement

Le périmètre est fixé en tête de DOC-11 (§0, « Périmètre V1 définitif »). Il l'emporte sur toute étape qui le contredirait.

### Ce qui a été aligné

- **SMS : V2.** WF-09 étape 3 et RG-09.4 le disent. `SMS_PROVIDER_KEY` quitte `.env.example` : c'était la seule variable documentée que rien ne lit, gardée depuis le 22/09/2026 comme trace d'un écart. La trace vit maintenant dans DOC-11. Un test interdit qu'une variable SMS ou Google revienne.
- **OAuth Google : V2.** WF-02 étape 1 le dit, et le README ne nomme plus NextAuth, retiré le 22/09/2026.
- **Essentiel → Dossier Pro : V2** (déjà écrit dans RG-05.6 par S.92), repris dans le périmètre.
- **Date de dépôt.** La correction autonome est reportée ; le recours passe par le support. RG-10.8 le décrivait déjà : le candidat signale la date, et un opérateur tranche.
- **Partenaires** désactivés sans activation conformité : c'était déjà l'état du produit (K.D, filtre en requête), désormais écrit dans le périmètre.
- **Fuseau.** Les rappels suivent le fuseau choisi, tous les autres écrans l'heure de Cotonou. Trois affichages suivaient encore le fuseau du navigateur : la mention de source (`SourceNote`), les dates de vérification d'une fiche pays, et la date de dépôt du tableau de bord (une date civile, qui reculait d'un jour à l'ouest de Greenwich). Ils sont corrigés.
- **`metadataBase`** est lu sur `APP_URL` par `origineDuSite`, avec un repli local sûr pour une valeur absente, relative ou d'un autre protocole. Le plan du site lit la même fonction.
- **README** : le statut « Squelette » est remplacé par l'état réel et renvoie aux registres.

### `/comment-ca-marche` — Q.A, « Produit et contenu »

La page est écrite à partir du parcours réellement implémenté. Ses nombres sont importés du domaine (grille des packs, délais de rappel, jalons de suivi, durées de conservation), et rien de ce qui est hors V1 n'y figure. Elle entre au pied de page et au plan du site.

Le registre Q.A la marque servie (`servie: { le, source }`) **sans effacer** son responsable ni ce qui manquait le jour du relevé. Le test, qui interdisait jusqu'ici toute page servie, vérifie désormais l'accord entre le registre et l'arborescence, page par page.

Les trois pages juridiques et le contact restent absents : aucun texte juridique ni aucune identité d'entreprise n'est inventé.

## S.94 — Plusieurs fournisseurs d'IA au choix (ouvert)

**Question posée le 25/09/2026 : peut-on proposer d'autres fournisseurs d'IA qu'Anthropic, au choix ?**

**Constat.** Oui, et l'essentiel est déjà prêt :

- les contrats `Extracteur`, `Redacteur` et `Critique` sont neutres ;
- les consignes, les schémas, la lecture des réponses et les causes d'échec vivent dans le domaine ;
- l'état de service mesure le résolveur.

Le couplage tient dans les adaptateurs : le client du SDK, la classification de ses erreurs, les blocs PDF, la sortie par schéma et `stop_reason`. S'y ajoutent les variables `ANTHROPIC_API_KEY`, un tarif unique et `AiUsage`, qui ne porte ni fournisseur ni modèle.

**Ce qui n'est pas technique, et bloque avant le code :**

- chaque fournisseur est un sous-traitant qui recevrait des pièces d'identité ;
- le quota INV-6 est compté en jetons, qui ne se comparent pas d'un fournisseur à l'autre ;
- la qualité de lecture est à mesurer sur un jeu d'évaluation.

**Proposition.**

- **Choix par configuration**, un fournisseur par fonction (`AI_FOURNISSEUR_EXTRACTION`, `AI_FOURNISSEUR_REDACTION`, défaut `anthropic`).
- **Aucune bascule automatique** pour les pièces.
- Cinq lots :
  1. neutraliser sans changement visible ;
  2. tracer par fournisseur (migration `AiUsage.provider` et `model`, tarifs par fournisseur) ;
  3. un second fournisseur pour la rédaction ;
  4. l'extraction chez ce fournisseur, après décision de conformité et jeu d'évaluation ;
  5. un repli explicite, facultatif, pour la rédaction seulement.

Le détail est dans `docs/IA-fournisseurs.md`.

**À trancher :**

1. les fournisseurs et les fonctions ;
2. la sous-traitance : convention, `/donnees-personnelles`, consentement ;
3. le quota : jetons, coût ou coefficient ;
4. le repli ;
5. le jeu d'évaluation et son seuil.

**Rien n'est implémenté.** En V1, Anthropic reste le seul fournisseur.

### S.94 — suite (26/09/2026) : implémenté

La demande est d'implémenter de bout en bout, en front comme en back. Les options recommandées sont retenues :

- **Choix par configuration**, un fournisseur par fonction : `AI_FOURNISSEUR_EXTRACTION`, `AI_FOURNISSEUR_REDACTION`, Anthropic par défaut.
- **Un second adaptateur** « compatible OpenAI » (`src/server/ia/openai-compatible.ts`, sans SDK). Il sert OpenAI, Mistral, Gemini ou un serveur local. Le produit ne devine aucun modèle.
- **Garde des pièces.** Chez un autre sous-traitant qu'Anthropic, la lecture n'est branchée que si `AI_PIECES_SOUS_TRAITANT_AUTORISE` porte son code. La variable se pose une fois la conformité tranchée ; sans elle, les pièces partent en revue humaine.
- **PDF.** Envoyé seulement à un fournisseur déclaré lecteur de PDF (`AI_OPENAI_PDF=oui`).
- **Pas de bascule automatique.** Un fournisseur en panne rend sa cause, sans repli sur un autre.
- **Quota en jetons** (option a).
- **Traçabilité et coûts.** `AiUsage.provider` et `model` (migration, l'historique n'est pas réécrit), tarif par fournisseur. B-07 affiche une section « Fournisseurs d'IA » : état par fonction, raison actionnable, consommation par fournisseur.
- **Règles et documentation.** RG-06.7 et RG-08.6 sont ajoutées dans DOC-11, avec une ligne dans le périmètre V1. Le §9 de `docs/IA-fournisseurs.md` détaille la procédure d'activation.

**Reste hors code.**

1. La décision de conformité, et le texte de `/donnees-personnelles`.
2. Le jeu d'évaluation des pièces.
3. Le repli explicite pour la rédaction, qui n'est pas implémenté.

## S.95 — La fiche Émirats reprise sur sources officielles

**Demande du 01/10/2026.** La fiche `AE/etudes_residence_etudiante` reposait sur des agrégateurs (`SECONDAIRE`), et sa date de relecture, le 30/09/2026, était passée. Elle est reprise sur les sources officielles et passe en `OFFICIEL`.

### Les sources relevées le 01/10/2026

| Source | Ce qu'elle établit |
|---|---|
| ICP, délivrance d'un titre de séjour (étudiant) | durée du titre égale à celle du programme ; 180 jours sur le territoire après la fin des études ; passeport valable 6 mois ; assurance santé ; attestation d'inscription précisant le programme et sa durée ; frais |
| ICP, permis d'entrée pour études | entrée dans les 60 jours ; frais |
| GDRFA Dubaï, titre de séjour étudiant | l'établissement parraine ; examen médical ; frais propres à Dubaï ; 60 jours de grâce après une annulation ou une expiration |
| u.ae, séjour pour études et dispositions générales | parrainage par l'établissement ou par un parent résident ; examen médical à partir de 18 ans ; carte d'identité émirienne |
| u.ae, permis de travail | permis de formation et d'emploi étudiant, valable trois mois |
| ICP, résidence dorée | étudiants et diplômés exceptionnels : seuils de moyenne, catégorie de l'établissement, diplôme de moins de deux ans |

### Ce qui change

- **Retiré, faute de source** : le niveau « IELTS 6.0 », la fourchette de frais de scolarité, le délai de 21 à 35 jours, la validité de 6 mois de l'examen médical et la pièce « diplôme légalisé ». Chaque champ vide l'est par choix : la plateforme n'annonce pas une valeur qu'aucune source ne porte (INV-8).
- **Frais de dossier** : ils sont laissés vides et détaillés en réserve, autorité par autorité. Un montant unique serait faux pour Dubaï ou pour les autres émirats.
- **Délai de traitement** : il est laissé vide. Les 2 jours de l'ICP et les 48 heures de la GDRFA courent à partir du dépôt par l'établissement, pas du début des démarches. Pris comme délai total, ils auraient fait poser par l'échéancier une date de dépôt deux jours avant le départ. Ils figurent en réserve.
- **Après les études** : les 180 jours de l'ICP remplacent le « visa de travail ou Golden Visa, 24 mois » de l'agrégateur. La résidence dorée passe en réserve, avec ses seuils.
- **Conditions** : la condition de moyenne pour la résidence dorée est retirée. Elle s'évaluait sur le diplôme d'entrée, alors qu'elle porte sur le diplôme obtenu aux Émirats ou dans l'une des 100 premières universités mondiales. Les conditions passeport et assurance s'ajoutent, toutes deux bloquantes et rattachées à leur pièce.
- **Pièces** : s'ajoutent la photo et la demande de carte d'identité émirienne (démarche).
- `tests/validite-des-pieces.test.ts` est mis à jour : la fiche ne porte plus aucune pièce périssable.

### Ce qui reste

- **La publication.** La fiche reste en `DRAFT`. Elle a été préparée avec un assistant IA (`verifiedBy: "releve-assiste"`) : un opérateur la relit sur les sources citées puis la publie en B-02. La règle de S.46, celui qui écrit ne publie pas, s'applique ainsi d'elle-même.
- **La légalisation d'un diplôme béninois** pour les Émirats n'est décrite par aucune source relevée. Elle reste en réserve, à confirmer auprès de l'établissement et de l'ambassade.
- **Le niveau de langue.** Il est vide, et la fiche l'affiche donc « Aucun niveau exigé », ce qui est exact pour le titre de séjour. La réserve dit que l'établissement fixe le sien. Si l'affichage doit distinguer « non exigé par l'autorité » de « exigé par l'établissement », cela se tranche à part.
- **Prochaine relecture** : le 01/01/2027.

## S.96 — L'antivirus branché pour le pilote, la messagerie prête à l'être

**Demande du 01/10/2026 : brancher la messagerie et l'antivirus pour le pilote fermé.**

### Antivirus : un moteur réel en face de `ANTIVIRUS_URL`

Le contrat de balayage date du 22/09/2026 (`domain/securite/balayage.ts`). Il est HTTP, et prévoit qu'un moteur sans HTTP se branche derrière « une trentaine de lignes de colle ». Aucune colle n'existait, et aucun moteur n'était décrit au déploiement : `ANTIVIRUS_URL` n'avait rien à désigner.

**Ce qui est ajouté**

- **`clamav`** (`clamav/clamav:1.4`) dans `docker-compose.prod.yml`. Il porte clamd et freshclam, qui tient les signatures à jour seul, et les signatures vivent dans un volume. `StreamMaxLength` est aligné sur `TAILLE_MAXI_BALAYAGE_OCTETS` (32 Mo) par `CLAMD_CONF_StreamMaxLength` : sans cela, un fichier accepté par le balayeur serait refusé par le démon à chaque reprise.
- **`antivirus`** : la passerelle HTTP (`server/securite/passerelle-clamd.ts`), même image que l'application, commande `node dist/passerelle-antivirus.js`. Elle reçoit les octets, les passe au démon par `zINSTREAM` en blocs de 64 Kio, et rend la réponse du contrat. Son contrôle de santé interroge `/sante`, qui envoie `zPING` au démon.
- **La lecture de la réponse du démon** (`domain/securite/clamd.ts`) : elle est pure et testée sans réseau. Seul `stream: OK` est sain. `… FOUND` est une infection. Le reste (`ERROR`, réponse vide, forme inconnue) est une erreur, que la passerelle rend en 502, 503 ou 504. Le balayeur lit ces statuts comme `INDISPONIBLE`, et la pièce reste en quarantaine.
- **`ANTIVIRUS_URL=http://antivirus:8080/balayer`** dans `.env.app`. Rien n'est exposé hors du réseau interne.
- **Aucun `depends_on` du worker vers ces services.** Un antivirus en panne laisse les pièces en quarantaine ; il n'arrête ni la purge ni les paiements.

**Vérifications**

- `tests/passerelle-clamd.test.ts` (27 cas), contre un faux démon TCP qui parle le protocole :
  - les octets arrivent réassemblés à l'identique ;
  - EICAR est vu, y compris à cheval sur deux blocs ;
  - une erreur, une réponse hors protocole, un raccrochage, un démon muet ou un démon absent ne rendent jamais « saine » ;
  - un corps vide ou trop gros est refusé avant le démon.
- `smoke:worker` lance aussi la commande du service `antivirus`, depuis l'artefact seul et sans `node_modules`. En mode `--image`, il la lance depuis l'image. Sans démon, la passerelle doit tenir debout et répondre 503 sur `/sante`.
- **Contre le vrai moteur, le 01/10/2026**, avec ClamAV 1.5.4 en local, puis l'image `clamav/clamav:1.4` sur un réseau Docker, sous le nom de service `clamav` :
  - un fichier ordinaire est sain, et un fichier de 20 Mo passe ;
  - EICAR est détecté, et un motif à cheval sur deux blocs aussi ;
  - la sonde du worker conclut « reconnu » ;
  - un démon absent rend `INDISPONIBLE` ;
  - le contrôle de santé de l'image est vert.

  La base de signatures était réduite à l'essai : le bac à sable ne joint pas `database.clamav.net`.

**À faire sur le VPS**

- Le déploiement ne recopie pas `docker-compose.prod.yml` : il faut le recopier une fois sur le VPS.
- Renseigner `ANTIVIRUS_URL` dans `.env.app`.
- Prévoir environ 1,5 Go de mémoire pour clamd, et le double le temps d'un rechargement.

La procédure est dans `INSTALLATION-GITHUB.md` §4.

### Messagerie : rien à coder, un compte à ouvrir

Le transport SMTP est branché depuis S.43, et la fumée `smoke:courrier` l'éprouve sur un serveur local. Ce qui manque n'est pas du code, ce sont deux choses que le dépôt ne peut pas fournir :

- **un compte chez un fournisseur SMTP transactionnel** ;
- **un domaine d'envoi authentifié** (SPF, DKIM, DMARC), sans quoi les courriels de vérification partent en indésirables.

Les identifiants vont dans `.env.app` (`SMTP_URL`, `SMTP_FROM`), jamais dans le dépôt. La procédure est dans `INSTALLATION-GITHUB.md` §4. Le registre `DEPENDANCES` reste inchangé : la messagerie est toujours bloquante avant l'ouverture au public, et elle se lève par configuration.

## S.97 — Brouillons des mentions légales et des conditions

**Demande du 01/10/2026.** Deux brouillons sont rédigés dans `docs/juridique/`, pour la direction et le conseil juridique (Q.A) : `mentions-legales.brouillon.md` et `conditions.brouillon.md`. Aucune page n'est créée.

**Ils ne lèvent pas Q.A.** Un brouillon n'est pas un texte validé, et Q.A interdit d'inventer un texte juridique ou une identité d'entreprise. Le registre `PAGES_PUBLIQUES` reste donc inchangé : les pages restent absentes, leurs liens aussi, et la réserve affichée près des cases d'acceptation demeure.

**Ce qu'ils contiennent**

- Tout ce que le code fixe, avec un tableau des sources en fin de fichier : prix, passage d'Essentiel à Dossier, remboursements, moyens de paiement, reçu, durées de conservation, suppression de compte, export, sous-traitants, cookie de session.
- Les limites du service : INV-1, INV-2, RG-08.2.
- Des marques `[À COMPLÉTER]` pour ce que le produit ignore : identité de l'entité, immatriculation, hébergeur exact, âge minimum, délais de réponse.
- Des marques `[À TRANCHER]` pour ce qui demande un avis : droit applicable, droit de rétractation (dont le cas des candidats de l'Union européenne qui paient en euros), TVA, facture (M.C), transfert de données vers le prestataire d'IA, autorité de contrôle, nouvelle acceptation après un changement de version.

Les deux textes passent le vocabulaire interdit avec ses trois listes. `docs/` est hors du périmètre de `check:copy` ; le contrôle a été fait à la main avec la même fonction.

**Trois écarts relevés en rédigeant**, consignés dans `docs/juridique/README.md` :

- **Remboursement d'un pack entamé.** DOC-11 annonce une proratisation selon les jetons consommés. Le code n'en calcule aucune : la demande part en revue manuelle.
- **Opérateurs Mobile Money.** DOC-11 nomme MTN MoMo et Moov. Le produit n'en nomme aucun.
- **Remboursement FedaPay.** Il n'est possible que par MTN Mobile Money. Rien n'est prévu pour un paiement fait par un autre opérateur.

### S.97 — suite : le brouillon des données personnelles

`docs/juridique/donnees-personnelles.brouillon.md` est rédigé pour le responsable conformité et le conseil juridique. Il couvre :

- les données collectées, relevées dans le schéma, et leurs finalités ;
- les bases légales, toutes `[À TRANCHER]` ;
- les consentements et l'effet de leur refus ;
- l'analyse par l'IA, et la complétude, qui ne produit aucune décision ;
- les destinataires et sous-traitants, les durées de conservation, les droits et la façon de les exercer ;
- la sécurité, le cookie et le stockage du navigateur, les mineurs.

Deux faits sont relevés dans le code au passage. Le simulateur ne garde rien côté serveur : les réponses restent dans le `sessionStorage` du navigateur (RG-01.1). L'adresse IP ne sert qu'au contrôle de débit, en mémoire, cinq minutes au plus.

Un quatrième écart s'ajoute au `README` : les consentements `pieces_financieres` et `mesure_audience` sont proposés au candidat, mais ne commandent rien. Une page de données personnelles ne peut pas décrire un consentement sans effet.

## S.98 — Les URL présignées étaient signées pour une adresse que personne ne joint

**Relevé au contrôle avant ouverture du 02/10/2026.** L'écran d'une pièce dépose le fichier par un `PUT` direct sur une URL présignée. Cette URL était signée avec `MINIO_ENDPOINT`, l'adresse par laquelle le serveur joint le stockage. En production, elle vaut `minio:9000`, un nom qui n'existe que sur le réseau Docker. Le candidat recevait donc `http://minio:9000/…` : son navigateur ne pouvait pas le joindre, et aucune pièce ne pouvait être déposée. Rien ne le voyait :

- en local, `localhost:9000` est joignable des deux côtés ;
- les fumées utilisent un faux stockage en mémoire.

Le défaut existait avec MinIO, avant le passage à Garage.

**Infrastructure** (faite sur le VPS par l'exploitant, le 02/10/2026) :

- `stockage.immipro.app` en HTTPS, servi par nginx vers Garage, avec l'hôte d'origine préservé ;
- le port 9000 publié en boucle locale seulement (PR malcomx2022/immipro#182) ;
- une règle CORS limitée à `https://immipro.app`.

Vérifié depuis Internet : préliminaire `OPTIONS`, `PUT` et `GET` présignés passent, et une origine étrangère est refusée.

**Code**

- `MINIO_PUBLIC_URL` est lue par `domain/stockage/adresse-publique.ts` (logique pure). Elle exige `https`, sauf sur la boucle locale, et n'admet ni chemin, ni paramètre, ni identifiant.
- Un second client, le **signataire**, ne sert qu'à signer. Le client interne garde toutes les opérations du serveur.
- La région de signature est fixée à `us-east-1`, celle que vérifie `garage.toml`. Sans elle, le client `minio` interrogeait le stockage avant chaque signature ; aucune signature ne passe plus par le réseau.
- En production, l'absence de `MINIO_PUBLIC_URL` coupe le dépôt avec un message qui la nomme, plutôt que de distribuer des liens injoignables. Sur le poste de développement, l'adresse interne sert aux deux, comme avant.
- Les invariants sont tenus et testés : le dépôt est signé sur la quarantaine, la lecture sur le seau de confiance, pour 5 minutes.

**Vérifications**

- `tests/stockage-adresse-publique.test.ts` : 16 cas. La signature est éprouvée devant un hôte en `.invalid`, qui prouve qu'aucun appel réseau n'est fait.
- Parcours complet contre un vrai Garage v2.2.0, avec deux adresses distinctes : `localhost` pour le serveur, `127.0.0.1` comme adresse publique. Dépôt, taille, lecture, promotion, lien de lecture et suppression passent.

**Au passage**, `PUSH_TEST.txt`, un fichier d'essai poussé sur `main` par erreur, est retiré.

## S.99 — Le choix du fournisseur d'IA, sans priorité à Anthropic (ouvert)

**Demandé par la direction le 02/10/2026** : ne plus donner la priorité à l'API d'Anthropic et comparer les fournisseurs sur pied d'égalité. Le banc comparatif est dans `docs/IA-benchmark.md`, établi à partir des pages officielles lues le jour même.

**Ce qu'il établit**

- **Le prix ne départage pas.** Un dossier type (8 pièces et une lettre) coûte entre 0,01 $ et 0,27 $ en IA selon le modèle.
- **Écartés pour les pièces :**
  - DeepSeek : stockage en Chine, entraînement par défaut, ni PDF ni schéma JSON ;
  - l'API Gemini « Developer » : 55 jours de conservation, sans lieu garanti ;
  - les passerelles, déjà déconseillées par S.94 §5.
- **Quatre finalistes :**
  - Mistral Medium 3.5, point d'accès UE ;
  - OpenAI GPT-6.1 Sol, résidence UE ;
  - Gemini 3.8 Flash sur Vertex AI, région UE ;
  - Anthropic Sonnet 5.5, déjà branché.
- **Aucun classement public ne mesure la lecture de pièces béninoises.** Un essai sur des pièces factices est proposé (§8 du banc), avec un seuil disqualifiant : aucune pièce non conforme lue comme conforme.

**Ce qui n'est pas fait, volontairement**

Le défaut reste `anthropic` dans le code, et l'adaptateur n'est pas modifié. Chaque finaliste demande un changement différent :

| Finaliste | Changement |
|---|---|
| OpenAI | `max_completion_tokens` |
| Mistral | Bloc PDF `document_url` |
| Vertex | Jeton OAuth renouvelé |
| Anthropic | Aucun |

Écrire ces changements avant le choix, ce serait maintenir du code pour des fournisseurs non retenus.

**À trancher**

| # | Question | Qui |
|---|---|---|
| 1 | Valider la liste des finalistes et ouvrir les comptes d'essai | Direction produit |
| 2 | Écrire le jeu d'essai factice et les lectures attendues, et fixer le seuil de champs justes | Produit |
| 3 | Choisir le fournisseur de lecture et celui de rédaction après l'essai | Direction produit |
| 4 | Sous-traitance (S.94 §4.1) pour le fournisseur de lecture retenu : contrat, conservation zéro, résidence, page `/donnees-personnelles` | Conformité et conseil juridique |

**Haiku 4.5**, au passage : Anthropic peut le retirer dès le 15/10/2026. Il ne doit être retenu nulle part.

### S.99 — suite (02/10/2026) : le jeu d'essai est prêt

La deuxième décision à prendre (le jeu d'essai et les lectures attendues) est préparée. Le seuil de champs justes reste à fixer par le produit. Le détail est dans `docs/IA-benchmark.md` §8.1.

**Le jeu d'essai**

- 30 pièces factices sur les quatre règles du référentiel, dont 8 dégradées, 11 qui tendent un piège de fausse conformité et 13 non conformes.
- 10 rédactions sur les quatre pièces que le produit sait mettre en forme, dont deux portent une incohérence à relever.
- Chaque pièce a sa lecture attendue et son verdict attendu. `tests/banc-ia.test.ts` les recalcule avec la chaîne du produit : un jeu faux casse la suite, avant qu'aucun fournisseur ne soit jugé dessus.

**Le banc**

- `npm run banc:ia` fait passer un fournisseur par les adaptateurs du produit. Seul le stockage est contourné.
- La notation rejoue la décision du job d'analyse.
- Une seule fausse conformité disqualifie.
- `npm run banc:ia:aveugle` prépare la relecture à l'aveugle des lettres.

**Rien n'est changé dans le produit** : ni l'adaptateur, ni le fournisseur par défaut, ni le job d'analyse.

### S.99 — suite (02/10/2026) : Mistral et Vertex AI passent par l'adaptateur

À la demande de la direction, le code d'appel prend en charge les deux finalistes qui ne passaient pas tels quels. Aucun code fournisseur n'est ajouté : tous deux restent `openai_compatible`, ce qui laisse inchangés la traçabilité (`AiUsage.provider`), la garde des pièces et l'écran B-07.

**Mistral : la forme du bloc PDF**

- `AI_OPENAI_PDF` déclare la forme attendue : `oui` pour OpenAI (inchangé), `document_url` pour Mistral, `image_url` pour Vertex AI.
- Une autre valeur n'est plus lue comme « non ». Elle est refusée et dite dans B-07, car l'exploitant qui l'a écrite croit que ses PDF partent.

**Vertex AI : le compte de service**

- `AI_OPENAI_AUTH=compte_de_service_google` et `AI_OPENAI_COMPTE_DE_SERVICE`, le fichier JSON de la clé, collé tel quel ou en base64, remplacent la clé d'API.
- La lecture du compte et la composition de l'affirmation sont pures (`domain/ia/compte-de-service.ts`). Le jeton n'est échangé qu'auprès d'une adresse https de Google, jamais vers une adresse qu'un fichier modifié aurait choisie.
- La signature RS256, l'échange et la garde en mémoire sont dans `server/ia/jeton-google.ts`, sans bibliothèque Google. Le jeton est renouvelé cinq minutes avant son expiration et redemandé une fois si Vertex le refuse en cours d'appel.
- Aucun secret n'est journalisé : ni la clé, ni l'affirmation, ni le jeton.

**Vérifications**

- `tests/ia-vertex.test.ts` : 20 cas.
  - Le compte de service : lecture, refus et motifs.
  - Le registre : variables exigées, mode d'authentification inconnu.
  - Une signature vérifiée par la clé publique.
  - Un échange de jeton, sa garde et son renouvellement, contre un vrai serveur HTTP local.
  - Le refus en cours d'appel suivi d'une seule nouvelle demande.
  - Aucun appel vers Vertex sans jeton.
- `tests/ia-fournisseurs.test.ts` : blocs `document_url` et `image_url`, valeur de PDF inconnue.

Rien ne change pour une installation existante : sans ces variables, la configuration lue est la même qu'avant.

## S.100 — L'état de service disait « aucun adaptateur » pour l'IA

**Relevé au contrôle avant ouverture du 02/10/2026, en production.** Sans clé d'IA, `/api/health` écrivait, pour la lecture des pièces et pour la rédaction : « Aucun adaptateur : le point de branchement ne rend rien ». Or les adaptateurs existent, pour Anthropic comme pour l'API compatible OpenAI (S.94, S.99). Le message envoyait l'exploitant chercher du code, alors que le remède était de poser une clé. Ce n'est pas un message d'échec actionnable (`CLAUDE.md`).

**Deux causes**

- La présence d'un adaptateur se déduisait du résolveur, qui rend la fonction non branchée dès que la clé manque. « Pas d'adaptateur » et « pas de clé » se confondaient.
- La rédaction se mesurait sur `process.env` et non sur l'environnement observé : le défaut corrigé pour l'antivirus le 22/09/2026. Le test `capacites` l'avait figé : clé posée, il attendait « aucun adaptateur » pour la rédaction.

**Correction** (`src/server/exploitation/capacites.ts`)

- L'adaptateur se mesure par le fournisseur choisi : il en a un. Une valeur inconnue (`openai`) n'en a pas, et le dit toujours.
- La configuration se mesure par `extractionConfiguree` et `redactionConfiguree`, sur l'environnement observé, garde des pièces et authentification comprises.

**Ce que lit l'exploitant**

| Situation | Ce que lit l'exploitant |
|---|---|
| Sans clé | « Adaptateur présent, configuration absente » |
| Avec une clé | « Configurée, sans vérification concluante », comme avant pour l'extraction |
| Pièces non autorisées chez le sous-traitant choisi | Configuration absente, et non adaptateur absent |

**Vérification** : `tests/capacites.test.ts`, 8 cas nouveaux ou corrigés. Sur l'ancien code, 7 échouent.

L'aptitude de l'instance ne change pas : ces deux dépendances sont facultatives pour le pilote, et elles n'étaient ni bloquantes ni opérationnelles avant.

## S.101 — Les textes juridiques se valident au back-office, leurs variables se modifient sans redéploiement

**Demande du 02/10/2026.** Les trois brouillons (S.97) doivent être validés, et la page contact créée ; les principales variables des textes doivent pouvoir changer depuis le back-office.

**Décisions de la direction (02/10/2026)**

| Question | Décision |
|---|---|
| Qui valide | L'administrateur publie, en nommant le relecteur et la date de sa relecture ; la version est immuable et journalisée |
| Une variable change | Republication automatique des textes déjà validés qui l'emploient, en nouvelle version tracée ; un changement du texte du modèle exige une nouvelle validation |
| Page contact | Coordonnées seules, modifiables au back-office |

**Ce qui tient Q.A.** Aucun drapeau « validé » dans le code : une page n'existe que s'il existe en base une version `LegalPublication` portant un relecteur nommé (contrainte SQL, au moins cinq caractères). Les routes répondent 404 jusque-là ; `PAGES_PUBLIQUES` les marque `surValidation`, et elles restent bloquantes dans les préalables tant qu'elles ne sont pas validées.

**Mise en œuvre**

- Domaine : `src/domain/juridique/` — variables (nature, groupe, contrôle), modèles (quatre textes, vouvoyés comme les brouillons), rendu (variables multi-lignes, passages facultatifs, empreinte), décisions de validation et de republication.
- Base : `LegalVariable`, `LegalPublication` (rang unique par page, page connue, relecteur nommé), migration `20261002150000_textes_juridiques`.
- Back-office : `/textes-juridiques`, accès administrateur ; actions journalisées `juridique.variables`, `juridique.validation`, `juridique.publication`.
- Public : quatre pages servies depuis la dernière version ; liens du pied de page et plan du site selon les versions publiées ; consentement `CGU` enregistré avec les versions acceptées, à l'inscription et à l'ouverture d'un paiement.

**Vérification** : `tests/textes-juridiques.test.ts` (33 cas), `tests/acceptation-sans-texte.test.ts`, `tests/arbitrages-ouverts.test.ts`, et la fumée `npm run smoke:juridique` sur base jetable (30 vérifications), ajoutée à la CI.

**Reste à la direction** : saisir les valeurs réelles, faire relire par le conseil juridique, trancher les écarts de `docs/juridique/README.md` — registre de langue compris : l'interface tutoie, les textes vouvoient.

## S.102 — Deux liens menaient au mauvais endroit (test du 02/10/2026)

**Relevé en test, transmis le 02/10/2026.**

| Lien | Menait à | Mène à |
|---|---|---|
| « Corriger mon adresse email » (A-03) | `/consentements`, où rien ne change l'adresse | Un formulaire sur place : nouvelle adresse et mot de passe, puis un nouveau code |
| « Ouvrir un dossier » (P-03), « Voir la checklist » (P-04) | `/inscription`, même connecté | Connecté : `/dossiers/nouveau`, sur la destination affichée. Visiteur : `/inscription`, comme avant |

**Correction de l'adresse** (`PUT /api/comptes/adresse`, `corrigerLAdresse`)

- Seulement tant que l'adresse n'est pas vérifiée. Une adresse vérifiée reçoit les alertes et la réinitialisation du mot de passe ; la changer depuis une session suffirait à prendre le compte. Ce cas passe par le support.
- Le mot de passe est redemandé.
- Une adresse déjà prise ne se dit pas à l'écran : la réponse est la même, et un courrier dit à son titulaire ce qui s'est passé (règle de l'inscription).
- Le code précédent est annulé : un code parti à la mauvaise adresse ne vérifie jamais la nouvelle.
- L'adresse en cours est écrite dans le chapeau, comme au prototype : c'est en la lisant qu'on voit la faute de frappe.

**Hors de cette correction** : « Choisir un pack » sur `/tarifs` mène aussi à `/inscription` pour un candidat connecté. Le choix d'un pack se fait au récapitulatif de paiement d'un dossier ouvert ; la bonne destination est à décider par le produit.

**Vérification** : `tests/entree-dossier.test.ts`, `tests/ui/p0-public.test.tsx` et `tests/ui/p0-comptes.test.tsx` (5 cas d'écran nouveaux), et un essai sur base jetable de `corrigerLAdresse` : mauvais mot de passe, même adresse, adresse prise sans changement, correction normalisée, ancien code invalide, nouveau code valide, adresse vérifiée refusée.

## S.103 — La production n'avait aucune destination, et rien ne pouvait en ouvrir une

**Relevé en test le 02/10/2026.** Après S.102, « Ouvrir un dossier » mène bien à `/dossiers/nouveau`, qui affiche « Aucune destination n'est ouverte en ce moment ». `https://immipro.app/destinations` le confirme : « Aucune destination n'est publiée pour l'instant ». Le test de dépôt de bout en bout est bloqué.

**Cause.** Une règle entre en base par deux chemins, et aucun ne fonctionnait sur une production neuve :

- **B-02** édite et publie une règle **existante** (`/regles/[id]`). Il n'en crée pas.
- **La graine** (`npm run seed:rules`) ne pouvait pas tourner dans l'image. Ni `tsx` ni les sources TypeScript n'y sont.

**Correction.** La graine est empaquetée comme le worker (`scripts/build-worker.mjs` → `dist/graine-regles.js`) et se lance comme une migration :

    docker compose -f docker-compose.prod.yml run --rm app node dist/graine-regles.js

Le paquet est le même code que `seed:rules`. Il applique les mêmes garde-fous :

- vocabulaire de B-02 ;
- source secondaire forcée en brouillon ;
- archivage de la version précédente.

Il publie les trois fiches à source officielle ou institutionnelle (Pays-Bas études, Pays-Bas kennismigrant, Suisse études). Il laisse les Émirats en brouillon, à relire et publier en B-02.

**Ce qu'il ne fait pas.** Le déploiement ne le lance pas. La graine remet chaque fiche dans l'état du fichier : la relancer à chaque déploiement republierait une fiche que la veille a dépubliée, et réécrirait ce que B-02 a changé. C'est un chargement initial, à faire une fois.

**Vérification.** `npm run smoke:graine`, ajoutée à la CI : paquet exécuté hors sources, sur une base jetable, deux fois. Résultat : 3 publiées et les Émirats en brouillon, sans doublon, statuts et bornes inchangés à la reprise.

## S.104 — Le retour après connexion se perdait, et `robots.txt` répondait 404

**Relevés au contrôle de production du 02/10/2026 au soir.**

**Retour après connexion.** Sans session, `/dossiers/nouveau?destination=suisse` renvoyait vers `/connexion` sans `?suite=`. La page posait bien sa suite, mais le gabarit `(dossier)` exige lui aussi une session. Or un gabarit Next ne connaît pas l'adresse de la page qu'il entoure, et c'est sa redirection qui partait la première. Après connexion, le candidat arrivait donc au tableau de bord.

- **`src/middleware.ts`** relève le chemin et la requête dans un en-tête de requête (`x-immipro-chemin`). Il écrase toute valeur fournie par le client. Il ne fait rien d'autre : ni session, ni limitation, ni redirection.
- **La garde (`server/securite/page.ts`)** lit cet en-tête quand on ne lui donne pas de suite.
- **Une seule règle, `suiteInterne`** (`domain/comptes/suite.ts`), est appliquée par la garde, la connexion et la vérification. Elle refuse :
  - une adresse absolue ;
  - `//hôte` et `/\hôte` ;
  - les caractères de contrôle ;
  - les écrans du compte eux-mêmes.
- **Un compte non vérifié garde la suite** jusqu'à `/verification?suite=…`. « Vérifier » et « Plus tard » y mènent ensuite.

Vérifié sur le serveur compilé : `/dossiers/nouveau?destination=suisse`, `/profil`, `/tableau-de-bord` et `/paiement/recapitulatif` renvoient chacun vers `/connexion?suite=<leur adresse>`.

**`robots.txt`** (`src/app/robots.ts`) :
- ouvre le site public ;
- ferme l'espace candidat, les écrans du compte et l'API ;
- désigne le plan du site en adresse absolue.

Le back-office n'y est pas nommé : l'écrire publierait la carte de ses adresses, et sa garde le ferme déjà sans dire qu'il existe (RG-15.3). La liste (`ESPACES_NON_INDEXES`) est vérifiée contre `PAGES_STABLES` : aucune page publique n'est fermée.

**Vérification** :
- `tests/suite-connexion.test.ts` ;
- `tests/ui/suite-verification.test.tsx` ;
- `tests/plan-du-site.test.ts` (robots).

## S.105 — L'émetteur du reçu était une identité inventée ; la note M.C est corrigée

**Relevé le 02/10/2026, en relisant la note de cadrage de l'avis comptable (M.C).** Le reçu affichait en dur « ImmiPro SAS · RCCM Cotonou · service@immipro.bj ». La note nomme l'exploitant **Rêveur Digital**, et le site est servi sur `immipro.app`. Un reçu est une pièce comptable : y imprimer une entité, un registre sans numéro et un domaine qui ne sont pas les bons est pire que de n'en imprimer aucun.

**Correction** (`emetteurDuRecu`, `domain/paiement/recu.ts`)

- L'émetteur est composé à partir des variables des textes juridiques (S.101) : dénomination, forme juridique, siège, RCCM, IFU et adresse de contact. Elles se saisissent une seule fois dans `/textes-juridiques` : les mentions légales et le reçu ne peuvent plus se contredire.
- S'il manque une seule de ces variables, le reçu le dit (« L'identité de l'émetteur n'est pas encore enregistrée ») au lieu de compléter de lui-même.
- L'émetteur reste celui d'un **reçu** : ni « facture », ni TVA, ni numéro d'ordre. La mention de TVA des conditions n'y est pas reprise.

**La note de cadrage M.C** (`docs/comptable/note-cadrage-MC.md`) est corrigée pour décrire le produit tel qu'il est. Écarts relevés dans la version reçue :

| Sujet | Version reçue | Version corrigée |
|---|---|---|
| Envoi du reçu | Envoyé par courriel et archivé dans le dossier | Le courriel porte la référence et le montant ; le reçu se consulte dans l'espace du client, sans PDF conservé |
| Identité du payeur | Le reçu porterait le nom et l'adresse électronique | Il ne porte ni l'un ni l'autre (minimisation) |
| Grille | « À fixer après le pilote » ; Dossier Pro « envisagé » | Les deux grilles (F CFA et euros) sont reproduites ; Dossier Pro existe |
| Ventes | Packs et recharges | S'y ajoutent le passage d'Essentiel à Dossier et la consultation |
| Opérateurs | « MTN, Moov et autres » | Le produit ne choisit ni ne nomme l'opérateur |
| Remboursement | « Au prorata » | Aucun prorata : un pack entamé passe en revue manuelle, sans remboursement automatique |

**Questions ajoutées** :
- contre-valeur d'une facture en euros ;
- moment d'émission de la facture et de l'avoir ;
- facture du passage d'Essentiel à Dossier et de la consultation ;
- suffisance d'une reconstitution à partir des données de paiement.

**Vérification** : `tests/recu.test.ts`, `tests/ui/recu.test.tsx` et `tests/prealables.test.ts`. Ces tests vérifient trois points :
- la composition de l'émetteur et son absence quand une variable manque ;
- l'absence d'identité écrite en dur dans le code du reçu ;
- l'absence de « facture » et de TVA dans ce que la mise en forme ajoute.

M.C reste ouvert jusqu'à réception de l'avis.

## S.106 — L'ouverture d'un dossier échouait sur « Identifiant attendu »

**Relevé en test de bout en bout, en production, le 02/10/2026.**

| Étape | Résultat |
|---|---|
| Connexion | ✅ |
| Destinations | ✅ visibles |
| Création du dossier | ❌ échoue à chaque essai, sur les deux parcours testés, avec « Identifiant attendu » |
| Dépôt d'une pièce | impossible sans dossier |

**Ce que dit le message.** « Identifiant attendu » est la traduction du refus de format UUID. Or la route `POST /api/dossiers` n'avait qu'un seul champ de ce format : `visaRuleId`. L'écran recevait cet identifiant de la page serveur et le renvoyait tel quel. En production, il n'arrivait pas sous la forme que la route exigeait.

**Non reproduit en local.** Sur une base chargée avec le même référentiel, l'écran envoie un UUID valide et le dossier s'ouvre, sur les trois destinations, avec ou sans date. La cause exacte en production n'est donc pas établie. Ce qui est établi, c'est que l'écran n'avait pas à porter un identifiant technique de la base pour que le serveur retrouve ce qu'il sait déjà.

**Correction**

- L'écran envoie la **destination** : le `slug` de la fiche, celui de l'adresse `?destination=`.
- La route retrouve elle-même la règle publiée du jour, avec le même filtre que la fiche affichée (INV-4, RG-14.1).
- Une destination inconnue, ou retirée entre-temps, reçoit un refus qui le dit : « Cette destination n'est pas ouverte en ce moment. Choisis-en une dans le catalogue des destinations. »
- `visaRuleId` reste accepté pour compatibilité, sans exiger le format UUID. C'est `ouvrirDossier` qui vérifie que la règle existe et qu'elle est publiée.

**Vérification**

- Sur le serveur compilé, dans Chromium : `/dossiers/nouveau?destination=suisse` puis `?destination=pays-bas`, avec et sans date. La requête porte `{"destination": …}`, la réponse est 200, et le candidat arrive sur son dossier.
- Une destination inconnue renvoie 422, avec le message sous le champ.
- Tests : `tests/ouverture-dossier.test.ts` et `tests/ui/p0-dossier1.test.tsx` (corps envoyé).

**Si l'erreur persiste après déploiement** : relever, dans l'onglet Réseau du navigateur, le corps de la requête `POST /api/dossiers` et sa réponse.

## S.107 — Le dépôt d'une pièce n'aboutissait pas : l'autorisation ne pouvait pas être donnée

**Relevé en test de bout en bout, en production, le 03/10/2026.**

| Étape | Résultat |
|---|---|
| Création du dossier (S.106) | ✅ |
| Fichier PDF choisi | ✅ |
| « Ajouter la pièce » | ❌ aucun dépôt n'aboutit |

Le testeur décrivait une case « J'autorise l'analyse de mes pièces d'identité » qui apparaissait puis disparaissait.

**Ce que fait le code.** RG-02.2 refuse tout dépôt tant que l'autorisation de traiter les pièces d'identité n'est pas donnée. Le serveur répond alors « L'analyse de tes pièces demande ton autorisation », avec l'action « Ouvrir mes autorisations ». Or l'écran de dépôt :

- ne proposait **aucune case** pour donner cette autorisation ;
- affichait le refus **sans lien** vers « Mes consentements » ;
- n'indiquait nulle part, avant le clic, que l'autorisation manquait.

Un candidat qui n'était jamais passé par « Mes consentements » n'avait donc aucun moyen de déposer une pièce.

**Non reproduit tel quel.** En local, le bouton envoie bien la requête de dépôt. La case décrite par le testeur n'existe pas sur cet écran.

**Correction** (`PieceDuDossier`, page de la pièce)

- La page lit l'autorisation côté serveur. Si elle manque, l'écran affiche la case « J'autorise l'analyse de mes pièces d'identité », décochée, avec le texte de « Mes consentements » et un lien vers cet écran pour la retirer.
- Cocher la case enregistre l'autorisation par la même route que « Mes consentements » (`PUT /api/comptes/consentements`), avec sa date et sa version (RG-02.1).
- Tant que l'autorisation manque, « Ajouter la pièce » et « Téléverser sans analyse » sont désactivés, et l'écran dit pourquoi.
- L'état vit dans le composant : la case ne revient pas quand la page se rafraîchit après un dépôt. Si l'autorisation est retirée entre-temps depuis un autre appareil, le refus du serveur fait réapparaître la case, au lieu d'un refus sans issue.

**Deux défauts corrigés au passage, sur le même écran**

- **Autorisation inventée.** La phrase « Tu as autorisé l'analyse automatique des pièces financières le 11/09/2026 » s'affichait à tous les candidats : une autorisation et une date fictives. Elle est retirée. Seul un lien vers « Mes consentements » reste.
- **Titre absurde sans pack.** Le titre disait « Tes 0 analyses du pack sans pack sont utilisées ». Il dit maintenant « Aucune analyse n'est incluse tant que le dossier n'a pas de pack ».

**Vérification**

- Sur le serveur compilé, dans Chromium, avec un compte sans autorisation :
  - la case est visible et le reste après 2 s comme après le choix du fichier ;
  - « Ajouter la pièce » est désactivé ;
  - cocher la case envoie `PUT /api/comptes/consentements` (200), la case disparaît et le bouton s'active ;
  - le clic envoie `POST …/depot`. En local, la réponse est 503 parce que l'antivirus n'y tourne pas ; il est opérationnel en production ;
  - après rechargement, la case ne revient pas.
- Tests : `tests/ui/p0-dossier2.test.tsx` (3 cas) et `tests/dossier2.test.ts` (titre sans pack).

## S.108 — Après l'envoi : la barre restait bloquée, et le contrôle antivirus ne se lisait pas

**Relevé en test de bout en bout, en production, le 03/10/2026, après S.107.**

| Étape | Résultat |
|---|---|
| Case d'autorisation (S.107) | ✅ cochée, et elle reste cochée |
| Envoi direct vers le stockage | ✅ aucune erreur CORS |
| Pièce au retour sur la checklist | ✅ « Conservée, non vérifiée » |
| Écran de la pièce après l'envoi | ❌ reste sur « Envoi en cours » |
| Statut du contrôle antivirus | ❌ rien d'affiché après 45 s |

**1. La barre d'envoi.** Quand le serveur confirmait le dépôt, l'écran rafraîchissait la page. Mais l'état de l'envoi vit dans le composant, et rien ne le faisait sortir de `ENVOI`. Le fichier était sur le serveur, l'écran disait le contraire.

*Correction.* À la confirmation, l'écran sort de l'envoi, oublie le fichier choisi et annonce « Ton fichier « … » est bien arrivé » (`role="status"`).

**2. Le contrôle antivirus avait bien eu lieu.** La pastille « Conservée, non vérifiée » est écrite par le job de balayage, et seulement après un verdict **sain**, sur un dossier sans analyse disponible (RG-06.5). Le contrôle s'était donc déclenché et avait abouti. C'est l'écran de la pièce qui ne lisait jamais l'état de la version déposée.

*Correction.*

- `controleDuDepot` (domaine, `quarantaine.ts`) traduit l'état de la dernière version en un bloc, pour trois cas :
  - **en cours** : la mention d'attente existante, qui tient déjà compte d'une attente longue et des causes d'incident ;
  - **passé** : « Le contrôle de sécurité n'a rien détecté le JJ/MM/AAAA » ;
  - **écarté** : le fichier a été écarté et l'écran dit quoi refaire.
- `analyseDeLaPiece` porte ce contrôle, et la page le passe à l'écran.
- Tant que le contrôle est en cours, l'écran se relit toutes les 4 secondes, au plus pendant 2 minutes. Au-delà, la mention d'attente prend le relais.
- Quand la pièce est conservée sans analyse, le bloc donne aussi le motif écrit par le balayage.

**3. Défaut corrigé au passage.** Sans pack, le motif disait « tes analyses du pack sont utilisées ». Le titre avait le même défaut, corrigé par S.107. Un motif `sans_pack` est ajouté : « aucune analyse n'est incluse tant que le dossier n'a pas de pack ». Le balayage le choisit quand aucun crédit d'analyse n'a jamais été ouvert sur le dossier.

**Tests.** Domaine : `tests/controle-du-depot.test.ts`. Écran : `tests/ui/p0-dossier2.test.tsx`, avec un envoi complet simulé, le contrôle en cours et le contrôle passé. La fumée `smoke:balayage` passe sur une base jetable.

## S.109 — Confirmation des paiements : le rail FedaPay, de l'interface au crédit

**Demande du 03/10/2026.** Point « Confirmation des paiements » du référentiel avant ouverture. Contexte de production, vérifié par l'exploitant :

- `FEDAPAY_ENVIRONMENT=sandbox` ;
- `FEDAPAY_API_KEY` et `FEDAPAY_WEBHOOK_SECRET` sont chargées dans le conteneur ;
- `APP_URL=https://immipro.app` ;
- les clés Stripe sont vides : le pilote passe par FedaPay seul ;
- un appel direct à l'API a réussi (transaction de bac à sable #516681).

Ni le webhook signé de bout en bout ni le paiement depuis l'interface n'étaient vérifiés.

### 1. Défaut bloquant : la référence

**Constat.** L'adaptateur envoyait notre référence dans le champ `reference` de `POST /transactions` et attendait de la relire au même endroit. Or :

- la documentation FedaPay de la création, relue le 03/10/2026, ne connaît pas `reference` en entrée ;
- la réponse porte la référence que FedaPay génère lui-même (`trx_…`) ;
- les champs marchands documentés sont `custom_metadata` (à la création, puis rendu à la lecture) et `merchant_reference` (à la lecture).

**Effet.**

- `depuisLEntite` comparait `trx_…` à `IMP-…` et rendait `reponse_inattendue` : **aucun paiement ne pouvait s'ouvrir depuis l'interface**.
- `lireFedaPay` lisait `entity.reference` comme si c'était la nôtre : aucune notification réelle n'aurait retrouvé son paiement.
- La consultation de réconciliation aurait conclu à l'incohérence.

Le test direct à l'API ne passait pas par l'adaptateur et ne pouvait pas le montrer. Les tests unitaires non plus : leurs échantillons reprenaient l'hypothèse de l'adaptateur. C'est le même mécanisme que pour le défaut de la forme plate (22/09/2026).

**Correction.**

- Notre référence part dans `custom_metadata.reference`.
- `referenceMarchande` (`server/paiement/notifications.ts`) la relit, avec `merchant_reference` en repli. Elle n'utilise jamais la `reference` de FedaPay.
- Si la référence revient et n'est pas la nôtre, l'ouverture est refusée.
- Si elle ne revient pas (la réponse de création n'est pas tenue de rendre les métadonnées), l'identifiant suffit.
- `appliquerLaNotification` retrouve le paiement par notre référence quand elle est présente, sinon par `providerTxId` (`fedapay:<id>`, unique, posé à l'ouverture).

### 2. Stripe fermé proprement : `PAIEMENT_FOURNISSEURS`

Sans déclaration, rien ne distinguait « Stripe volontairement vide » d'un oubli. L'état de service exigeait les clés des deux rails. Il lisait donc « non configurée » la confirmation et l'ouverture des paiements, alors que FedaPay était prêt. Côté écran, « Payer par carte, en euros » menait à un paiement impossible.

`PAIEMENT_FOURNISSEURS=FEDAPAY` (variable vide = les deux, comme avant ; un nom inconnu est signalé au journal) :

- **état de service :** le secret entrant, la clé sortante et la sonde de signature ne sont exigés que pour les rails ouverts ;
- **ouverture :** `lOuvreur` ne rend rien pour un rail fermé, même si une clé traîne ;
- **route :** `POST /api/paiements` refuse une devise fermée avant toute écriture, avec un message qui dit ce qui reste possible ;
- **écrans :** le choix du pack ne propose que les devises ouvertes. Un compte qui suggère l'euro se voit proposer le franc CFA, avec la mention « Le paiement par carte bancaire, en euros, n'est pas encore ouvert ». Le récapitulatif ouvert en `devise=EUR` bloque le paiement et renvoie au choix du pack. L'écran d'échec ne propose plus « Payer par carte ».

La déclaration est explicite plutôt que déduite des clés présentes : une clé oubliée en production doit se voir à l'état de service, pas fermer un rail en silence.

### 3. INV-7 — vérifié, rien à changer

La signature correspond exactement au SDK officiel FedaPay (`WebhookSignature::verifyHeader`) :

- en-tête `X-FEDAPAY-SIGNATURE: t=…,s=…` ;
- HMAC-SHA256 de `t.corps` ;
- tolérance de 300 s ;
- comparaison en temps constant.

Sans secret configuré, la vérification rend `false` et le journal dit pourquoi (fail-closed). La route est exclue de la limitation de débit, avec la signature exigée en contrepartie.

Changement mineur au passage : la route ne lit plus la session pour un webhook, puisque le fournisseur n'en a pas. C'est ce qui rend la vraie route testable hors de Next.

### 4. Remboursement FedaPay (S.91) — vérifié, rien à changer

L'adaptateur rend `procedure_manuelle` sans aucun appel réseau. L'opérateur rembourse au tableau de bord FedaPay, puis déclare la référence en B-04. La dette ne se solde que par la notification signée `refunded`, que `lireFedaPay` lit sur `entity.status`.

À trancher : avec FedaPay seul, la capacité `remboursement` reste « aucun adaptateur », et `/api/health` reste à 503 pour cette seule raison. C'est conforme à S.91 (« la capacité reste non branchée »). Il faut décider si une procédure manuelle tracée suffit à déclarer l'instance apte à encaisser.

### Vérifications

- `npm run smoke:fedapay` (nouveau, en CI), sur une base jetable :
  - adaptateur réel devant des réponses de la forme documentée, route réelle du webhook ;
  - rejet sans signature, avec un autre secret, avec un corps modifié, avec un horodatage périmé, et sans secret configuré ;
  - crédit unique sur notification signée, rejeu sans double crédit ;
  - événement sans métadonnées retrouvé par l'identifiant ;
  - euros refusés sans écriture.
- `smoke:tunnel`, `smoke:remboursement` et `smoke:reconciliation` passent.
- Tests ajoutés : `tests/fedapay-reference.test.ts`, `tests/fournisseurs-ouverts.test.ts`, et `tests/ui/p0-paiement.test.tsx` (rail fermé). Les échantillons de `tunnel-ouverture`, `consultation-paiement`, `motif-refus` et `remboursement` ont la forme FedaPay réelle.
- En production, le 03/10 : `POST /api/webhooks/fedapay` sans signature répond 400 « La notification n'a pas pu être authentifiée ».

### Pour tester en bac à sable, après déploiement

1. **Configuration :**
   - ajouter `PAIEMENT_FOURNISSEURS=FEDAPAY` dans `.env.app`, puis recréer les conteneurs ;
   - dans le tableau de bord FedaPay (bac à sable), déclarer le webhook `https://immipro.app/api/webhooks/fedapay` avec au minimum `transaction.approved`, `transaction.declined`, `transaction.canceled` et `transaction.updated` (pour le remboursement) ;
   - vérifier que le secret de ce webhook est bien `FEDAPAY_WEBHOOK_SECRET`.
2. **Essai de l'adaptateur :** sur le VPS, `docker compose -f docker-compose.prod.yml run --rm app node dist/sandbox-paiement.mjs`. Il ouvre une vraie session de bac à sable et doit passer, alors qu'il aurait échoué avant cette correction. Il refuse `FEDAPAY_ENVIRONMENT=live`, et ne fait rien sans clé. Le script est maintenant empaqueté dans l'image (`dist/`), comme la graine : l'image n'a ni `tsx` ni les sources.
3. **Paiement depuis l'interface :** payer un pack en francs CFA avec un numéro de test FedaPay, puis vérifier le crédit, le reçu et la ligne B-04 rapprochée.
4. **Rejet d'une notification non signée :** déjà constaté (400).

### S.109 bis — en production, la déclaration n'était pas lue (03/10/2026)

**Constat de l'exploitant après le déploiement de #196 :**

- `PAIEMENT_FOURNISSEURS=FEDAPAY` figure dans `.env.app` ;
- `/api/health` lit toujours « configuration absente » pour la confirmation et l'ouverture des paiements ;
- une recherche dans `/app/.next/server/` ne trouve pas la variable.

**Vérifié de ce côté :**

- Le déploiement de `8e5d8b7` (fusion de #196) a réussi, et `app` a été recréé à 06:09:47 UTC avec l'image `ghcr.io/malcomx2022/immipro:8e5d8b7`.
- La même construction, faite localement (`next build`), contient la variable dans `.next/standalone/.next/server/chunks/`. Une recherche à 0 résultat portait donc sur un conteneur antérieur, ou n'était pas récursive.
- Lancé avec `PAIEMENT_FOURNISSEURS=FEDAPAY` et les clés Stripe vides, ce serveur compilé répond :
  - `paiements` : `OPERATIONNELLE` ;
  - `ouverture_paiement` : configurée, sans sonde sûre, donc en réserve.
- En production, à 06:16:48, la réponse reste « configuration absente ».

**Conclusion.** Le processus de production ne lit pas `FEDAPAY` dans cette variable : soit elle est absente de l'environnement du conteneur `app`, soit sa valeur n'est pas reconnue. Dans les deux cas, la déclaration vaut alors les deux rails, et Stripe est exigé. C'est exactement le symptôme observé.

**Corrections :**

- La valeur tolère les guillemets et un commentaire de fin (`"FEDAPAY"`, `FEDAPAY # pilote`). Selon l'outil qui charge le fichier, ils arrivent tels quels au processus.
- `/api/health` expose `fournisseursDePaiement` : la variable, la déclaration (`absente`, `lue` ou `illisible`), les fournisseurs ouverts et les noms inconnus. Ce ne sont que des noms, jamais une clé. L'écart se lit désormais de l'extérieur.

## S.110 — Test du paiement en bac à sable : double clic, numéro de téléphone, conditions

**Relevé le 03/10/2026, en production.** Le parcours va jusqu'au widget FedaPay :

- Essentiel, 5 000 F, récapitulatif correct ;
- widget en fenêtre (modale), 5 208 CFA frais compris, opérateur « Momo Test » ;
- aucune erreur ;
- paiement non validé : aucune donnée personnelle n'a été fournie.

### 1. Idempotence — corrigé

`node dist/sandbox-paiement.mjs` échouait sur « même clé → même session ». FedaPay ne documente pas `Idempotency-Key`, et le bac à sable le confirme : même clé, deux transactions. Ce n'est pas un défaut de l'adaptateur, mais une garantie que ce fournisseur ne donne pas.

La plateforme avait sa propre protection : une seconde soumission reprend la transaction locale, puis la session par son identifiant. Il restait une **fenêtre de course**. Deux demandes simultanées, avant que l'identifiant ne soit enregistré, appelaient toutes deux `creer` :

- la seconde renvoyait l'adresse d'une transaction FedaPay orpheline ;
- un candidat qui réglait les deux voyait le second paiement tenu pour un rejeu, encaissé sans trace.

**Corrections :**

- `ouvrirLeTunnel` : la demande qui perd l'écriture de l'identifiant rend **la session enregistrée** (`retrouver`), jamais la sienne. L'orpheline n'est montrée à personne et ne peut pas être réglée.
- `appliquerLaNotification` : une confirmation FedaPay qui porte un autre identifiant, sur une référence déjà réglée, n'est plus un rejeu. Elle ouvre un écart (`discrepancy`) qui nomme le second paiement à rembourser. Stripe n'est pas concerné : il confirme sur un identifiant différent de la session.
- `sandbox-paiement` : pour FedaPay, ce contrôle devient une information (ℹ) et non un échec. Il reste strict pour Stripe, qui documente l'idempotence.
- `smoke:fedapay` provoque une vraie course : latence à la création, deux créations chez le faux FedaPay. Il vérifie qu'une seule session est rendue, puis qu'un second paiement ouvre un écart sans double crédit. Sur le code d'avant, ces deux vérifications échouent.

### 2. Conditions de paiement « pas encore publiées » — à trancher (produit)

Ce n'est pas un défaut de code. La case renvoie aux conditions, qui ne sont pas publiées tant que Q.A n'est pas validé dans `/textes-juridiques`. La plateforme le dit honnêtement au lieu de faire accepter un texte absent.

**Question.** Faut-il **bloquer tout paiement réel** (`FEDAPAY_ENVIRONMENT=live`) tant que les conditions ne sont pas publiées ? Le bac à sable resterait ouvert pour les essais. Proposition : oui, mais à décider avant de coder.

### 3. « Renseigner mon numéro » menait à un profil sans champ téléphone — corrigé

L'API `PUT /api/comptes/profil` acceptait déjà le numéro, validé au format international (RG-02.3). L'écran ne le proposait pas. Corrections :

- section « Paiement Mobile Money » ajoutée au profil (`id="telephone"`) ;
- `normaliserTelephone` retire espaces, points, tirets et parenthèses, et lit `00` comme `+`. Aucun indicatif n'est deviné ;
- le numéro est hors du décompte des champs, puisqu'il n'affine pas la checklist ;
- le lien du récapitulatif mène à `/profil#telephone`.

**À noter.** Ce numéro n'est pas transmis à FedaPay : le widget demande le sien. Le pré-remplir (`customer.phone_number`, documenté à la création) éviterait une double saisie, mais transmet une donnée personnelle de plus au prestataire. C'est une décision produit et conformité.

## S.111 — Décisions du 03/10/2026 sur le paiement

### 1. Aucun encaissement réel sans conditions de vente publiées — décidé : oui

Le candidat coche qu'il accepte les conditions. En espace réel, lui faire payer un texte « pas encore publié » n'est pas tenable. Le bac à sable reste ouvert, pour que les essais continuent.

- **Espace réel** (`espaceReel`, `server/paiement/secrets.ts`) : `FEDAPAY_ENVIRONMENT=live` pour FedaPay, une clé `sk_live_` ou `rk_live_` pour Stripe.
- **`ouvrirLeTunnel`** refuse avec `paiement_sans_conditions` tant que `/conditions` n'a pas de version validée. Le refus intervient avant toute écriture et sans appel au fournisseur. Le pack et la consultation passent tous deux par là.
- **Récapitulatif** : il le dit avant le clic et désactive « Payer », avec la même phrase (`MENTION_ENCAISSEMENT_SUSPENDU`) que le refus du serveur.
- **Vérifications** : `smoke:fedapay` (espace réel sans conditions : refus sans écriture), `tests/fournisseurs-ouverts.test.ts` (espace réel) et `tests/ui/p0-paiement.test.tsx` (bouton désactivé, mention).

### 2. Pré-remplir le numéro dans le widget FedaPay — décidé : non, pour l'instant

Aucune donnée personnelle de plus n'est transmise au prestataire : le candidat saisit son numéro dans le widget. À rouvrir après avis de la conformité. Il faudrait alors citer FedaPay comme destinataire du numéro dans la page des données personnelles.

## S.112 — Décisions de la direction du 03/10/2026 : remboursement manuel, responsable de la revue

1. **Remboursement manuel FedaPay : accepté pour le pilote.** FedaPay n'a pas d'API de remboursement : c'est une contrainte du prestataire, pas un choix. Pour un pilote de dix dossiers, la procédure au tableau de bord, déclarée en B-04, est gérable et traçable.
   - **Nouvelle capacité `PROCEDURE_MANUELLE`.** Elle s'applique quand il n'y a pas d'adaptateur mais qu'une procédure tracée est acceptée. Elle compte comme une réserve, au même titre que `NON_VERIFIABLE` : l'instance passe en `PILOTE` et sort d'`INAPTE`. La capacité dérive du point de branchement : seul le rail sans API (FedaPay) en bénéficie, et Stripe garde son adaptateur.
   - **Alerte de volume.** Au-delà de `SEUIL_PILOTE_REMBOURSEMENT_MANUEL` (10 dossiers payés pour de vrai, dossiers distincts, FedaPay confirmé ou remboursé), le point redevient bloquant : 503, avec un message qui dit de reprendre la décision. En bac à sable, les paiements d'essai ne comptent pas. Le détail figure dans `/api/health` → `remboursementManuel`.
   - **Procédure opérateur** : `docs/exploitation/remboursement-fedapay.md`. Rembourser au tableau de bord FedaPay (MTN uniquement), déclarer la référence en B-04, puis attendre la notification signée `refunded`.
2. **Blocage de l'encaissement réel sans conditions de vente : confirmé** (S.111, PR #199). Le motif : une exposition juridique dans tout l'espace CEDEAO.
3. **Numéro non pré-rempli chez FedaPay : confirmé**, jusqu'à l'avis de la conformité (L.A).
4. **Responsable de la revue manuelle : le superadmin.** Exigences du rôle : disponibilité sous 4 h (délai cible), rigueur sur les pièces d'identité, accès au back-office. Sans IA, chaque pièce du pilote passe par lui.

**Pour ouvrir le pilote**, il reste à payer un pack de bout en bout en bac à sable (notification signée, puis crédit) et à vérifier en production le lien vers le numéro au profil et l'affichage après envoi.

## S.113 — L.A tranché : la pondération n'est pas exposée, sous trois garde-fous

**Avis juridique du 03/10/2026 (protection des données).** La pondération du calcul de complétude n'a pas à être exposée au-delà de l'explication des facteurs déjà restituée à l'export.

- **Pas de décision automatisée** au sens de l'article 22 : le calcul n'a aucun effet juridique, la décision appartient aux autorités.
- **Transparence (articles 13 à 15) satisfaite** : l'export restitue les données fournies, les résultats utilisés, le palier, le dénombrement, les manques ordonnés et les facteurs.
- **Savoir-faire de Rêveur Digital** : la pondération relève du secret d'affaires, ce qui est un motif légitime de ne pas la divulguer.

**Les trois garde-fous de l'avis, vérifiés ou mis en place :**

1. **Indicatif, jamais prédictif.** Déjà tenu : C-09 affiche « Ce qui manque au dossier, pas tes chances d'obtenir le visa » et « Un dossier complet n'est pas un dossier accepté ». Les conditions et la politique de données le disent. Le vocabulaire interdit bloque toute promesse, dans le code comme dans les textes saisis.
2. **L'opacité est dite.** Déjà tenue dans l'export (`LIMITE_DE_LA_RESTITUTION`, liste des données non restituées). Elle est **ajoutée** à la politique de données personnelles : « La pondération interne du calcul n'est pas communiquée… ».
3. **Contestation humaine.** **Absente jusqu'ici, construite** :
   - modèle `CompletenessReviewRequest`, avec une seule demande en attente par dossier et une réponse obligatoire une fois traitée, imposées par la base ;
   - section « Relecture humaine » sur C-09 ;
   - file « Relectures de la complétude demandées » en B-05, tenue par le responsable de la revue (le superadmin) ;
   - la réponse passe par le vocabulaire interdit de l'écran candidat, part dans les alertes et est journalisée (`dossier.completude.relecture`) ;
   - la politique de données mentionne ce droit.
   - les demandes et leurs réponses figurent dans l'export des données du candidat (`demandesDeRelectureDeLaCompletude`), puisque c'est lui qui les a écrites.

**Conséquences.** L.A quitte le registre des préalables et passe en « tranché » dans le relevé. Toute évolution du rôle du score, par exemple s'il devenait un prérequis affiché comme déterminant, appelle un nouvel avis.

**Vérifications :**

- tests : `tests/relecture-completude.test.ts` et `tests/ui/p0-dossier2.test.tsx` (C-09 : demande, en attente, réponse) ;
- fumée : `smoke:relecture` en CI (doublon refusé, réponse qui promet refusée, alerte, journal, contrainte de base) ;
- migrations : `smoke:migrations` confirme l'absence de dérive.

**Note :** la politique de données a changé, mais aucun texte n'était encore publié, donc rien n'est à revalider. La relecture juridique de Q.A portera sur la version qui contient ces deux phrases.

## S.114 — M.C : avis comptable reçu, factures et avoirs émis, encaissement réel fermé sans facturation

**Avis de l'expert-comptable du 04/10/2026.**

- **La facture est obligatoire** pour chaque vente : droit comptable OHADA, CGI béninois, facture normalisée. Le reçu reste un justificatif de paiement complémentaire.
- **Mentions obligatoires :**
  - émetteur : dénomination, forme, capital, RCCM, IFU, siège ;
  - numéro et date ;
  - client : nom, adresse, « particulier » à défaut d'IFU ;
  - désignation, prix HT et quantité ;
  - TVA, total TTC en chiffres et en lettres ;
  - mode de règlement ;
  - code de certification.
- **Numérotation** continue par exercice ; les avoirs ont leur propre suite ; une pièce annulée est conservée.
- **TVA** à 18 % si Rêveur Digital est assujettie, régime « à confirmer ». Pour le pilote, la TVA béninoise est défendable ; la territorialité est à valider pays par pays avant l'ouverture large.
- **Avoir** pour chaque remboursement, y compris manuel.
- **Archivage** dix ans.
- **Ne pas ouvrir les paiements réels** tant que le circuit facture + avoir n'est pas testé de bout en bout en réel.

**Décisions de la direction (04/10/2026) :**

- les prix de la grille sont **toutes taxes comprises**, et la TVA en est extraite ;
- le nom et l'adresse de facturation sont **demandés avant le premier paiement réel**, figés sur la facture et conservés dix ans ;
- le circuit est **construit dès maintenant**.

**Ce qui est construit :**

- **Domaine** (`domain/facturation/`) :
  - numérotation par série et par exercice, à l'heure de Cotonou ;
  - TVA extraite d'un prix TTC, euro compté en centimes, somme en toutes lettres ;
  - mentions de l'émetteur, capital compris ;
  - identité du client ;
  - obstacles à la série réelle, avec leur remède.
- **Base** :
  - modèles `Invoice` et `InvoiceSequence`, colonnes `billingName` et `billingAddress` sur le compte ;
  - contraintes : un avoir a une origine, montants cohérents, pièce réelle complète, certification datée, annulation motivée ;
  - déclencheur `facture_immuable` : ni suppression, ni réécriture.
- **Émission** (`server/facturation/emission.ts`) :
  - à la confirmation signée et au remboursement confirmé ;
  - suite prise dans la transaction de la pièce, une pièce de chaque genre par paiement ;
  - filet dans la réconciliation.
- **Série d'essai** en bac à sable (`ESSAI-RD-…`), pour tester le circuit sans consommer la suite réelle.
- **Encaissement réel fermé** tant que la série réelle l'est. Trois obstacles : certification non branchée (aucun adaptateur, faute d'immatriculation et d'accès), mentions de l'émetteur incomplètes, régime `FACTURATION_TVA` non déclaré. S'y ajoute l'identité de facturation du client. Le refus intervient avant toute écriture, et le récapitulatif le dit avant le clic. `/api/health` expose `facturation` et passe en 503 dès que l'espace est réel.
- **Candidat** :
  - section *Facturation* du profil ;
  - lien du reçu vers la facture et l'avoir ;
  - page imprimable `/paiement/facture/<numéro>` ;
  - export des données : identité de facturation et pièces.
- **Textes juridiques** :
  - conditions §8 : facture et avoir ;
  - politique de données : catégorie « Facturation », conservation des factures, avoirs et reçus, nom et adresse gardés après la suppression du compte, une facture émise ne se modifie pas.
- **Profil** : la phrase « jamais transmises à une administration » devenait fausse pour l'identité de facturation, qui partira avec la facture normalisée. Elle est réécrite.
- **Garde-fou M.C** : il interdisait le mot « facture » dans tout texte rendu. Il porte désormais sur le reçu seul : son module n'emploie pas le mot, et son écran ne l'emploie que pour mener à la facture.

**Reste, hors code :**

- immatriculation au système de facture normalisée et adaptateur de certification ;
- régime de TVA ;
- saisie du capital social ;
- opérateur Mobile Money sur la facture, à vérifier sur un paiement de bac à sable ;
- territorialité par pays avant l'ouverture large ;
- test de bout en bout en réel.

Procédure : `docs/exploitation/facturation.md`.

**Vérifications :**

- tests : `tests/facturation.test.ts` (domaine), ainsi que les tests UI du profil, du reçu et du récapitulatif ;
- fumée : `smoke:facturation` en CI ; elle couvre :
  - la suite continue sous six émissions simultanées ;
  - le double appel ;
  - l'avoir adossé à sa facture ;
  - l'immuabilité ;
  - l'émission par la notification signée ;
  - le filet de la réconciliation ;
  - la lecture réservée au client ;
  - la série réelle fermée ;
  - la suspension du paiement réel.
- migrations : `smoke:migrations`.


## S.115 — Un rôle se change depuis la console, avec un motif et une trace au journal

**Relevé le 05/10/2026**, en expliquant comment se connecter en administrateur. Aucun écran ne donne de rôle, et c'est voulu : nommer un administrateur depuis le back-office est le premier geste qu'une session volée ferait. Mais la seule voie était une requête SQL sur la base de production : sans motif, sans auteur, et **sans trace au journal d'audit**, alors que toute autre action sensible y est inscrite (RG-15.1).

**Ce qui change :**

- **Commande** `dist/changer-role.mjs`, livrée dans l'image de production. Elle se lance par `docker compose … run --rm app node dist/changer-role.mjs --email … --role … --par … --motif …`, et en local par `npm run compte:role`.
- **Règles** (`domain/comptes/role.ts`). La commande refuse :
  - sans motif (10 à 500 caractères) ni auteur déclaré ;
  - un compte inconnu, supprimé ou suspendu ;
  - un rôle élevé sur une adresse non vérifiée ;
  - le retrait du dernier administrateur.

  Relancée à l'identique, elle ne change rien et n'écrit rien.
- **Écriture** (`server/comptes/role.ts`) : le changement et la ligne `compte.role` s'écrivent dans une même transaction sérialisable. Le nombre d'administrateurs y est relu, pour que deux retraits simultanés ne laissent pas la plateforme sans personne.
- **Journal** : l'auteur s'écrit `console:<nom déclaré>`, et l'origine « console du serveur » apparaît en B-06. Il n'y a pas de compte à résoudre : le premier administrateur n'en a pas encore.
- **Procédure** : `docs/exploitation/administrateurs.md` (rôles, nomination, gestion des comptes en B-03).

**Vérifications :**

- tests : `tests/role-de-compte.test.ts` ;
- fumée : `smoke:role` en CI. Elle lance le paquet de l'image sur une vraie base et vérifie le refus sans motif, l'attribution, la ligne de journal (auteur, motif, `de` → `vers`), le rejeu sans effet, le refus d'une adresse non vérifiée et d'un compte inconnu, la protection du dernier administrateur, et l'absence de journal sur un refus.

## S.116 — Une confirmation tardive ouvre un écart, B-04 le garde visible, un diagnostic le dit

**Relevé le 05/10/2026** en bac à sable. Le widget FedaPay affichait « Transaction réussie » (numéro de test 64000001). ImmiPro renvoyait vers `/paiement/echec`, et la transaction `IMP-261005-P98AEE` était ECHOUEE, cause REFUS_EMETTEUR. Aucun webhook en base, pack non activé.

**Ce que le code montre :**

- L'état ECHOUEE vient de la **réconciliation**, qui a lu `declined` chez FedaPay pour l'identifiant enregistré. Le paiement réussi est donc vraisemblablement **une autre transaction FedaPay**. À vérifier au tableau de bord : ce n'est pas établi.
- « Aucun webhook en base » ne prouve pas qu'aucun webhook n'est arrivé. Une notification refusée par le cycle du paiement n'écrit **aucun** `PaymentEvent`, seulement une ligne `paiement.reconciliation` au journal d'audit. Et une signature refusée ne laissait **aucune trace du tout**.
- **Défaut** : une confirmation arrivant sur une transaction ECHOUEE ou EXPIREE était refusée, à raison, mais seulement journalisée. Le candidat débité sans pack n'apparaissait nulle part en B-04.
- **Défaut** : B-04 ne liste que les transactions créées le jour même. Un écart ouvert après coup sur une transaction de la veille n'était visible sur aucun écran.

**Ce qui change :**

- **Confirmation tardive** (`server/paiement/cycle.ts`, `ecartDeConfirmationTardive`). La transition reste refusée, mais l'écart s'ouvre, avec l'identifiant du fournisseur et le geste à faire : vérifier l'encaissement au tableau de bord, puis y rembourser. Un rejeu ne réécrit pas le constat.
- **B-04** (`ecartsAnterieurs`) : une section « Écarts ouverts des jours précédents », toutes dates confondues, chacun avec son formulaire de traitement et la date de sa transaction. Elle reste hors du tableau et des totaux de la journée, qui demeurent un livre du jour.
- **Diagnostic** : `dist/diagnostic-paiement.mjs --reference …`, en lecture seule. Il affiche :
  - la transaction ;
  - ses événements (webhook ou réconciliation) ;
  - le journal qui la cite ;
  - la transaction chez FedaPay, limitée à une liste fermée de champs, sans aucune donnée du payeur ;
  - des constats actionnables, dont la vérification de l'URL et du secret du webhook.

  Procédure : `docs/exploitation/diagnostic-paiement.md`.
- **Trace d'une signature refusée** : `[webhook:<route>] signature refusée` dans les journaux du service app, sans corps ni en-têtes.

**Reste à faire par l'exploitant** :
- lancer le diagnostic sur `IMP-261005-P98AEE` ;
- vérifier au tableau de bord FedaPay (bac à sable) le webhook vers `https://immipro.app/api/webhooks/fedapay` et son secret ;
- retrouver la transaction réellement approuvée.

**Vérifications :**
- tests : `tests/diagnostic-paiement.test.ts` ;
- fumée : `smoke:diagnostic` en CI. Elle couvre :
  - la confirmation tardive : refusée, écart ouvert, aucun événement, rejeu sans effet ;
  - B-04 le lendemain : hors du livre du jour, présente parmi les écarts antérieurs, retirée une fois refermée ;
  - le diagnostic : notifications refusées relues, aucune écriture ;
  - le paquet de l'image : sans clé, avec une référence inconnue, sans argument, sans donnée du payeur.

## S.117 — Diagnostic du paiement d'essai du 05/10 : FedaPay a refusé puis approuvé la même transaction

**Résultat du diagnostic** (`IMP-261005-P98AEE`, bac à sable) :

- **16 h 58** : webhooks FedaPay `pending` puis `declined`, appliqués. La transaction passe à ECHOUEE, et c'est correct.
- **17 h 59** : FedaPay approuve **la même transaction**. La notification est refusée, puisque ECHOUEE est un état abouti. C'est le cas que S.116 traite : l'écart s'ouvre en B-04 (la #206 était en ligne depuis 17 h 48).
- Le candidat d'essai est débité de 5 000 XOF (bac à sable) sans pack. Le remboursement se fait au tableau de bord FedaPay.

**Ce que cela corrige dans S.116 :**

- **L'hypothèse « autre transaction » était fausse.** C'était la même transaction, sur laquelle le fournisseur a changé d'avis.
- **Le webhook fonctionne.** Les notifications de 16 h 58 ont passé la vérification de signature, donc l'URL et le secret sont bons.
- **L'issue de clôture était mal conseillée.** La procédure recommandait « Remboursement à initier », dont l'aide renvoie vers un remboursement depuis la transaction, ce qu'une transaction échouée n'ouvre pas. L'issue correcte est « Écart expliqué, sans correction financière », avec la référence du remboursement en note. Corrigé dans :
  - `docs/exploitation/diagnostic-paiement.md` ;
  - le constat du diagnostic ;
  - le commentaire de `ecartDeConfirmationTardive`.
- **Le diagnostic ne conclut plus seul à « une autre transaction »** sur un `declined`. Il propose aussi de le relancer plus tard.

**Question ouverte, à trancher avant `FEDAPAY_ENVIRONMENT=live` :**

> Un `declined` suivi d'un `approved` sur la même transaction peut-il se produire en production chez FedaPay, ou est-ce un comportement du bac à sable (« Momo Test ») ?

Personne ne l'a vérifié, et la documentation lue le 22/09 n'en dit rien. Deux réponses possibles :

- **Le bac à sable seul.** Rien à changer : un refus reste définitif, et le cas exceptionnel passe par l'écart et le remboursement manuel.
- **Possible aussi en production.** Chaque occurrence ferait un candidat débité sans pack, puis un remboursement manuel, sur un rail qui n'a pas d'API de remboursement. L'autre voie serait d'accepter une approbation **signée** sur une transaction refusée **par le fournisseur**, mais jamais sur une transaction expirée par la plateforme, et d'ouvrir alors le pack. INV-7 reste tenu, puisque seule la parole signée du fournisseur fait bouger l'état. La table des transitions change toutefois, et il faut retirer la cause d'échec.

**Qui** : Direction, après réponse du support FedaPay. **Pour le pilote**, le fonctionnement actuel suffit.

## S.118 — Extraction IA non reconnue en production : l'autorisation attendait un code, pas « oui »

**Relevé le 06/10/2026.** Gemini 3.8 Flash est configuré sur Vertex AI comme fournisseur compatible OpenAI, avec un compte de service, pour la lecture et la rédaction. `/api/health` donnait :
- `redaction` en `CONFIGUREE_NON_VERIFIEE` ;
- `extraction` en `NON_CONFIGUREE`.

**Cause : la configuration, pas le code de S.94.** La lecture des pièces a une garde de plus que la rédaction : une pièce d'identité ne part chez un autre sous-traitant qu'Anthropic que si `AI_PIECES_SOUS_TRAITANT_AUTORISE` porte **le code** de ce sous-traitant. En production, la variable valait `oui`. Reproduit avec la configuration relevée : `oui` laisse l'extraction non branchée, `openai_compatible` la branche. Le reste de la configuration est reconnu : URL, modèle, `image_url`, compte de service.

**Pourquoi c'était difficile à voir.** `/api/health` disait « configuration absente » sans dire laquelle. Seul l'écran B-07 donnait la raison, et elle ne citait pas la valeur écrite.

**Ce qui change :**
- `/api/health` porte une `raison` pour l'extraction et la rédaction quand elles ne sont pas branchées. C'est la même raison que B-07, sans aucune valeur secrète.
- Quand la variable vaut autre chose que le code, la raison cite la valeur écrite et le code attendu.
- `.env.example` précise que `oui` n'est pas accepté.

**La garde n'est pas assouplie.** Une autorisation doit nommer le sous-traitant qu'elle vise. Un `oui` resterait valable si le fournisseur changeait, sans que personne ait autorisé le nouveau.

**À faire par l'exploitant :**
1. Écrire `AI_PIECES_SOUS_TRAITANT_AUTORISE=openai_compatible` dans `.env.app`.
2. Recréer `app` et `worker`.
3. Mettre à jour `/donnees-personnelles` (`docs/IA-fournisseurs.md`, étape 3). Cette étape ne se fait qu'une fois la décision de conformité prise.

## S.119 — « Données personnelles » : statut automatique des pièces et revue humaine

**Relevé le 06/10/2026**, en préparant la mention du nouveau sous-traitant IA (Gemini 3.8 Flash sur Vertex AI). Le texte proposé pour `/donnees-personnelles` affirmait trois choses que le code ne tient pas telles quelles.

- **« Aucune décision n'est prise sur le seul fondement du traitement automatisé. »** Inexact. Le modèle lit la pièce, puis des règles fixes lui attribuent, sans intervention humaine, un statut : conforme, à corriger, expirée… (`domain/dossiers/verification.ts`). Ce statut ne se prononce pas sur la décision de l'administration, mais il est automatique. Le modèle le dit maintenant. La qualification juridique (décision automatisée ou non) revient au juriste.
- **« Les pièces ne sont transmises à Google que le temps du traitement. »** Elle dépend du contrat Vertex AI et relève de la variable `ia_conservation` (« selon le contrat souscrit »). Le modèle n'est pas modifié sur ce point.
- **« Examinée sous un délai cible de 4 heures. »** C'est une cible interne. Publiée, elle deviendrait un engagement. Le modèle dit seulement qu'une pièce illisible est examinée par un membre de l'équipe, et un test vérifie qu'aucun délai n'y figure.

**Ce qui change :** deux éléments sont ajoutés à la section 4 du modèle « Données personnelles », avec un test dans `tests/textes-juridiques.test.ts`. Aucune version n'étant encore validée, aucune page publiée ne passe en « à revalider ».

**Reste à saisir dans `/textes-juridiques` avant publication :**
- `sous_traitants` : Google Cloud (Vertex AI, Gemini 3.8 Flash), lecture des pièces **et** rédaction assistée, point d'accès `europe-west1` (Belgique) ;
- `transferts` : encadrement et formalités APDP, à rédiger par le juriste ;
- `ia_conservation` : à recopier du contrat ;
- `email_donnees` ;
- toutes les autres variables obligatoires.

Viennent ensuite la relecture et la validation. La rédaction passe aussi par Gemini : Google reçoit donc les réponses à l'entretien et les lettres, pas seulement les pièces.

## S.123 — « Choisir un pack » sur /tarifs menait à l'inscription même connecté

Le défaut, consigné à S.102 comme « à décider », est tranché le 06/10/2026, dans le cadre de l'autonomie de développement donnée ce jour-là.

**Décision.** Une personne connectée va à l'ouverture de dossier, comme depuis une fiche destination. Le pack se choisit au récapitulatif d'un dossier ouvert.

**Comment.** `/tarifs` reste statique (Q.B, `tests/plan-du-site.test.ts`) et ne lit pas la session. Le lien porte donc `/inscription?suite=%2Fdossiers%2Fnouveau`. L'inscription, déjà rendue à la demande, fait le tri :
- une personne connectée est renvoyée vers la suite demandée, filtrée par `suiteInterne` (aucune adresse externe), sinon vers son tableau de bord ;
- un visiteur voit l'inscription, comme avant.

## S.121 — B-03 : deux des trois actions attendues sont branchées, le recrédit reste à décider

**Constat.** B-03 listait trois actions dans `ACTIONS_ATTENDUES`, sans route ni bouton. Deux n'attendaient que du câblage : la fonction serveur existait déjà.

**Fait.**
- **« Renvoyer l'email de vérification »** : `POST /api/admin/utilisateurs/verification`.
  - Même émission que l'écran A-03 (`emettreUnCode`, qui annule les codes précédents), même courrier, même validité de dix minutes, limite « sensible ».
  - Le code n'est jamais rendu ni journalisé.
  - Action d'audit `compte.verification`, avec un motif d'au moins dix caractères, écrite avant l'envoi.
  - Si la messagerie ne transmet pas le courrier, la route répond `service_indisponible`, comme côté candidat.
- **« Traiter la demande de suppression »** : `POST /api/admin/utilisateurs/suppression`.
  - Elle appelle `acheverLaSuppression`, la fonction que la tâche de nuit reprend déjà (RG-10.4).
  - Elle est refusée sans `deletionRequestedAt` : seul le candidat demande sa suppression.
  - Elle est idempotente : un compte déjà anonymisé rend `anonymise: true` sans écriture.
  - Si une pièce résiste, la réponse le dit (`anonymise: false`), et l'écran aussi.
  - Action d'audit `compte.relance`.

**Reste à arbitrer.** « Recréditer des analyses » est une décision commerciale : combien, à quelles conditions, à la charge de qui. L'action reste dans `ACTIONS_ATTENDUES`.

## S.120 — Deux commandes d'exploitation de plus tournent depuis l'image

`seed:editorial` et `scripts/garde-fous.mjs` ne pouvaient pas tourner en production : l'image n'a ni `tsx`, ni les sources, ni `psql`. Deux paquets rejoignent `build-worker.mjs`, construits comme `changer-role.mjs` :
- `dist/graine-editoriale.mjs` ;
- `dist/verifier-garde-fous.mjs`.

**Arbitrage pris.** La graine de développement remettait les textes d'origine à chaque lancement (`upsert` avec `update`). Lancée en production, elle aurait écrasé une retouche faite en B-08. Le paquet de production ne crée donc que les documents absents, et ne touche à aucun document existant, retiré compris. `npm run seed:editorial` garde son comportement. Pour corriger un texte d'origine en production, on passe par B-08.

**Écarts avec la version `psql`.** Le paquet des garde-fous embarque le SQL et l'exécute avec `pg`, avec le même décompte et les mêmes seuils.
- Les essais s'exécutent dans une transaction annulée. La base est donc laissée telle quelle, même si l'exécution n'est pas « lecture seule » au sens de PostgreSQL.
- Une erreur hors d'un essai interrompt la vérification, en code 1.

**Ce qui est éprouvé.** `smoke:editoriale`, branché dans la validation, vérifie que :
- la graine lancée deux fois ne crée pas de doublon ;
- une retouche et un document retiré ne sont jamais réécrits ;
- les garde-fous sortent en 0 sur une base migrée et en 1 sur une base sans tables.

**Reste à faire côté exploitation.** Le runbook `docs/exploitation/sauvegardes.md` documente `backup-postgres.sh`. Restent à vérifier :
- l'origine des variables du cron ;
- l'alerte en cas d'échec ;
- la sauvegarde du stockage objet des pièces ;
- la restauration de contrôle.
