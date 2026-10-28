# S.201 — L5 : premier passage Vertex `--pieces L01,R03`

**28/10/2026**, base `de63b49` (#322 fusionnée), branche
`claude/dreamy-heisenberg-49uym4`. Instruction du responsable : « lance le
premier passage L5 `--pieces L01,R03` ». Le protocole
[campagne Vertex](../exploitation/qualification-vertex-l5.md) et le
[suivi S.181](lot-l5-vertex-2026-10-16.md) ont été relus avant l'appel.
Aucun code, schéma ni service touché ; aucune fusion ni déploiement.

## Conditions

- Secret `AI_OPENAI_COMPTE_DE_SERVICE` présent dans l'environnement de la
  session, jamais lu, affiché ni copié ; aucun journal
  `.qualification-vertex` antérieur dans le dépôt ni dans les preuves : le
  budget de 5 000 XOF s'ouvre ici, une seule fois.
- Commande exacte du protocole, campagne et manifeste du 16/10 inchangés.
- Un premier lancement s'est arrêté au chargement (client Prisma non
  généré dans la session neuve) : aucun journal créé, aucun réseau, aucune
  réserve. `prisma generate` puis relance.
- Commit `de63b49`, arbre non modifié au moment du passage.

## Résultat

Passage du `2026-10-28T17:23:31Z`, quatre appels, tous `CONNUE`, aucun
incident, aucun arrêt de campagne.

| Cas | Fonction | Entrée / sortie | ms | Constat |
|---|---|---|---|---|
| L01 | extraction | 1 668 / 36 | 4 518 | `CONFORME` attendu et obtenu, champ juste, pièce identifiée |
| R03 | rédaction | 522 / 158 | 2 604 | lettre écrite, aucun nombre ajouté, aucun mot interdit |
| R03 | relecture | 852 / 420 | 4 735 | incohérence du jeu relevée |
| R03 | avis de référence | 818 / 656 | 6 412 | incohérence relevée, avis valide L3 |

- **Accès** : OAuth du compte, point `eu`, modèle `google/gemini-3.8-flash`
  et `reasoning_effort: low` acceptés.
- **Mesures** : entrée maximale 1 668 jetons pour une borne de 10 240,
  sortie maximale 656 pour 5 120.
- **Coût mesuré** au tarif déclaré : 3 860 / 1 270 jetons, 0,0084 USD, soit
  environ 4,9 XOF au change du 15/10, hors taxes. Ce n'est pas une facture.
- **Réserve prudente** (journal) : 4 invocations, 175,99 XOF ; restant
  4 824,01 XOF, soit 109 invocations. Le jeu complet en demande 56 (29
  pièces, 9 rédactions et 9 relectures, 9 avis), soit 2 464 XOF : couvert.

## Points à lever avant le jeu complet

1. **Raisonnement compté ?** L'extraction L01 rend 36 jetons de sortie
   avec un raisonnement `low` demandé. L'adaptateur ne lit que
   `prompt_tokens` et `completion_tokens` ; ni `total_tokens` ni le détail
   des jetons de raisonnement ne sont conservés. Si Vertex facture la
   réflexion hors de `completion_tokens`, la borne de sortie serait
   contrôlée sur une valeur trop basse. À rapprocher dans la console du
   projet `projetanatt` (SKU de sortie du 28/10 contre 1 270 jetons) avant
   la suite ; le relevé de la réserve n'en dépend pas.
2. **PDF non éprouvé** : L01 est une image ; le chemin `image_url` des
   pièces PDF n'a pas encore été appelé. Le jeu complet le couvre, sans
   rejouer L01 ni R03.
3. Devise de facturation et taxes du compte, toujours à confirmer.

## Preuves

[`passage-2026-10-28-L01-R03/`](preuves-l5-vertex-2026-10-16/passage-2026-10-28-L01-R03/) :
`passage.json`, `appels.json`, `resultats.json`, `rapport.md`, la lettre
R03 (pour les grilles humaines) et `journal/budget.json`, copie à
l'identique du journal privé (SHA-256 `03f9cc34…bd351`). Aucun secret.

**Reprise dans une nouvelle session** : copier
`journal/budget.json` vers
`.qualification-vertex/projetanatt-eu-gemini-3.8-flash/budget.json` avant
tout passage, vérifier l'empreinte, puis lancer le restant. Ne jamais
relancer sans ce journal : ce serait ouvrir un second budget.

## Reste à faire et non prouvé

Jeu complet, rapprochement avec la facture, deux grilles humaines, DPA,
résidence, conservation, incidents réels, configuration déployée.
**L5 non clôturé**, Q.A et M.C non levés.
