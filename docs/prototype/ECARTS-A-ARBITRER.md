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

**À trancher :** le report l'emporte-t-il (mise en avant sur Dossier, à
suivre depuis `misEnAvant`), ou l'arbitrage doit-il être rouvert ? Tant que
ce n'est pas dit, $-01 ne peut pas être codé fidèlement.

### B.2 — Recharge de 10 analyses : 5 € ou 7 €

| Source | Montant |
|---|---|
| `README.md` du prototype, grille tarifaire | 3 000 F / **5 €** |
| P-06, `Lot P0 Public` (`p4: eur ? "5 €" : "3 000 F"`) | **5 €** |
| `src/domain/payments/pricing.ts` | **7 €** |

Le plancher de 3 000 F est cohérent partout (RG-05.5). Seul l'euro diverge.
Le prix affiché vient du domaine, donc l'écran montre aujourd'hui 7 €.

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

**À trancher :** faut-il rapprocher le test de la règle écrite ? Une piste
qui garde la contrainte serrée sans mordre sur ces textes :

- n'interdire `%`, `score` et `chances` que dans une phrase qui parle aussi
  du dossier, de la complétude ou du visa — c'est le qualificatif de la règle ;
- ou maintenir l'interdit large et exiger une dérogation explicite et
  motivée, ligne par ligne, dans le fichier concerné.

La première colle à l'intention, la seconde est plus facile à auditer.
Tant que rien n'est décidé, chaque lot continuera de buter dessus, et la
tentation d'assouplir le test au coup par coup — le plus mauvais des trois
chemins — grandira à chaque fois.

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

| Rang | Écart | Bloque |
|---|---|---|
| 1 | B.1 — mise en avant de $-01 | **P0 Paiement**, le lot suivant |
| 2 | B.2 — recharge en euros | P0 Paiement (P-06 l'affiche déjà) |
| 3 | A — C-01, C-02, C-06, C-09 | P0 Dossier 1 et Dossier 2 |
| 4 | C — le garde-fou | P0 Dossier 2 (C-09, C-10), puis P1 |
| 5 | B.3, B.4 — consultation et commission | P1 (T-03), P2 WF-12 |
| 6 | A — T-01, T-05 | P1, P2 WF-12 |
